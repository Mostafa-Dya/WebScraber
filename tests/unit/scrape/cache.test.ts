import { describe, expect, it } from 'vitest';
import { SCRAPE_CACHE_MAX, SCRAPE_CACHE_TTL_MS, ScrapeCache } from '../../../src/lib/scrape/cache.ts';
import type { ScrapedRug } from '../../../src/lib/scrape/types.ts';

function rug(ref: string): ScrapedRug {
  return {
    supplier: 'karavanrug',
    supplierRef: ref,
    sourceUrl: `u${ref}`,
    supplierTitle: ref,
    tagsSuggested: [],
    photos: [],
    warnings: [],
  };
}

describe('ScrapeCache (ADMIN_SPEC §4.3)', () => {
  it('defaults to 15 minutes and 100 entries', () => {
    expect(SCRAPE_CACHE_TTL_MS).toBe(15 * 60_000);
    expect(SCRAPE_CACHE_MAX).toBe(100);
  });

  it('expires entries after the TTL', () => {
    let t = 1_000;
    const cache = new ScrapeCache({ ttlMs: 100, now: () => t });
    cache.set('a', { data: rug('a'), via: 'impit' });
    t = 1_099;
    expect(cache.get('a')?.via).toBe('impit');
    t = 1_100;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry beyond the cap', () => {
    const cache = new ScrapeCache({ maxEntries: 2 });
    cache.set('a', { data: rug('a'), via: 'impit' });
    cache.set('b', { data: rug('b'), via: 'impit' });
    expect(cache.get('a')).toBeDefined(); // a is now the most recent
    cache.set('c', { data: rug('c'), via: 'jina' });
    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')?.data.supplierRef).toBe('a');
    expect(cache.get('c')?.via).toBe('jina');
  });

  it('supports delete and clear', () => {
    const cache = new ScrapeCache();
    cache.set('a', { data: rug('a'), via: 'undici' });
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    cache.set('b', { data: rug('b'), via: 'undici' });
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
