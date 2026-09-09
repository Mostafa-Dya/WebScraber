// The photos folder (docs/ADMIN_SPEC.md §5.2), decided once per process:
//   1. `folderId` (GOOGLE_DRIVE_FOLDER_ID) when set — trusted as is, no API call;
//   2. else `files.list` by name (under `drive.file` only app-created files are visible, so the name
//      is unambiguous) — and the "anyone with the link" permission is checked/added, so a folder whose
//      permission call failed on a previous run heals itself;
//   3. else `files.create` + `permissions.create` anyone/reader (files inherit it: no per-file call).
// The result is memoised; concurrent callers share one in-flight lookup; a failure is not memoised.

import { DRIVE_ID_RE } from '../images.ts';
import { DRIVE_API, DriveApiError, type DriveHttp } from './client.ts';
import { FOLDER_MIME_TYPE, PHOTOS_FOLDER_NAME } from './types.ts';

export interface FolderOptions {
  folderId?: string;
  /** Test hook / future rename; defaults to `PHOTOS_FOLDER_NAME`. */
  name?: string;
}

interface FileStub {
  id: string;
  name?: string;
}

/** Escapes a literal for a Drive `q` string (backslash and single quote). */
export function escapeDriveQuery(literal: string): string {
  return literal.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function folderQuery(name: string): string {
  return `name='${escapeDriveQuery(name)}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
}

async function hasAnyoneReader(http: DriveHttp, folderId: string): Promise<boolean> {
  const res = await http.request<{ permissions?: Array<{ type?: string; role?: string }> }>({
    method: 'GET',
    url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions`,
    query: [['fields', 'permissions(type,role)']],
    policy: 'read',
  });
  return (res.permissions ?? []).some((p) => p.type === 'anyone');
}

async function shareAnyoneReader(http: DriveHttp, folderId: string): Promise<void> {
  await http.request<{ id?: string }>({
    method: 'POST',
    url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions`,
    query: [['fields', 'id']],
    body: { json: { type: 'anyone', role: 'reader', allowFileDiscovery: false } },
    policy: 'write',
  });
}

async function discoverOrCreate(http: DriveHttp, name: string): Promise<string> {
  const list = await http.request<{ files?: FileStub[] }>({
    method: 'GET',
    url: `${DRIVE_API}/files`,
    query: [
      ['q', folderQuery(name)],
      ['spaces', 'drive'],
      ['fields', 'files(id,name)'],
      ['pageSize', '10'],
    ],
    policy: 'read',
  });
  const files = list.files ?? [];
  const found = files[0];
  if (found) {
    if (files.length > 1) {
      http.logger.warn(`found ${files.length} folders named "${name}"; using the first`, {
        ids: files.map((f) => f.id),
      });
    }
    if (!(await hasAnyoneReader(http, found.id))) {
      await shareAnyoneReader(http, found.id);
      http.logger.info(`restored the "anyone with the link" permission on folder ${found.id}`);
    }
    http.logger.info(
      `using Drive folder "${name}" (${found.id}); set GOOGLE_DRIVE_FOLDER_ID=${found.id} to skip this lookup`,
    );
    return found.id;
  }
  const created = await http.request<FileStub>({
    method: 'POST',
    url: `${DRIVE_API}/files`,
    query: [['fields', 'id']],
    body: { json: { name, mimeType: FOLDER_MIME_TYPE } },
    policy: 'write',
  });
  if (!created.id) throw new DriveApiError(502, 'files.create returned no id');
  await shareAnyoneReader(http, created.id);
  http.logger.info(
    `created Drive folder "${name}" (${created.id}); set GOOGLE_DRIVE_FOLDER_ID=${created.id} to skip this lookup`,
  );
  return created.id;
}

export function createFolderResolver(http: DriveHttp, options: FolderOptions = {}): () => Promise<string> {
  const name = options.name ?? PHOTOS_FOLDER_NAME;
  const configured = options.folderId?.trim() || undefined;
  let resolved: string | undefined;
  let pending: Promise<string> | undefined;
  return async () => {
    if (resolved) return resolved;
    if (configured !== undefined) {
      if (!DRIVE_ID_RE.test(configured)) {
        throw new DriveApiError(400, 'GOOGLE_DRIVE_FOLDER_ID is not a Drive file id', 'INVALID_ARGUMENT');
      }
      resolved = configured;
      return resolved;
    }
    if (!pending) {
      pending = discoverOrCreate(http, name)
        .then((id) => {
          resolved = id;
          return id;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
}
