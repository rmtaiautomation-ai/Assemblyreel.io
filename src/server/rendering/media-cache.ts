import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const MEDIA_CACHE_DIR = path.join(process.cwd(), "public", "media", "cache");

/**
 * Pulls remote media onto local disk so Remotion does not repeat network range
 * requests for every rendered frame. Lambda uses S3 synchronization instead.
 */
export async function cacheRemoteMedia(
  url: string | undefined,
  origin: string
): Promise<string | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  if (url.startsWith(origin)) return url;
  if (url.includes(".supabase.co/")) return url;

  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
  let extension = ".mp4";

  try {
    const urlExtension = path.extname(new URL(url).pathname);
    if (urlExtension && urlExtension.length <= 5) extension = urlExtension;
  } catch {
    // Keep the default extension when a remote URL cannot be parsed.
  }

  const fileName = `${hash}${extension}`;
  const filePath = path.join(MEDIA_CACHE_DIR, fileName);
  const localUrl = `${origin}/media/cache/${fileName}`;

  try {
    await fs.access(filePath);
    return localUrl;
  } catch {
    // Cache miss; download below.
  }

  try {
    await fs.mkdir(MEDIA_CACHE_DIR, { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    return localUrl;
  } catch (error) {
    console.warn(`[Render Cache] Could not cache ${url}:`, error);
    return url;
  }
}
