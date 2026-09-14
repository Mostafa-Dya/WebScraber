// The /api/image/[fileId] response (src/lib/drive/proxy.ts, brief §12): the aggressive cache header
// on a hit, the status for every failure the reader can report, and the 503 that says "this
// deployment has no Drive client" rather than pretending the photo is missing.
import { describe, expect, it } from 'vitest';
import {
  IMAGE_CACHE_CONTROL,
  driveImageResponse,
  imageMethodNotAllowed,
} from '../../../src/lib/drive/proxy.ts';
import type { MediaResult } from '../../../src/lib/drive/types.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

const FILE_ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const hit = (over: Partial<Extract<MediaResult, { ok: true }>> = {}): MediaResult => ({
  ok: true,
  body: new Response(JPEG).body,
  contentType: 'image/jpeg',
  contentLength: '8',
  ...over,
});

const serving = (result: MediaResult): { readMedia: (id: string) => Promise<MediaResult>; ids: string[] } => {
  const ids: string[] = [];
  return {
    ids,
    readMedia: async (id) => {
      ids.push(id);
      return result;
    },
  };
};

describe('driveImageResponse — a hit', () => {
  it('streams the bytes with a year-long immutable cache and Drive s own content-type', async () => {
    const drive = serving(hit());
    const res = await driveImageResponse(FILE_ID, { readMedia: drive.readMedia });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(IMAGE_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-length')).toBe('8');
    expect(drive.ids).toEqual([FILE_ID]);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...JPEG]);
  });

  it('passes the media type through instead of assuming jpeg, and omits an absent length', async () => {
    const res = await driveImageResponse(FILE_ID, {
      readMedia: serving(hit({ contentType: 'image/webp', contentLength: undefined })).readMedia,
    });
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL);
  });
});

describe('driveImageResponse — failures', () => {
  const body = async (res: Response): Promise<{ ok: boolean; error: string }> => res.json();

  it('400s a malformed id before the Drive client is even consulted', async () => {
    const drive = serving(hit());
    for (const bad of [undefined, '', 'short', '../../etc/passwd', 'https://evil.example/a.jpg']) {
      const res = await driveImageResponse(bad, { readMedia: drive.readMedia });
      expect(res.status, String(bad)).toBe(400);
      expect(await body(res)).toEqual({ ok: false, error: 'bad file id' });
    }
    expect(drive.ids).toEqual([]);
  });

  it('503s with a retry hint when the deployment has no Drive client (service_account mode)', async () => {
    const res = await driveImageResponse(FILE_ID, {});
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('3600');
    expect(await body(res)).toEqual({ ok: false, error: 'drive_not_authorised' });
  });

  it('maps each reader failure to its status', async () => {
    const cases: Array<[MediaResult, number, string]> = [
      [{ ok: false, error: 'not_found' }, 404, 'not found'],
      [{ ok: false, error: 'not_an_image', detail: 'text/html' }, 415, 'not an image'],
      [{ ok: false, error: 'drive_error', detail: 'HTTP 500' }, 502, 'drive unavailable'],
      [{ ok: false, error: 'bad_id' }, 400, 'bad file id'],
    ];
    for (const [result, status, error] of cases) {
      const res = await driveImageResponse(FILE_ID, { readMedia: serving(result).readMedia });
      expect(res.status, error).toBe(status);
      expect(await body(res)).toEqual({ ok: false, error });
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('never leaks Drive s own detail text to the caller', async () => {
    const res = await driveImageResponse(FILE_ID, {
      readMedia: serving({ ok: false, error: 'drive_error', detail: 'quota project 12345 exceeded' })
        .readMedia,
    });
    expect(await res.text()).not.toContain('12345');
  });

  it('502s instead of throwing when a reader breaks its contract', async () => {
    const res = await driveImageResponse(FILE_ID, {
      readMedia: async () => {
        throw new Error('boom');
      },
      logger: silentLogger,
    });
    expect(res.status).toBe(502);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(await body(res)).toEqual({ ok: false, error: 'drive unavailable' });
  });

  it('caches no error response', async () => {
    for (const deps of [
      {},
      { readMedia: serving({ ok: false, error: 'not_found' } as MediaResult).readMedia },
    ]) {
      const res = await driveImageResponse(FILE_ID, deps);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    }
  });
});

describe('imageMethodNotAllowed', () => {
  it('answers 405 with an Allow header, matching the JSON APIs', async () => {
    const res = imageMethodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    expect(await res.json()).toEqual({ ok: false, error: 'method not allowed' });
  });
});

describe('driveImageResponse — two upstreams (lh3 first, Drive as fallback)', () => {
  /** Records which upstream was asked, and with what width. */
  function upstreams(pub: MediaResult, authed: MediaResult) {
    const seen: string[] = [];
    return {
      seen,
      deps: {
        readPublic: async (id: string, width?: number) => {
          seen.push(`public:${id}:${String(width)}`);
          return pub;
        },
        readMedia: async (id: string) => {
          seen.push(`media:${id}`);
          return authed;
        },
        logger: silentLogger,
      },
    };
  }

  it('asks lh3 first, passes the width through, and never touches the Drive API on a hit', async () => {
    const u = upstreams(hit(), hit());
    const res = await driveImageResponse(FILE_ID, u.deps, 400);
    expect(res.status).toBe(200);
    expect(u.seen).toEqual([`public:${FILE_ID}:400`]);
  });

  it('falls back to the authenticated read for a photo that is not public', async () => {
    const u = upstreams({ ok: false, error: 'not_found' }, hit({ contentType: 'image/png' }));
    const res = await driveImageResponse(FILE_ID, u.deps, 800);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(u.seen).toEqual([`public:${FILE_ID}:800`, `media:${FILE_ID}`]);
  });

  it('reports the public failure when the fallback fails too', async () => {
    const u = upstreams({ ok: false, error: 'not_found' }, { ok: false, error: 'drive_error' });
    const res = await driveImageResponse(FILE_ID, u.deps);
    expect(res.status).toBe(404);
    expect(u.seen).toHaveLength(2);
  });

  it('does not retry a malformed id against the Drive API', async () => {
    const u = upstreams({ ok: false, error: 'bad_id' }, hit());
    const res = await driveImageResponse(FILE_ID, u.deps);
    expect(res.status).toBe(400);
    expect(u.seen).toEqual([`public:${FILE_ID}:undefined`]);
  });

  it('serves from lh3 alone when no Drive client exists (service_account mode)', async () => {
    const res = await driveImageResponse(FILE_ID, { readPublic: async () => hit() });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(IMAGE_CACHE_CONTROL);
  });
});
