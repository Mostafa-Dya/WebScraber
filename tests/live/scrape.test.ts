// Opt-in live scrape against the two suppliers: `SCRAPE_LIVE=1 npm run test:live`.
// One ECG product (via impit, Jina fallback allowed) and one KV product; skipped otherwise.
import { describe, expect, it } from 'vitest';
import { scrapeRug } from '../../src/lib/scrape/index.ts';
import { ScrapeCache } from '../../src/lib/scrape/cache.ts';
import { consoleLogger } from '../../src/lib/sheets/errors.ts';

const live = process.env.SCRAPE_LIVE === '1';

describe.skipIf(!live)('live: supplier scrape', () => {
  it('reads an ecarpetgallery.com product page', async () => {
    const r = await scrapeRug('https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114', {
      cache: new ScrapeCache(),
      logger: consoleLogger,
      markup: 1.6,
    });
    console.log(
      JSON.stringify({ ...r, data: r.ok ? { ...r.data, description: undefined } : r.data }, null, 1),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(['impit', 'jina', 'undici']).toContain(r.via);
    expect(r.data.supplierRef).toBe('380114');
    expect(r.data.seenPrice).toBeGreaterThan(0);
    expect(r.data.seenCurrency).toBe('USD');
    expect(r.data.widthCm).toBeGreaterThan(0);
    expect(r.data.photos.length).toBeGreaterThan(0);
    expect(r.data.suggestedRetailUsd).toBeGreaterThan(0);
  });

  it('reads a karavanrug.com product', async () => {
    const r = await scrapeRug(
      'https://karavanrug.com/products/60-years-old-vintage-turkish-oushak-rug-305-x-370-cm-10-0-x-12-1-ft',
      { cache: new ScrapeCache(), logger: consoleLogger },
    );
    console.log(
      JSON.stringify({ ...r, data: r.ok ? { ...r.data, description: undefined } : r.data }, null, 1),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.supplierRef).toBe('11103');
    expect(r.data.seenPrice).toBeGreaterThan(0);
    expect(r.data.currencyAssumed).toBe(false);
    expect(r.data.widthCm).toBe(305);
    expect(r.data.photos.length).toBeGreaterThan(0);
  });
});
