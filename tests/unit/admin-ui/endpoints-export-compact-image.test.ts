// The three routes added from brief §14, against the in-memory sheet and a stub Drive client:
// GET /api/admin/export/shopify-csv (brief §9), POST /api/admin/compact-reactions (brief §3 rule 3)
// and GET /api/image/[fileId] (brief §12).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { adminRugRow, apiContext, fakeCache, fakeSheet, type FakeSheet } from './fake-sheets.ts';
import type { CellValue } from '../../../src/lib/sheets/client.ts';

const state = vi.hoisted(() => ({
  sheet: undefined as unknown,
  cache: undefined as unknown,
  drive: undefined as unknown,
}));

vi.mock('astro:env/server', async () => ({ ...(await import('./fake-sheets.ts')).ENV_MOCK }));
vi.mock('../../../src/lib/runtime.ts', () => ({
  getClient: () => (state.sheet as FakeSheet).client,
  getCache: () => state.cache,
  getAdminDeps: () => ({
    authMode: 'oauth_refresh',
    drive: state.drive,
    scrape: { jinaFallback: true },
    convertToUsd: () => undefined,
  }),
}));

import { newSession } from '../../../src/lib/admin/auth.ts';
import { PRODUCT_HEADER_LABELS } from '../../../src/lib/sheets/contract.ts';
import { GET as exportGet, ALL as exportAll } from '../../../src/pages/api/admin/export/shopify-csv.ts';
import { POST as compactPost, ALL as compactAll } from '../../../src/pages/api/admin/compact-reactions.ts';
import { GET as imageGet, ALL as imageAll } from '../../../src/pages/api/image/[fileId].ts';

const FILE_ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const session = newSession('owner', Date.now());
const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

const ev = (id: string, slug: string, product: string, reaction: string): CellValue[] => [
  id,
  slug,
  product,
  reaction,
  'card',
  `2026-09-08T${id.slice(1).padStart(2, '0')}:00:00Z`,
];

let sheet: FakeSheet;
beforeEach(() => {
  sheet = fakeSheet({
    rugs: [
      adminRugRow({ id: 'SL-021', slug: 'winks', name: 'Winks', price_usd: 576 }),
      adminRugRow({ id: 'SL-022', slug: 'yellow', name: 'Yellow, "bright"', price_usd: 900 }),
    ],
    votes: [
      ev('e9', 'hala', 'SL-021', 'like'),
      ev('e8', 'omar', 'SL-022', 'like'),
      ev('e7', 'hala', 'SL-021', 'dislike'),
    ],
  });
  state.sheet = sheet;
  state.cache = fakeCache();
  state.drive = {
    getMedia: async (fileId: string) => ({
      ok: true,
      body: new Response(JPEG).body,
      contentType: 'image/jpeg',
      contentLength: String(JPEG.byteLength),
      fileId,
    }),
  };
});

describe('GET /api/admin/export/shopify-csv (brief §9)', () => {
  it('downloads the Products tab as a Shopify-ordered CSV with the brief s filename', async () => {
    const res = await exportGet(ctx({ path: '/api/admin/export/shopify-csv' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="serio-ludere-products.csv"');
    expect(res.headers.get('cache-control')).toBe('no-store');

    // The BOM has to be asserted on the bytes: `Response.text()` performs a UTF-8 decode, which
    // strips a leading BOM by spec. Excel reads the bytes, so the bytes are what matter.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const csv = new TextDecoder('utf-8').decode(bytes);
    const [header, ...rows] = csv.split('\r\n');
    expect(header!.startsWith('Handle,Title,Body (HTML),Vendor,')).toBe(true);
    expect(header!.split(',')).toHaveLength(PRODUCT_HEADER_LABELS.length);
    expect(rows[0]!.startsWith('winks,Winks,')).toBe(true);
    expect(rows[1]!.startsWith('yellow,"Yellow, ""bright""",')).toBe(true);
    expect(rows[2]).toBe(''); // trailing CRLF, no extra record
    expect(csv).toContain('SL-021'); // Product ID kept, trailing
  });

  it('reads the tab fresh, and refuses anything but GET', async () => {
    await exportGet(ctx({ path: '/api/admin/export/shopify-csv' }));
    expect(sheet.reads).toEqual([['Products!A1:AP']]);

    const res = await exportAll(ctx({ path: '/api/admin/export/shopify-csv', method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('answers 503 when the tab headers no longer match the contract', async () => {
    sheet.row('Products', 1)[15] = 'price_usd';
    const res = await exportGet(ctx({ path: '/api/admin/export/shopify-csv' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: 'sheet contract' });
  });
});

describe('POST /api/admin/compact-reactions (brief §3 rule 3)', () => {
  it('keeps the newest row per pair, archives the rest and reports { ok, kept, archived }', async () => {
    const context = ctx({ path: '/api/admin/compact-reactions', method: 'POST', body: {} });
    const res = await compactPost(context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kept: 2, archived: 1 });

    expect(
      sheet
        .rows('Reactions')
        .slice(0, 2)
        .map((r) => r[0]),
    ).toEqual(['e9', 'e8']);
    expect(sheet.rows('Reactions')[2]).toEqual(['', '', '', '', '', '']);
    expect(sheet.rows('ReactionsArchive').map((r) => r[0])).toEqual(['e7']);
  });

  it('writes one reactions.compact audit row and busts the catalogue cache', async () => {
    const context = ctx({ path: '/api/admin/compact-reactions', method: 'POST', body: {} });
    await compactPost(context);

    const audit = sheet.auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.slice(1, 5)).toEqual(['owner', 'reactions.compact', 'Reactions', 'Reactions']);
    expect(JSON.parse(String(audit[0]![6]))).toEqual({ archived: 1, kept: 2, read: 3 });
    expect((state.cache as ReturnType<typeof fakeCache>).busts).toBe(1);
  });

  it('is safe to run twice: the second call archives nothing and touches no sheet row', async () => {
    const body = { path: '/api/admin/compact-reactions', method: 'POST' as const, body: {} };
    expect(await (await compactPost(ctx(body))).json()).toEqual({ ok: true, kept: 2, archived: 1 });

    const before = sheet.rows('Reactions').map((r) => [...r]);
    const second = await compactPost(ctx(body));
    expect(await second.json()).toEqual({ ok: true, kept: 2, archived: 0 });
    expect(sheet.rows('Reactions')).toEqual(before);
    expect(sheet.rows('ReactionsArchive').map((r) => r[0])).toEqual(['e7']);
    // Still audited (two rows now), but no cache bust for a no-op.
    expect(sheet.auditRows()).toHaveLength(2);
    expect((state.cache as ReturnType<typeof fakeCache>).busts).toBe(1);
  });

  it('refuses a session-less request and anything but POST', async () => {
    const anon = apiContext({
      path: '/api/admin/compact-reactions',
      method: 'POST',
      body: {},
    }) as unknown as APIContext;
    expect((await compactPost(anon)).status).toBe(401);

    const res = await compactAll(ctx({ path: '/api/admin/compact-reactions' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('refuses a cross-site POST before it reads the sheet', async () => {
    const res = await compactPost(
      ctx({
        path: '/api/admin/compact-reactions',
        method: 'POST',
        body: {},
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    );
    expect(res.status).toBe(403);
    expect(sheet.writes).toHaveLength(0);
  });
});

describe('GET /api/image/[fileId] (brief §12)', () => {
  it('streams the Drive bytes with the year-long immutable cache header', async () => {
    const res = await imageGet(ctx({ path: `/api/image/${FILE_ID}`, params: { fileId: FILE_ID } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...JPEG]);
  });

  it('needs no admin session (it serves the buyers preview) but validates the id strictly', async () => {
    const anon = (fileId: string): APIContext =>
      apiContext({ path: `/api/image/${fileId}`, params: { fileId } }) as unknown as APIContext;
    expect((await imageGet(anon(FILE_ID))).status).toBe(200);
    expect((await imageGet(anon('https://evil.example/a.jpg'))).status).toBe(400);
    expect((await imageGet(anon('short'))).status).toBe(400);
  });

  it('answers 503 when the runtime built no Drive client, and 405 for a non-GET', async () => {
    state.drive = undefined;
    const res = await imageGet(ctx({ path: `/api/image/${FILE_ID}`, params: { fileId: FILE_ID } }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'drive_not_authorised' });

    const notAllowed = await imageAll(
      ctx({ path: `/api/image/${FILE_ID}`, method: 'POST', params: { fileId: FILE_ID } }),
    );
    expect(notAllowed.status).toBe(405);
  });

  it('404s an id Drive does not serve and 502s a Drive failure', async () => {
    state.drive = { getMedia: async () => ({ ok: false, error: 'not_found' }) };
    expect((await imageGet(ctx({ path: '/api/image/x', params: { fileId: FILE_ID } }))).status).toBe(404);

    state.drive = { getMedia: async () => ({ ok: false, error: 'drive_error', detail: 'HTTP 500' }) };
    expect((await imageGet(ctx({ path: '/api/image/x', params: { fileId: FILE_ID } }))).status).toBe(502);
  });
});
