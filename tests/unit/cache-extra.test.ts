import { describe, expect, it } from 'vitest';
import { CatalogueCache } from '../../src/lib/sheets/cache.ts';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import { sweepPhotos } from '../../src/lib/photos-health.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

describe('CatalogueCache — failure cooldown without a snapshot, discardVote, meta', () => {
  it('fails fast during the cooldown instead of hitting Google on every request when nothing is cached', async () => {
    let t = 0;
    let loads = 0;
    const cache = new CatalogueCache({
      load: async () => {
        loads++;
        throw new Error('bad credential');
      },
      parse: (r) => snapshotFromRanges(r, () => t),
      ttlMs: 60_000,
      now: () => t,
      failureCooldownMs: 15_000,
    });
    await expect(cache.get()).rejects.toThrow('bad credential');
    await expect(cache.get()).rejects.toThrow('bad credential');
    await expect(cache.get()).rejects.toThrow(/bad credential/);
    expect(loads).toBe(1);
    t = 16_000;
    await expect(cache.get()).rejects.toThrow('bad credential');
    expect(loads).toBe(2);
  });

  it('discardVote removes a failed optimistic delta so an overlapping refresh does not replay it', async () => {
    let t = 1000;
    let release: (() => void) | undefined;
    let loads = 0;
    const cache = new CatalogueCache({
      load: async () => {
        loads++;
        if (loads === 2) await new Promise<void>((r) => (release = r));
        return rangesWith({ rugs: [rugRow({ id: 'SL-021', likes: 2, dislikes: 1 })] });
      },
      parse: (r) => snapshotFromRanges(r, () => t),
      ttlMs: 100,
      now: () => t,
    });
    await cache.get();
    t = 2000;
    const refreshing = cache.get(); // in flight
    await new Promise((r) => setTimeout(r, 5));
    t = 2001;
    const applied = cache.applyVote('SL-021', 'visitor-1', 'none', 'like')!;
    expect(applied.rug.likes).toBe(3);
    cache.discardVote(applied.delta); // the sheet write failed
    expect(cache.peek()?.catalogue.rugs[0]?.likes).toBe(2);
    expect(cache.currentVote('visitor-1', 'SL-021')).toBe('none');
    release!();
    const fresh = await refreshing;
    expect(fresh.catalogue.rugs[0]?.likes).toBe(2); // not replayed
  });

  it('exposes Votes metadata for the breaker and health', async () => {
    const cache = new CatalogueCache({
      load: async () => rangesWith({ rugs: [rugRow()] }),
      loadMeta: async () => ({ votesRowsTotal: 1234 }),
      parse: (r) => snapshotFromRanges(r),
      ttlMs: 60_000,
      windowRows: 5000,
    });
    await cache.get();
    expect(cache.votesRowsTotal).toBe(1234);
    const h = cache.health();
    expect(h.votesRowsTotal).toBe(1234);
    expect(h.voteStateTruncated).toBe(false);
    expect(h.dropped).toEqual([]);
  });

  it('a failing loadMeta keeps the last known row count (the breaker stays armed) and logs it', async () => {
    let metaFails = false;
    let t = 0;
    const warnings: string[] = [];
    const cache = new CatalogueCache({
      load: async () => rangesWith({ rugs: [rugRow()] }),
      loadMeta: async () => {
        if (metaFails) throw new Error('spreadsheets.get quota');
        return { votesRowsTotal: 4321 };
      },
      parse: (r) => snapshotFromRanges(r, () => t),
      ttlMs: 100,
      now: () => t,
      logger: { info: () => undefined, warn: (m) => void warnings.push(m), error: () => undefined },
    });
    await cache.get();
    expect(cache.votesRowsTotal).toBe(4321);
    metaFails = true;
    t = 1000;
    await cache.get(); // refresh with a failing metadata read
    expect(cache.votesRowsTotal).toBe(4321);
    expect(cache.health().lastRefreshOk).toBe(true);
    expect(warnings.some((w) => w.includes('metadata read failed'))).toBe(true);
  });
  it('a failing loadMeta never fails the refresh', async () => {
    const cache = new CatalogueCache({
      load: async () => rangesWith({ rugs: [rugRow()] }),
      loadMeta: async () => {
        throw new Error('meta down');
      },
      parse: (r) => snapshotFromRanges(r),
      ttlMs: 60_000,
    });
    expect((await cache.get()).catalogue.rugs).toHaveLength(1);
    expect(cache.health().votesRowsTotal).toBeNull();
  });
});

describe('sweepPhotos', () => {
  it('HEADs the first photo of each active rug and lists the failures', async () => {
    const rugs = snapshotFromRanges(
      rangesWith({
        rugs: [
          rugRow({ id: 'ok', photos: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb' }),
          rugRow({ id: 'bad', photos: '1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0' }),
          rugRow({ id: 'none', photos: '' }),
          rugRow({ id: 'draft', photos: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb', status: 'draft' }),
        ],
      }),
    ).catalogue.rugs;
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(String(input));
      expect(init?.method).toBe('HEAD');
      const ok = String(input).includes('1U8FwNPCdm');
      return new Response(null, {
        status: ok ? 200 : 500,
        headers: ok ? { 'content-type': 'image/jpeg' } : { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;
    const result = await sweepPhotos(rugs, { fetchImpl });
    expect(result.checked).toBe(2);
    expect(seen).toHaveLength(2);
    expect(result.failing).toEqual([
      { id: 'bad', name: 'Winks', photo: '1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0', status: 500 },
    ]);
  });
});
