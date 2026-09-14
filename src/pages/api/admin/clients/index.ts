// GET /api/admin/clients and POST (client.create: unique code, link from the runtime SITE_URL,
// newest-first row 2), docs/ADMIN_SPEC.md §2.3, §6.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { generatePassword, hashCustomerPassword } from '../../../../lib/customer/auth.ts';
import { buildAuditRow } from '../../../../lib/admin/audit.ts';
import { clientLink, clientToCells, newClientCode } from '../../../../lib/admin/clients.ts';
import { ClientInput } from '../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminGet,
  adminPost,
  adminRuntime,
  auditBase,
  methodNotAllowed,
} from '../../../../lib/admin/http.ts';
import { insertTopRow } from '../../../../lib/admin/write.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { TABS } from '../../../../lib/sheets/contract.ts';
import { clientView, freshClient, loadSnapshot, nowIso } from '../_shared.ts';

export const GET = adminGet(async () => {
  const snapshot = await loadSnapshot();
  return noStore({ ok: true, clients: snapshot.clients.map(clientView) });
});

export const POST = adminPost(ClientInput, async ({ context, body, actor }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const code = newClientCode(
    body.name,
    snapshot.clients.map((c) => c.code),
  );
  const link = clientLink(adminRuntime.siteUrl, code);
  // The owner may type a password themselves — easier to dictate over the phone than three random
  // words — and leaving the field blank generates one. Either way it is shown once and stored only
  // as a hash (brief §10).
  const password = body.password?.trim() || generatePassword();
  const passwordHash = hashCustomerPassword(password);
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'client.create',
    targetTab: 'Customers',
    targetId: code,
    // Never the password itself, and never the hash: an audit row is readable by anyone with the
    // sheet. Only whether the owner chose it or the site generated one.
    after: { code, name: body.name, note: body.note, password: body.password ? 'chosen' : 'generated' },
  });
  const result = await insertTopRow(client, {
    // Re-checked inside the admin lock, not just against the snapshot read above. The codes are
    // short scrambles of the buyer's name now (owner, 2026-09-13), so two customers with similar
    // names are a realistic collision — and a duplicated code would hand two buyers the same private
    // link. Cheap: one extra read, only on create, only while the lock is already held.
    precheck: async () => {
      const fresh = await loadSnapshot(client);
      if (fresh.clients.some((c) => c.code.trim().toLowerCase() === code.toLowerCase())) {
        throw new AdminError(
          409,
          'code taken',
          'That preview link was just taken by another customer — press Add again to get a new one.',
          { code },
        );
      }
    },
    tab: TABS.customers,
    cells: clientToCells({
      code,
      name: body.name,
      note: body.note,
      status: 'active',
      createdAt: nowIso(),
      createdBy: actor,
      link,
      passwordHash,
    }),
    audit,
  });
  const created = clientView(await freshClient(client, result.row));
  // The only time the plaintext exists: the reveal-once panel shows it, nothing stores it.
  return noStore({ ok: true, client: created, password, audit: result.audit }, 201);
});

export const ALL = methodNotAllowed('GET, POST');
