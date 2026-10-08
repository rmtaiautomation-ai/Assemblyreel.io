export type SavePayload = Record<string, unknown>;
export type SaveResult = { success: boolean; error?: string };
export type SaveStatus = { state: 'saved' | 'saving' | 'failed'; pending: number; errors: string[] };
type Entry = { payload: SavePayload; activePayload?: SavePayload; write: (payload: SavePayload) => Promise<SaveResult>;
  timer?: ReturnType<typeof setTimeout>; running?: Promise<void>; error?: string };

/** Serializes ordinary writes per entity, retaining failures and newer edits. */
export class OrdinarySaveQueue {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(status: SaveStatus) => void>();
  subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  status(): SaveStatus {
    const entries = [...this.entries.values()];
    const errors = entries.flatMap(entry => entry.error ? [entry.error] : []);
    return { state: errors.length ? 'failed' : entries.length ? 'saving' : 'saved', pending: entries.length, errors };
  }
  pendingPayload(key: string): SavePayload {
    const entry = this.entries.get(key);
    return { ...entry?.activePayload, ...entry?.payload };
  }
  private notify() { const status = this.status(); this.listeners.forEach(listener => listener(status)); }
  enqueue(key: string, payload: SavePayload, write: Entry['write'], delay = 0): void {
    const entry = this.entries.get(key) ?? { payload: {}, write };
    entry.payload = { ...entry.payload, ...payload };
    entry.write = write;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    this.entries.set(key, entry);
    this.notify();
    if (entry.error) return; // Failure requires an intentional ordinary-save retry.
    if (delay) entry.timer = setTimeout(() => { entry.timer = undefined; void this.drain(key); }, delay);
    else void this.drain(key);
  }
  private drain(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.error) return Promise.resolve();
    if (entry.running) return entry.running;
    entry.running = (async () => {
      // Defer once so running is installed even when the writer throws synchronously.
      await Promise.resolve();
      while (this.entries.get(key) === entry && !entry.timer && Object.keys(entry.payload).length) {
        const payload = entry.payload;
        entry.activePayload = payload;
        entry.payload = {};
        try {
          const result = await entry.write(payload);
          if (!result.success) throw new Error(result.error || 'Save rejected');
        } catch (error) {
          entry.payload = { ...payload, ...entry.payload };
          entry.error = key + ': ' + (error instanceof Error ? error.message : 'Save failed');
          break;
        }
      }
      entry.activePayload = undefined;
      entry.running = undefined;
      if (!entry.error && !entry.timer && !Object.keys(entry.payload).length && this.entries.get(key) === entry) this.entries.delete(key);
      this.notify();
    })();
    return entry.running;
  }
  async flushAll(retryFailed = false): Promise<boolean> {
    // Recheck after awaiting: edits may arrive while another row's write is running.
    do {
      for (const entry of this.entries.values()) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = undefined;
        if (retryFailed) entry.error = undefined;
      }
      this.notify();
      await Promise.all([...this.entries.keys()].map(key => this.drain(key)));
      retryFailed = false; // Never automatically retry a failure encountered in this flush.
    } while ([...this.entries.values()].some(entry => !entry.error));
    return this.entries.size === 0;
  }
  forget(key: string): void {
    const entry = this.entries.get(key);
    if (entry?.timer) clearTimeout(entry.timer);
    this.entries.delete(key);
    this.notify();
  }
  dispose(): void {
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    this.listeners.clear();
  }
}
