// /api/admin/collections* and /api/admin/tags* against the in-memory sheet (docs/ADMIN_SPEC.md
// §3.4): create = bottom insert with id = slug and sort_order max+1 (409 on a duplicate slug),
// update = version-guarded whole-row write (409 with the fresh cells), reorder = one batchUpdate
// rewriting column F for every row with the full before/after order in the audit row.
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
import {
  GET as collectionsGet,
  POST as collectionsPost,
} from '../../../src/pages/api/admin/collections/index.ts';
import { POST as collectionPost } from '../../../src/pages/api/admin/collections/[id].ts';
import { POST as reorderPost } from '../../../src/pages/api/admin/collections/reorder.ts';
import { GET as tagsGet, POST as tagsPost } from '../../../src/pages/api/admin/tags/index.ts';
import { POST as tagPost } from '../../../src/pages/api/admin/tags/[id].ts';

const session = newSession('owner', Date.now());
const ctx = (init: Parameters<typeof apiContext>[0]): APIContext =>
  apiContext({ session, ...init }) as unknown as APIContext;

let sheet: FakeSheet;
let cache: ReturnType<typeof fakeCache>;
beforeEach(() => {
  sheet = fakeSheet({
    rugs: [
      adminRugRow({ id: 'SL-021', collection: 'Kilims' }),
      adminRugRow({ id: 'SL-022', collection: 'kilims', tags: 'Kilim' }),
    ],
    collections: [
      ['kilims', 'Kilims', 'kilims', 'Flat weaves', '', '', 2],
      ['tulu', 'Tulu', 'tulu', '', '', '', 1],
      ['modern', 'Modern', 'modern', '', '', '', 3],
    ],
    tags: [
      ['kilim', 'kilim', 'Kilim', ''],
      ['denizli', 'denizli', 'Denizli', '#bb3e03'],
    ],
  });
  cache = fakeCache();
  state.sheet = sheet;
  state.cache = cache;
});

describe('collections', () => {
  it('lists with row + version and creates at the bottom with id = slug and sort_order max + 1', async () => {
    const list = await (await collectionsGet(ctx({ path: '/api/admin/collections' }))).json();
    expect(list.collections.map((c: { id: string; row: number }) => [c.id, c.row])).toEqual([
      ['kilims', 2],
      ['tulu', 3],
      ['modern', 4],
    ]);
    const res = await collectionsPost(
      ctx({
        path: '/api/admin/collections',
        method: 'POST',
        body: {
          name: 'Wabi Sabi',
          description: 'Imperfect',
          coverImageUrl: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb',
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.collection).toMatchObject({
      id: 'wabi-sabi',
      slug: 'wabi-sabi',
      name: 'Wabi Sabi',
      sortOrder: 4,
      row: 5,
    });
    expect(body.collection.coverImageUrl).toContain('/api/image/1U8FwNPCdm');
    expect(body.audit).toEqual({ row: 2, action: 'collection.create' });
    const created = sheet.row('Collections', 5);
    expect([created[0], created[1], created[2], created[3], created[5], created[6]]).toEqual([
      'wabi-sabi',
      'Wabi Sabi',
      'wabi-sabi',
      'Imperfect',
      '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb',
      4,
    ]);
    expect(String(created[4])).toMatch(/^[0-9]{4}-/); // created_at
    expect(sheet.writes).toHaveLength(1);
    expect(cache.busts).toBe(1);
    const dup = await collectionsPost(
      ctx({ path: '/api/admin/collections', method: 'POST', body: { name: 'KILIMS' } }),
    );
    expect(dup.status).toBe(409);
    const badCover = await collectionsPost(
      ctx({
        path: '/api/admin/collections',
        method: 'POST',
        body: { name: 'X', coverImageUrl: 'http://evil.test/a.jpg' },
      }),
    );
    expect(badCover.status).toBe(400);
  });
  it('updates name/description/cover with the version token, keeps the slug, reports detached rugs, 409 on stale', async () => {
    const list = await (await collectionsGet(ctx({ path: '/api/admin/collections' }))).json();
    const kilims = list.collections[0];
    const res = await collectionPost(
      ctx({
        path: '/api/admin/collections/kilims',
        method: 'POST',
        params: { id: 'kilims' },
        body: { name: 'Flatweaves', description: 'Renamed', coverImageUrl: '', version: kilims.version },
      }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.collection).toMatchObject({
      id: 'kilims',
      slug: 'kilims',
      name: 'Flatweaves',
      sortOrder: 2,
      row: 2,
    });
    expect(out.collection.version).not.toBe(kilims.version);
    expect(out.detached).toBe(2); // both rugs store "Kilims"/"kilims"
    expect(out.audit).toEqual({ row: 2, action: 'collection.update' });
    expect(sheet.row('Collections', 2)).toEqual(['kilims', 'Flatweaves', 'kilims', 'Renamed', '', '', 2]);
    const audit = sheet.auditRows()[0]!;
    expect(JSON.parse(String(audit[5]))).toEqual({ name: 'Kilims', description: 'Flat weaves' });
    expect(JSON.parse(String(audit[6]))).toEqual({ name: 'Flatweaves', description: 'Renamed' });
    const stale = await collectionPost(
      ctx({
        path: '/api/admin/collections/kilims',
        method: 'POST',
        params: { id: 'kilims' },
        body: { name: 'Again', version: kilims.version },
      }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: 'version mismatch',
      tab: 'Collections',
      fresh: ['kilims', 'Flatweaves', 'kilims', 'Renamed', '', '', 2],
    });
    const clash = await collectionPost(
      ctx({
        path: '/api/admin/collections/tulu',
        method: 'POST',
        params: { id: 'tulu' },
        body: { name: 'flatweaves', version: list.collections[1].version },
      }),
    );
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ error: 'name exists' });
    const missing = await collectionPost(
      ctx({
        path: '/api/admin/collections/nope',
        method: 'POST',
        params: { id: 'nope' },
        body: { name: 'x', version: kilims.version },
      }),
    );
    expect(missing.status).toBe(404);
  });
  it('reorders every row in one batchUpdate with the whole order in the audit row; refuses unknown / partial lists', async () => {
    const res = await reorderPost(
      ctx({
        path: '/api/admin/collections/reorder',
        method: 'POST',
        body: { order: ['modern', 'kilims', 'tulu'] },
      }),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.audit).toEqual({ row: 2, action: 'collection.reorder' });
    expect(out.collections.map((c: { id: string; sortOrder: number }) => [c.id, c.sortOrder])).toEqual([
      ['kilims', 2],
      ['tulu', 3],
      ['modern', 1],
    ]);
    expect(sheet.writes).toHaveLength(1);
    expect(sheet.row('Collections', 4)[6]).toBe(1); // sort_order moved to column G
    const audit = sheet.auditRows()[0]!;
    expect(JSON.parse(String(audit[5]))).toEqual({ order: ['tulu', 'kilims', 'modern'] });
    expect(JSON.parse(String(audit[6]))).toEqual({ order: ['modern', 'kilims', 'tulu'] });
    const unknown = await reorderPost(
      ctx({
        path: '/api/admin/collections/reorder',
        method: 'POST',
        body: { order: ['modern', 'kilims', 'ghost'] },
      }),
    );
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: 'unknown id', id: 'ghost' });
    const partial = await reorderPost(
      ctx({ path: '/api/admin/collections/reorder', method: 'POST', body: { order: ['modern'] } }),
    );
    expect(partial.status).toBe(400);
    const same = await reorderPost(
      ctx({
        path: '/api/admin/collections/reorder',
        method: 'POST',
        body: { order: ['modern', 'kilims', 'tulu'] },
      }),
    );
    expect(await same.json()).toMatchObject({ ok: true, unchanged: true });
    expect(sheet.writes).toHaveLength(1);
  });
});

describe('tags', () => {
  it('lists, creates with id = slug and optional colour (409 on a duplicate), updates with the version', async () => {
    const list = await (await tagsGet(ctx({ path: '/api/admin/tags' }))).json();
    expect(list.tags.map((t: { id: string; row: number }) => [t.id, t.row])).toEqual([
      ['kilim', 2],
      ['denizli', 3],
    ]);
    const res = await tagsPost(
      ctx({ path: '/api/admin/tags', method: 'POST', body: { name: 'Plant Dyes', color: '#2f6b3a' } }),
    );
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.tag).toMatchObject({
      id: 'plant-dyes',
      slug: 'plant-dyes',
      name: 'Plant Dyes',
      color: '#2f6b3a',
      row: 4,
    });
    expect(out.audit).toEqual({ row: 2, action: 'tag.create' });
    expect(sheet.row('Tags', 4)).toEqual(['plant-dyes', 'plant-dyes', 'Plant Dyes', '#2f6b3a']);
    const dup = await tagsPost(ctx({ path: '/api/admin/tags', method: 'POST', body: { name: 'kilim' } }));
    expect(dup.status).toBe(409);
    const pipe = await tagsPost(ctx({ path: '/api/admin/tags', method: 'POST', body: { name: 'a|b' } }));
    expect(pipe.status).toBe(400);

    const upd = await tagPost(
      ctx({
        path: '/api/admin/tags/kilim',
        method: 'POST',
        params: { id: 'kilim' },
        body: { name: 'Kilim weave', version: list.tags[0].version },
      }),
    );
    expect(upd.status).toBe(200);
    const u = await upd.json();
    expect(u.tag).toMatchObject({ id: 'kilim', slug: 'kilim', name: 'Kilim weave', row: 2 });
    expect(u.detached).toBe(2); // both fixture rugs carry the default tag "Kilim"
    expect(sheet.row('Tags', 2)).toEqual(['kilim', 'kilim', 'Kilim weave', '']);
    const stale = await tagPost(
      ctx({
        path: '/api/admin/tags/kilim',
        method: 'POST',
        params: { id: 'kilim' },
        body: { name: 'x', version: list.tags[0].version },
      }),
    );
    expect(stale.status).toBe(409);
    expect(cache.busts).toBe(2);
  });
});
