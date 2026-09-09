// POST /api/admin/clients/[code]/status — client.status (active ↔ revoked; rows are never deleted
// and the site keeps accepting old codes, docs/ADMIN_SPEC.md §3.2, §6.3).
export const prerender = false;

import { noStore } from '../../../../../lib/api.ts';
import { buildAuditRow } from '../../../../../lib/admin/audit.ts';
import { clientToCells } from '../../../../../lib/admin/clients.ts';
import { CLIENT_CODE_RE, ClientStatus } from '../../../../../lib/admin/dto.ts';
import { AdminError, adminPost, auditBase, methodNotAllowed } from '../../../../../lib/admin/http.ts';
import { updateRow } from '../../../../../lib/admin/write.ts';
import { getClient } from '../../../../../lib/runtime.ts';
import { TABS } from '../../../../../lib/sheets/contract.ts';
import { clientView, freshClient, loadSnapshot } from '../../_shared.ts';

export const POST = adminPost(ClientStatus, async ({ context, body }) => {
  const code = context.params.code;
  if (!code || !CLIENT_CODE_RE.test(code)) throw new AdminError(404, 'not found', 'no such client');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const current = snapshot.clients.find((c) => c.code.toLowerCase() === code.toLowerCase());
  if (!current) throw new AdminError(404, 'not found', `client "${code}" is not in the sheet`);
  if (current.status === body.status) {
    return noStore({ ok: true, client: clientView(current), unchanged: true });
  }
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'client.status',
    targetTab: 'Customers',
    targetId: current.code,
    before: { status: current.status },
    after: { status: body.status },
    note: `row ${current.row}`,
  });
  const result = await updateRow(client, {
    tab: TABS.customers,
    row: current.row,
    version: body.version,
    cells: clientToCells({ ...current, status: body.status }),
    audit,
    expectFirstCell: current.code,
  });
  const updated = clientView(await freshClient(client, current.row));
  return noStore({ ok: true, client: updated, audit: result.audit });
});

export const ALL = methodNotAllowed('POST');
