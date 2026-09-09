// GET /api/admin/clients/report — the client-saves report (docs/ADMIN_SPEC.md §3.5, §6.3): the
// Votes tab read fully (bounded by the 200 000-row breaker) joined to Rugs and Clients.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { adminGet, methodNotAllowed } from '../../../../lib/admin/http.ts';
import { ADMIN_READ_RANGES, parseAdminSnapshot } from '../../../../lib/admin/read.ts';
import { SAVES_READ_RANGE, buildSavesReport } from '../../../../lib/admin/saves.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { consoleLogger } from '../../../../lib/sheets/errors.ts';

export const GET = adminGet(async () => {
  const client = getClient();
  const ranges = await client.batchGet([...ADMIN_READ_RANGES, SAVES_READ_RANGE]);
  const snapshot = parseAdminSnapshot(ranges.slice(0, ADMIN_READ_RANGES.length), { logger: consoleLogger });
  const votes = ranges[ADMIN_READ_RANGES.length]?.values;
  const report = buildSavesReport(votes, snapshot.rugs, snapshot.clients);
  return noStore({ ok: true, ...report });
});

export const ALL = methodNotAllowed('GET');
