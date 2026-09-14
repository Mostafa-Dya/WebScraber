import { describe, expect, it } from 'vitest';
import { ScrapeCache } from '../../../src/lib/scrape/cache.ts';
import { finalisePricing, scrapeRug } from '../../../src/lib/scrape/index.ts';
import { jinaUrl } from '../../../src/lib/scrape/jina.ts';
import { RobotsCache } from '../../../src/lib/scrape/robots.ts';
import { HostThrottle, MIN_HOST_GAP_MS } from '../../../src/lib/scrape/throttle.ts';
import { SCRAPED_FIELDS, type ScrapedRug } from '../../../src/lib/scrape/types.ts';
import type { Logger } from '../../../src/lib/sheets/errors.ts';
import {
  ECG_380114_URL,
  KV_OUSHAK_HANDLE,
  fakeTransport,
  fixture,
  guards,
  robotsRoute,
  type FakeCall,
  type FakeRoute,
} from '../../fixtures/scrape/index.ts';

const ecgPage = fixture('ecg-380114.html');
const challenge = fixture('cf-challenge.html');
const kvBase = `https://karavanrug.com/products/${KV_OUSHAK_HANDLE}`;
const kvJs = fixture(`kv-${KV_OUSHAK_HANDLE}.js.json`);
const kvJson = fixture(`kv-${KV_OUSHAK_HANDLE}.json`);
const kvHtml = fixture(`kv-${KV_OUSHAK_HANDLE}.html`);

const JSON_CT = 'application/json; charset=utf-8';
const JS_CT = 'text/javascript; charset=utf-8';

function kvRoutes(overrides: Record<string, FakeRoute> = {}): Record<string, FakeRoute> {
  return {
    [`${kvBase}.js`]: { body: kvJs, contentType: JS_CT },
    [`${kvBase}.json`]: { body: kvJson, contentType: JSON_CT },
    [kvBase]: { body: kvHtml },
    ...overrides,
  };
}

function collectingLogger(lines: string[]): Logger {
  return {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
}

describe('scrapeRug: detection failures', () => {
  it('refuses unsupported hosts with no manual pre-fill and never touches the transport', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug('https://example.com/products/x', {
      fetchImpl: fakeTransport({}, calls),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({ ok: false, code: 'unsupported_host', manual: undefined });
    expect(calls).toEqual([]);
  });

  it('offers manual entry for a known host with a non-product path', async () => {
    const r = await scrapeRug('https://ecarpetgallery.com/us_en/catalogsearch/result/?q=380114', {
      fetchImpl: fakeTransport({}),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({
      ok: false,
      code: 'invalid_url',
      manual: {
        supplier: 'ecarpetgallery',
        supplierRef: '',
        sourceUrl: 'https://ecarpetgallery.com/us_en/catalogsearch/result/',
      },
    });
  });
});

describe('scrapeRug: ecarpetgallery.com', () => {
  it('fetches the rebuilt us_en URL through impit only, parses, caches and prices', async () => {
    const calls: FakeCall[] = [];
    const cache = new ScrapeCache();
    const g = guards();
    const fetchImpl = fakeTransport({ [ECG_380114_URL]: { body: ecgPage } }, calls);
    const r = await scrapeRug(
      'http://www.ecarpetgallery.com/eu_en/red-5x8-andelz-area-rugs-380114?utm_source=mail',
      {
        fetchImpl,
        cache,
        ...g,
        markup: 1.6,
      },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ via: 'impit', cached: false });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.data).toMatchObject({
      supplierRef: '380114',
      sourceUrl: ECG_380114_URL,
      widthCm: 130,
      lengthCm: 226,
      seenPrice: 700,
      seenCurrency: 'USD',
      priceUsd: 700,
      // ecarpetgallery's own formula (owner, 2026-09-13): 700 × 1.5 + 150 = 1200. The Settings
      // markup of 1.6 is deliberately ignored — the formula IS the rule for this supplier.
      suggestedRetailUsd: 1200,
      markupApplied: undefined,
      pricingRule: 'ecarpetgallery: USD × 1.5 + 150',
      roundStep: 5,
    });
    expect(calls.map((c) => [c.url, c.client])).toEqual([[ECG_380114_URL, 'impit']]);

    // Second call: cache hit, pricing re-derived with the new settings, no fetch. The rounding step
    // still applies (1200 is already a multiple of 50); the markup still does not.
    const again = await scrapeRug(ECG_380114_URL, { fetchImpl, cache, ...g, markup: 2, roundStep: 50 });
    expect(again).toMatchObject({ ok: true, cached: true, via: 'impit' });
    if (again.ok)
      expect(again.data).toMatchObject({
        suggestedRetailUsd: 1200,
        markupApplied: undefined,
        roundStep: 50,
      });
    expect(calls).toHaveLength(1);

    // force bypasses the cache. A supplier WITH a formula still gets a suggestion without any
    // Settings markup at all — that is the point of moving the rule out of Settings.
    const forced = await scrapeRug(ECG_380114_URL, { fetchImpl, cache, ...g, force: true });
    expect(forced).toMatchObject({ ok: true, cached: false });
    if (forced.ok) {
      expect(forced.data.suggestedRetailUsd).toBe(1200);
      expect(forced.data.markupApplied).toBeUndefined();
    }
    expect(calls).toHaveLength(2);
  });

  it('falls back to Jina Reader on a Cloudflare challenge and reports via: jina', async () => {
    const calls: FakeCall[] = [];
    const lines: string[] = [];
    const fetchImpl = fakeTransport(
      {
        [ECG_380114_URL]: { status: 403, body: challenge },
        [jinaUrl(ECG_380114_URL)]: { body: ecgPage, contentType: 'text/plain; charset=utf-8' },
      },
      calls,
    );
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl,
      cache: new ScrapeCache(),
      ...guards(),
      logger: collectingLogger(lines),
    });
    expect(r).toMatchObject({ ok: true, via: 'jina', cached: false });
    if (r.ok) expect(r.data.seenPrice).toBe(700);
    expect(calls.map((c) => c.client)).toEqual(['impit', 'undici']);
    expect(calls[1]?.headers['X-Return-Format']).toBe('html');
    expect(lines.some((l) => l.startsWith('warn supplier answered 403'))).toBe(true);
  });

  it('reports blocked with manual entry when the fallback is off or also fails', async () => {
    const off = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({ [ECG_380114_URL]: { status: 403, body: challenge } }),
      cache: new ScrapeCache(),
      ...guards(),
      jinaFallback: false,
    });
    expect(off).toMatchObject({
      ok: false,
      code: 'blocked',
      status: 403,
      manual: { supplier: 'ecarpetgallery', supplierRef: '380114', sourceUrl: ECG_380114_URL },
    });

    const both = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({
        [ECG_380114_URL]: { status: 403, body: challenge },
        [jinaUrl(ECG_380114_URL)]: { status: 429, body: 'rate limited', contentType: 'text/plain' },
      }),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(both).toMatchObject({ ok: false, code: 'blocked', status: 403 });
    if (!both.ok) expect(both.message).toMatch(/Jina fallback: .*429/);
  });

  it('answers not_found on a 404 without trying the fallback', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport(
        { [ECG_380114_URL]: { status: 404, body: '<html><title>404</title></html>' } },
        calls,
      ),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({ ok: false, code: 'not_found', status: 404 });
    expect(calls).toHaveLength(1);
  });

  it('tries the fallback on a network error and on a page without a price; returns partial data on parse_failed', async () => {
    const noPrice =
      '<html><head><meta property="og:title" content="Nice rug | ECARPETGALLERY"></head><body></body></html>';
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({
        [ECG_380114_URL]: { throws: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }) },
        [jinaUrl(ECG_380114_URL)]: { body: noPrice, contentType: 'text/plain' },
      }),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({
      ok: false,
      code: 'parse_failed',
      data: { supplierTitle: 'Nice rug', supplierRef: '380114' },
    });

    const recovered = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({
        [ECG_380114_URL]: { body: noPrice },
        [jinaUrl(ECG_380114_URL)]: { body: ecgPage, contentType: 'text/plain' },
      }),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(recovered).toMatchObject({ ok: true, via: 'jina' });
  });

  it('times out as a whole and reports code timeout', async () => {
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({ [ECG_380114_URL]: { body: ecgPage, delayMs: 5_000 } }),
      cache: new ScrapeCache(),
      ...guards(),
      timeoutMs: 30,
    });
    expect(r).toMatchObject({ ok: false, code: 'timeout' });
  });
});

describe('scrapeRug: karavanrug.com', () => {
  it('reads .js + HTML, never the pasted URL as is', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug(`http://www.karavanrug.com/products/${KV_OUSHAK_HANDLE}/?variant=1`, {
      fetchImpl: fakeTransport(kvRoutes(), calls),
      cache: new ScrapeCache(),
      ...guards(),
      markup: 1.5,
    });
    expect(r).toMatchObject({ ok: true, via: 'impit', cached: false });
    if (r.ok) {
      expect(r.data).toMatchObject({
        supplierRef: '11103',
        seenPrice: 4000,
        seenCurrency: 'USD',
        currencyAssumed: false,
        priceUsd: 4000,
        // karavanrug (owner, 2026-09-13): 4000 × 0.7 × 2 = 5600, +200 because 4000 > 1000.
        suggestedRetailUsd: 5800,
      });
    }
    expect(calls.map((c) => c.url)).toEqual([`${kvBase}.js`, kvBase]);
    expect(calls.every((c) => c.client === 'impit')).toBe(true);
  });

  it('falls back to .json when .js fails, and assumes USD when the HTML is unavailable', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        kvRoutes({
          [`${kvBase}.js`]: { status: 500, body: 'oops' },
          [kvBase]: { status: 503, body: 'down' },
        }),
        calls,
      ),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.data).toMatchObject({ seenPrice: 4000, currencyAssumed: true });
    expect(calls.map((c) => c.url)).toEqual([`${kvBase}.js`, `${kvBase}.json`, kvBase]);
  });

  it('answers not_found on a 404 and blocked on a 403', async () => {
    const nf = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(kvRoutes({ [`${kvBase}.js`]: { status: 404, body: '{}' } })),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(nf).toMatchObject({
      ok: false,
      code: 'not_found',
      manual: { supplier: 'karavanrug', supplierRef: KV_OUSHAK_HANDLE },
    });
    const blocked = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        kvRoutes({
          [`${kvBase}.js`]: { status: 403, body: 'no' },
          [`${kvBase}.json`]: { status: 403, body: 'no' },
        }),
      ),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(blocked).toMatchObject({ ok: false, code: 'blocked', status: 403 });
  });

  // The HTML page is blanked too: since the brief's §11 ladder falls through to JSON-LD, a page
  // that still carries a Product node is rescued (the test below), so parse_failed now means
  // "no rung produced a product", which is what this case is about.
  it('reports parse_failed when the payload is not a product', async () => {
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        kvRoutes({
          [`${kvBase}.js`]: { body: '{"nope":true}', contentType: JS_CT },
          [`${kvBase}.json`]: { body: '[]', contentType: JSON_CT },
          [kvBase]: { body: '<html><head><title>Karavan Rug</title></head><body></body></html>' },
        }),
      ),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({ ok: false, code: 'parse_failed' });
  });

  it('falls through to the JSON-LD rung when the Shopify payload is broken (brief §11)', async () => {
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        kvRoutes({
          [`${kvBase}.js`]: { body: '{"nope":true}', contentType: JS_CT },
          [`${kvBase}.json`]: { body: '[]', contentType: JSON_CT },
        }),
      ),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Rung 2 supplies title, sku, price and currency; the size is read out of the title, so it is
    // flagged `inferred` rather than `found`.
    expect(r.data).toMatchObject({
      supplierRef: '11103-7321',
      seenCurrency: 'USD',
      widthCm: 305,
      lengthCm: 370,
      sizeLabel: '305 × 370 cm',
      sizeBand: 'XL',
    });
    expect(r.data.fieldStatus.widthCm).toBe('inferred');
    expect(r.data.fieldStatus.seenPrice).toBe('found');
  });
});

describe('finalisePricing (ADMIN_SPEC §4.7 / §7)', () => {
  const base: ScrapedRug = {
    supplier: 'ecarpetgallery',
    supplierRef: '1',
    sourceUrl: 'u',
    supplierTitle: 't',
    seenPrice: 900,
    seenCurrency: 'EUR',
    tagsSuggested: [],
    photos: [],
    warnings: ['existing'],
  };

  it("converts through the Rates tab, then applies the supplier's formula, without mutating the input", () => {
    const out = finalisePricing(base, {
      convertToUsd: (a, c) => (c === 'EUR' ? a * 1.1 : undefined),
      markup: 1.6,
    });
    expect(out.priceUsd).toBe(990);
    // 990 × 1.5 + 150 = 1635. The 1.6 markup passed above is ignored: `base` is an ecarpetgallery
    // rug, and that supplier has a formula.
    expect(out.suggestedRetailUsd).toBe(1635);
    expect(out.warnings).toEqual(['existing', 'price converted from EUR 900 with the Rates tab (estimate)']);
    expect(base.warnings).toEqual(['existing']);
    expect(base.priceUsd).toBeUndefined();
  });

  it('leaves priceUsd blank with a warning when no rate exists, and prices from the formula', () => {
    const out = finalisePricing(base, {});
    expect(out.priceUsd).toBeUndefined();
    expect(out.suggestedRetailUsd).toBeUndefined();
    expect(out.warnings.at(-1)).toMatch(/EUR/);
    const usd = finalisePricing(
      { ...base, seenCurrency: 'USD', seenPrice: 833 },
      { markup: 1.6, roundStep: 0 },
    );
    // 833 × 1.5 + 150 = 1399.5, rounded up to the next 5 → 1400 (roundStep 0 falls back to 5).
    expect(usd).toMatchObject({ priceUsd: 833, suggestedRetailUsd: 1400, roundStep: 5 });
  });
});

const KV_ROBOTS = 'https://karavanrug.com/robots.txt';

describe('scrapeRug: robots.txt and the per-host gap (brief §11)', () => {
  it('refuses a disallowed URL with the blocked code, before any product request', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        { [KV_ROBOTS]: robotsRoute('User-agent: *\nDisallow: /products/\n'), ...kvRoutes() },
        calls,
      ),
      cache: new ScrapeCache(),
      ...guards(),
      robots: new RobotsCache(),
    });
    expect(r).toMatchObject({
      ok: false,
      code: 'blocked',
      manual: { supplier: 'karavanrug', supplierRef: KV_OUSHAK_HANDLE },
    });
    if (!r.ok) expect(r.message).toMatch(/robots\.txt on karavanrug\.com/);
    expect(calls.map((c) => c.url)).toEqual([KV_ROBOTS]);
  });

  it('honours an Allow that is more specific than the Disallow', async () => {
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport({
        [KV_ROBOTS]: robotsRoute(
          `User-agent: *\nDisallow: /products/\nAllow: /products/${KV_OUSHAK_HANDLE}\n`,
        ),
        ...kvRoutes(),
      }),
      cache: new ScrapeCache(),
      ...guards(),
      robots: new RobotsCache(),
    });
    expect(r.ok).toBe(true);
  });

  it('treats a missing robots.txt as allowed and reads it once per host', async () => {
    const calls: FakeCall[] = [];
    const robots = new RobotsCache();
    const fetchImpl = fakeTransport({ [KV_ROBOTS]: robotsRoute('nope', 404), ...kvRoutes() }, calls);
    const first = await scrapeRug(kvBase, {
      fetchImpl,
      cache: new ScrapeCache(),
      ...guards(),
      robots,
    });
    const second = await scrapeRug(kvBase, {
      fetchImpl,
      cache: new ScrapeCache(),
      ...guards(),
      robots,
      force: true,
    });
    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(calls.filter((c) => c.url === KV_ROBOTS)).toHaveLength(1);
  });

  it('can be turned off explicitly, and then never asks for robots.txt', async () => {
    const calls: FakeCall[] = [];
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(
        { [KV_ROBOTS]: robotsRoute('User-agent: *\nDisallow: /\n'), ...kvRoutes() },
        calls,
      ),
      cache: new ScrapeCache(),
      ...guards(),
      robots: new RobotsCache(),
      respectRobots: false,
    });
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.url === KV_ROBOTS)).toBe(false);
  });

  it('waits the politeness gap between two requests to the same host', async () => {
    const waits: number[] = [];
    const r = await scrapeRug(kvBase, {
      fetchImpl: fakeTransport(kvRoutes()),
      cache: new ScrapeCache(),
      ...guards(),
      throttle: new HostThrottle({
        sleep: async (ms) => {
          waits.push(ms);
        },
      }),
    });
    expect(r.ok).toBe(true);
    // Two requests to karavanrug.com (.js then the HTML page): the second one pays the gap.
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(MIN_HOST_GAP_MS - 200);
    expect(waits[0]).toBeLessThanOrEqual(MIN_HOST_GAP_MS);
  });
});

describe('scrapeRug: the derived fields the admin form needs (brief §11)', () => {
  it('returns the primary image, the Size Label, the Size Band and a status for every field', async () => {
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({ [ECG_380114_URL]: { body: ecgPage } }),
      cache: new ScrapeCache(),
      ...guards(),
      markup: 1.6,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sizeLabel).toBe('130 × 226 cm');
    expect(r.data.sizeBand).toBe('M');
    expect(r.primaryImage).toBe(r.data.photos[0]?.url);
    expect(r.data.primaryImage).toBe(r.primaryImage);
    expect(Object.keys(r.data.fieldStatus).sort()).toEqual([...SCRAPED_FIELDS].sort());
    expect(r.data.fieldStatus).toMatchObject({
      supplierRef: 'found',
      supplierTitle: 'found',
      seenPrice: 'found',
      seenCurrency: 'found',
      priceUsd: 'found',
      // ECG prints feet-inches only, so every size field is derived.
      widthCm: 'inferred',
      lengthCm: 'inferred',
      sizeRaw: 'inferred',
      sizeLabel: 'inferred',
      sizeBand: 'inferred',
      suggestedRetailUsd: 'inferred',
      photos: 'found',
      primaryImage: 'found',
    });
  });

  it('flags the partial a failed parse still produced (ADMIN_SPEC §4.8)', async () => {
    const noPrice =
      '<html><head><meta property="og:title" content="Nice rug | ECARPETGALLERY"></head><body></body></html>';
    const r = await scrapeRug(ECG_380114_URL, {
      fetchImpl: fakeTransport({
        [ECG_380114_URL]: { body: noPrice },
        [jinaUrl(ECG_380114_URL)]: { body: noPrice, contentType: 'text/plain' },
      }),
      cache: new ScrapeCache(),
      ...guards(),
    });
    expect(r).toMatchObject({ ok: false, code: 'parse_failed' });
    if (r.ok) return;
    expect(r.data?.supplierTitle).toBe('Nice rug');
    expect(r.data?.fieldStatus?.supplierTitle).toBe('found');
    expect(r.data?.fieldStatus?.seenPrice).toBe('missing');
    expect(r.data?.sizeBand).toBe('');
  });

  it('keeps the derived fields on a cache hit, where pricing is re-derived', async () => {
    const cache = new ScrapeCache();
    const g = guards();
    const fetchImpl = fakeTransport({ [ECG_380114_URL]: { body: ecgPage } });
    await scrapeRug(ECG_380114_URL, { fetchImpl, cache, ...g });
    const hit = await scrapeRug(ECG_380114_URL, { fetchImpl, cache, ...g, markup: 2, roundStep: 50 });
    expect(hit).toMatchObject({ ok: true, cached: true });
    if (!hit.ok) return;
    expect(hit.data.sizeBand).toBe('M');
    expect(hit.data.fieldStatus.widthCm).toBe('inferred');
    expect(hit.data.fieldStatus.suggestedRetailUsd).toBe('inferred');
    expect(hit.primaryImage).toBe(hit.data.photos[0]?.url);
  });
});
