// POST /api/admin/clients/[code]/regenerate — mints a new password for one customer (brief §10,
// §14 `POST /api/customers/[slug]/regenerate`; the path lives under /api/admin because that is
// where this project's admin gate applies).
//
// The plaintext exists exactly once, in this response body, for the reveal-once panel. The row
// stores only the scrypt hash. Regenerating does not sign the buyer out: their existing cookie
// stays valid until it expires, which is what the owner wants when they are reading the new
// password down a phone line.
export const prerender = false;

import { noStore } from '../../../../../lib/api.ts';
import { buildAuditRow } from '../../../../../lib/admin/audit.ts';
import { clientToCells } from '../../../../../lib/admin/clients.ts';
import { CLIENT_CODE_RE, ClientPassword } from '../../../../../lib/admin/dto.ts';
import { AdminError, adminPost, auditBase, methodNotAllowed } from '../../../../../lib/admin/http.ts';
import { updateRow } from '../../../../../lib/admin/write.ts';
import { generatePassword, hashCustomerPassword } from '../../../../../lib/customer/auth.ts';
import { getClient } from '../../../../../lib/runtime.ts';
import { TABS } from '../../../../../lib/sheets/contract.ts';
import { clientView, freshClient, loadSnapshot } from '../../_shared.ts';

export const POST = adminPost(ClientPassword, async ({ context, body }) => {
  const code = context.params.code;
  if (!code || !CLIENT_CODE_RE.test(code)) throw new AdminError(404, 'not found', 'no such client');
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const current = snapshot.clients.find((c) => c.code.toLowerCase() === code.toLowerCase());
  if (!current) throw new AdminError(404, 'not found', `client "${code}" is not in the sheet`);

  // Blank means "mint one for me"; otherwise the owner's own choice.
  const password = body.password?.trim() || generatePassword();
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'client.password',
    targetTab: 'Customers',
    targetId: current.code,
    // Never the hash and never the plaintext: an audit row is readable by anyone with the sheet.
    after: { password: body.password ? 'chosen' : 'regenerated' },
    note: `row ${current.row}`,
  });
  const result = await updateRow(client, {
    tab: TABS.customers,
    row: current.row,
    version: body.version,
    cells: clientToCells({ ...current, passwordHash: hashCustomerPassword(password) }),
    audit,
    expectFirstCell: current.code,
  });
  const updated = clientView(await freshClient(client, current.row));
  return noStore({ ok: true, client: updated, password, audit: result.audit });
});

export const ALL = methodNotAllowed('POST');
