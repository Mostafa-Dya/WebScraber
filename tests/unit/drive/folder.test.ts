import { describe, expect, it } from 'vitest';
import { DRIVE_API, createDriveHttp } from '../../../src/lib/drive/client.ts';
import {
  createFolderLister,
  createFolderResolver,
  createProductFolderResolver,
  escapeDriveQuery,
  folderQuery,
} from '../../../src/lib/drive/folder.ts';
import { PHOTOS_FOLDER_NAME } from '../../../src/lib/drive/types.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

const FOLDER = '1B97RZtgjHCLNePWf40j2a1h8vPtaU6ee';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function mockFetch(handler: (c: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return handler(call, calls.length);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function http(fetchImpl: typeof fetch) {
  return createDriveHttp({
    getAccessToken: async () => 'tok',
    fetchImpl,
    logger: silentLogger,
    sleep: async () => {},
  });
}

const LIST_URL = `${DRIVE_API}/files?q=`;
const permissionsUrl = (id: string) => `${DRIVE_API}/files/${id}/permissions`;

describe('folderQuery', () => {
  it('escapes quotes and backslashes and pins mimeType/trashed', () => {
    expect(escapeDriveQuery(`it's a \\ test`)).toBe(`it\\'s a \\\\ test`);
    expect(folderQuery(PHOTOS_FOLDER_NAME)).toBe(
      "name='Serio Ludere catalogue photos' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    );
  });
});

describe('createFolderResolver', () => {
  it('uses GOOGLE_DRIVE_FOLDER_ID without any API call', async () => {
    const m = mockFetch(() => json(500, {}));
    const ensure = createFolderResolver(http(m.fn), { folderId: ` ${FOLDER} ` });
    expect(await ensure()).toBe(FOLDER);
    expect(await ensure()).toBe(FOLDER);
    expect(m.calls).toHaveLength(0);
  });

  it('refuses a malformed GOOGLE_DRIVE_FOLDER_ID loudly', async () => {
    const m = mockFetch(() => json(500, {}));
    const ensure = createFolderResolver(http(m.fn), { folderId: 'not an id' });
    await expect(ensure()).rejects.toMatchObject({ status: 400, googleStatus: 'INVALID_ARGUMENT' });
    expect(m.calls).toHaveLength(0);
  });

  it('treats a blank folderId as unset and discovers the folder by name', async () => {
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) return json(200, { files: [{ id: FOLDER, name: PHOTOS_FOLDER_NAME }] });
      if (c.url.startsWith(permissionsUrl(FOLDER)) && c.method === 'GET')
        return json(200, {
          permissions: [
            { type: 'anyone', role: 'reader' },
            { type: 'user', role: 'owner' },
          ],
        });
      return json(500, { error: { message: 'unexpected' } });
    });
    const ensure = createFolderResolver(http(m.fn), { folderId: '   ' });
    expect(await ensure()).toBe(FOLDER);
    expect(m.calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      `GET ${DRIVE_API}/files`,
      `GET ${permissionsUrl(FOLDER)}`,
    ]);
    const listUrl = m.calls[0]!.url;
    expect(decodeURIComponent(listUrl)).toContain(folderQuery(PHOTOS_FOLDER_NAME));
    expect(listUrl).toContain('fields=files(id%2Cname)');
    expect(listUrl).toContain('spaces=drive');
    // memoised
    expect(await ensure()).toBe(FOLDER);
    expect(m.calls).toHaveLength(2);
  });

  it('restores the anyone/reader permission on a discovered folder that lost it', async () => {
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) return json(200, { files: [{ id: FOLDER }] });
      if (c.url.startsWith(permissionsUrl(FOLDER)) && c.method === 'GET')
        return json(200, { permissions: [{ type: 'user', role: 'owner' }] });
      if (c.url.startsWith(permissionsUrl(FOLDER)) && c.method === 'POST')
        return json(200, { id: 'anyoneWithLink' });
      return json(500, {});
    });
    const ensure = createFolderResolver(http(m.fn));
    expect(await ensure()).toBe(FOLDER);
    const post = m.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ type: 'anyone', role: 'reader', allowFileDiscovery: false });
  });

  it('creates the folder and shares it once when nothing is found', async () => {
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) return json(200, { files: [] });
      if (c.url.startsWith(`${DRIVE_API}/files?fields=id`) && c.method === 'POST')
        return json(200, { id: FOLDER });
      if (c.url.startsWith(permissionsUrl(FOLDER)) && c.method === 'POST')
        return json(200, { id: 'anyoneWithLink' });
      return json(500, { error: { message: `unexpected ${c.method} ${c.url}` } });
    });
    const ensure = createFolderResolver(http(m.fn));
    expect(await ensure()).toBe(FOLDER);
    expect(m.calls.map((c) => `${c.method} ${c.url.split('?')[0]}`)).toEqual([
      `GET ${DRIVE_API}/files`,
      `POST ${DRIVE_API}/files`,
      `POST ${permissionsUrl(FOLDER)}`,
    ]);
    expect(m.calls[1]!.body).toEqual({
      name: PHOTOS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    });
    expect(m.calls[2]!.body).toEqual({ type: 'anyone', role: 'reader', allowFileDiscovery: false });
    // Once: a second call makes no request at all.
    expect(await ensure()).toBe(FOLDER);
    expect(m.calls).toHaveLength(3);
  });

  it('does not memoise a failure, and shares one in-flight lookup between concurrent callers', async () => {
    let listCalls = 0;
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) {
        listCalls++;
        if (listCalls === 1)
          return json(403, {
            error: { message: 'Drive API disabled', errors: [{ reason: 'accessNotConfigured' }] },
          });
        return json(200, { files: [{ id: FOLDER }] });
      }
      if (c.url.startsWith(permissionsUrl(FOLDER)) && c.method === 'GET')
        return json(200, { permissions: [{ type: 'anyone', role: 'reader' }] });
      return json(500, {});
    });
    const ensure = createFolderResolver(http(m.fn));
    const first = await Promise.allSettled([ensure(), ensure(), ensure()]);
    expect(first.every((r) => r.status === 'rejected')).toBe(true);
    expect(listCalls).toBe(1); // three callers, one lookup
    expect(await ensure()).toBe(FOLDER); // retried after the failure
    expect(listCalls).toBe(2);
  });

  it('rejects when files.create answers without an id', async () => {
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) return json(200, {});
      if (c.method === 'POST') return json(200, {});
      return json(500, {});
    });
    await expect(createFolderResolver(http(m.fn))()).rejects.toMatchObject({ status: 502 });
  });
});

/* ---------- per-product folders (brief §12) ---------- */

const PRODUCT = '1PRODUCTfolderIdAAAAAAAAAAAAAAAA';
const ALL = '1ALLimagesFolderIdBBBBBBBBBBBBBBB';

describe('createProductFolderResolver', () => {
  it('creates <root>/<id> — <name>/All Images and asks for no permission of its own', async () => {
    const m = mockFetch((c) => {
      if (c.url.startsWith(LIST_URL)) return json(200, { files: [] });
      if (c.method === 'POST' && (c.body as { name?: string }).name?.startsWith('SL-021'))
        return json(200, { id: PRODUCT });
      if (c.method === 'POST') return json(200, { id: ALL });
      return json(500, {});
    });
    const out = await createProductFolderResolver(http(m.fn), async () => FOLDER)('SL-021', 'Winks');

    expect(out).toEqual({
      productId: PRODUCT,
      allImagesId: ALL,
      name: 'SL-021 — Winks',
      url: `https://drive.google.com/drive/folders/${PRODUCT}`,
    });
    // The folders inherit the root's "anyone with the link" share, so no permissions call is made.
    expect(m.calls.some((c) => c.url.includes('/permissions'))).toBe(false);
    expect(m.calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { name: 'SL-021 — Winks', mimeType: 'application/vnd.google-apps.folder', parents: [FOLDER] },
      { name: 'All Images', mimeType: 'application/vnd.google-apps.folder', parents: [PRODUCT] },
    ]);
  });

  it('scopes each lookup to its parent, so two rugs with the same name cannot collide', async () => {
    const m = mockFetch((c) =>
      c.url.startsWith(LIST_URL) ? json(200, { files: [{ id: PRODUCT }] }) : json(500, {}),
    );
    await createProductFolderResolver(http(m.fn), async () => FOLDER)('SL-021', 'Winks');
    const queries = m.calls.map((c) => decodeURIComponent(new URL(c.url).searchParams.get('q') ?? ''));
    expect(queries[0]).toContain(`'${FOLDER}' in parents`);
    expect(queries[1]).toContain(`'${PRODUCT}' in parents`);
  });

  it('reuses what is already there, so a retry after a half-finished import creates nothing', async () => {
    const m = mockFetch((c, n) =>
      c.url.startsWith(LIST_URL) ? json(200, { files: [{ id: n === 1 ? PRODUCT : ALL }] }) : json(500, {}),
    );
    const out = await createProductFolderResolver(http(m.fn), async () => FOLDER)('SL-021', 'Winks');
    expect(out.productId).toBe(PRODUCT);
    expect(out.allImagesId).toBe(ALL);
    expect(m.calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('createFolderLister', () => {
  it('maps the filenames already in a folder to their ids', async () => {
    const m = mockFetch(() =>
      json(200, {
        files: [
          { id: 'f1', name: '01-primary' },
          { id: 'f2', name: 'winks-02' },
        ],
      }),
    );
    const names = await createFolderLister(http(m.fn))(ALL);
    expect([...names]).toEqual([
      ['01-primary', 'f1'],
      ['winks-02', 'f2'],
    ]);
    const q = decodeURIComponent(new URL(m.calls[0]!.url).searchParams.get('q') ?? '');
    expect(q).toBe(`'${ALL}' in parents and trashed=false`);
  });

  it('keeps the first of two files sharing a name, and tolerates a nameless entry', async () => {
    const m = mockFetch(() =>
      json(200, {
        files: [{ id: 'first', name: 'winks-02' }, { id: 'second', name: 'winks-02' }, { id: 'x' }],
      }),
    );
    const names = await createFolderLister(http(m.fn))(ALL);
    expect(names.get('winks-02')).toBe('first');
    expect(names.size).toBe(1);
  });

  it('returns an empty map for an empty folder', async () => {
    const m = mockFetch(() => json(200, {}));
    expect((await createFolderLister(http(m.fn))(ALL)).size).toBe(0);
  });
});
