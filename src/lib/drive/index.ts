// Public entry point for the Drive photo import (docs/ADMIN_SPEC.md §5).
//
//   const drive = createDriveClient({
//     getAccessToken: () => tokens.getAccessToken(), // the Sheets TokenSource (one bearer serves both APIs)
//     download: guardedDownload,                     // the scraper's SSRF-guarded undici client
//     folderId: GOOGLE_DRIVE_FOLDER_ID,              // optional; discovered/created by name otherwise
//   });
//   await drive.scopeStatus();                        // { driveScopeOk, scopes, reason? } — cached
//   await drive.uploadFromUrl(url, `${slug}-1.jpg`);  // { id, name } | { error, detail?, id? }
//
// In GOOGLE_AUTH_MODE=service_account the integrator should not create the client (uploads would land
// in the service account's own Drive, §5.1): report `drive_not_authorised` instead.

import { createDriveHttp } from './client.ts';
import { createFolderLister, createFolderResolver, createProductFolderResolver } from './folder.ts';
import { createMediaReader } from './media.ts';
import { createScopeChecker } from './scope.ts';
import { createCopier, createUploader, defaultDownload } from './upload.ts';
import type { DriveClient, DriveClientOptions } from './types.ts';

export function createDriveClient(options: DriveClientOptions): DriveClient {
  const http = createDriveHttp({
    getAccessToken: options.getAccessToken,
    fetchImpl: options.fetchImpl,
    logger: options.logger,
    sleep: options.sleep,
    maxAttempts: options.maxAttempts,
  });
  const ensureFolder = createFolderResolver(http, { folderId: options.folderId });
  const download = options.download ?? ((url: string) => defaultDownload(url, http.fetchImpl));
  const uploadFromUrl = createUploader(http, { download, ensureFolder });
  const scopeStatus = createScopeChecker({ getAccessToken: options.getAccessToken, http, now: options.now });
  const getMedia = createMediaReader({ getAccessToken: options.getAccessToken, http });
  const ensureProductFolders = createProductFolderResolver(http, ensureFolder);
  const copyFile = createCopier(http);
  const listFolder = createFolderLister(http);
  return { ensureFolder, ensureProductFolders, uploadFromUrl, copyFile, listFolder, scopeStatus, getMedia };
}

export { DriveApiError, describeDriveError } from './client.ts';
export { DownloadError, buildMultipartBody, defaultDownload, fileNameFor, waitForLh3 } from './upload.ts';
export {
  DRIVE_MEDIA_ID_RE,
  PROXY_WIDTHS,
  coerceWidth,
  createMediaReader,
  createPublicMediaReader,
  isDriveFileId,
} from './media.ts';
export type { ProxyWidth } from './media.ts';
export { IMAGE_CACHE_CONTROL, driveImageResponse, imageMethodNotAllowed } from './proxy.ts';
export { hasDriveScope, parseScopes } from './scope.ts';
export {
  ALL_IMAGES_FOLDER,
  createFolderLister,
  createProductFolderResolver,
  productFolderName,
} from './folder.ts';
export type { ProductFolders } from './folder.ts';
export {
  DOWNLOAD_HOSTS,
  DRIVE_FILE_SCOPE,
  DRIVE_FULL_SCOPE,
  MAX_UPLOAD_BYTES,
  PHOTOS_FOLDER_NAME,
} from './types.ts';
export type { ImageProxyDeps } from './proxy.ts';
export type {
  DownloadResult,
  Downloader,
  DriveClient,
  DriveClientOptions,
  MediaErrorCode,
  MediaResult,
  ScopeReason,
  ScopeStatus,
  UploadErrorCode,
  UploadResult,
} from './types.ts';
