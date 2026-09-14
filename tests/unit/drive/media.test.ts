// The Drive media reader (src/lib/drive/media.ts, brief §12): id validation before anything reaches
// a URL, one un-retried `files/{id}?alt=media` GET, images only, and 403/404 collapsed to
// `not_found` so a caller cannot probe which ids exist.
import { describe, expect, it } from 'vitest';
import { DRIVE_API } from '../../../src/lib/drive/client.ts';
import {
  DRIVE_MEDIA_ID_RE,
  PROXY_WIDTHS,
  coerceWidth,
  createMediaReader,
  createPublicMediaReader,
  isDriveFileId,
} from '../../../src/lib/drive/media.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

const FILE_ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

interface Call {
  url: string;
  method: string;
  authorization: string | null;
}

function readerWith(
  respond: (url: string) => Response | Promise<Response>,
  opts: { token?: () => Promise<string> } = {},
): { read: (id: string) => ReturnType<ReturnType<typeof createMediaReader>>; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', authorization: headers.get('authorization') });
    return respond(url);
  }) as unknown as typeof fetch;
  const read = createMediaReader({
    getAccessToken: opts.token ?? (async () => 'tok'),
    http: { fetchImpl, logger: silentLogger },
  });
  return { read, calls };
}

const image = (): Response =>
  new Response(JPEG, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.byteLength) },
  });

describe('isDriveFileId / DRIVE_MEDIA_ID_RE (brief §12)', () => {
  it('accepts the alphabet and length the brief pins, and nothing else', () => {
    expect(DRIVE_MEDIA_ID_RE.source).toBe('^[A-Za-z0-9_-]{10,200}$');
    expect(isDriveFileId(FILE_ID)).toBe(true);
    expect(isDriveFileId('a'.repeat(10))).toBe(true);
    expect(isDriveFileId('a'.repeat(200))).toBe(true);
    expect(isDriveFileId('A-b_C1234567890')).toBe(true);

    expect(isDriveFileId('a'.repeat(9))).toBe(false);
    expect(isDriveFileId('a'.repeat(201))).toBe(false);
    expect(isDriveFileId('')).toBe(false);
    expect(isDriveFileId(undefined)).toBe(false);
    expect(isDriveFileId(42)).toBe(false);
  });

  it('rejects every shape that could steer the request somewhere else', () => {
    for (const bad of [
      'https://evil.example/x.jpg',
      '../../../../etc/passwd',
      '1U8FwNPCdm/../../secrets',
      '1U8FwNPCdm?alt=json',
      '1U8FwNPCdm#frag',
      '1U8FwNPCdm%2F..',
      'file id with spaces',
      '1U8FwNPCdm\n1U8FwNPCdm',
      '169.254.169.254',
    ]) {
      expect(isDriveFileId(bad), bad).toBe(false);
    }
  });
});

describe('createMediaReader', () => {
  it('GETs files/{id}?alt=media with the bearer token and hands back an unconsumed body', async () => {
    const { read, calls } = readerWith(() => image());
    const result = await read(FILE_ID);
    expect(result).toMatchObject({ ok: true, contentType: 'image/jpeg', contentLength: '8' });
    expect(calls).toEqual([
      {
        url: `${DRIVE_API}/files/${FILE_ID}?alt=media&supportsAllDrives=true`,
        method: 'GET',
        authorization: 'Bearer tok',
      },
    ]);
    // The bytes were not read by the reader: the route still gets all of them.
    const bytes = new Uint8Array(await new Response(result.ok ? result.body : null).arrayBuffer());
    expect([...bytes]).toEqual([...JPEG]);
  });

  it('refuses a malformed id without making a request at all', async () => {
    const { read, calls } = readerWith(() => image());
    expect(await read('../secrets')).toEqual({ ok: false, error: 'bad_id' });
    expect(await read('short')).toEqual({ ok: false, error: 'bad_id' });
    expect(calls).toEqual([]);
  });

  it('collapses 404 and 403 to not_found so an id cannot be probed', async () => {
    for (const status of [404, 403]) {
      const { read } = readerWith(() => new Response('{}', { status }));
      expect(await read(FILE_ID)).toEqual({ ok: false, error: 'not_found' });
    }
  });

  it('reports every other Drive status as drive_error, once, with no retry', async () => {
    const { read, calls } = readerWith(() => new Response('{}', { status: 500 }));
    expect(await read(FILE_ID)).toEqual({ ok: false, error: 'drive_error', detail: 'HTTP 500' });
    expect(calls).toHaveLength(1);

    const rateLimited = readerWith(() => new Response('{}', { status: 429 }));
    expect(await rateLimited.read(FILE_ID)).toMatchObject({ ok: false, error: 'drive_error' });
    expect(rateLimited.calls).toHaveLength(1);
  });

  it('never streams a non-image body: an HTML or SVG file in the folder is refused', async () => {
    const html = readerWith(
      () => new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } }),
    );
    expect(await html.read(FILE_ID)).toEqual({ ok: false, error: 'not_an_image', detail: 'text/html' });

    const svg = readerWith(
      () => new Response('<svg onload="x()"/>', { headers: { 'content-type': 'image/svg+xml' } }),
    );
    expect(await svg.read(FILE_ID)).toEqual({ ok: false, error: 'not_an_image', detail: 'image/svg+xml' });

    const bare = readerWith(() => new Response(JPEG, { headers: { 'content-type': '' } }));
    expect(await bare.read(FILE_ID)).toMatchObject({ ok: false, error: 'not_an_image' });
  });

  it('drops the content-type parameters Drive sometimes appends', async () => {
    const { read } = readerWith(
      () => new Response(JPEG, { headers: { 'content-type': 'image/webp; charset=binary' } }),
    );
    expect(await read(FILE_ID)).toMatchObject({ ok: true, contentType: 'image/webp' });
  });

  it('turns a network failure and a dead credential into drive_error, never a throw', async () => {
    const network = readerWith(() => {
      throw new Error('ECONNRESET');
    });
    expect(await network.read(FILE_ID)).toMatchObject({ ok: false, error: 'drive_error' });

    const noToken = readerWith(() => image(), {
      token: async () => {
        throw new Error('invalid_grant');
      },
    });
    expect(await noToken.read(FILE_ID)).toEqual({
      ok: false,
      error: 'drive_error',
      detail: 'no access token',
    });
    expect(noToken.calls).toEqual([]);
  });

  it('passes a body-less 200 through as a null body rather than inventing bytes', async () => {
    const { read } = readerWith(
      () => new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    const result = await read(FILE_ID);
    expect(result).toMatchObject({ ok: true, contentType: 'image/png' });
    expect(result.ok && result.body).toBeNull();
  });
});

/* ---------- the anonymous lh3 reader (brief §12) ---------- */

describe('coerceWidth', () => {
  it('accepts only the three widths the proxy serves', () => {
    expect(PROXY_WIDTHS).toEqual([400, 800, 1600]);
    for (const w of PROXY_WIDTHS) expect(coerceWidth(w)).toBe(w);
    expect(coerceWidth('400')).toBe(400);
  });

  it('falls back to 800 for anything else, so the width can never widen the surface', () => {
    for (const bad of [undefined, null, '', 'w800', '801', 0, -400, 9999, NaN, Infinity, '800px', {}, []])
      expect(coerceWidth(bad), String(bad)).toBe(800);
  });
});

describe('createPublicMediaReader', () => {
  const lh3 = (respond: (url: string) => Response) => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      return respond(url);
    }) as unknown as typeof fetch;
    return { urls, read: createPublicMediaReader({ fetchImpl }) };
  };

  it('asks lh3 for the requested width, with no Authorization header at all', async () => {
    let sawAuth: string | null = 'unset';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      sawAuth = new Headers(init?.headers).get('authorization');
      expect(String(input)).toBe(`https://lh3.googleusercontent.com/d/${FILE_ID}=w1600`);
      return image();
    }) as unknown as typeof fetch;
    const out = await createPublicMediaReader({ fetchImpl })(FILE_ID, 1600);
    expect(out).toMatchObject({ ok: true, contentType: 'image/jpeg', contentLength: '8' });
    // No token: this is why the proxy works before (and after) a Drive grant.
    expect(sawAuth).toBeNull();
  });

  it('defaults to 800 and clamps a width outside the closed set', async () => {
    const a = lh3(() => image());
    await a.read(FILE_ID);
    await a.read(FILE_ID, 9999);
    await a.read(FILE_ID, 400);
    expect(a.urls).toEqual([
      `https://lh3.googleusercontent.com/d/${FILE_ID}=w800`,
      `https://lh3.googleusercontent.com/d/${FILE_ID}=w800`,
      `https://lh3.googleusercontent.com/d/${FILE_ID}=w400`,
    ]);
  });

  it('validates the id before it reaches the URL', async () => {
    const a = lh3(() => image());
    for (const bad of ['', 'short', '../../etc/passwd', 'a/b?x=1', 'https://evil.example/a.jpg'])
      expect(await a.read(bad), bad).toEqual({ ok: false, error: 'bad_id' });
    expect(a.urls).toEqual([]);
  });

  it('answers not_found for both 404 and 403, so a caller cannot probe which ids exist', async () => {
    for (const status of [403, 404]) {
      const a = lh3(() => new Response('nope', { status }));
      expect(await a.read(FILE_ID)).toEqual({ ok: false, error: 'not_found' });
    }
  });

  it('reports any other status, and a network failure, as drive_error', async () => {
    const a = lh3(() => new Response('boom', { status: 500 }));
    expect(await a.read(FILE_ID)).toMatchObject({
      ok: false,
      error: 'drive_error',
      detail: 'lh3 answered 500',
    });

    const dead = createPublicMediaReader({
      fetchImpl: (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    });
    expect(await dead(FILE_ID)).toMatchObject({ ok: false, error: 'drive_error', detail: 'ECONNRESET' });
  });

  it('refuses a non-image body: the proxy serves from our own origin', async () => {
    const a = lh3(
      () => new Response('<script>x</script>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    expect(await a.read(FILE_ID)).toMatchObject({ ok: false, error: 'not_an_image', detail: 'text/html' });
  });

  it('omits content-length when lh3 does not send one', async () => {
    const a = lh3(() => new Response(JPEG, { status: 200, headers: { 'content-type': 'image/webp' } }));
    const out = await a.read(FILE_ID);
    expect(out.ok && out.contentLength).toBeUndefined();
    expect(out).toMatchObject({ ok: true, contentType: 'image/webp' });
  });
});
