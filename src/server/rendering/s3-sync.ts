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
  
  // If it's already a Supabase URL, return as-is
  if (url.includes(".supabase.co/storage/v1/object/public/")) return url;

  const isLocal = url.startsWith("/") || url.startsWith(origin);
  if (isLocal) {
    const relativePath = url.startsWith(origin) ? url.slice(origin.length) : url;
    
    // In our dual-storage architecture, all local files in /media/ and /audio/
    // have already been simultaneously uploaded to Supabase Storage during generation.
    // Instead of doing a slow S3 upload at export time, we simply translate the local URL
    // into its corresponding Supabase Public URL for the Lambda render farm.
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Cannot translate local URLs to cloud URLs for export.");
    }
    
    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/project-media/`;
    
    if (relativePath.startsWith("/media/")) {
      // /media/uploads/... -> uploads/...
      const cloudPath = relativePath.slice("/media/".length);
      return `${publicPrefix}${cloudPath}`;
    }
    
    if (relativePath.startsWith("/audio/")) {
      // /audio/123.mp3 -> audio/123.mp3
      const cloudPath = relativePath.slice(1);
      return `${publicPrefix}${cloudPath}`;
    }
    
    return url;
  }

  // Remote stock URLs are already natively fast for Lambda.
  return url;
}

async function runInChunks<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Walks a render payload (same shape as `resolvedPayload` in
 * render-remotion/route.ts) and rewrites every scene/audio media URL to a
 * presigned S3 URL, uploading anything not already on S3 first.
 *
 * Processes assets in parallel chunks to dramatically speed up export times
 * without overwhelming the network or hitting OS file descriptor limits.
 */
export async function syncPayloadMediaToS3(payload: any, origin: string): Promise<any> {
  const { region, bucketName } = getLambdaConfig();
  const sync = (url: string | undefined) => syncMediaUrlToS3(url, origin, region, bucketName);

  const scenes = await runInChunks(payload.scenes ?? [], 10, async (scene: any) => {
    return { ...scene, mediaUrl: await sync(scene.mediaUrl) };
  });

  const audioClips = await runInChunks(payload.audioClips ?? [], 10, async (clip: any) => {
    return { ...clip, src: await sync(clip.src) };
  });

  return {
    ...payload,
    scenes,
    audioUrl: await sync(payload.audioUrl),
    audioClips,
  };
}
