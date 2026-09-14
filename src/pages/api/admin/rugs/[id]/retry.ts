// POST /api/admin/rugs/[id]/retry — finishes a row whose photo import did not complete (brief §12).
//
// The commit writes the row first and marks it `pending`, so a failure part-way through leaves a
// visible row rather than orphaned files in Drive. This is the other half of that bargain: the
// products list shows the pending row and this endpoint finishes it.
//
// Where the photo URLs come from is worth explaining. They are NOT stored on the row — the Products
// tab is the brief's fixed 42 columns and there is nowhere to put them. Instead the source page is
// re-scraped: the row already carries `Source URL`, the scraper is cached and idempotent, and a
// supplier page that has not changed returns the same images. That keeps the retry honest with no
// extra column and no second source of truth.
//
// Photos already in Drive are kept. The shortfall is worked out from the `All Images` folder itself,
// not from the row: the Products tab records only the primary, so counting row photos would re-upload
// everything after it. Filenames are deterministic, so a name already in the folder is a photo that
// already landed — which makes this endpoint idempotent, and pressing it twice a no-op.
export const prerender = false;

import { noStore } from '../../../../../lib/api.ts';
import { buildAuditRow } from '../../../../../lib/admin/audit.ts';
import { RugCommit } from '../../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../../lib/admin/http.ts';
import { productFieldsToCells, updateRug } from '../../../../../lib/admin/write.ts';
import { commitPhotos } from '../../../../../lib/drive/commit.ts';
import { extractDriveId } from '../../../../../lib/images.ts';
import { getAdminDeps, getClient } from '../../../../../lib/runtime.ts';
import { scrapeRug } from '../../../../../lib/scrape/index.ts';
import { consoleLogger } from '../../../../../lib/sheets/errors.ts';
import { fieldsOfRug, freshRug, loadSnapshot, nowIso } from '../../_shared.ts';

export const POST = adminPost(RugCommit.partial({ version: true }), async ({ context, body }) => {
  const id = context.params.id;
  if (!id) throw new AdminError(404, 'not found', 'no such rug');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const rug = snapshot.rugs.find((r) => r.id === id);
  if (!rug) throw new AdminError(404, 'not found', `No rug with id "${id}".`);

  const deps = getAdminDeps();
  if (!deps.drive) {
    throw new AdminError(
      409,
      'drive_not_authorised',
      'Photo import needs a Google account with Drive access.',
      {
        reason: 'service_account',
      },
    );
  }
  const scope = await deps.drive.scopeStatus();
  if (!scope.driveScopeOk) {
    throw new AdminError(
      409,
      'drive_not_authorised',
      `Drive is not authorised (${scope.reason ?? 'unknown'}).`,
      {
        reason: scope.reason ?? null,
      },
    );
  }
  if (!rug.sourceUrl) {
    throw new AdminError(
      422,
      'no_source',
      'This row has no source URL, so there is nothing to fetch the photos from again. Paste Drive ids by hand instead.',
    );
  }

  // Re-read the supplier page for its images. The scrape writes nothing by itself (ADMIN_SPEC §4).
  const scraped = await scrapeRug(rug.sourceUrl, {
    jinaFallback: deps.scrape.jinaFallback,
    respectRobots: deps.scrape.respectRobots,
    convertToUsd: deps.convertToUsd,
    logger: consoleLogger,
  });
  if (!scraped.ok) {
    throw new AdminError(
      502,
      'scrape_failed',
      `Could not read ${rug.sourceUrl} again (${scraped.code}): ${scraped.message}`,
      { reason: scraped.code },
    );
  }
  // ScrapedPhoto carries the full-size candidate plus dimensions; only the URL is needed here.
  const wanted = (scraped.data.photos ?? []).map((p) => p.url).slice(0, 12);
  if (wanted.length === 0) {
    throw new AdminError(422, 'no_photos', 'The source page no longer offers any photographs.');
  }

  const commit = await commitPhotos(
    {
      productId: rug.id,
      productName: rug.name,
      urls: wanted,
      namePrefix: rug.slug || rug.id,
      reuseExisting: true,
      /*
       * Without this, `transformsFor('', 0)` returns [] and the Karavan 90-degree rotation (owner
       * requirement, 2026-09-13) silently does not run on the retry path — so a half-imported
       * Karavan rug finished from the Products list came out unrotated, while the same rug imported
       * in one go came out correct. The field is already on the loaded row.
       */
      supplier: rug.supplier,
    },
    { drive: deps.drive, logger: consoleLogger },
  );
  const uploaded = commit.photos.filter((p) => p.id && !p.reused).length;

  // The row keeps its own primary first, so finishing an import never reshuffles the card image.
  const photos = [...new Set([...rug.photos, ...commit.ids].map((p) => extractDriveId(p) ?? p))].slice(0, 12);
  const complete = commit.complete;
  const fields = {
    ...fieldsOfRug(rug),
    photos,
    commitStatus: complete ? ('complete' as const) : ('pending' as const),
    driveFolderId: commit.folders?.productId ?? rug.driveFolderId,
    driveFolderUrl: commit.folders?.url ?? rug.driveFolderUrl,
  };

  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'photo.import',
    targetTab: 'Drive',
    targetId: rug.id,
    after: {
      wanted: wanted.length,
      imported: uploaded,
      reused: commit.ids.length - uploaded,
      commitStatus: fields.commitStatus,
    },
    note: `row ${rug.row}`,
  });
  const result = await updateRug(client, {
    row: rug.row,
    version: body.version ?? rug.version,
    id: rug.id,
    cells: { all: productFieldsToCells({ ...fields, scrapedAt: rug.scrapedAt || nowIso() }, rug.id) },
    audit,
    logger: consoleLogger,
  });

  // The primary photo is a catalogue-visible cell, so the public snapshot must not outlive the write.
  await invalidateAfterWrite(context);

  return noStore({
    ok: true,
    rug: await freshRug(client, rug.row, rug.id),
    photos: commit.photos,
    imported: uploaded,
    reused: commit.ids.length - uploaded,
    complete,
    audit: result.audit,
  });
});

export const ALL = methodNotAllowed('POST');
