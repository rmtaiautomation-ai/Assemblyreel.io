export interface Thumbnail {
  url: string;
  bytes: number;
  dispose: () => void;
}

type Listener = (thumbnail: Thumbnail | null) => void;
type Entry = {
  source: string;
  state: 'queued' | 'loading' | 'settled';
  thumbnail: Thumbnail | null;
  listeners: Set<Listener>;
  controller: AbortController;
};

export const THUMBNAIL_WIDTH = 160;
export const THUMBNAIL_HEIGHT = 90;
export const THUMBNAIL_CACHE_LIMIT = 128;
export const THUMBNAIL_CACHE_BYTES = 8 * 1024 * 1024;

/** Per-editor LRU. Pending requests and failed results count toward the entry limit. */
export class ThumbnailCache {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  private running = 0;

  constructor(
    private load: (source: string, signal: AbortSignal) => Promise<Thumbnail> = loadTimelineThumbnail,
    private limit = THUMBNAIL_CACHE_LIMIT,
    private byteLimit = THUMBNAIL_CACHE_BYTES,
    private concurrency = 2,
  ) {}

  get stats() {
    return { entries: this.entries.size, bytes: this.bytes, running: this.running };
  }

  subscribe(source: string, listener: Listener) {
    let entry = this.entries.get(source);
    if (!entry) {
      entry = { source, state: 'queued', thumbnail: null, listeners: new Set(), controller: new AbortController() };
    }
    this.entries.delete(source);
    this.entries.set(source, entry);
    entry.listeners.add(listener);
    listener(entry.thumbnail);
    this.prune();
    this.pump();
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size && entry.state !== 'settled') this.remove(entry);
      this.pump();
    };
  }

  clear() {
    for (const entry of this.entries.values()) this.remove(entry);
  }

  private remove(entry: Entry) {
    if (this.entries.get(entry.source) !== entry) return;
    this.entries.delete(entry.source);
    entry.controller.abort();
    if (entry.thumbnail) {
      this.bytes -= entry.thumbnail.bytes;
      entry.thumbnail.dispose();
      entry.thumbnail = null;
    }
    for (const listener of entry.listeners) listener(null);
    entry.listeners.clear();
  }

  private prune() {
    while (this.entries.size > this.limit || this.bytes > this.byteLimit) {
      const oldest = this.entries.values().next().value;
      if (!oldest) break;
      this.remove(oldest);
    }
  }

  private pump() {
    while (this.running < this.concurrency) {
      const entry = [...this.entries.values()].find(item => item.state === 'queued');
      if (!entry) return;
      entry.state = 'loading';
      this.running++;
      const timeout = setTimeout(() => entry.controller.abort(), 15_000);
      Promise.resolve().then(() => this.load(entry.source, entry.controller.signal)).then(thumbnail => {
        if (entry.controller.signal.aborted || this.entries.get(entry.source) !== entry) {
          thumbnail.dispose();
          return;
        }
        if (thumbnail.bytes > this.byteLimit) {
          thumbnail.dispose();
          return;
        }
        entry.thumbnail = thumbnail;
        this.bytes += thumbnail.bytes;
        this.prune();
        for (const listener of entry.listeners) listener(entry.thumbnail);
      }).catch(() => {
        // A missing/CORS-blocked image stays a lightweight placeholder. No retry loop.
      }).finally(() => {
        clearTimeout(timeout);
        entry.state = 'settled';
        this.running--;
        this.pump();
      });
    }
  }
}

/** Sources are loaded in the browser; this adds no arbitrary-URL server proxy. */
export async function loadTimelineThumbnail(source: string, signal: AbortSignal): Promise<Thumbnail> {
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error('Thumbnail source unavailable');
  const blob = await response.blob();
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  try {
    signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    canvas.width = THUMBNAIL_WIDTH;
    canvas.height = THUMBNAIL_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thumbnail canvas unavailable');
    const ratio = Math.max(THUMBNAIL_WIDTH / bitmap.width, THUMBNAIL_HEIGHT / bitmap.height);
    const width = bitmap.width * ratio;
    const height = bitmap.height * ratio;
    context.drawImage(bitmap, (THUMBNAIL_WIDTH - width) / 2, (THUMBNAIL_HEIGHT - height) / 2, width, height);
    const thumbnail = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('Thumbnail encoding failed')), 'image/webp', 0.7,
    ));
    signal.throwIfAborted();
    const url = URL.createObjectURL(thumbnail);
    return { url, bytes: thumbnail.size + THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT * 4, dispose: () => URL.revokeObjectURL(url) };
  } finally {
    bitmap.close();
  }
}
