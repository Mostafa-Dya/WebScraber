// In-process fixed-window rate limiter (exact on the single long-lived process, ADR D2/D8).
export interface RateDecision {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfterSec: number;
  remaining: number;
}

interface Window {
  start: number;
  windowMs: number;
  count: number;
}

/** Keys that must survive eviction (the global bucket protects the Sheets quota). */
const PROTECTED_KEYS = new Set(['global']);

export class RateLimiter {
  private readonly now: () => number;
  private readonly maxKeys: number;
  private readonly windows = new Map<string, Window>();

  constructor(options: { now?: () => number; maxKeys?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /** Consumes one unit from `key`'s window if allowed. */
  allow(key: string, limit: number, windowMs: number): RateDecision {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || t - w.start >= w.windowMs) {
      w = { start: t, windowMs, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > this.maxKeys) this.prune();
    }
    if (w.count >= limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((w.start + w.windowMs - t) / 1000)),
        remaining: 0,
      };
    }
    w.count += 1;
    return { ok: true, retryAfterSec: 0, remaining: limit - w.count };
  }

  /** Peeks without consuming (used to check every limit before consuming any); the live window keeps its own length. */
  wouldAllow(key: string, limit: number, _windowMs: number): RateDecision {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= w.windowMs) return { ok: true, retryAfterSec: 0, remaining: limit };
    if (w.count >= limit)
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((w.start + w.windowMs - t) / 1000)),
        remaining: 0,
      };
    return { ok: true, retryAfterSec: 0, remaining: limit - w.count };
  }

  /** Gives back one unit (a write that failed must not burn the visitor's budget). */
  refund(key: string): void {
    const w = this.windows.get(key);
    if (w && w.count > 0) w.count -= 1;
  }

  get size(): number {
    return this.windows.size;
  }

  private prune(): void {
    const t = this.now();
    for (const [k, w] of this.windows) if (t - w.start >= w.windowMs) this.windows.delete(k);
    if (this.windows.size > this.maxKeys) {
      // Still too big: drop the oldest entries (Map preserves insertion order), never the protected ones.
      const excess = this.windows.size - this.maxKeys;
      let dropped = 0;
      for (const k of [...this.windows.keys()]) {
        if (dropped >= excess) break;
        if (PROTECTED_KEYS.has(k)) continue;
        this.windows.delete(k);
        dropped++;
      }
    }
  }
}
