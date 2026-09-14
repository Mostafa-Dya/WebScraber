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

/* ---------- per-product folders (brief §12) ---------- */

/** The subfolder every photo of a rug is kept in, beside the duplicated primary. */
export const ALL_IMAGES_FOLDER = 'All Images';

/**
 * `SL-021 — Winks`. The em dash is the brief's; the id leads so the folder list sorts by it and a
 * renamed rug keeps its place. Characters Drive dislikes in a name are replaced rather than dropped,
 * so two rugs never collapse onto one folder name.
 */
export function productFolderName(productId: string, productName: string): string {
  const clean = (s: string): string =>
    s
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  const id = clean(productId) || 'unknown';
  const name = clean(productName).slice(0, 80);
  return name ? `${id} — ${name}` : id;
}

async function findChildFolder(http: DriveHttp, parentId: string, name: string): Promise<string | undefined> {
  const list = await http.request<{ files?: FileStub[] }>({
    method: 'GET',
    url: `${DRIVE_API}/files`,
    query: [
      ['q', `${folderQuery(name)} and '${escapeDriveQuery(parentId)}' in parents`],
      ['spaces', 'drive'],
      ['fields', 'files(id,name)'],
      ['pageSize', '10'],
    ],
    policy: 'read',
  });
  return (list.files ?? [])[0]?.id;
}

async function createChildFolder(http: DriveHttp, parentId: string, name: string): Promise<string> {
  const created = await http.request<FileStub>({
    method: 'POST',
    url: `${DRIVE_API}/files`,
    query: [['fields', 'id']],
    body: { json: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] } },
    policy: 'write',
  });
  if (!created.id) throw new DriveApiError(502, 'files.create returned no id');
  return created.id;
}

async function ensureChild(http: DriveHttp, parentId: string, name: string): Promise<string> {
  return (await findChildFolder(http, parentId, name)) ?? (await createChildFolder(http, parentId, name));
}

export interface ProductFolders {
  /** `<root>/<id> — <name>`, which holds the duplicated primary. */
  productId: string;
  /** `<root>/<id> — <name>/All Images`, which holds every photo. */
  allImagesId: string;
  name: string;
  /** A link the admin can open; the folder inherits the root's "anyone with the link" permission. */
  url: string;
}

/**
 * Finds or creates the two folders one rug needs. No permission call is made on either: they are
 * created inside the root, which is already shared with anyone holding the link, and Drive folders
 * inherit that. Idempotent, so a retry after a half-finished import reuses what is there.
 */
export function createProductFolderResolver(
  http: DriveHttp,
  ensureRoot: () => Promise<string>,
): (productId: string, productName: string) => Promise<ProductFolders> {
  return async (productId, productName) => {
    const root = await ensureRoot();
    const name = productFolderName(productId, productName);
    const folderId = await ensureChild(http, root, name);
    const allImagesId = await ensureChild(http, folderId, ALL_IMAGES_FOLDER);
    return {
      productId: folderId,
      allImagesId,
      name,
      url: `https://drive.google.com/drive/folders/${folderId}`,
    };
  };
}

/**
 * Every file already sitting in a folder, as `name → id`. Used by the retry path to tell what an
 * interrupted import managed to upload: filenames are deterministic (`01-primary`, `winks-02`), so a
 * name that is already there is a photo that already landed. One page of 100 covers the 12-photo cap
 * many times over.
 */
export function createFolderLister(http: DriveHttp): (folderId: string) => Promise<Map<string, string>> {
  return async (folderId) => {
    const list = await http.request<{ files?: FileStub[] }>({
      method: 'GET',
      url: `${DRIVE_API}/files`,
      query: [
        ['q', `'${escapeDriveQuery(folderId)}' in parents and trashed=false`],
        ['spaces', 'drive'],
        ['fields', 'files(id,name)'],
        ['pageSize', '100'],
      ],
      policy: 'read',
    });
    const out = new Map<string, string>();
    for (const f of list.files ?? []) if (f.name && !out.has(f.name)) out.set(f.name, f.id);
    return out;
  };
}
