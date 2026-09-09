// Streaming media reads from Drive (brief §12): `GET drive/v3/files/{id}?alt=media`, with the
// response body handed back unconsumed so `/api/image/[fileId]` can pipe rug photos straight to the
// browser. This lives beside client.ts rather than inside it because `DriveHttp.request` parses every
// response as JSON; image bytes must never be read into a string.
//
// The reader takes a **file id**, never a URL, and the id is checked against DRIVE_MEDIA_ID_RE before
// it is put anywhere near a URL — there is no input that can steer the request at another host (SSRF).

import { serializeError } from '../sheets/errors.ts';
import { DRIVE_API, type DriveHttp } from './client.ts';
import { isImageType, mimeOf } from './upload.ts';
import type { MediaResult } from './types.ts';

/** Drive file ids as the brief pins them (§12). Wider than images.ts DRIVE_ID_RE, which is a
 *  storage-format check for ids we minted ourselves; this one guards a path segment. */
export const DRIVE_MEDIA_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/** Drive answers quickly or not at all; a rug photo is ~1 MB. */
export const MEDIA_TIMEOUT_MS = 20_000;

export function isDriveFileId(value: unknown): value is string {
  return typeof value === 'string' && DRIVE_MEDIA_ID_RE.test(value);
}

export interface MediaReaderOptions {
  /** Bearer token for the Drive API (the same TokenSource the Sheets client uses). */
  getAccessToken: () => Promise<string>;
  http: Pick<DriveHttp, 'fetchImpl' | 'logger'>;
  timeoutMs?: number;
}

/**
 * One `files/{id}?alt=media` GET, never retried: a media read is cheap to repeat from the browser,
 * and a retry loop here would multiply the load Drive is already rate-limiting.
 *
 * `404` and `403` both answer `not_found`: whether an id is unknown or merely invisible to this
 * token is not something a caller may probe. Everything else is `drive_error` (502 at the edge).
 */
export function createMediaReader(opts: MediaReaderOptions): (fileId: string) => Promise<MediaResult> {
  const timeoutMs = opts.timeoutMs ?? MEDIA_TIMEOUT_MS;
  return async (fileId) => {
    if (!isDriveFileId(fileId)) return { ok: false, error: 'bad_id' };

    let token: string;
    try {
      token = await opts.getAccessToken();
    } catch (e) {
      opts.http.logger.warn('image proxy: no access token', { error: serializeError(e) });
      return { ok: false, error: 'drive_error', detail: 'no access token' };
    }

    const url = new URL(`${DRIVE_API}/files/${fileId}`);
    url.search = 'alt=media&supportsAllDrives=true';

    let res: Response;
    try {
      res = await opts.http.fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}`, accept: 'image/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const detail = serializeError(e).message;
      opts.http.logger.warn('image proxy: Drive request failed', { detail });
      return { ok: false, error: 'drive_error', detail };
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      if (res.status === 404 || res.status === 403) return { ok: false, error: 'not_found' };
      opts.http.logger.warn(`image proxy: Drive answered ${res.status}`);
      return { ok: false, error: 'drive_error', detail: `HTTP ${res.status}` };
    }

    // Images only. The proxy serves from our own origin, so streaming whatever a Drive folder happens
    // to hold (an HTML file, an SVG) would hand an attacker same-origin script execution.
    const contentType = mimeOf(res.headers.get('content-type'));
    if (!isImageType(contentType)) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, error: 'not_an_image', detail: contentType || 'missing content-type' };
    }

    return {
      ok: true,
      body: res.body,
      contentType,
      contentLength: res.headers.get('content-length') ?? undefined,
    };
  };
}
