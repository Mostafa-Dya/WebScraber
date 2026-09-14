// /api/admin/rugs* handlers against the in-memory sheet (docs/ADMIN_SPEC.md §2.3, §3.4): create
// writes the row and its audit entry in ONE batchUpdate, allocates SL-nnn, derives the slug, rounds
// the price; update answers 409 with the fresh row on a stale version; status archives / restores;
// unknown collection / tag → 422; oversized bodies → 413; every mutation invalidates the catalogue.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { adminRugRow, apiContext, fakeCache, fakeSheet, type FakeSheet } from './fake-sheets.ts';

const state = vi.hoisted(() => ({ sheet: undefined as unknown, cache: undefined as unknown }));

vi.mock('astro:env/server', async () => ({ ...(await import('./fake-sheets.ts')).ENV_MOCK }));

vi.mock('../../../src/lib/runtime.ts', () => ({
  getClient: () => (state.sheet as FakeSheet).client,
  getCache: () => state.cache,
  getAdminDeps: () => ({
    authMode: 'service_account',
    scrape: { jinaFallback: true },
    convertToUsd: () => undefined,
  }),
}));

import { newSession } from '../../../src/lib/admin/auth.ts';
import { rugVersion } from '../../../src/lib/admin/read.ts';
import { PRODUCT_COLS } from '../../../src/lib/sheets/contract.ts';
import {
  GET as listGet,
  POST as createPost,
  ALL as rugsAll,
} from '../../../src/pages/api/admin/rugs/index.ts';
import { GET as nextIdGet } from '../../../src/pages/api/admin/rugs/next-id.ts';
import { GET as oneGet, POST as updatePost } from '../../../src/pages/api/admin/rugs/[id]/index.ts';
import { POST as statusPost } from '../../../src/pages/api/admin/rugs/[id]/status.ts';

const session = newSession('owner', Date.now());
const PHOTO = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';

function seed(): FakeSheet {
  const sheet = fakeSheet({
    rugs: [
      adminRugRow({ id: 'SL-021' }, ['https://karavanrug.com/products/winks', 'karavanrug', '1389', '']),
      adminRugRow({ id: 'SL-029', name: 'Yellow', slug: 'yellow', status: 'draft' }),
      adminRugRow({ id: '1389', name: 'Old', status: 'archived' }),
    ],
    collections: [
      ['kilims', 'Kilims', 'kilims', '', '', '', 1],
      ['tulu', 'Tulu', 'tulu', '', '', '', 2],
    ],
    tags: [
      ['kilim', 'kilim', 'Kilim', ''],
      ['denizli', 'denizli', 'Denizli', '#bb3e03'],
      ['plant-dyes', 'plant-dyes', 'Plant Dyes', ''],
    ],
    settings: [
      ['price_round_step', '5', '', ''],
      ['default_status', 'draft', '', ''],
    ],
  });
  return sheet;
}

const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

let sheet: FakeSheet;
let cache: ReturnType<typeof fakeCache>;
beforeEach(() => {
  sheet = seed();
  cache = fakeCache();
  state.sheet = sheet;
  state.cache = cache;
});

const baseInput = {
  name: 'Khal Mohammadi',
  collections: ['kilims'], // case-insensitive match → canonical "Kilims"
  tags: ['KILIM', 'Denizli'],
  photos: [PHOTO],
  widthCm: 130,
  lengthCm: 226,
  material: '100% Wool',
  method: 'Hand-knotted',
  age: 'Vintage',
  origin: 'Afghanistan',
  priceUsd: 1332.4,
  featured: true,
  sourceUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
  supplier: 'ecarpetgallery',
  supplierRef: '380114',
  notes: 'bought at the fair',
  roundPrice: true,
};

describe('GET /api/admin/rugs and next-id', () => {
  it('lists every rug with row + version and filters by status / q', async () => {
    const res = await listGet(ctx({ path: '/api/admin/rugs' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.rugs.map((r: { id: string }) => r.id)).toEqual(['SL-021', 'SL-029', '1389']);
    expect(body.rugs[0]).toMatchObject({ row: 2, supplier: 'karavanrug', supplierRef: '1389' });
    expect(body.rugs[0].version).toMatch(/^[a-f0-9]{16}$/);
    expect(body.collections).toHaveLength(2);
    const drafts = await (await listGet(ctx({ path: '/api/admin/rugs?status=draft' }))).json();
    expect(drafts.rugs.map((r: { id: string }) => r.id)).toEqual(['SL-029']);
    const q = await (await listGet(ctx({ path: '/api/admin/rugs?status=all&q=1389' }))).json();
    expect(q.rugs.map((r: { id: string }) => r.id)).toEqual(['SL-021', '1389']);
    const next = await (await nextIdGet(ctx({ path: '/api/admin/rugs/next-id' }))).json();
    expect(next).toEqual({ ok: true, id: 'SL-030' });
    expect((await rugsAll(ctx({ path: '/api/admin/rugs' }))).status).toBe(405);
  });
  it('requires a session (the gate answers first; the wrapper re-checks)', async () => {
    const res = await listGet(ctx({ path: '/api/admin/rugs', session: undefined }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/rugs (rug.create)', () => {
  it('writes the row and its audit entry in ONE batchUpdate, allocates SL-030, derives the slug, rounds the price', async () => {
    const res = await createPost(ctx({ path: '/api/admin/rugs', method: 'POST', body: baseInput }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.row).toBe(5);
    expect(body.audit).toEqual({ row: 2, action: 'rug.create' });
    expect(body.rug).toMatchObject({
      id: 'SL-030',
      slug: 'khal-mohammadi',
      name: 'Khal Mohammadi',
      collections: ['Kilims'],
      tags: ['Kilim', 'Denizli'],
      photos: [PHOTO],
      priceUsd: 1335,
      featured: true,
      status: 'active',
      supplier: 'ecarpetgallery',
      supplierRef: '380114',
      notes: 'bought at the fair',
      row: 5,
    });
    expect(body.rug.version).toBe(rugVersion(sheet.row('Products', 5)));
    // one batchUpdate containing the Rugs cells AND the AuditLog insert
    expect(sheet.writes).toHaveLength(1);
    const reqs = sheet.writes[0] as Array<Record<string, unknown>>;
    const sheetIds = reqs.map((r) => {
      const u = r.updateCells as { start?: { sheetId: number } } | undefined;
      const i = r.insertDimension as { range?: { sheetId: number } } | undefined;
      return u?.start?.sheetId ?? i?.range?.sheetId;
    });
    expect(sheetIds).toContain(11);
    expect(sheetIds).toContain(99);
    const written = sheet.row('Products', 5);
    expect(written[0]).toBe('SL-030');
    expect(written[PRODUCT_COLS.variantPrice]).toBe(1335);
    expect(String(written[PRODUCT_COLS.scrapedAt])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(written[PRODUCT_COLS.sourceUrl]).toBe(baseInput.sourceUrl);
    const audit = sheet.auditRows()[0]!;
    expect(audit[2]).toBe('rug.create');
    expect(audit[4]).toBe('SL-030');
    expect(JSON.parse(String(audit[6]))).toMatchObject({
      id: 'SL-030',
      priceUsd: 1335,
      requestedPrice: 1332.4,
    });
    expect(audit[7]).toMatch(/^[a-f0-9]{32}$/);
    expect(cache.busts).toBe(1);
  });
  it('honours a typed id / slug, refuses duplicates (409) and a number below the sequence (422)', async () => {
    const dup = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, id: 'sl-021' } }),
    );
    expect(dup.status).toBe(409);
    const low = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, id: 'SL-012' } }),
    );
    expect(low.status).toBe(422);
    const slug = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, slug: 'yellow' } }),
    );
    expect(slug.status).toBe(409);
    expect(await slug.json()).toMatchObject({ error: 'slug exists' });
    const ok = await createPost(
      ctx({
        path: '/api/admin/rugs',
        method: 'POST',
        body: { ...baseInput, id: 'ECG-380114', slug: 'custom-slug', roundPrice: false },
      }),
    );
    expect(ok.status).toBe(201);
    expect((await ok.json()).rug).toMatchObject({ id: 'ECG-380114', slug: 'custom-slug', priceUsd: 1332.4 });
    // a second create with the same name gets a -2 slug
    const again = await createPost(ctx({ path: '/api/admin/rugs', method: 'POST', body: baseInput }));
    expect((await again.json()).rug.slug).toBe('khal-mohammadi');
    const third = await createPost(ctx({ path: '/api/admin/rugs', method: 'POST', body: baseInput }));
    expect((await third.json()).rug).toMatchObject({ id: 'SL-031', slug: 'khal-mohammadi-2' });
  });
  it('refuses an unknown collection or tag with 422 and writes nothing', async () => {
    const c = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, collections: ['Nope'] } }),
    );
    expect(c.status).toBe(422);
    expect(await c.json()).toMatchObject({ ok: false, error: 'unknown collection', collection: 'Nope' });
    const t = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, tags: ['Kilim', 'Ghost'] } }),
    );
    expect(t.status).toBe(422);
    expect(await t.json()).toMatchObject({ error: 'unknown tag', tag: 'Ghost' });
    expect(sheet.writes).toHaveLength(0);
    expect(cache.busts).toBe(0);
  });
  it('validates the body (400 with issues), the size (413) and the content type (415)', async () => {
    const bad = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, name: '', widthCm: 5 } }),
    );
    expect(bad.status).toBe(400);
    const issues = (await bad.json()).issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['name', 'widthCm']));
    const big = await createPost(
      ctx({
        path: '/api/admin/rugs',
        method: 'POST',
        body: { ...baseInput, description: 'x'.repeat(70_000) },
      }),
    );
    expect(big.status).toBe(413);
    const text = await createPost(
      ctx({
        path: '/api/admin/rugs',
        method: 'POST',
        rawBody: 'name=x',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    expect(text.status).toBe(415);
    expect(sheet.writes).toHaveLength(0);
  });
  it('refuses to write when the Products tab has no header row (503, run sheet:init)', async () => {
    state.sheet = fakeSheet({
      rugsHeader: [],
      rugs: [adminRugRow({ id: 'SL-021' })],
      collections: [['kilims', 'Kilims', 'kilims', '', '', '', 1]],
    });
    const res = await createPost(
      ctx({ path: '/api/admin/rugs', method: 'POST', body: { ...baseInput, tags: [] } }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'sheet not initialised' });
  });
});

describe('GET/POST /api/admin/rugs/[id] (rug.update)', () => {
  it('reads one rug (404 for unknown) and updates B:P + U:Z with a diff-only audit row', async () => {
    const one = await oneGet(ctx({ path: '/api/admin/rugs/SL-021', params: { id: 'SL-021' } }));
    expect(one.status).toBe(200);
    const rug = (await one.json()).rug;
    expect(rug).toMatchObject({ id: 'SL-021', row: 2 });
    const missing = await oneGet(ctx({ path: '/api/admin/rugs/SL-999', params: { id: 'SL-999' } }));
    expect(missing.status).toBe(404);

    const body = {
      ...baseInput,
      name: 'Winks renamed',
      slug: undefined,
      collections: ['Tulu'],
      tags: ['Kilim'],
      priceUsd: 705,
      roundPrice: false,
      version: rug.version,
      supplier: 'karavanrug',
      sourceUrl: 'https://karavanrug.com/products/winks',
    };
    const res = await updatePost(
      ctx({ path: '/api/admin/rugs/SL-021', method: 'POST', params: { id: 'SL-021' }, body }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.audit).toEqual({ row: 2, action: 'rug.update' });
    expect(out.rug).toMatchObject({
      id: 'SL-021',
      slug: 'winks',
      name: 'Winks renamed',
      collections: ['Tulu'],
      row: 2,
    });
    expect(out.rug.version).not.toBe(rug.version);
    expect(out.changed).toEqual(expect.arrayContaining(['name', 'collections', 'priceUsd']));
    expect(out.changed).not.toContain('slug'); // kept on rename (stable URLs)
    const written = sheet.row('Products', 2);
    expect(written[0]).toBe('SL-021');
    expect(written[2]).toBe('Winks renamed');
    expect(written[PRODUCT_COLS.collection]).toBe('Tulu'); // the update moved it
    const audit = sheet.auditRows()[0]!;
    expect(audit[2]).toBe('rug.update');
    const before = JSON.parse(String(audit[5]));
    const after = JSON.parse(String(audit[6]));
    expect(before).toMatchObject({ name: 'Winks', collections: ['Kilims'] });
    expect(after).toMatchObject({ name: 'Winks renamed', collections: ['Tulu'] });
    expect(before).not.toHaveProperty('slug');
    expect(sheet.writes).toHaveLength(1);
    expect(cache.busts).toBe(1);
  });
  it('answers 409 with the fresh rug on a stale version and writes nothing', async () => {
    const res = await updatePost(
      ctx({
        path: '/api/admin/rugs/SL-021',
        method: 'POST',
        params: { id: 'SL-021' },
        body: { ...baseInput, version: 'a'.repeat(16) },
      }),
    );
    expect(res.status).toBe(409);
    const out = await res.json();
    expect(out).toMatchObject({ ok: false, error: 'version mismatch', row: 2 });
    expect(out.rug).toMatchObject({ id: 'SL-021', name: 'Winks' });
    expect(out.rug.version).toMatch(/^[a-f0-9]{16}$/);
    expect(sheet.writes).toHaveLength(0);
    expect(cache.busts).toBe(0);
  });
  it('reports an unchanged save without writing, and takes a regenerated slug when it is free', async () => {
    const rug = (
      await (await oneGet(ctx({ path: '/api/admin/rugs/SL-029', params: { id: 'SL-029' } }))).json()
    ).rug;
    const same = {
      name: rug.name,
      description: rug.description,
      collections: rug.collections,
      tags: rug.tags,
      photos: rug.photos,
      widthCm: rug.widthCm,
      lengthCm: rug.lengthCm,
      material: rug.material,
      method: rug.method,
      age: rug.age,
      origin: rug.origin,
      priceUsd: rug.priceUsd,
      rotate: rug.rotate,
      featured: rug.featured,
      status: rug.status,
      supplier: rug.supplier,
      supplierRef: rug.supplierRef,
      notes: rug.notes,
      version: rug.version,
    };
    const unchanged = await updatePost(
      ctx({ path: '/api/admin/rugs/SL-029', method: 'POST', params: { id: 'SL-029' }, body: same }),
    );
    expect(await unchanged.json()).toMatchObject({ ok: true, unchanged: true });
    expect(sheet.writes).toHaveLength(0);
    const taken = await updatePost(
      ctx({
        path: '/api/admin/rugs/SL-029',
        method: 'POST',
        params: { id: 'SL-029' },
        body: { ...same, slug: 'winks' },
      }),
    );
    expect(taken.status).toBe(409);
    const renamed = await updatePost(
      ctx({
        path: '/api/admin/rugs/SL-029',
        method: 'POST',
        params: { id: 'SL-029' },
        body: { ...same, slug: 'sunny' },
      }),
    );
    expect((await renamed.json()).rug.slug).toBe('sunny');
  });
});

describe('POST /api/admin/rugs/[id]/status (rug.status)', () => {
  it('archives then restores with {status} audit rows and a fresh version each time', async () => {
    const rug = (
      await (await oneGet(ctx({ path: '/api/admin/rugs/SL-021', params: { id: 'SL-021' } }))).json()
    ).rug;
    const archived = await statusPost(
      ctx({
        path: '/api/admin/rugs/SL-021/status',
        method: 'POST',
        params: { id: 'SL-021' },
        body: { status: 'archived', version: rug.version },
      }),
    );
    expect(archived.status).toBe(200);
    const a = await archived.json();
    expect(a.rug.status).toBe('archived');
    expect(a.audit).toEqual({ row: 2, action: 'rug.status' });
    expect(sheet.row('Products', 2)[PRODUCT_COLS.status]).toBe('archived');
    expect(JSON.parse(String(sheet.auditRows()[0]![5]))).toEqual({ status: 'active' });
    expect(JSON.parse(String(sheet.auditRows()[0]![6]))).toEqual({ status: 'archived' });
    const stale = await statusPost(
      ctx({
        path: '/api/admin/rugs/SL-021/status',
        method: 'POST',
        params: { id: 'SL-021' },
        body: { status: 'active', version: rug.version },
      }),
    );
    expect(stale.status).toBe(409);
    const restored = await statusPost(
      ctx({
        path: '/api/admin/rugs/SL-021/status',
        method: 'POST',
        params: { id: 'SL-021' },
        body: { status: 'active', version: a.rug.version },
      }),
    );
    expect((await restored.json()).rug.status).toBe('active');
    expect(sheet.auditRows()).toHaveLength(2);
    expect(cache.busts).toBe(2);
    const unknown = await statusPost(
      ctx({
        path: '/api/admin/rugs/SL-404/status',
        method: 'POST',
        params: { id: 'SL-404' },
        body: { status: 'active', version: a.rug.version },
      }),
    );
    expect(unknown.status).toBe(404);
  });
});
