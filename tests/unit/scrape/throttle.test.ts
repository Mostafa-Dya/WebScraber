import { describe, expect, it } from 'vitest';
import {
  HostThrottle,
  MAX_HOST_WAIT_MS,
  MIN_HOST_GAP_MS,
  realSleep,
} from '../../../src/lib/scrape/throttle.ts';

/**
 * A throttle on a controllable clock. By default the fake sleep advances that clock (what really
 * happens); `advanceOnSleep: false` models a stalled clock so queued debts stack and the cap shows.
 */
function fake(
  options: {
    minGapMs?: number;
    maxWaitMs?: number;
    maxHosts?: number;
    advanceOnSleep?: boolean;
  } = {},
): {
  throttle: HostThrottle;
  slept: number[];
  advance: (ms: number) => void;
  at: () => number;
} {
  let clock = 1_000;
  const slept: number[] = [];
  const { advanceOnSleep = true, ...rest } = options;
  const throttle = new HostThrottle({
    ...rest,
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      if (advanceOnSleep) clock += ms;
    },
  });
  return { throttle, slept, advance: (ms) => (clock += ms), at: () => clock };
}

describe('HostThrottle (brief §11: 2 s between requests to the same host)', () => {
  it('lets the first request through and holds the next one for the full gap', async () => {
    const { throttle, slept } = fake();
    expect(await throttle.take('karavanrug.com')).toBe(0);
    expect(await throttle.take('karavanrug.com')).toBe(MIN_HOST_GAP_MS);
    expect(slept).toEqual([MIN_HOST_GAP_MS]);
  });

  it('charges only the time still owed once the gap has partly elapsed', async () => {
    const { throttle, advance } = fake();
    await throttle.take('karavanrug.com');
    advance(1_500);
    expect(await throttle.take('karavanrug.com')).toBe(500);
    advance(9_000);
    expect(await throttle.take('karavanrug.com')).toBe(0);
  });

  it('keeps hosts independent and matches them case-insensitively', async () => {
    const { throttle } = fake();
    await throttle.take('karavanrug.com');
    expect(await throttle.take('ecarpetgallery.com')).toBe(0);
    expect(await throttle.take('KaravanRug.COM')).toBe(MIN_HOST_GAP_MS);
  });

  it('reserves the slot before awaiting, so concurrent takes queue instead of colliding', async () => {
    const { throttle, at } = fake();
    const started = at();
    const waits = await Promise.all([
      throttle.take('karavanrug.com'),
      throttle.take('karavanrug.com'),
      throttle.take('karavanrug.com'),
    ]);
    // Each request pays exactly one gap: none of the three shares a slot.
    expect(waits).toEqual([0, MIN_HOST_GAP_MS, MIN_HOST_GAP_MS]);
    expect(at() - started).toBe(2 * MIN_HOST_GAP_MS);
  });

  it('never lets two requests to one host start inside the same gap', async () => {
    const { throttle } = fake({ advanceOnSleep: false });
    const waits = await Promise.all([
      throttle.take('karavanrug.com'),
      throttle.take('karavanrug.com'),
      throttle.take('karavanrug.com'),
    ]);
    expect(waits).toEqual([0, MIN_HOST_GAP_MS, 2 * MIN_HOST_GAP_MS]);
  });

  it('caps a single wait so a deep queue cannot eat the scrape deadline', async () => {
    const { throttle } = fake({ minGapMs: 4_000, maxWaitMs: 5_000, advanceOnSleep: false });
    const waits = await Promise.all([
      throttle.take('h.example'),
      throttle.take('h.example'),
      throttle.take('h.example'),
      throttle.take('h.example'),
    ]);
    expect(waits).toEqual([0, 4_000, 5_000, 5_000]);
    expect(MAX_HOST_WAIT_MS).toBe(5_000);
  });

  it('waitFor is pure: it reports the debt without reserving anything', async () => {
    const { throttle } = fake();
    expect(throttle.waitFor('karavanrug.com')).toBe(0);
    await throttle.take('karavanrug.com');
    expect(throttle.waitFor('karavanrug.com')).toBe(MIN_HOST_GAP_MS);
    expect(throttle.waitFor('karavanrug.com')).toBe(MIN_HOST_GAP_MS);
    expect(await throttle.take('karavanrug.com')).toBe(MIN_HOST_GAP_MS);
  });

  it('forgets the least recently used hosts once it is over its cap', async () => {
    const { throttle } = fake({ maxHosts: 4 });
    for (let i = 0; i < 12; i++) await throttle.take(`h${i}.example`);
    expect(throttle.size).toBeLessThanOrEqual(4);
    throttle.clear();
    expect(throttle.size).toBe(0);
  });

  it('realSleep resolves after the delay and rejects with the abort reason', async () => {
    const started = Date.now();
    await realSleep(5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1);

    const controller = new AbortController();
    const pending = realSleep(5_000, controller.signal);
    controller.abort(new Error('deadline'));
    await expect(pending).rejects.toThrow('deadline');

    const already = new AbortController();
    already.abort(new Error('already gone'));
    await expect(realSleep(5_000, already.signal)).rejects.toThrow('already gone');
  });

  it('propagates the abort out of take, so the outer scrape deadline still wins', async () => {
    const controller = new AbortController();
    const throttle = new HostThrottle({
      sleep: (_ms, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
        }),
    });
    await throttle.take('karavanrug.com', controller.signal);
    const pending = throttle.take('karavanrug.com', controller.signal);
    controller.abort(new Error('scrape exceeded 15000 ms'));
    await expect(pending).rejects.toThrow('scrape exceeded 15000 ms');
  });
});
