// POST /api/admin/tags/[id] — tag.update (name / colour; slug kept; version-guarded),
// docs/ADMIN_SPEC.md §2.3, §3.4. Rugs store tag display names, so a rename does not rewrite them.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { buildAuditRow, diffFields } from '../../../../lib/admin/audit.ts';
import { ID_RE, TagUpdate } from '../../../../lib/admin/dto.ts';
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
import { freshTag, loadSnapshot } from '../_shared.ts';

export const POST = adminPost(TagUpdate, async ({ context, body }) => {
  const id = context.params.id;
  if (!id || !ID_RE.test(id)) throw new AdminError(404, 'not found', 'no such tag');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const current = snapshot.tags.find((t) => t.id.toLowerCase() === id.toLowerCase());
  if (!current) throw new AdminError(404, 'not found', `tag "${id}" is not in the sheet`);
  const clash = snapshot.tags.find(
    (t) => t.id !== current.id && t.name.trim().toLowerCase() === body.name.toLowerCase(),
  );
  if (clash) throw new AdminError(409, 'name exists', `Another tag is already called "${clash.name}".`);
  const color = body.color ?? '';
  const diff = diffFields({ name: current.name, color: current.color ?? '' }, { name: body.name, color });
  if (diff.changed.length === 0) return noStore({ ok: true, tag: current, unchanged: true });
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'tag.update',
    targetTab: 'Tags',
    targetId: current.id,
    before: diff.before,
    after: diff.after,
    note: `row ${current.row}`,
  });
  const result = await updateRow(client, {
    tab: TABS.tags,
    row: current.row,
    version: body.version,
    cells: [current.id, current.slug, body.name, color],
    audit,
  });
  await invalidateAfterWrite(context);
  const tag = await freshTag(client, current.row);
  const detached =
    body.name.trim().toLowerCase() === current.name.trim().toLowerCase()
      ? 0
      : snapshot.rugs.filter((r) =>
          r.tags.some((t) => t.trim().toLowerCase() === current.name.trim().toLowerCase()),
        ).length;
  return noStore({ ok: true, tag, audit: result.audit, detached });
});

export const ALL = methodNotAllowed('POST');
