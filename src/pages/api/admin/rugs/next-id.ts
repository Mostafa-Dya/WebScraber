// GET /api/admin/rugs/next-id — preview of the next `SL-nnn` (not reserved; docs/ADMIN_SPEC.md §3.4).
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { adminGet, methodNotAllowed } from '../../../../lib/admin/http.ts';
import { nextRugId } from '../../../../lib/admin/ids.ts';
import { loadSnapshot, reservedIds } from '../_shared.ts';

export const GET = adminGet(async () => {
  const snapshot = await loadSnapshot();
  return noStore({
    ok: true,
    id: nextRugId(
      snapshot.rugs.map((r) => r.id),
      reservedIds(snapshot),
    ),
  });
});

export const ALL = methodNotAllowed('GET');
