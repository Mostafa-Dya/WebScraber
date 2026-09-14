// /api/admin/scrape and /api/admin/photos with the scraper and the Drive client replaced
// (docs/ADMIN_SPEC.md §4.8–4.9, §5.3): status codes per failure code, the manual pre-fill, the
// markup lookup from Settings, the per-session + global scrape limits, the `scrape.fetch` /
// `photo.import` audit rows, per-URL upload outcomes and the `drive_not_authorised` fallback.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ScrapeModuleNs from '../../../src/lib/scrape/index.ts';
type ScrapeModule = typeof ScrapeModuleNs;
import type { UploadResult } from '../../../src/lib/drive/types.ts';
import type { APIContext } from 'astro';
import { apiContext, fakeCache, fakeSheet, type FakeSheet } from './fake-sheets.ts';
import { RateLimiter } from '../../../src/lib/votes/ratelimit.ts';

const state = vi.hoisted(() => ({
  sheet: undefined as unknown,
  cache: undefined as unknown,
  drive: undefined as unknown,
  scrape: vi.fn(),
}));

vi.mock('astro:env/server', async () => ({ ...(await import('./fake-sheets.ts')).ENV_MOCK }));
vi.mock('../../../src/lib/runtime.ts', () => ({
  getClient: () => (state.sheet as FakeSheet).client,
  getCache: () => state.cache,
  // Loads the catalogue snapshot so the synchronous convertToUsd has rates on a cold process.
  // A no-op here: this suite supplies convertToUsd directly.
  warmRates: async () => {},
  getAdminDeps: () => ({
    authMode: state.drive ? 'oauth_refresh' : 'service_account',
    drive: state.drive,
    scrape: { jinaFallback: false },
    convertToUsd: (amount: number, currency: string) => (currency === 'EUR' ? amount / 0.92 : undefined),
  }),
}));
vi.mock('../../../src/lib/scrape/index.ts', async (importOriginal) => ({
  ...(await importOriginal<ScrapeModule>()),
  scrapeRug: (...args: unknown[]) => state.scrape(...args),
}));

import { newSession } from '../../../src/lib/admin/auth.ts';
import { adminRuntime } from '../../../src/lib/admin/http.ts';
import { finaliseScraped } from '../../../src/lib/scrape/ladder.ts';
import type { ScrapedRug } from '../../../src/lib/scrape/types.ts';
import { POST as scrapePost, SCRAPE_STATUS } from '../../../src/pages/api/admin/scrape.ts';
import { POST as photosPost } from '../../../src/pages/api/admin/photos.ts';

const session = newSession('owner', Date.now());
const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

const ECG_URL = 'https://www.ecarpetgallery.com/eu_en/red-5x8-andelz-area-rugs-380114?utm=x';
const scraped: ScrapedRug = {
  supplier: 'ecarpetgallery',
  supplierRef: '380114',
  sourceUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
  supplierTitle: 'Red 5x8 Andelz',
  widthCm: 130,
  lengthCm: 226,
  seenPrice: 700,
  seenCurrency: 'USD',
  priceUsd: 700,
  tagsSuggested: ['Red'],
  photos: [{ url: 'https://images.ecarpetwholesale.com/a.jpg' }],
  warnings: [],
};

let sheet: FakeSheet;
beforeEach(() => {
  // Per-session/global API budgets live in module state: reset them so tests do not bleed.
  adminRuntime.limiter = new RateLimiter({ maxKeys: 1000 });
  sheet = fakeSheet({
    settings: [
      ['retail_markup', '1.6', '', ''],
      ['retail_markup.ecarpetgallery', '2', '', ''],
      ['price_round_step', '50', '', ''],
    ],
  });
  state.sheet = sheet;
  state.cache = fakeCache();
  state.drive = undefined;
  state.scrape.mockReset();
  adminRuntime.driveScopeOk = undefined;
});

describe('POST /api/admin/scrape', () => {
  it('passes the supplier markup, the round step and the Rates conversion to scrapeRug and audits the fetch', async () => {
    state.scrape.mockResolvedValue({ ok: true, data: scraped, via: 'impit', cached: false, ms: 1800 });
    const res = await scrapePost(ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: ECG_URL } }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({
      ok: true,
      via: 'impit',
      cached: false,
      ms: 1800,
      audit: { row: 2, action: 'scrape.fetch' },
    });
    expect(out.data.supplierRef).toBe('380114');
    const [url, opts] = state.scrape.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(ECG_URL);
    expect(opts).toMatchObject({ force: false, markup: 2, roundStep: 50, jinaFallback: false });
    expect((opts.convertToUsd as (a: number, c: string) => number | undefined)(92, 'EUR')).toBeCloseTo(100);
    const audit = sheet.auditRows()[0]!;
    expect(audit[2]).toBe('scrape.fetch');
    expect(audit[3]).toBe('-');
    expect(audit[4]).toBe('380114');
    expect(JSON.parse(String(audit[6]))).toMatchObject({
      ok: true,
      via: 'impit',
      supplier: 'ecarpetgallery',
      seenPrice: 700,
      seenCurrency: 'USD',
      ms: 1800,
    });
  });
  it('maps every failure code to its status and carries the manual pre-fill / partial data', async () => {
    expect(SCRAPE_STATUS).toEqual({
      unsupported_host: 400,
      invalid_url: 400,
      blocked: 502,
      fetch_failed: 502,
      not_found: 404,
      parse_failed: 422,
      timeout: 504,
    });
    const manual = { supplier: 'ecarpetgallery', supplierRef: '380114', sourceUrl: scraped.sourceUrl };
    state.scrape.mockResolvedValueOnce({
      ok: false,
      code: 'blocked',
      status: 403,
      message: 'Cloudflare',
      manual,
    });
    const blocked = await scrapePost(
      ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: ECG_URL } }),
    );
    expect(blocked.status).toBe(502);
    expect(await blocked.json()).toMatchObject({
      ok: false,
      error: 'blocked',
      message: 'Cloudflare',
      manual,
      status: 403,
    });
    state.scrape.mockResolvedValueOnce({
      ok: false,
      code: 'parse_failed',
      message: 'no price',
      manual,
      data: { supplierTitle: 'Red' },
    });
    const parse = await scrapePost(
      ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: ECG_URL, force: true } }),
    );
    expect(parse.status).toBe(422);
    expect(await parse.json()).toMatchObject({ error: 'parse_failed', data: { supplierTitle: 'Red' } });
    expect((state.scrape.mock.calls[1] as [string, Record<string, unknown>])[1]).toMatchObject({
      force: true,
    });
    state.scrape.mockResolvedValueOnce({
      ok: false,
      code: 'unsupported_host',
      message: 'only the two suppliers',
      manual: undefined,
    });
    const other = await scrapePost(
      ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: 'https://example.com/products/x' } }),
    );
    expect(other.status).toBe(400);
    expect(await other.json()).toMatchObject({ error: 'unsupported_host', manual: null });
    state.scrape.mockResolvedValueOnce({ ok: false, code: 'timeout', message: 'slow', manual });
    expect(
      (await scrapePost(ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: ECG_URL } }))).status,
    ).toBe(504);
    expect(sheet.auditRows()).toHaveLength(4); // every call is audited
    expect(JSON.parse(String(sheet.auditRows()[3]![6]))).toMatchObject({
      ok: false,
      code: 'blocked',
      status: 403,
    });
  });
  it('applies the scrape limit: 10 per session per minute, 30 per 10 minutes globally', async () => {
    state.scrape.mockResolvedValue({ ok: true, data: scraped, via: 'impit', cached: true, ms: 1 });
    const s = newSession('owner', Date.now());
    for (let i = 0; i < 10; i++) {
      const r = await scrapePost(
        apiContext({
          session: s,
          path: '/api/admin/scrape',
          method: 'POST',
          body: { url: ECG_URL },
        }) as unknown as APIContext,
      );
      expect(r.status).toBe(200);
    }
    const limited = await scrapePost(
      apiContext({
        session: s,
        path: '/api/admin/scrape',
        method: 'POST',
        body: { url: ECG_URL },
      }) as unknown as APIContext,
    );
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // other sessions share the global window (30/10 min): 10 already consumed above
    let globalHit = 0;
    for (let n = 0; n < 3; n++) {
      const other = newSession('owner', Date.now());
      for (let i = 0; i < 10; i++) {
        const r = await scrapePost(
          apiContext({
            session: other,
            path: '/api/admin/scrape',
            method: 'POST',
            body: { url: ECG_URL },
          }) as unknown as APIContext,
        );
        if (r.status === 429) globalHit++;
      }
    }
    expect(globalHit).toBe(10);
    expect(state.scrape).toHaveBeenCalledTimes(30);
  });
  it('validates the body', async () => {
    const short = await scrapePost(ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: 'x' } }));
    expect(short.status).toBe(400);
    expect(state.scrape).not.toHaveBeenCalled();
  });

  it('answers photo-first: primaryImage, Size Label/Band and fieldStatus ahead of data (brief §11)', async () => {
    const derived = finaliseScraped(scraped);
    state.scrape.mockResolvedValue({
      ok: true,
      data: derived,
      primaryImage: derived.primaryImage,
      via: 'impit',
      cached: false,
      ms: 1800,
    });
    const res = await scrapePost(ctx({ path: '/api/admin/scrape', method: 'POST', body: { url: ECG_URL } }));
    const text = await res.text();
    const out = JSON.parse(text);
    expect(out.primaryImage).toBe('https://images.ecarpetwholesale.com/a.jpg');
    // Serialised before the (slower, larger) product body so a client can paint the photo first.
    expect(Object.keys(out).slice(0, 2)).toEqual(['ok', 'primaryImage']);
    expect(text.indexOf('"primaryImage"')).toBeLessThan(text.indexOf('"data"'));
    expect(out.sizeLabel).toBe('130 × 226 cm');
    expect(out.sizeBand).toBe('M');
    expect(out.fieldStatus).toEqual(out.data.fieldStatus);
    expect(out.fieldStatus.method).toBe('missing');
    expect(out.fieldStatus.sizeBand).toBe('inferred');
    expect(out.data.primaryImage).toBe(out.primaryImage);
  });
});

describe('POST /api/admin/photos', () => {
  const body = {
    urls: [
      'https://cdn.shopify.com/s/a.jpg?width=1600',
      'https://cdn.shopify.com/s/b.jpg',
      'https://evil.example/c.jpg',
    ],
    namePrefix: 'winks',
  };
  it('answers 409 drive_not_authorised in service-account mode and when the scope is missing', async () => {
    const sa = await photosPost(ctx({ path: '/api/admin/photos', method: 'POST', body }));
    expect(sa.status).toBe(409);
    expect(await sa.json()).toMatchObject({ error: 'drive_not_authorised', reason: 'service_account' });
    expect(adminRuntime.driveScopeOk).toBe(false);
    state.drive = {
      scopeStatus: async () => ({ driveScopeOk: false, scopes: [], reason: 'scope_missing', checkedAt: 1 }),
      uploadFromUrl: vi.fn(),
      ensureFolder: async () => 'folder',
    };
    const scope = await photosPost(ctx({ path: '/api/admin/photos', method: 'POST', body }));
    expect(scope.status).toBe(409);
    expect(await scope.json()).toMatchObject({ error: 'drive_not_authorised', reason: 'scope_missing' });
    expect(sheet.auditRows()).toHaveLength(0);
  });
  it('imports sequentially, names files <prefix>-<n>.jpg, reports per-URL outcomes and audits photo.import', async () => {
    const upload = vi.fn(async (url: string, name: string): Promise<UploadResult> => {
      if (url.includes('evil')) return { error: 'unsupported_host', detail: 'host not allow-listed' };
      if (url.includes('/b.jpg')) return { error: 'not_visible', id: '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
      return { id: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb', name };
    });
    state.drive = {
      scopeStatus: async () => ({ driveScopeOk: true, scopes: ['drive.file'], checkedAt: 1 }),
      uploadFromUrl: upload,
      ensureFolder: async () => 'folder',
    };
    const res = await photosPost(ctx({ path: '/api/admin/photos', method: 'POST', body }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.imported).toBe(1);
    expect(out.photos).toEqual([
      { url: body.urls[0], id: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb', name: 'winks-1.jpg' },
      { url: body.urls[1], error: 'not_visible', id: '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      { url: body.urls[2], error: 'unsupported_host', detail: 'host not allow-listed' },
    ]);
    expect(out.audit).toEqual({ row: 2, action: 'photo.import' });
    expect(upload.mock.calls.map((c) => c[1])).toEqual(['winks-1.jpg', 'winks-2.jpg', 'winks-3.jpg']);
    expect(adminRuntime.driveScopeOk).toBe(true);
    const audit = sheet.auditRows()[0]!;
    expect(audit[3]).toBe('Drive');
    expect(audit[4]).toBe('winks');
    expect(JSON.parse(String(audit[6]))).toEqual({
      ids: ['1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb'],
      failed: [
        { url: body.urls[1], error: 'not_visible' },
        { url: body.urls[2], error: 'unsupported_host' },
      ],
    });
    // nothing imported → 502 with the outcomes
    upload.mockResolvedValue({ error: 'download_failed' });
    const none = await photosPost(
      ctx({ path: '/api/admin/photos', method: 'POST', body: { urls: [body.urls[0]], namePrefix: 'x' } }),
    );
    expect(none.status).toBe(502);
    expect(await none.json()).toMatchObject({ ok: false, error: 'upload_failed', imported: 0 });
  });
  it('validates urls (https only, ≤ 12) and the prefix', async () => {
    state.drive = {
      scopeStatus: async () => ({ driveScopeOk: true, scopes: [], checkedAt: 1 }),
      uploadFromUrl: vi.fn(),
      ensureFolder: async () => 'f',
    };
    const http = await photosPost(
      ctx({
        path: '/api/admin/photos',
        method: 'POST',
        body: { urls: ['http://cdn.shopify.com/a.jpg'], namePrefix: 'x' },
      }),
    );
    expect(http.status).toBe(400);
    const prefix = await photosPost(
      ctx({
        path: '/api/admin/photos',
        method: 'POST',
        body: { urls: ['https://cdn.shopify.com/a.jpg'], namePrefix: 'bad prefix' },
      }),
    );
    expect(prefix.status).toBe(400);
    const many = await photosPost(
      ctx({
        path: '/api/admin/photos',
        method: 'POST',
        body: {
          urls: Array.from({ length: 13 }, (_, i) => `https://cdn.shopify.com/${i}.jpg`),
          namePrefix: 'x',
        },
      }),
    );
    expect(many.status).toBe(400);
  });
});
