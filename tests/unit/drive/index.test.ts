import { describe, expect, it } from 'vitest';
import { DRIVE_API, DRIVE_UPLOAD_API } from '../../../src/lib/drive/client.ts';
import { TOKENINFO_URL } from '../../../src/lib/drive/scope.ts';
import { DRIVE_FILE_SCOPE, PHOTOS_FOLDER_NAME, createDriveClient } from '../../../src/lib/drive/index.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

const FOLDER = '1B97RZtgjHCLNePWf40j2a1h8vPtaU6ee';
const FILE_ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createDriveClient', () => {
  it('wires folder discovery, the default downloader, the upload and the scope check through one fetch', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      seen.push(`${method} ${url.split('?')[0]}`);
      if (url === TOKENINFO_URL) return json(200, { scope: DRIVE_FILE_SCOPE });
      if (url.startsWith(`${DRIVE_API}/files?pageSize=1`)) return json(200, { files: [] });
      if (url.startsWith(`${DRIVE_API}/files?q=`)) return json(200, { files: [] });
      if (url.startsWith(`${DRIVE_API}/files?fields=id`) && method === 'POST')
        return json(200, { id: FOLDER });
      if (url.startsWith(`${DRIVE_API}/files/${FOLDER}/permissions`))
        return json(200, { id: 'anyoneWithLink' });
      if (url.startsWith('https://cdn.shopify.com/')) {
        return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (url.startsWith(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`)) {
        const body = new TextDecoder().decode(init?.body as Uint8Array);
        expect(body).toContain(`"parents":["${FOLDER}"]`);
        return json(200, { id: FILE_ID, name: 'rug-1.jpg' });
      }
      if (url.startsWith('https://lh3.googleusercontent.com/d/')) {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      return json(500, { error: { message: `unexpected ${method} ${url}` } });
    }) as unknown as typeof fetch;

    const drive = createDriveClient({
      getAccessToken: async () => 'tok',
      fetchImpl,
      logger: silentLogger,
      sleep: async () => {},
      now: () => 42,
    });

    expect(await drive.scopeStatus()).toEqual({
      driveScopeOk: true,
      scopes: [DRIVE_FILE_SCOPE],
      checkedAt: 42,
    });
    expect(
      await drive.uploadFromUrl('https://cdn.shopify.com/s/files/rug.jpg?width=1600', 'rug-1.jpg'),
    ).toEqual({
      id: FILE_ID,
      name: 'rug-1.jpg',
    });
    expect(await drive.ensureFolder()).toBe(FOLDER);
    expect(seen).toEqual([
      `POST ${TOKENINFO_URL}`,
      `GET ${DRIVE_API}/files`,
      `GET ${DRIVE_API}/files`,
      `POST ${DRIVE_API}/files`,
      `POST ${DRIVE_API}/files/${FOLDER}/permissions`,
      'GET https://cdn.shopify.com/s/files/rug.jpg',
      `POST ${DRIVE_UPLOAD_API}/files`,
      `HEAD https://lh3.googleusercontent.com/d/${FILE_ID}=w800`,
    ]);
    expect(seen.filter((s) => s.startsWith('POST') && s.endsWith('/files'))).toHaveLength(2); // tokeninfo excluded
    expect(PHOTOS_FOLDER_NAME).toBe('Serio Ludere catalogue photos');
  });

  it('uses the injected downloader and folder id instead of the network', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
      if (url.startsWith(`${DRIVE_UPLOAD_API}/files`)) return json(200, { id: FILE_ID });
      return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    const drive = createDriveClient({
      getAccessToken: async () => 'tok',
      fetchImpl,
      folderId: FOLDER,
      download: async () => ({ bytes: JPEG, contentType: 'image/webp' }),
      logger: silentLogger,
      sleep: async () => {},
    });
    expect(await drive.uploadFromUrl('https://anything.example/not-fetched.jpg', 'rug-3.jpg')).toEqual({
      id: FILE_ID,
      name: 'rug-3.webp',
    });
    expect(seen).toEqual([
      `POST ${DRIVE_UPLOAD_API}/files`,
      `HEAD https://lh3.googleusercontent.com/d/${FILE_ID}=w800`,
    ]);
  });
});
