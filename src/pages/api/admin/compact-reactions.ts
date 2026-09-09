// POST /api/admin/compact-reactions — the admin-triggered form of `npm run reactions:compact`
// (brief §3 rule 3, §14). Keeps the newest row per (customer_slug, product_id), moves the superseded
// rows to `ReactionsArchive`, and answers `{ ok: true, kept, archived }`.
//
// Idempotent: a second run finds nothing superseded, writes nothing at all and answers
// `archived: 0`. The compaction itself lives in src/lib/sheets/compact.ts, shared with the CLI so
// the two can never drift apart.
//
// Audited as `reactions.compact` (target_tab Reactions). It is deliberately *not* in
// `MUTATION_ACTIONS`: the row is written after the rewrite has already happened, so refusing an
// over-long diff would refuse nothing — truncation is the only sensible failure mode here.
export const prerender = false;

import { noStore } from '../../../lib/api.ts';
import { CompactReactionsRequest } from '../../../lib/admin/dto.ts';
import {
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
  recordAuditEvent,
} from '../../../lib/admin/http.ts';
import { getClient } from '../../../lib/runtime.ts';
import { compactReactions } from '../../../lib/sheets/compact.ts';
import { TABS } from '../../../lib/sheets/contract.ts';

export const POST = adminPost(CompactReactionsRequest, async ({ context }) => {
  const result = await compactReactions(getClient());

  await recordAuditEvent({
    ...auditBase(context),
    action: 'reactions.compact',
    targetTab: 'Reactions',
    targetId: TABS.reactions,
    after: { read: result.read, kept: result.kept, archived: result.archived },
    note: result.alreadyCompact
      ? `already compact (${result.kept} rows)`
      : `${result.archived} superseded rows archived; ${result.kept} kept`,
  });

  // The catalogue reads a fixed window of the newest reaction rows (REACTIONS_WINDOW_ROWS), so a
  // compaction can pull older pairs into view: bust the snapshot rather than serve stale counts.
  if (result.archived > 0) await invalidateAfterWrite(context);

  return noStore({ ok: true, kept: result.kept, archived: result.archived });
});

export const ALL = methodNotAllowed('POST');
