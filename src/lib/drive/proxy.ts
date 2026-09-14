// The `GET /api/image/[fileId]` response (brief §12, §14), pure: the route hands over the raw path
// parameter plus a media reader and gets a Response back, so every rule below is unit-testable
// without Astro or a network.
//
// Why the proxy exists: Drive is not a CDN. `lh3.googleusercontent.com` is rate-limited, unstable and
// outside our cache and CSP control, so photos are served from our own origin instead, immutable for
// a year — a Drive file id addresses one immutable blob, so the bytes behind an id never change
// (replacing a photo produces a new id, which is a new URL).
//
// Two safety rules the route must not be able to weaken:
//   1. **Ids only.** The parameter is matched against DRIVE_MEDIA_ID_RE (`[A-Za-z0-9_-]{10,200}`)
//      before anything else happens. There is no parameter that accepts a URL, so no SSRF surface.
//   2. **Images only.** The reader refuses a non-`image/*` body, so a stray HTML or SVG file in the
//      photo folder can never be served as same-origin script.

import { serializeError, type Logger } from '../sheets/errors.ts';
import { isDriveFileId } from './media.ts';
import type { MediaResult } from './types.ts';

/** A year, immutable: the id is the version, so a cached response can never go stale. */
export const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface ImageProxyDeps {
  /**
   * `drive.getMedia`. Undefined when no Drive client exists — `GOOGLE_AUTH_MODE=service_account`
   * (docs/ADMIN_SPEC.md §5.1), where the photos live in the owner's Drive and the service account
   * cannot see them — and the proxy answers 503 rather than pretending the photo is missing.
   */
  readMedia?: (fileId: string) => Promise<MediaResult>;
  /**
   * The anonymous lh3 reader, tried FIRST. The photo folder is shared with anyone holding the link,
   * so this path needs no token and returns a correctly downscaled image; the authenticated reader
   * above is the fallback for a file that is not public.
   */
  readPublic?: (fileId: string, width?: number) => Promise<MediaResult>;
  logger?: Logger;
}

function fail(status: number, error: string, retryAfter?: string): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (retryAfter) headers['retry-after'] = retryAfter;
  return new Response(JSON.stringify({ ok: false, error }), { status, headers });
}

/**
 * 400 malformed id · 503 no Drive client · 404 unknown id · 415 not an image · 502 Drive failed ·
 * 200 the bytes, streamed, with the year-long immutable cache header and Drive's own content-type.
 */
export async function driveImageResponse(
  fileId: string | undefined,
  deps: ImageProxyDeps,
  width?: number,
): Promise<Response> {
  if (!isDriveFileId(fileId)) return fail(400, 'bad file id');
  if (!deps.readPublic && !deps.readMedia) return fail(503, 'drive_not_authorised', '3600');

  let result: MediaResult;
  try {
    result = deps.readPublic ? await deps.readPublic(fileId, width) : await deps.readMedia!(fileId);
    // Not public, but we hold a token: the file may be private to the owner's Drive.
    if (!result.ok && result.error !== 'bad_id' && deps.readPublic && deps.readMedia) {
      const authed = await deps.readMedia(fileId);
      if (authed.ok) result = authed;
    }
  } catch (e) {
    // createMediaReader never throws, but the route must not 500 if a future reader does.
    deps.logger?.error('image proxy: media read threw', { error: serializeError(e) });
    return fail(502, 'drive unavailable', '30');
  }

  if (!result.ok) {
    if (result.error === 'bad_id') return fail(400, 'bad file id');
    if (result.error === 'not_found') return fail(404, 'not found');
    if (result.error === 'not_an_image') return fail(415, 'not an image');
    return fail(502, 'drive unavailable', '30');
  }

  const headers = new Headers({
    'content-type': result.contentType,
    'cache-control': IMAGE_CACHE_CONTROL,
    'x-content-type-options': 'nosniff',
  });
  if (result.contentLength) headers.set('content-length', result.contentLength);
  return new Response(result.body, { status: 200, headers });
}

/** Anything but GET on the image route, in the shape the JSON APIs use (src/lib/admin/http.ts). */
export function imageMethodNotAllowed(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      allow: 'GET',
    },
  });
}
