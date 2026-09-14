// POST /api/admin/rugs/[id]/retry — finishing a row whose photo import did not complete (brief §12).
//
// The row-first commit's other half: the import writes the row `pending` before it uploads, so what a
// failure leaves behind is a visible row rather than orphaned files. These tests pin the contract that
// makes the Retry button safe to press — it is idempotent, it uploads only what is actually missing
// from Drive, and it only says `complete` when everything landed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import type * as ScrapeModuleNs from '../../../src/lib/scrape/index.ts';
type ScrapeModule = typeof ScrapeModuleNs;
import type { CellValue } from '../../../src/lib/sheets/client.ts';
import type { UploadResult } from '../../../src/lib/drive/types.ts';
import { adminRugRow, apiContext, fakeCache, fakeSheet, type FakeSheet } from './fake-sheets.ts';

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
  getAdminDeps: () => ({
    authMode: state.drive ? 'oauth_refresh' : 'service_account',
    drive: state.drive,
    scrape: { jinaFallback: false, respectRobots: true },
    convertToUsd: () => undefined,
  }),
}));
vi.mock('../../../src/lib/scrape/index.ts', async (importOriginal) => ({
  ...(await importOriginal<ScrapeModule>()),
  scrapeRug: (...args: unknown[]) => state.scrape(...args),
}));

import { newSession } from '../../../src/lib/admin/auth.ts';
import { PRODUCT_COLS } from '../../../src/lib/sheets/contract.ts';
import type { ScrapedRug } from '../../../src/lib/scrape/types.ts';
import { POST as retryPost, ALL as retryAll } from '../../../src/pages/api/admin/rugs/[id]/retry.ts';

const session = newSession('owner', Date.now());
const SOURCE = 'https://karavanrug.com/products/winks';
const PRIMARY = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const FOLDERS = {
  productId: '1PRODUCTfolderAAAAAAAAAAAAAAAAAA',
  allImagesId: '1ALLIMAGESfolderBBBBBBBBBBBBBBBB',
  name: 'SL-021 — Winks',
  url: 'https://drive.google.com/drive/folders/1PRODUCTfolderAAAAAAAAAAAAAAAAAA',
};

/** Three photos on the supplier page; the row only ever records the first. */
const scraped = (n = 3): ScrapedRug => ({
  supplier: 'karavanrug',
  supplierRef: '1389',
  sourceUrl: SOURCE,
  supplierTitle: 'Winks',
  widthCm: 135,
  lengthCm: 190,
  seenPrice: 576,
  seenCurrency: 'USD',
  priceUsd: 576,
  tagsSuggested: [],
  photos: Array.from({ length: n }, (_, i) => ({ url: `https://images.karavanrug.com/${i + 1}.jpg` })),
  warnings: [],
});

/** A Products row that already carries the primary and is parked at `pending`. */
function pendingRow(over: Record<string, CellValue> = {}): CellValue[] {
  const sourceUrl = typeof over.source_url === 'string' ? over.source_url : SOURCE;
  const row = adminRugRow({ id: 'SL-021', slug: 'winks', photos: PRIMARY, ...over }, [
    sourceUrl,
    'karavanrug',
    '1389',
    '',
  ]);
  row[PRODUCT_COLS.commitStatus] = 'pending';
  return row;
}

function driveWith(over: Partial<Record<'upload' | 'list', unknown>> = {}) {
  const uploads: string[][] = [];
  let n = 0;
  return {
    uploads,
    client: {
      scopeStatus: async () => ({ driveScopeOk: true, scopes: ['drive.file'], checkedAt: 1 }),
      ensureProductFolders: vi.fn(async () => FOLDERS),
      uploadFromUrl: vi.fn(async (url: string, name: string, folder: string): Promise<UploadResult> => {
        uploads.push([url, name, folder]);
        if (typeof over.upload === 'function') return (over.upload as (i: number) => UploadResult)(n++);
        n++;
        return { id: `1NEWfile${String(n).padStart(2, '0')}CCCCCCCCCCCCCCCCC`, name };
      }),
      copyFile: vi.fn(async () => ({ id: '1COPYfileDDDDDDDDDDDDDDDDDDDDDDD', name: '01-primary' })),
      listFolder: vi.fn(async () =>
        typeof over.list === 'function'
          ? (over.list as () => Map<string, string>)()
          : new Map<string, string>(),
      ),
    },
  };
}

const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

const call = async (body: unknown = {}, id = 'SL-021'): Promise<Response> =>
  retryPost(ctx({ path: `/api/admin/rugs/${id}/retry`, method: 'POST', params: { id }, body }));

let sheet: FakeSheet;
let cache: ReturnType<typeof fakeCache>;
beforeEach(() => {
  sheet = fakeSheet({ rugs: [pendingRow()] });
  cache = fakeCache();
  state.sheet = sheet;
  state.cache = cache;
  state.drive = driveWith().client;
  state.scrape.mockReset();
  state.scrape.mockResolvedValue({ ok: true, data: scraped(), via: 'impit', cached: false, ms: 10 });
});

describe('POST /api/admin/rugs/[id]/retry — refusals', () => {
  it('404s an unknown id', async () => {
    const res = await call({}, 'SL-999');
    expect(res.status).toBe(404);
    expect(sheet.auditRows()).toHaveLength(0);
  });

  it('409s in service-account mode and when the Drive scope is missing, without scraping', async () => {
    state.drive = undefined;
    const sa = await call();
    expect(sa.status).toBe(409);
    expect(await sa.json()).toMatchObject({ error: 'drive_not_authorised', reason: 'service_account' });

    state.drive = {
      ...driveWith().client,
      scopeStatus: async () => ({ driveScopeOk: false, scopes: [], reason: 'scope_missing', checkedAt: 1 }),
    };
    const scope = await call();
    expect(scope.status).toBe(409);
    expect(await scope.json()).toMatchObject({ error: 'drive_not_authorised', reason: 'scope_missing' });
    expect(state.scrape).not.toHaveBeenCalled();
  });

  it('422s a row with no source URL, because there is nowhere to fetch the photos from', async () => {
    sheet = fakeSheet({ rugs: [pendingRow({ source_url: '' })] });
    state.sheet = sheet;
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'no_source' });
    expect(state.scrape).not.toHaveBeenCalled();
  });

  it('502s when the supplier page cannot be read again', async () => {
    state.scrape.mockResolvedValue({ ok: false, code: 'blocked', message: 'Cloudflare' });
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'scrape_failed', reason: 'blocked' });
  });

  it('422s when the page no longer offers any photographs', async () => {
    state.scrape.mockResolvedValue({ ok: true, data: scraped(0), via: 'impit', cached: false, ms: 10 });
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'no_photos' });
  });

  it('answers 405 to anything but POST', async () => {
    const res = await retryAll(ctx({ path: '/api/admin/rugs/SL-021/retry' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('POST /api/admin/rugs/[id]/retry — finishing the import', () => {
  it('uploads only what All Images is missing and marks the row complete', async () => {
    // The first two photos landed before the original import died.
    const drive = driveWith({
      list: () =>
        new Map([
          ['01-primary', PRIMARY],
          ['winks-02', '1OLDfile02EEEEEEEEEEEEEEEEEEEEEE'],
        ]),
    });
    state.drive = drive.client;

    const res = await call();
    expect(res.status).toBe(200);
    const out = await res.json();

    // Exactly one upload: the third photo, into All Images, under its deterministic name.
    expect(drive.uploads).toEqual([['https://images.karavanrug.com/3.jpg', 'winks-03', FOLDERS.allImagesId]]);
    expect(out).toMatchObject({ ok: true, imported: 1, reused: 2, complete: true });

    const row = sheet.row('Products', 2);
    expect(row[PRODUCT_COLS.commitStatus]).toBe('complete');
    expect(row[PRODUCT_COLS.driveFolderId]).toBe(FOLDERS.productId);
    expect(row[PRODUCT_COLS.driveFolderUrl]).toBe(FOLDERS.url);
    // The row keeps its own primary, so finishing an import never reshuffles the card image.
    expect(String(row[PRODUCT_COLS.imageSrc])).toContain(PRIMARY);
  });

  it('is idempotent: pressing it again uploads nothing and still reads complete', async () => {
    const all = new Map([
      ['01-primary', PRIMARY],
      ['winks-02', '1OLDfile02EEEEEEEEEEEEEEEEEEEEEE'],
      ['winks-03', '1OLDfile03FFFFFFFFFFFFFFFFFFFFFF'],
    ]);
    const drive = driveWith({ list: () => all });
    state.drive = drive.client;

    const out = await (await call()).json();
    expect(drive.uploads).toEqual([]);
    expect(out).toMatchObject({ ok: true, imported: 0, reused: 3, complete: true });
    expect(sheet.row('Products', 2)[PRODUCT_COLS.commitStatus]).toBe('complete');
  });

  it('leaves the row pending when a photo still fails, so the button stays available', async () => {
    const drive = driveWith({
      upload: (i: number) =>
        i === 2
          ? { error: 'download_failed', detail: '404' }
          : { id: `1RETRYfile${i}GGGGGGGGGGGGGGGGGGG`, name: 'x' },
    });
    state.drive = drive.client;

    const res = await call();
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, imported: 2, complete: false });
    expect(out.photos[2]).toMatchObject({ error: 'download_failed', detail: '404' });
    expect(sheet.row('Products', 2)[PRODUCT_COLS.commitStatus]).toBe('pending');
  });

  it('audits the import and busts the catalogue snapshot', async () => {
    await call();
    const audit = sheet.auditRows()[0]!;
    expect(audit[2]).toBe('photo.import');
    expect(audit[3]).toBe('Drive');
    expect(audit[4]).toBe('SL-021');
    expect(JSON.parse(String(audit[6]))).toEqual({
      wanted: 3,
      imported: 3,
      reused: 0,
      commitStatus: 'complete',
    });
    expect(audit[9]).toBe('row 2');
    // The primary is a catalogue-visible cell: the public snapshot must not outlive the write.
    expect(cache.busts).toBe(1);
  });

  it('re-scrapes the source URL on the row rather than trusting the request body', async () => {
    await call({ driveFolderUrl: 'https://evil.example/' });
    expect(state.scrape).toHaveBeenCalledWith(SOURCE, expect.objectContaining({ respectRobots: true }));
    expect(sheet.row('Products', 2)[PRODUCT_COLS.driveFolderUrl]).toBe(FOLDERS.url);
  });

  it('409s on a stale version and writes nothing', async () => {
    const res = await call({ version: 'a'.repeat(16) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: 'version mismatch' });
    expect(sheet.row('Products', 2)[PRODUCT_COLS.commitStatus]).toBe('pending');
  });
});
