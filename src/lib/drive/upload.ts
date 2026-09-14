// Photo upload (docs/ADMIN_SPEC.md §5.2): download through the injected guarded client, guard the
// bytes again (image/*, ≤ 5 MB — the multipart cap), `POST upload/drive/v3/files?uploadType=multipart`
// with a hand-built `multipart/related` body, then HEAD the lh3 rendition until it answers (fresh
// files may take a moment to propagate) before the id is accepted. `uploadFromUrl` never throws.

import { randomBytes } from 'node:crypto';
import { lh3Url, DRIVE_ID_RE } from '../images.ts';
import { scrub } from '../sheets/errors.ts';
import { DRIVE_API, DRIVE_UPLOAD_API, DriveApiError, describeDriveError, type DriveHttp } from './client.ts';
import { applyTransforms } from './transform.ts';
import {
  DOWNLOAD_HOSTS,
  MAX_UPLOAD_BYTES,
  type DownloadResult,
  type Downloader,
  type UploadErrorCode,
  type UploadResult,
} from './types.ts';

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
export const LH3_ATTEMPTS = 4; // 1 try + 3 retries
export const LH3_RETRY_DELAY_MS = 2000;
const LH3_TIMEOUT_MS = 10_000;

export class DownloadError extends Error {
  readonly code: Extract<UploadErrorCode, 'unsupported_host' | 'not_image' | 'too_large' | 'download_failed'>;

  constructor(code: DownloadError['code'], message: string) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
  }
}

/** Media type without parameters, lower-cased; '' when absent. */
export function mimeOf(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** `image/*` except SVG (scriptable, and never a photo). */
export function isImageType(mime: string): boolean {
  return /^image\/[a-z0-9.+-]+$/.test(mime) && !mime.includes('svg');
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif',
};

/** Sanitised file name whose extension matches the bytes actually stored (`<slug>-<n>.jpg` normally). */
export function fileNameFor(name: string, mime: string): string {
  const base =
    name
      .replace(/[\p{Cc}/\\]+/gu, '')
      .trim()
      .slice(0, 100)
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .trim() || 'photo';
  const fromMime = mime
    .replace(/^image\//, '')
    .replace(/^x-/, '')
    .replace(/[^a-z0-9]/g, '');
  const ext = EXTENSIONS[mime] ?? (fromMime || 'jpg');
  return `${base}.${ext}`;
}

function randomBoundary(): string {
  return `sl_${randomBytes(16).toString('hex')}`;
}

export interface MultipartInput {
  metadata: Record<string, unknown>;
  bytes: Uint8Array;
  mimeType: string;
}

export interface MultipartBody {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  boundary: string;
}

/** `multipart/related` body for `uploadType=multipart`: JSON metadata part, then the media part. */
export function buildMultipartBody(input: MultipartInput, boundary?: string): MultipartBody {
  const metadata = JSON.stringify(input.metadata);
  const media = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  let b = boundary ?? randomBoundary();
  while (media.includes(b) || metadata.includes(b)) b = randomBoundary();
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${b}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${b}--\r\n`);
  const body = new Uint8Array(head.byteLength + input.bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(input.bytes, head.byteLength);
  body.set(tail, head.byteLength + input.bytes.byteLength);
  return { body, contentType: `multipart/related; boundary=${b}`, boundary: b };
}

function validateDownloadUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DownloadError('unsupported_host', 'not a URL');
  }
  if (url.protocol !== 'https:') throw new DownloadError('unsupported_host', 'https only');
  if (url.username || url.password || url.port) throw new DownloadError('unsupported_host', 'userinfo/port');
  if (!DOWNLOAD_HOSTS.includes(url.hostname.toLowerCase())) {
    throw new DownloadError('unsupported_host', `host "${url.hostname}" is not allow-listed`);
  }
  return url;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > max) throw new DownloadError('too_large', `${buf.byteLength} bytes > ${max}`);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new DownloadError('too_large', `body exceeds ${max} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Interim downloader until the scraper's guarded undici client is wired in: https + host allow-list,
 * manual redirects re-validated per hop, `image/*` only, 5 MB cap enforced while streaming.
 * Not DNS-pinned (the allow-listed hosts are constants, so no user-influenced name reaches DNS).
 */
export async function defaultDownload(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
  let url = validateDownloadUrl(input);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'image/*' },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (e) {
      throw new DownloadError('download_failed', scrub(e instanceof Error ? e.message : String(e)));
    }
    if (REDIRECT_STATUSES.has(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!location) throw new DownloadError('download_failed', `redirect ${res.status} without location`);
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new DownloadError('download_failed', 'unparseable redirect');
      }
      url = validateDownloadUrl(next.toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new DownloadError('download_failed', `HTTP ${res.status}`);
    }
    const contentType = mimeOf(res.headers.get('content-type'));
    if (!isImageType(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new DownloadError('not_image', contentType || 'missing content-type');
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      await res.body?.cancel().catch(() => {});
      throw new DownloadError('too_large', `content-length ${declared} > ${MAX_UPLOAD_BYTES}`);
    }
    const bytes = await readCapped(res, MAX_UPLOAD_BYTES);
    return { bytes, contentType };
  }
  throw new DownloadError('download_failed', 'too many redirects');
}

/** HEADs `lh3.googleusercontent.com/d/<id>=w800` until it answers 200 (fresh files can lag). */
export async function waitForLh3(
  fetchImpl: typeof fetch,
  id: string,
  sleep: (ms: number) => Promise<void>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? LH3_ATTEMPTS;
  const delayMs = opts.delayMs ?? LH3_RETRY_DELAY_MS;
  const url = lh3Url(id, 800);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(LH3_TIMEOUT_MS),
      });
      await res.body?.cancel().catch(() => {});
      const type = mimeOf(res.headers.get('content-type'));
      if (res.ok && (type === '' || type.startsWith('image/'))) return true;
    } catch {
      /* network / timeout: retry */
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return false;
}

export interface UploaderDeps {
  download: Downloader;
  ensureFolder: () => Promise<string>;
  lh3?: { attempts?: number; delayMs?: number };
}

function classifyDriveError(
  e: unknown,
  fallback: UploadErrorCode,
): { error: UploadErrorCode; detail: string } {
  const safe = describeDriveError(e);
  const detail = String(safe.message ?? fallback);
  if (e instanceof DriveApiError && (e.status === 401 || e.status === 403)) {
    return { error: 'drive_not_authorised', detail };
  }
  return { error: fallback, detail };
}

export function createUploader(
  http: DriveHttp,
  deps: UploaderDeps,
): (
  url: string,
  name: string,
  intoFolderId?: string,
  opts?: { supplier?: string; index?: number },
) => Promise<UploadResult> {
  return async (url, name, intoFolderId, opts) => {
    // `intoFolderId` is the rug's own "All Images" folder (brief §12). Without it the photo lands in
    // the flat root, which is what a plain import outside a product commit still does.
    let folderId: string;
    try {
      folderId = intoFolderId ?? (await deps.ensureFolder());
    } catch (e) {
      const out = classifyDriveError(e, 'folder_failed');
      http.logger.error('photo import: folder unavailable', { error: describeDriveError(e) });
      return out;
    }

    let downloaded: DownloadResult;
    try {
      downloaded = await deps.download(url);
    } catch (e) {
      const code: UploadErrorCode = e instanceof DownloadError ? e.code : 'download_failed';
      const detail = scrub(e instanceof Error ? e.message : String(e));
      http.logger.warn(`photo import: download failed (${code})`, { detail });
      return { error: code, detail };
    }
    const mime = mimeOf(downloaded.contentType);
    if (!isImageType(mime)) return { error: 'not_image', detail: mime || 'missing content-type' };

    // Per-supplier fixes on the way in (owner, 2026-09-13). Never fatal: a photo that could not be
    // rotated is still a photo the studio wants, so a failure here logs and stores the original.
    const fixed = await applyTransforms(downloaded, {
      supplier: opts?.supplier ?? '',
      index: opts?.index ?? 0,
    });
    if (fixed.skipped) {
      http.logger.warn('photo import: transform skipped, storing the original', { detail: fixed.skipped });
    }
    downloaded = { bytes: fixed.bytes, contentType: fixed.contentType };

    const size = downloaded.bytes.byteLength;
    if (size === 0) return { error: 'download_failed', detail: 'empty body' };
    if (size > MAX_UPLOAD_BYTES) return { error: 'too_large', detail: `${size} bytes > ${MAX_UPLOAD_BYTES}` };

    const fileName = fileNameFor(name, mime);
    const part = buildMultipartBody({
      metadata: { name: fileName, parents: [folderId], mimeType: mime },
      bytes: downloaded.bytes,
      mimeType: mime,
    });
    let created: { id?: string; name?: string };
    try {
      created = await http.request<{ id?: string; name?: string }>({
        method: 'POST',
        url: `${DRIVE_UPLOAD_API}/files`,
        query: [
          ['uploadType', 'multipart'],
          ['fields', 'id,name,mimeType'],
        ],
        body: { raw: part.body, contentType: part.contentType },
        policy: 'write',
      });
    } catch (e) {
      const out = classifyDriveError(e, 'upload_failed');
      http.logger.error('photo import: upload failed', { error: describeDriveError(e) });
      return out;
    }
    const id = created.id ?? '';
    if (!DRIVE_ID_RE.test(id)) return { error: 'upload_failed', detail: 'unexpected file id' };

    const visible = await waitForLh3(http.fetchImpl, id, http.sleep, deps.lh3);
    if (!visible) {
      http.logger.warn(`photo import: lh3 did not serve ${id} yet`, { name: fileName });
      return { error: 'not_visible', id, detail: 'lh3 has not served the file yet; it may appear shortly' };
    }
    http.logger.info(`photo import: uploaded ${fileName} as ${id}`, { bytes: size, mime });
    return { id, name: created.name ?? fileName };
  };
}

/**
 * Copies a file that is already in Drive into another folder under a new name — the "primary
 * duplicated deliberately" of brief §12.
 *
 * It is a copy rather than a second parent because a shortcut or a multi-parent file behaves oddly
 * in the Drive UI and the studio browses these folders by hand. One extra copy of one image per rug
 * is a price worth paying for a folder that reads like a folder.
 */
export function createCopier(
  http: DriveHttp,
): (fileId: string, name: string, intoFolderId: string) => Promise<UploadResult> {
  return async (fileId, name, intoFolderId) => {
    try {
      const created = await http.request<{ id?: string; name?: string }>({
        method: 'POST',
        url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}/copy`,
        query: [['fields', 'id,name']],
        body: { json: { name, parents: [intoFolderId] } },
        policy: 'write',
      });
      if (!created.id) return { error: 'upload_failed', detail: 'files.copy returned no id' };
      return { id: created.id, name: created.name ?? name };
    } catch (e) {
      const out = classifyDriveError(e, 'upload_failed');
      http.logger.warn('photo import: copy failed', { error: describeDriveError(e) });
      return out;
    }
  };
}
