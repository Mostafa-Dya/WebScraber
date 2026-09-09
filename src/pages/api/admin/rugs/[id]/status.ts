// POST /api/admin/rugs/[id]/status — soft archive / restore / draft (rug.status), docs/ADMIN_SPEC.md
// §3.4: rows are never deleted; `archived` hides the rug from the site and refuses votes.
export const prerender = false;

import { noStore } from '../../../../../lib/api.ts';
import { buildAuditRow } from '../../../../../lib/admin/audit.ts';
import { ID_RE, RugStatus } from '../../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../../lib/admin/http.ts';
import { findRugById } from '../../../../../lib/admin/read.ts';
import { productFieldsToCells, updateRug } from '../../../../../lib/admin/write.ts';
import { getClient } from '../../../../../lib/runtime.ts';
import { consoleLogger } from '../../../../../lib/sheets/errors.ts';
import { fieldsOfRug, freshRug, loadSnapshot, requireAdminHeaders } from '../../_shared.ts';

export const POST = adminPost(RugStatus, async ({ context, body }) => {
  const id = context.params.id;
  if (!id || !ID_RE.test(id)) throw new AdminError(404, 'not found', 'no such rug');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  requireAdminHeaders(snapshot);
  const rug = findRugById(snapshot, id);
  if (!rug) throw new AdminError(404, 'not found', `rug "${id}" is not in the sheet`);
  if (rug.status === body.status) return noStore({ ok: true, rug, unchanged: true });
  const fields = { ...fieldsOfRug(rug), status: body.status };
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'rug.status',
    targetTab: 'Products',
    targetId: rug.id,
    before: { status: rug.status },
    after: { status: body.status },
    note: `row ${rug.row}`,
  });
  const result = await updateRug(client, {
    row: rug.row,
    id: rug.id,
    version: body.version,
    cells: { all: productFieldsToCells(fields, rug.id) },
    audit,
    logger: consoleLogger,
  });
  await invalidateAfterWrite(context);
  const fresh = await freshRug(client, rug.row, rug.id);
  return noStore({ ok: true, rug: fresh, audit: result.audit, verified: result.verified });
});

export const ALL = methodNotAllowed('POST');
