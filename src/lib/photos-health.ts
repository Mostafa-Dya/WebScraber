// Photo reachability sweep for /api/health (docs/ADR.md D5.5, D6): HEADs every active rug's first
// photo on lh3 after a refresh, at most once per interval, and remembers which rugs fail.
import { lh3Url } from './images.ts';
import type { Rug } from './sheets/types.ts';

export interface PhotoHealth {
  checkedAt: number | null;
  checked: number;
  failing: Array<{ id: string; name: string; photo: string; status: number }>;
}

export interface SweepOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
}

export async function sweepPhotos(rugs: Rug[], opts: SweepOptions = {}): Promise<PhotoHealth> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const targets = rugs
    .filter((r) => r.status === 'active' && r.photos[0])
    .map((r) => ({ id: r.id, name: r.name, photo: r.photos[0]! }));
  const failing: PhotoHealth['failing'] = [];
  let i = 0;
  const worker = async (): Promise<void> => {
    while (i < targets.length) {
      const t = targets[i++]!;
      let status = 0; // 0 = network error / timeout
      try {
        const res = await fetchImpl(lh3Url(t.photo, 800), {
          method: 'HEAD',
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = res.status;
        const type = res.headers.get('content-type') ?? '';
        if (res.status === 200 && type.startsWith('image/')) continue;
      } catch {
        /* status stays 0 */
      }
      failing.push({ ...t, status });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return { checkedAt: Date.now(), checked: targets.length, failing };
}

/** Runs sweeps in the background, at most once per `intervalMs`; the latest result is readable any time. */
export class PhotoMonitor {
  private latest: PhotoHealth = { checkedAt: null, checked: 0, failing: [] };
  private running: Promise<void> | undefined;
  private readonly intervalMs: number;
  private readonly opts: SweepOptions;

  constructor(intervalMs = 10 * 60_000, opts: SweepOptions = {}) {
    this.intervalMs = intervalMs;
    this.opts = opts;
  }

  /** Fire-and-forget; never throws. */
  schedule(rugs: Rug[]): void {
    if (this.running) return;
    const last = this.latest.checkedAt ?? 0;
    if (Date.now() - last < this.intervalMs) return;
    this.running = sweepPhotos(rugs, this.opts)
      .then((r) => {
        this.latest = r;
      })
      .catch(() => undefined)
      .finally(() => {
        this.running = undefined;
      });
  }

  get result(): PhotoHealth {
    return this.latest;
  }
}
