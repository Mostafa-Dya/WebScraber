// GET /api/admin/clients/visits — the access log: who has opened their private link, when they last
// did, and from what kind of device.
//
// The Visits tab has been written since the customer realm shipped (one row per buyer per half-hour
// session) but nothing read it back, so the owner could see what a buyer had liked and not whether
// they had ever arrived. This is the read side.
//
// It joins to Customers so a buyer who has a link but has never used it still appears, with zero
// visits — which is usually the row the owner most wants to see.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { adminGet, methodNotAllowed } from '../../../../lib/admin/http.ts';
import { ADMIN_READ_RANGES, parseAdminSnapshot } from '../../../../lib/admin/read.ts';
import { VISITS_READ_RANGE, buildVisitsReport } from '../../../../lib/admin/visits.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { consoleLogger } from '../../../../lib/sheets/errors.ts';

export const GET = adminGet(async () => {
  const client = getClient();
  const ranges = await client.batchGet([...ADMIN_READ_RANGES, VISITS_READ_RANGE]);
  const snapshot = parseAdminSnapshot(ranges.slice(0, ADMIN_READ_RANGES.length), { logger: consoleLogger });
  const visits = ranges[ADMIN_READ_RANGES.length]?.values;
  const report = buildVisitsReport(visits, snapshot.clients);
  return noStore({ ok: true, ...report });
});

export const ALL = methodNotAllowed('GET');
