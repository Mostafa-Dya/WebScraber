// Per-host politeness throttle (brief §11: "2 s between requests to the same host"). A pure,
// injectable module: the clock and the sleep are parameters, so tests never wait for real time.
// Slots are reserved synchronously before the wait, so two concurrent takes for the same host queue
// instead of both slipping through. Every wait honours the caller's AbortSignal and is capped, so
// the throttle can never sit on the 15 s scrape budget (docs/ADMIN_SPEC.md §4.3).

/** The brief's minimum gap between two requests to the same host. */
export const MIN_HOST_GAP_MS = 2_000;

/** Hard ceiling for a single wait, so a deep queue cannot eat the whole scrape deadline. */
export const MAX_HOST_WAIT_MS = 5_000;

/** Hosts remembered before the least recently used is dropped. */
export const MAX_TRACKED_HOSTS = 500;

export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void>;

/** setTimeout that rejects with the signal's reason if the wait is aborted. */
export const realSleep: Sleeper = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    function onAbort(): void {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('aborted'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export interface HostThrottleOptions {
  /** Minimum gap between two requests to the same host; default 2 s. */
  minGapMs?: number;
  /** Longest single wait; default 5 s. */
  maxWaitMs?: number;
  now?: () => number;
  sleep?: Sleeper;
  maxHosts?: number;
}

export class HostThrottle {
  private readonly minGapMs: number;
  private readonly maxWaitMs: number;
  private readonly maxHosts: number;
  private readonly now: () => number;
  private readonly sleep: Sleeper;
  /** host → epoch ms at which the next request to it may start. Insertion order = recency. */
  private readonly next = new Map<string, number>();

  constructor(options: HostThrottleOptions = {}) {
    this.minGapMs = options.minGapMs ?? MIN_HOST_GAP_MS;
    this.maxWaitMs = options.maxWaitMs ?? MAX_HOST_WAIT_MS;
    this.maxHosts = options.maxHosts ?? MAX_TRACKED_HOSTS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? realSleep;
  }

  private key(host: string): string {
    return host.trim().toLowerCase();
  }

  /** Pure: how long a request to `host` would have to wait right now. No reservation is made. */
  waitFor(host: string): number {
    const earliest = this.next.get(this.key(host));
    if (earliest === undefined) return 0;
    return Math.min(Math.max(0, earliest - this.now()), this.maxWaitMs);
  }

  /**
   * Reserves the next slot for `host` and waits for it. Returns the ms actually waited (0 for the
   * first request to a host, or once the gap has already elapsed). Rejects with the signal's reason
   * when the outer deadline fires during the wait.
   */
  async take(host: string, signal?: AbortSignal): Promise<number> {
    const key = this.key(host);
    const t = this.now();
    const earliest = this.next.get(key) ?? t;
    const start = Math.max(t, earliest);
    // Reserve before awaiting so concurrent takes queue rather than share a slot.
    this.next.delete(key);
    this.next.set(key, start + this.minGapMs);
    this.prune(t);
    const wait = Math.min(start - t, this.maxWaitMs);
    if (wait > 0) await this.sleep(wait, signal);
    return wait;
  }

  /** Drops the least recently used hosts once the map is over its cap. */
  private prune(t: number): void {
    while (this.next.size > this.maxHosts) {
      const oldest = this.next.keys().next().value;
      if (oldest === undefined) break;
      this.next.delete(oldest);
    }
    // Cheap hygiene: an entry whose gap has long elapsed carries no information.
    if (this.next.size > this.maxHosts / 2) {
      for (const [host, at] of this.next) {
        if (at <= t) this.next.delete(host);
      }
    }
  }

  /** Test/ops helper. */
  clear(): void {
    this.next.clear();
  }

  get size(): number {
    return this.next.size;
  }
}

/** The process-wide throttle used by `scrapeRug` unless a caller supplies its own. */
export const defaultHostThrottle = new HostThrottle();
