import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogueCache } from '../../src/lib/sheets/cache.ts';
import type { ValueRange } from '../../src/lib/sheets/client.ts';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

function ranges(likes = 2, votes: (string | number)[][] = []): ValueRange[] {
  return rangesWith({ rugs: [rugRow({ id: 'SL-021', likes, dislikes: 1, rating: 0 })], votes });
}

function makeCache(opts: {
  load: () => Promise<ValueRange[]>;
  ttlMs?: number;
  now?: () => number;
  persistPath?: string;
  failureCooldownMs?: number;
}): CatalogueCache {
  const now = opts.now ?? (() => 1_000_000);
  return new CatalogueCache({
    load: opts.load,
    parse: (r) => snapshotFromRanges(r, now),
    ttlMs: opts.ttlMs ?? 60_000,
    now,
    persistPath: opts.persistPath,
    failureCooldownMs: opts.failureCooldownMs,
  });
}

describe('CatalogueCache', () => {
  it('serves within the TTL and refreshes once when stale (single-flight)', async () => {
    let now = 1_000_000;
    let loads = 0;
    const cache = makeCache({
      load: async () => {
        loads++;
        await new Promise((r) => setTimeout(r, 5));
        return ranges();
      },
      now: () => now,
    });
    const [a, b] = await Promise.all([cache.get(), cache.get()]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
    now += 30_000;
    await cache.get();
    expect(loads).toBe(1);
    now += 31_000;
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(loads).toBe(2);
  });

  it('keeps serving the last good snapshot when a refresh fails, and does not hammer Google during the cooldown', async () => {
    let now = 0;
    let fail = false;
    let loads = 0;
    const cache = makeCache({
      load: async () => {
        loads++;
        if (fail) throw new Error('Sheets down');
        return ranges();
      },
      ttlMs: 1000,
      now: () => now,
      failureCooldownMs: 500,
    });
    const first = await cache.get();
    fail = true;
    now = 5000;
    const second = await cache.get();
    expect(second).toBe(first);
    expect(loads).toBe(2);
    await cache.get();
    await cache.get();
    expect(loads).toBe(2); // inside the cooldown: no new attempt
    now = 5600;
    await cache.get();
    expect(loads).toBe(3); // cooldown over: one attempt, still stale-if-error
    const h = cache.health();
    expect(h.lastRefreshOk).toBe(false);
    expect(h.lastError).toMatch(/Sheets down/);
    expect(h.ok).toBe(false);
    expect(h.snapshotAgeSec).toBe(6);
  });

  it('throws only when there is no snapshot at all', async () => {
    const cache = makeCache({
      load: async () => {
        throw new Error('boom');
      },
    });
    await expect(cache.get()).rejects.toThrow('boom');
    expect(cache.health().ok).toBe(false);
  });

  it('rejects a refresh whose header row breaks the contract and keeps the previous snapshot', async () => {
    let now = 0;
    let broken = false;
    const cache = makeCache({
      load: async () => {
        const r = ranges();
        if (broken)
          r[0] = {
            range: r[0]!.range,
            values: [(r[0]!.values![0] as string[]).map((h) => (h === 'title' ? 'name' : h))],
          };
        return r;
      },
      ttlMs: 1000,
      now: () => now,
    });
    const first = await cache.get();
    broken = true;
    now = 5000;
    expect(await cache.get()).toBe(first);
    expect(cache.health().lastError).toMatch(/column C should be "title"/);
  });

  it('bust() forces a read that starts after the call, even while another refresh is in flight', async () => {
    const now = 0;
    let loads = 0;
    let release: (() => void) | undefined;
    const cache = makeCache({
      load: async () => {
        loads++;
        if (loads === 1) await new Promise<void>((r) => (release = r));
        return ranges(loads);
      },
      now: () => now,
    });
    const firstRead = cache.get(); // in flight, blocked
    await new Promise((r) => setTimeout(r, 5));
    const busted = cache.bust(); // must wait for the first read and then start a second one
    release!();
    await firstRead;
    const snap = await busted;
    expect(loads).toBe(2);
    expect(snap.catalogue.rugs[0]?.likes).toBe(2);
  });

  it('applies vote deltas in place, tracks visitor state, and replays deltas over an overlapping refresh', async () => {
    let now = 1000;
    let release: (() => void) | undefined;
    let loads = 0;
    const cache = makeCache({
      load: async () => {
        loads++;
        if (loads === 2) await new Promise<void>((r) => (release = r));
        return ranges(2);
      },
      ttlMs: 100,
      now: () => now,
    });
    await cache.get();
    expect(cache.currentVote('visitor-1', 'SL-021')).toBe('none');
    let rug = cache.applyVote('SL-021', 'visitor-1', 'none', 'like')?.rug;
    expect(rug).toMatchObject({ likes: 3, dislikes: 1, rating: 3.75 });
    expect(cache.currentVote('visitor-1', 'SL-021')).toBe('like');
    rug = cache.applyVote('SL-021', 'visitor-1', 'like', 'dislike')?.rug;
    expect(rug).toMatchObject({ likes: 2, dislikes: 2, rating: 2.5 });
    rug = cache.applyVote('SL-021', 'visitor-1', 'dislike', 'none')?.rug;
    expect(rug).toMatchObject({ likes: 2, dislikes: 1 });
    expect(cache.currentVote('visitor-1', 'SL-021')).toBe('none');
    expect(cache.applyVote('nope', 'visitor-1', 'none', 'like')).toBeUndefined();

    // A refresh starts (blocked), a vote lands meanwhile, the refresh completes with pre-vote data.
    now = 2000;
    const refreshing = cache.get();
    await new Promise((r) => setTimeout(r, 5));
    now = 2001;
    cache.applyVote('SL-021', 'visitor-2', 'none', 'like');
    release!();
    const fresh = await refreshing;
    expect(fresh.catalogue.rugs[0]?.likes).toBe(3); // sheet said 2, delta replayed
    expect(cache.currentVote('visitor-2', 'SL-021')).toBe('like');
  });

  it('persists the content ranges (never votes) and re-validates them on restore', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sl-cache-'));
    const path = join(dir, 'catalogue.json');
    const votes = [['e-8', 'visitor-1', 'SL-021', 'like', 'card', 't']];
    const cache = makeCache({ load: async () => ranges(4, votes), persistPath: path });
    await cache.get();
    const file = readFileSync(path, 'utf8');
    expect(file).not.toContain('visitor-1');
    expect(JSON.parse(file).ranges).toHaveLength(4);

    // Restored snapshot: parsed through the same schemas, considered stale, vote state empty.
    const restored = makeCache({
      load: async () => {
        throw new Error('offline');
      },
      persistPath: path,
    });
    const snap = await restored.get(); // stale → refresh fails → restored snapshot served
    // Counts are derived from the Reactions log, which is deliberately not persisted: a restored
    // snapshot shows zero until the first refresh (it is already marked stale).
    expect(snap.catalogue.rugs[0]?.likes).toBe(0);
    expect(snap.voteState.size).toBe(0);
    expect(restored.health().ok).toBe(false);

    // Invalid or foreign files are ignored (and never crash health()).
    writeFileSync(path, JSON.stringify({ catalogue: { rugs: [{ id: 1, name: null }] } }));
    const junk = makeCache({
      load: async () => {
        throw new Error('offline');
      },
      persistPath: path,
    });
    expect(junk.peek()).toBeUndefined();
    expect(junk.health().rugs).toBe(0);
    writeFileSync(path, '{not json');
    expect(makeCache({ load: async () => ranges(), persistPath: path }).peek()).toBeUndefined();
    // Content that fails the contract on restore is ignored too.
    const bad = JSON.parse(file);
    bad.ranges[0].values[0][2] = 'name'; // column C must be "title"
    writeFileSync(path, JSON.stringify(bad));
    expect(makeCache({ load: async () => ranges(), persistPath: path }).peek()).toBeUndefined();
  });
});
