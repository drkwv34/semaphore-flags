/**
 * In-process singleflight: one in-flight promise per key (FR-CACHE-003).
 */
export class Singleflight {
  private readonly inflight = new Map<string, Promise<unknown>>();

  do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const pending = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, pending);
    return pending;
  }

  get size(): number {
    return this.inflight.size;
  }
}
