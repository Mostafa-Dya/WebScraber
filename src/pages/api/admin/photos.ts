// POST /api/admin/photos — imports ≤ 12 supplier photos into Drive sequentially and returns the
// per-URL outcome (docs/ADMIN_SPEC.md §5.3). 5 / min per session; audited as `photo.import`
// (target_tab Drive, after = { ids, failed }). Fallback = store nothing: 409 `drive_not_authorised`
// when the token lacks the drive.file scope or the deployment runs in service-account mode.
export const prerender = false;

import { noStore } from '../../../lib/api.ts';
import { PhotoImportRequest } from '../../../lib/admin/dto.ts';
import {
  AdminError,
  adminPost,
  adminRuntime,
  auditBase,
  methodNotAllowed,
  recordAuditEvent,
} from '../../../lib/admin/http.ts';
import { commitPhotos } from '../../../lib/drive/commit.ts';
import { getAdminDeps } from '../../../lib/runtime.ts';
import { consoleLogger } from '../../../lib/sheets/errors.ts';

export interface PhotoOutcome {
  url: string;
  id?: string;
  name?: string;
  error?: string;
  detail?: string;
}

export const POST = adminPost(
  PhotoImportRequest,
  async ({ context, body }) => {
    const deps = getAdminDeps();
    if (!deps.drive) {
      adminRuntime.driveScopeOk = false;
      throw new AdminError(
        409,
        'drive_not_authorised',
        'Photo import needs GOOGLE_AUTH_MODE=oauth_refresh with the drive.file scope — see SHEET_SETUP §6.',
        { reason: 'service_account' },
      );
    }
    const scope = await deps.drive.scopeStatus();
    adminRuntime.driveScopeOk = scope.driveScopeOk;
    if (!scope.driveScopeOk) {
      throw new AdminError(
        409,
        'drive_not_authorised',
        `Drive is not authorised (${scope.reason ?? 'unknown'}) — see SHEET_SETUP §6.`,
        { reason: scope.reason ?? null },
      );
    }
    // With a product id this is the brief's commit: its own folder, an "All Images" child, and the
    // primary duplicated up. Without one it is a plain import into the flat root, unchanged.
    const commit = body.productId
      ? await commitPhotos(
          {
            productId: body.productId,
            productName: body.productName ?? body.productId,
            urls: body.urls,
            namePrefix: body.namePrefix,
            supplier: body.supplier,
          },
          { drive: deps.drive, logger: consoleLogger },
        )
      : undefined;

    const photos: PhotoOutcome[] = commit ? commit.photos : [];
    if (!commit) {
      for (const [i, url] of body.urls.entries()) {
        const r = await deps.drive.uploadFromUrl(url, `${body.namePrefix}-${i + 1}.jpg`);
        if ('error' in r)
          photos.push({
            url,
            error: r.error,
            ...(r.detail ? { detail: r.detail } : {}),
            ...(r.id ? { id: r.id } : {}),
          });
        else photos.push({ url, id: r.id, name: r.name });
      }
    }
    const ids = photos.filter((p) => p.id && !p.error).map((p) => p.id!);
    const failed = photos.filter((p) => p.error).map((p) => ({ url: p.url, error: p.error }));
    const audit = await recordAuditEvent({
      ...auditBase(context),
      action: 'photo.import',
      targetTab: 'Drive',
      targetId: body.namePrefix,
      after: { ids, failed },
      note: `${ids.length}/${body.urls.length} imported`,
    });
    if (ids.length === 0) {
      return noStore({ ok: false, error: 'upload_failed', photos, imported: 0, audit }, 502);
    }
    return noStore({
      ok: true,
      photos,
      imported: ids.length,
      // The admin writes these onto the row so the folder is one click away from the rug.
      ...(commit?.folders
        ? { driveFolderId: commit.folders.productId, driveFolderUrl: commit.folders.url }
        : {}),
      complete: commit ? commit.complete : ids.length === body.urls.length,
      audit,
    });
  },
  'photos',
);

export const ALL = methodNotAllowed('POST');
