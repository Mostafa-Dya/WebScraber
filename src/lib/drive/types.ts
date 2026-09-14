// Google Drive photo import (docs/ADMIN_SPEC.md §5): shared types and constants.
// The client never sees an environment variable or a credential: the integrator injects the token
// source (the same one the Sheets client uses) and the SSRF-guarded image downloader.

import type { Logger } from '../sheets/errors.ts';
import type { ProductFolders } from './folder.ts';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** The broad scope also covers everything `drive.file` allows (accepted, never requested). */
export const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';

/** Name of the app-created folder (§5.2); discovered by name under `drive.file`, created once. */
export const PHOTOS_FOLDER_NAME = 'Serio Ludere catalogue photos';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** Multipart upload cap (§5.2): ECG full images are ~0.9 MB, KV `?width=1600` ~0.4 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Hosts the default (interim) downloader accepts (§4.5); the scraper's guarded client replaces it. */
export const DOWNLOAD_HOSTS: readonly string[] = [
  'images.ecarpetwholesale.com',
  'cdn.shopify.com',
  'karavanrug.com',
];

export interface DownloadResult {
  bytes: Uint8Array;
  /** Media type without parameters, e.g. `image/jpeg`. */
  contentType: string;
}

/** Fetches an image URL; must throw on anything but a 2xx `image/*` body within the size cap. */
export type Downloader = (url: string) => Promise<DownloadResult>;

export type UploadErrorCode =
  | 'unsupported_host'
  | 'not_image'
  | 'too_large'
  | 'download_failed'
  | 'drive_not_authorised'
  | 'folder_failed'
  | 'upload_failed'
  | 'not_visible';

export type UploadResult =
  | { id: string; name: string }
  /** `id` is present when the file was uploaded but lh3 never answered (`not_visible`). */
  | { error: UploadErrorCode; detail?: string; id?: string };

/** Why a media read produced no bytes (brief §12); mapped to a status code by drive/proxy.ts. */
export type MediaErrorCode = 'bad_id' | 'not_found' | 'not_an_image' | 'drive_error';

/** A media read. On success the body is **unconsumed** and must be streamed or cancelled. */
export type MediaResult =
  | {
      ok: true;
      /** Drive's response body, streamed straight through; null only for an empty 200. */
      body: ReadableStream<Uint8Array> | null;
      /** Media type without parameters, e.g. `image/jpeg`. */
      contentType: string;
      contentLength?: string;
    }
  | { ok: false; error: MediaErrorCode; detail?: string };

export type ScopeReason =
  'scope_missing' | 'api_disabled' | 'token_error' | 'tokeninfo_failed' | 'probe_failed';

export interface ScopeStatus {
  driveScopeOk: boolean;
  scopes: string[];
  reason?: ScopeReason;
  /** Epoch ms of the underlying check (the status is cached, §5.2). */
  checkedAt: number;
}

export interface DriveClientOptions {
  /** Bearer token for both APIs (wire it to the Sheets `TokenSource.getAccessToken`). */
  getAccessToken: () => Promise<string>;
  /** SSRF-guarded image downloader; defaults to `defaultDownload` (host allow-list, image/*, 5 MB). */
  download?: Downloader;
  /** `GOOGLE_DRIVE_FOLDER_ID` when set; otherwise the folder is discovered or created by name. */
  folderId?: string;
  logger?: Logger;
  fetchImpl?: typeof fetch;
  /** Test hook: replaces the backoff / lh3 retry sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Test hook: clock for the scope-status cache. */
  now?: () => number;
  maxAttempts?: number;
}

export interface DriveClient {
  /** Resolves (once per process) the folder id every upload lands in. */
  ensureFolder(): Promise<string>;
  /**
   * Downloads `url`, uploads it as `name` and waits until lh3 serves it. Never throws.
   * `intoFolderId` targets a rug's own folder; omitted, the photo lands in the flat root.
   */
  /**
   * `opts` carries the per-supplier first-image fixes of 2026-09-13
   * (src/lib/drive/transform.ts): which supplier sent the photo, and its position in the import.
   */
  uploadFromUrl(
    url: string,
    name: string,
    intoFolderId?: string,
    opts?: { supplier?: string; index?: number },
  ): Promise<UploadResult>;
  /** Finds or creates `<root>/<id> — <name>` and its `All Images` child (brief §12). */
  ensureProductFolders(productId: string, productName: string): Promise<ProductFolders>;
  /** Copies an already-uploaded file into another folder under a new name (the duplicated primary). */
  copyFile(fileId: string, name: string, intoFolderId: string): Promise<UploadResult>;
  /** What a folder already holds, as `name -> id`; how a retry tells which photos already landed. */
  listFolder(folderId: string): Promise<Map<string, string>>;
  /** Streams one file's bytes for the `/api/image/[fileId]` proxy (brief §12). Never throws. */
  getMedia(fileId: string): Promise<MediaResult>;
  /** Whether the current token can write to Drive (tokeninfo scopes + a one-call API probe), cached. */
  scopeStatus(): Promise<ScopeStatus>;
}
