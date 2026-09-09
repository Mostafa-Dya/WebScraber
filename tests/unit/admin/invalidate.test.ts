import { describe, expect, it } from 'vitest';
import { invalidateCatalogue, invalidateRoutes } from '../../../src/lib/admin/invalidate.ts';
import { CatalogueCache } from '../../../src/lib/sheets/cache.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';
import { snapshotFromRanges } from '../../../src/lib/sheets/read.ts';
import { rangesWith, rugRow } from '../../helpers/ranges.ts';

function cacheWith(loads: { n: number }, fail = { on: false }): CatalogueCache {
  return new CatalogueCache({
    load: async () => {
      loads.n++;
      if (fail.on) throw new Error('Sheets down');
      return rangesWith({ rugs: [rugRow({ id: 'SL-021' })] });
    },
    parse: (r) => snapshotFromRanges(r),
    ttlMs: 60_000,
    logger: silentLogger,
  });
}

describe('invalidateCatalogue (ADMIN_SPEC §3.4)', () => {
  it('busts the data cache, purges the "sheet" tag and stamps the shared coalescing state', async () => {
    const loads = { n: 0 };
    const cache = cacheWith(loads);
    await cache.get();
    const purges: unknown[] = [];
    const state = { lastBustAt: 0 };
    const result = await invalidateCatalogue(
      () => cache,
      { cache: { invalidate: async (i) => void purges.push(i) } },
      { state, now: () => 42 },
    );
    expect(loads.n).toBe(2);
    expect(purges).toEqual([{ tags: ['sheet'] }]);
    expect(state.lastBustAt).toBe(42);
    expect(result.refreshed).toBe(true);
    expect(result.snapshot?.catalogue.rugs).toHaveLength(1);
  });
  it('tolerates a failing refresh, a missing cache and a dev provider without a route cache', async () => {
    const warnings: string[] = [];
    const logger = { ...silentLogger, warn: (m: string) => void warnings.push(m) };
    const loads = { n: 0 };
    const fail = { on: false };
    const cache = cacheWith(loads, fail);
    await cache.get();
    fail.on = true;
    const throwing = {
      cache: {
        invalidate: async () => {
          throw new Error('no provider');
        },
      },
    };
    const r1 = await invalidateCatalogue(() => cache, throwing, { logger });
    expect(r1.refreshed).toBe(false);
    expect(r1.snapshot).toBeDefined(); // stale-if-error snapshot
    const r2 = await invalidateCatalogue(
      () => {
        throw new Error('not configured');
      },
      throwing,
      { logger },
    );
    expect(r2).toEqual({ refreshed: false, snapshot: undefined });
    expect(warnings.some((w) => /route cache invalidate skipped/.test(w))).toBe(true);
    expect(warnings.some((w) => /cache unavailable/.test(w))).toBe(true);
    await expect(invalidateRoutes(throwing)).resolves.toBeUndefined();
  });
});
