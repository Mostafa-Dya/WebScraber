// /api/admin/clients*, /api/admin/audit and /api/admin/settings against the in-memory sheet
// (docs/ADMIN_SPEC.md §3.2, §6): client rows land newest-first on row 2 with a regenerated link,
// status flips are version-guarded, the report joins Votes to Rugs and Clients, audit paging maps
// offsets onto sheet rows, settings are parsed per key and written with an audit row.
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
import { CLIENT_CODE_RE } from '../../../src/lib/admin/dto.ts';
import { GET as clientsGet, POST as clientsPost } from '../../../src/pages/api/admin/clients/index.ts';
import { POST as statusPost } from '../../../src/pages/api/admin/clients/[code]/status.ts';
import { GET as reportGet } from '../../../src/pages/api/admin/clients/report.ts';
import { GET as auditGet } from '../../../src/pages/api/admin/audit.ts';
import { GET as settingsGet, POST as settingsPost } from '../../../src/pages/api/admin/settings.ts';

const session = newSession('owner', Date.now());
const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

const auditRow = (n: number, action = 'rug.update', target = `SL-0${n}`): (string | number)[] => [
  `2026-09-07T10:${String(n).padStart(2, '0')}:00Z`,
  'owner',
  action,
  'Products',
  target,
  '',
  '{"a":1}',
  'a'.repeat(32),
  'b'.repeat(16),
  `note ${n}`,
];

let sheet: FakeSheet;
let cache: ReturnType<typeof fakeCache>;
beforeEach(() => {
  sheet = fakeSheet({
    rugs: [adminRugRow({ id: 'SL-021' }), adminRugRow({ id: 'SL-022', name: 'Yellow', status: 'archived' })],
    // Customers: slug, display_name, password_hash, note, created_at, active
    clients: [
      ['nadia-k7m2pq', 'Nadia', 'scrypt.131072.8.1.aa.bb', 'VIP', '2026-09-01T00:00:00Z', true],
      ['omar-aaaaaa', 'Omar', 'scrypt.131072.8.1.cc.dd', '', '2026-08-01T00:00:00Z', false],
    ],
    votes: [
      ['e-3', 'nadia-k7m2pq', 'SL-021', 'none', 'card', 't5'],
      ['e-4', 'nadia-k7m2pq', 'SL-021', 'like', 'card', 't4'],
      ['e-5', 'nadia-k7m2pq', 'SL-022', 'like', 'card', 't3'],
      ['e-6', 'ghost-code', 'SL-021', 'like', 'card', 't2'],
      ['e-7', 'visitor-dddd', 'SL-021', 'dislike', 'card', 't1'],
    ],
    audit: Array.from({ length: 7 }, (_, i) => auditRow(7 - i)),
    settings: [
      ['retail_markup', '', '', ''],
      ['price_round_step', '5', '', ''],
      ['default_status', 'active', '', ''],
    ],
  });
  cache = fakeCache();
  state.sheet = sheet;
  state.cache = cache;
});

describe('clients', () => {
  it('lists with the link regenerated from SITE_URL and creates newest-first at row 2', async () => {
    const list = await (await clientsGet(ctx({ path: '/api/admin/clients' }))).json();
    expect(list.clients[0]).toMatchObject({
      code: 'nadia-k7m2pq',
      row: 2,
      link: 'https://catalogue.example.test/nadia-k7m2pq',
    });
    const res = await clientsPost(
      ctx({ path: '/api/admin/clients', method: 'POST', body: { name: 'Léa Dupont', note: 'from Paris' } }),
    );
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.client.code).toMatch(CLIENT_CODE_RE);
    // The route is scrambled now (owner, 2026-09-13): half the name's letters, shuffled, with
    // digits and `-`/`_` woven inside — never at either end, and never a character the sheet's
    // customer_slug column would reject. The exact string is random, so assert the shape.
    expect(out.client.code).toMatch(/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/);
    expect(out.client.code).not.toContain('lea-dupont');
    for (const ch of out.client.code.replace(/[^a-z]/g, '')) expect('leadupont').toContain(ch);
    expect(out.client).toMatchObject({
      name: 'Léa Dupont',
      note: 'from Paris',
      status: 'active',
      row: 2,
    });
    expect(out.client.link).toBe(`https://catalogue.example.test/${out.client.code}`);
    expect(out.audit).toEqual({ row: 2, action: 'client.create' });
    expect(sheet.row('Customers', 2)[0]).toBe(out.client.code);
    expect(sheet.row('Customers', 3)[0]).toBe('nadia-k7m2pq'); // pushed down
    expect(sheet.writes).toHaveLength(1);
    // The audit row records how the password came about, never the password or its hash.
    expect(JSON.parse(String(sheet.auditRows()[0]![6]))).toEqual({
      code: out.client.code,
      name: 'Léa Dupont',
      note: 'from Paris',
      password: 'generated',
    });
    expect(out.password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
    const empty = await clientsPost(ctx({ path: '/api/admin/clients', method: 'POST', body: { name: '' } }));
    expect(empty.status).toBe(400);
  });

  it('takes a password the owner types, and refuses one that is too short', async () => {
    const chosen = await clientsPost(
      ctx({
        path: '/api/admin/clients',
        method: 'POST',
        body: { name: 'Hala', note: '', password: 'winter-loom-2026' },
      }),
    );
    expect(chosen.status).toBe(201);
    const out = await chosen.json();
    // Echoed once so the reveal panel can show it, and marked as the owner's choice in the audit.
    expect(out.password).toBe('winter-loom-2026');
    expect(JSON.parse(String(sheet.auditRows()[0]![6])).password).toBe('chosen');

    const short = await clientsPost(
      ctx({ path: '/api/admin/clients', method: 'POST', body: { name: 'Omar', password: 'short' } }),
    );
    expect(short.status).toBe(400);

    // Blank still means "generate one for me".
    const blank = await clientsPost(
      ctx({ path: '/api/admin/clients', method: 'POST', body: { name: 'Rana', password: '' } }),
    );
    expect(blank.status).toBe(201);
    expect((await blank.json()).password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
  });
  it('revokes / restores with the version token (409 when stale, 404 unknown)', async () => {
    const list = await (await clientsGet(ctx({ path: '/api/admin/clients' }))).json();
    const nadia = list.clients[0];
    const res = await statusPost(
      ctx({
        path: '/api/admin/clients/nadia-k7m2pq/status',
        method: 'POST',
        params: { code: 'nadia-k7m2pq' },
        body: { status: 'revoked', version: nadia.version },
      }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.client).toMatchObject({ code: 'nadia-k7m2pq', status: 'revoked', name: 'Nadia', note: 'VIP' });
    expect(out.audit).toEqual({ row: 2, action: 'client.status' });
    expect(sheet.row('Customers', 2)[5]).toBe(false); // the `active` column
    const stale = await statusPost(
      ctx({
        path: '/api/admin/clients/nadia-k7m2pq/status',
        method: 'POST',
        params: { code: 'nadia-k7m2pq' },
        body: { status: 'active', version: nadia.version },
      }),
    );
    expect(stale.status).toBe(409);
    const same = await statusPost(
      ctx({
        path: '/api/admin/clients/nadia-k7m2pq/status',
        method: 'POST',
        params: { code: 'nadia-k7m2pq' },
        body: { status: 'revoked', version: out.client.version },
      }),
    );
    expect(await same.json()).toMatchObject({ ok: true, unchanged: true });
    const missing = await statusPost(
      ctx({
        path: '/api/admin/clients/nobody-000000/status',
        method: 'POST',
        params: { code: 'nobody-000000' },
        body: { status: 'active', version: nadia.version },
      }),
    );
    expect(missing.status).toBe(404);
  });
  it('builds the saves report from Votes joined to Rugs and Clients', async () => {
    const res = await reportGet(ctx({ path: '/api/admin/clients/report' }));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ok).toBe(true);
    expect(r.rowsRead).toBe(5);
    expect(r.mostSaved).toEqual([
      { rugId: 'SL-021', name: 'Winks', slug: 'winks', status: 'active', saves: 1, dislikes: 1 },
      { rugId: 'SL-022', name: 'Yellow', slug: 'yellow', status: 'archived', saves: 1, dislikes: 0 },
    ]);
    expect(r.byClient.map((c: { code: string; known: boolean }) => [c.code, c.known])).toEqual([
      ['nadia-k7m2pq', true],
      ['ghost-code', false],
      ['visitor-dddd', false],
    ]);
    expect(r.byClient[0]).toMatchObject({ name: 'Nadia', status: 'active', liked: [{ rugId: 'SL-022' }] });
    expect(sheet.reads[0]).toHaveLength(7); // one batchGet: the six admin ranges + Votes
  });
});

describe('audit paging', () => {
  it('maps offset/limit onto sheet rows newest-first and reports the total', async () => {
    const first = await (await auditGet(ctx({ path: '/api/admin/audit?limit=3' }))).json();
    expect(first).toMatchObject({ ok: true, offset: 0, limit: 3, total: 7 });
    expect(first.rows.map((r: { row: number; targetId: string }) => [r.row, r.targetId])).toEqual([
      [2, 'SL-07'],
      [3, 'SL-06'],
      [4, 'SL-05'],
    ]);
    const next = await (await auditGet(ctx({ path: '/api/admin/audit?offset=3&limit=3' }))).json();
    expect(next.rows.map((r: { row: number; note: string }) => [r.row, r.note])).toEqual([
      [5, 'note 4'],
      [6, 'note 3'],
      [7, 'note 2'],
    ]);
    const last = await (await auditGet(ctx({ path: '/api/admin/audit?offset=6&limit=100' }))).json();
    expect(last.rows).toHaveLength(1);
    const past = await (await auditGet(ctx({ path: '/api/admin/audit?offset=50' }))).json();
    expect(past.rows).toEqual([]);
    const bad = await auditGet(ctx({ path: '/api/admin/audit?limit=0' }));
    expect(bad.status).toBe(400);
  });
});

describe('settings', () => {
  it('reads the parsed settings and updates one key per call with an audit row (400 on a bad value)', async () => {
    const before = await (await settingsGet(ctx({ path: '/api/admin/settings' }))).json();
    expect(before.settings).toMatchObject({ priceRoundStep: 5, defaultStatus: 'active' });
    expect(before.settings.retailMarkup).toBeUndefined();
    const res = await settingsPost(
      ctx({ path: '/api/admin/settings', method: 'POST', body: { key: 'retail_markup', value: '1.6' } }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.settings.retailMarkup).toBe(1.6);
    expect(out.audit).toEqual({ row: 2, action: 'settings.update' });
    expect(sheet.row('Settings', 2).slice(0, 2)).toEqual(['retail_markup', '1.6']);
    expect(sheet.row('Settings', 2)[3]).toBe('owner');
    expect(JSON.parse(String(sheet.auditRows()[0]![5]))).toEqual({ value: '' });
    expect(JSON.parse(String(sheet.auditRows()[0]![6]))).toEqual({ value: '1.6' });
    const bad = await settingsPost(
      ctx({ path: '/api/admin/settings', method: 'POST', body: { key: 'price_round_step', value: 'five' } }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'bad value' });
    // a key without a row yet is appended at the bottom
    const added = await settingsPost(
      ctx({
        path: '/api/admin/settings',
        method: 'POST',
        body: { key: 'retail_markup.karavanrug', value: '1.5' },
      }),
    );
    expect(added.status).toBe(200);
    expect(sheet.row('Settings', 5).slice(0, 2)).toEqual(['retail_markup.karavanrug', '1.5']);
    expect((await added.json()).settings.retailMarkupBySupplier).toEqual({ karavanrug: 1.5 });
    expect(cache.busts).toBe(2);
  });
});
