import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getLambdaConfig } from "./lambda-config";

/**
 * Phase 2 of implementation_plans/10-aws-lambda-cloud-rendering.md.
 *
 * Local-first asset storage, sync-to-cloud at render time: media generation
 * (images, TTS, uploads) stays on local disk during editing (fast, no network
 * latency), and this module pushes those files — plus any still-remote stock
 * media (Pexels/Pixabay) — to S3 immediately before a Lambda render, rewriting
 * the render payload to point at S3 instead.
 *
 * Mirrors `cacheRemoteMedia` in `src/app/api/render-remotion/route.ts`, which
 * solves the same "swap media URL before render" problem in the opposite
 * direction (remote → local, for local `renderMedia`). Here it's local/remote
 * → S3, because Lambda's render workers have no access to this machine's disk.
 */

let cachedClient: S3Client | null = null;
function getS3Client(region: string): S3Client {
  if (!cachedClient) {
    // Deliberately NOT left to the default AWS SDK credential chain: that chain
    // looks for plain AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (or a profile, or
    // an instance role), none of which this app sets — everywhere else in this
    // codebase uses the REMOTION_AWS_* names on purpose (see lambda-config.ts).
    // Omitting `credentials` here silently produced a client with no way to
    // authenticate, so every upload failed and syncMediaUrlToS3's error handling
    // masked it by falling back to the original (Lambda-unreachable) local URL.
    cachedClient = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedClient;
}

// Presigned URLs need an expiry; 6 hours comfortably covers even a slow
// long-form Lambda render (Phase verification target is well under 5 minutes)
// plus the time between sync and the Lambda function actually fetching each
// asset, without leaving files world-readable indefinitely.
const PRESIGN_EXPIRY_SECONDS = 6 * 60 * 60;

const EXT_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function guessContentType(filePath: string): string {
  return EXT_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Uploads a buffer to S3 under `key` (skipping the upload if that key is
 * already present — re-rendering the same project shouldn't re-upload
 * unchanged assets) and returns a presigned GET URL for it.
 */
async function putAndPresign(
  client: S3Client,
  bucket: string,
  key: string,
  loadBody: () => Promise<Buffer>,
  contentType: string
): Promise<string> {
  if (!(await objectExists(client, bucket, key))) {
    const body = await loadBody();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
    );
  }
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
  });
}

/**
 * Syncs one media URL to S3 and returns the presigned S3 URL to use instead.
 *
 * Handles three cases:
 * - Already an S3 URL (idempotent — a payload re-synced twice is a no-op here).
 * - A local asset served by this app (root-relative "/media/..." / "/audio/..."
 *   or an absolute URL under `origin`) — read straight off disk under `public/`.
 * - A genuine remote URL (stock media that was never generated locally) —
 *   fetched once and uploaded, same as `cacheRemoteMedia` does for local disk,
 *   so Lambda isn't re-fetching a remote host per frame during encoding.
 *
 * Returns the input unchanged for anything falsy/blob: (blob: URLs are
 * rejected earlier in the route, before this is ever called).
 */
export async function syncMediaUrlToS3(
  url: string | undefined,
  origin: string,
  region: string,
  bucketName: string
): Promise<string | undefined> {
  if (!url) return url;
  if (url.includes(".amazonaws.com/") && url.includes("X-Amz-Signature=")) return url; // already synced

  const client = getS3Client(region);

  const isLocal = url.startsWith("/") || url.startsWith(origin);
  if (isLocal) {
    const relativePath = url.startsWith(origin) ? url.slice(origin.length) : url;
    const filePath = path.join(process.cwd(), "public", relativePath);
    const key = `render-inputs${relativePath}`;
    try {
      return await putAndPresign(
        client,
        bucketName,
        key,
        () => fs.readFile(filePath),
        guessContentType(filePath)
      );
    } catch (err: any) {
      // No fallback here on purpose, unlike the remote-asset branch below: a
      // local `/media/...` URL is on THIS machine's disk and categorically
      // unreachable from a Lambda worker no matter why the upload failed, so
      // returning it unchanged would just defer the same failure to a much
      // more confusing point (Remotion's <Img> loader, deep inside the Lambda
      // render, with no indication it was ever an S3 sync problem). Failing
      // here instead surfaces the real cause immediately, before any Lambda
      // time is spent.
      throw new Error(`Could not sync local asset ${relativePath} to S3: ${err?.message || err}`);
    }
  }

  if (/^https?:\/\//i.test(url)) {
    const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
    let ext = ".mp4";
    try {
      const urlExt = path.extname(new URL(url).pathname);
      if (urlExt && urlExt.length <= 5) ext = urlExt;
    } catch {
      // Unparseable URL — keep the default extension.
    }
    const key = `render-inputs/remote-cache/${hash}${ext}`;
    try {
      return await putAndPresign(
        client,
        bucketName,
        key,
        async () => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        },
        EXT_CONTENT_TYPES[ext] || "application/octet-stream"
      );
    } catch (err) {
      console.warn(`[S3 Sync] Could not sync remote asset ${url}:`, err);
      return url; // Fall back to the original remote URL rather than failing the whole render.
    }
  }

  return url;
}

/**
 * Walks a render payload (same shape as `resolvedPayload` in
 * render-remotion/route.ts) and rewrites every scene/audio media URL to a
 * presigned S3 URL, uploading anything not already on S3 first.
 *
 * Sequential per-asset on purpose — same reasoning as the local media cache
 * loop it mirrors: this app is single-user/single-render, and firing dozens
 * of uploads at once isn't worth the complexity for the marginal time saved.
 */
export async function syncPayloadMediaToS3(payload: any, origin: string): Promise<any> {
  const { region, bucketName } = getLambdaConfig();
  const sync = (url: string | undefined) => syncMediaUrlToS3(url, origin, region, bucketName);

  const scenes: any[] = [];
  for (const scene of payload.scenes ?? []) {
    scenes.push({ ...scene, mediaUrl: await sync(scene.mediaUrl) });
  }

  const audioClips: any[] = [];
  for (const clip of payload.audioClips ?? []) {
    audioClips.push({ ...clip, src: await sync(clip.src) });
  }

  return {
    ...payload,
    scenes,
    audioUrl: await sync(payload.audioUrl),
    audioClips,
  };
}
