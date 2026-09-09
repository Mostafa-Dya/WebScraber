// POST /api/admin/collections/[id] — collection.update (name / description / cover; the slug and
// sort_order are kept; version-guarded whole-row update), docs/ADMIN_SPEC.md §2.3, §3.4. Renaming
// never rewrites rugs: they store display names matched case-insensitively (the UI says so).
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { buildAuditRow, diffFields } from '../../../../lib/admin/audit.ts';
import { CollectionUpdate, ID_RE } from '../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../lib/admin/http.ts';
import { updateRow } from '../../../../lib/admin/write.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { TABS } from '../../../../lib/sheets/contract.ts';
import { checkCover, freshCollection, loadSnapshot } from '../_shared.ts';

export const POST = adminPost(CollectionUpdate, async ({ context, body }) => {
  const id = context.params.id;
  if (!id || !ID_RE.test(id)) throw new AdminError(404, 'not found', 'no such collection');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const current = snapshot.collections.find((c) => c.id.toLowerCase() === id.toLowerCase());
  if (!current) throw new AdminError(404, 'not found', `collection "${id}" is not in the sheet`);
  const clash = snapshot.collections.find(
    (c) => c.id !== current.id && c.name.trim().toLowerCase() === body.name.toLowerCase(),
  );
  if (clash) {
    throw new AdminError(409, 'name exists', `Another collection is already called "${clash.name}".`);
  }
  const cover = checkCover(body.coverImageUrl);
  const before = {
    name: current.name,
    description: current.description,
    coverImageUrl: current.coverImageUrl ?? '',
  };
  const after = { name: body.name, description: body.description, coverImageUrl: cover };
  const diff = diffFields(before, after);
  if (diff.changed.length === 0) return noStore({ ok: true, collection: current, unchanged: true });
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'collection.update',
    targetTab: 'Collections',
    targetId: current.id,
    before: diff.before,
    after: diff.after,
    note: `row ${current.row}`,
  });
  const result = await updateRow(client, {
    tab: TABS.collections,
    row: current.row,
    version: body.version,
    cells: [
      current.id,
      body.name,
      current.slug,
      body.description,
      current.createdAt ?? '',
      cover,
      current.sortOrder,
    ],
    audit,
  });
  await invalidateAfterWrite(context);
  const collection = await freshCollection(client, current.row);
  const detached =
    body.name.trim().toLowerCase() === current.name.trim().toLowerCase()
      ? 0
      : snapshot.rugs.filter((r) => r.collection.trim().toLowerCase() === current.name.trim().toLowerCase())
          .length;
  return noStore({ ok: true, collection, audit: result.audit, detached });
});

export const ALL = methodNotAllowed('POST');
