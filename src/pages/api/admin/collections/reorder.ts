// POST /api/admin/collections/reorder — collection.reorder: rewrites `sort_order` (column F) for
// every listed row in one batchUpdate; the audit row carries the full before/after order
// (docs/ADMIN_SPEC.md §3.4). The order must list every collection exactly once.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { buildAuditRow } from '../../../../lib/admin/audit.ts';
import { CollectionReorder } from '../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../lib/admin/http.ts';
import { updateColumnCells } from '../../../../lib/admin/write.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { HEADERS, TABS } from '../../../../lib/sheets/contract.ts';
import { loadSnapshot } from '../_shared.ts';

const SORT_ORDER_COL = HEADERS.Collections.indexOf('sort_order'); // 5

export const POST = adminPost(CollectionReorder, async ({ context, body }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const byId = new Map(snapshot.collections.map((c) => [c.id.toLowerCase(), c]));
  const seen = new Set<string>();
  const ordered = body.order.map((id) => {
    const c = byId.get(id.toLowerCase());
    if (!c) throw new AdminError(400, 'unknown id', `"${id}" is not a collection id`, { id });
    if (seen.has(c.id)) throw new AdminError(400, 'duplicate id', `"${id}" is listed twice`, { id });
    seen.add(c.id);
    return c;
  });
  if (ordered.length !== snapshot.collections.length) {
    throw new AdminError(400, 'incomplete order', 'the order must list every collection once');
  }
  const before = snapshot.collections
    .slice()
    .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name))
    .map((c) => c.id);
  const after = ordered.map((c) => c.id);
  if (before.join('|') === after.join('|')) {
    return noStore({ ok: true, collections: snapshot.collections, unchanged: true });
  }
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'collection.reorder',
    targetTab: 'Collections',
    targetId: '-',
    before: { order: before },
    after: { order: after },
  });
  const result = await updateColumnCells(client, {
    tab: TABS.collections,
    columnIndex: SORT_ORDER_COL,
    updates: ordered.map((c, i) => ({ row: c.row, expectFirstCell: c.id, value: i + 1 })),
    audit,
  });
  await invalidateAfterWrite(context);
  const fresh = await loadSnapshot(client);
  return noStore({ ok: true, collections: fresh.collections, audit: result.audit });
});

export const ALL = methodNotAllowed('POST');
