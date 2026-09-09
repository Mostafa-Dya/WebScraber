// GET /api/admin/settings and POST (settings.update: one key at a time, parsed per key; '' clears),
// docs/ADMIN_SPEC.md §2.3, §3.2. A missing key row is appended at the bottom of the tab.
export const prerender = false;

import { noStore } from '../../../lib/api.ts';
import { buildAuditRow } from '../../../lib/admin/audit.ts';
import { SettingsUpdate } from '../../../lib/admin/dto.ts';
import {
  AdminError,
  adminGet,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../lib/admin/http.ts';
import { parseSettingValue } from '../../../lib/admin/settings.ts';
import { insertRowAtBottom, updateRow } from '../../../lib/admin/write.ts';
import { getClient } from '../../../lib/runtime.ts';
import { TABS } from '../../../lib/sheets/contract.ts';
import { loadSnapshot, nowIso, settingsRowVersion } from './_shared.ts';

export const GET = adminGet(async () => {
  const snapshot = await loadSnapshot();
  return noStore({ ok: true, settings: snapshot.settings });
});

export const POST = adminPost(SettingsUpdate, async ({ context, body, actor }) => {
  const parsed = parseSettingValue(body.key, body.value);
  if (!parsed.ok) throw new AdminError(400, 'bad value', parsed.error, { key: body.key });
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const existing = snapshot.settings.rows.find((r) => r.key === body.key);
  const value = body.value.trim();
  const cells = [body.key, value, nowIso(), actor];
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'settings.update',
    targetTab: 'Settings',
    targetId: body.key,
    before: existing ? { value: existing.value } : undefined,
    after: { value },
  });
  let result;
  if (existing) {
    const raw = await settingsRowVersion(client, existing.row);
    if (raw.key !== body.key) {
      throw new AdminError(409, 'row conflict', `Settings row ${existing.row} moved; reload and retry`);
    }
    result = await updateRow(client, {
      tab: TABS.settings,
      row: existing.row,
      version: raw.version,
      cells,
      audit,
      expectFirstCell: body.key,
    });
  } else {
    result = await insertRowAtBottom(client, { tab: TABS.settings, cells, audit });
  }
  await invalidateAfterWrite(context);
  const fresh = await loadSnapshot(client);
  return noStore({ ok: true, settings: fresh.settings, audit: result.audit });
});

export const ALL = methodNotAllowed('GET, POST');
