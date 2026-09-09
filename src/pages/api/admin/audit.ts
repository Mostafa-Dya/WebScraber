// GET /api/admin/audit?offset=&limit= — the AuditLog viewer's paging (docs/ADMIN_SPEC.md §2.3).
// Rows are newest-first from row 2, so `offset` maps straight onto sheet rows.
export const prerender = false;

import { noStore } from '../../../lib/api.ts';
import { parseAuditRows } from '../../../lib/admin/audit.ts';
import { AuditQuery, issuesOf } from '../../../lib/admin/dto.ts';
import { adminGet, methodNotAllowed } from '../../../lib/admin/http.ts';
import { getClient } from '../../../lib/runtime.ts';
import { TABS } from '../../../lib/sheets/contract.ts';

export const GET = adminGet(async ({ context }) => {
  const parsed = AuditQuery.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) {
    return noStore({ ok: false, error: 'invalid query', issues: issuesOf(parsed.error) }, 400);
  }
  const { offset, limit } = parsed.data;
  const first = 2 + offset;
  const last = first + limit - 1;
  const [header, page, colA] = await getClient().batchGet([
    `${TABS.auditLog}!A1:J1`,
    `${TABS.auditLog}!A${first}:J${last}`,
    `${TABS.auditLog}!A2:A`,
  ]);
  const rows = parseAuditRows([header?.values?.[0] ?? [], ...(page?.values ?? [])]).map((r) => ({
    ...r,
    row: r.row + offset,
  }));
  const total = colA?.values?.length ?? 0;
  return noStore({ ok: true, rows, offset, limit, total });
});

export const ALL = methodNotAllowed('GET');
