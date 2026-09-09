// Live read/write round-trip logic shared by scripts/roundtrip.ts and tests/live/sheet.test.ts:
// batchGet all tabs → insert one Votes row atomically (with a "=1+1" cell to prove literal storage)
// → poll the formula-owned counters → undo → optionally probe write containment on Rugs.
import { randomBytes } from 'node:crypto';
import type { SheetsClient } from '../../src/lib/sheets/client.ts';
import { HEADERS, PRODUCT_COLS, TABS } from '../../src/lib/sheets/contract.ts';
import { SheetsApiError } from '../../src/lib/sheets/errors.ts';
import { fetchSnapshot } from '../../src/lib/sheets/read.ts';
import { insertReactionRows } from '../../src/lib/sheets/write.ts';
import type { ReactionRow, Snapshot } from '../../src/lib/sheets/types.ts';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface RoundTripResult {
  ok: boolean;
  readMs: number;
  writeMs: number;
  recalcMs: number | null;
  literalCellOk: boolean;
  containment?: 'refused' | 'allowed' | 'skipped';
  rugId: string;
  likesBefore: number;
  likesAfter: number | null;
  snapshot: Snapshot;
}

export async function runRoundTrip(
  client: SheetsClient,
  opts: { log?: (line: string) => void; checkContainment?: boolean; pollMs?: number; polls?: number } = {},
): Promise<RoundTripResult> {
  const log = opts.log ?? (() => {});
  const pollMs = opts.pollMs ?? 500;
  const polls = opts.polls ?? 12;

  let t = Date.now();
  const snap = await fetchSnapshot(client);
  const readMs = Date.now() - t;
  const { rugs, collections, tags, rates } = snap.catalogue;
  log(
    `READ  ${readMs} ms: ${rugs.length} rugs, ${collections.length} collections, ${tags.length} tags, ${rates.length} rates, ${snap.report.votesRowsRead} vote rows, ${snap.report.dropped.length} dropped, ${snap.report.warnings.length} warnings`,
  );
  for (const d of snap.report.dropped.slice(0, 10))
    log(`  dropped ${d.tab} row ${d.row}: ${d.issues.join('; ')}`);
  for (const w of snap.report.warnings.slice(0, 10))
    log(`  warning ${w.tab} row ${w.row}: ${w.issues.join('; ')}`);
  const rug = rugs.find((r) => r.status === 'active');
  if (!rug) throw new Error('no active rug to vote on');
  log(
    `  target rug: ${rug.id} "${rug.name}" likes=${rug.likes} dislikes=${rug.dislikes} rating=${rug.rating}`,
  );

  const visitorHash = `roundtrip-${randomBytes(6).toString('hex')}`;
  // "=1+1" as the event id proves the cell is stored as literal text, never evaluated (ADR D8).
  const row = (reaction: 'like' | 'none'): ReactionRow => ({
    eventId: '=1+1',
    customerSlug: visitorHash,
    productId: rug.id,
    reaction,
    source: 'detail',
    createdAt: new Date().toISOString(),
  });

  t = Date.now();
  await insertReactionRows(client, [row('like')]);
  const writeMs = Date.now() - t;
  log(`WRITE ${writeMs} ms: appended a like for ${rug.id} (atomic batchUpdate)`);

  const [top] = await client.batchGet([`${TABS.reactions}!A2:F2`]);
  const literal = top?.values?.[0]?.[0];
  const literalCellOk = literal === '=1+1';
  log(
    `CELL  event_id read back as ${JSON.stringify(literal)} → ${literalCellOk ? 'literal text (OK)' : 'NOT literal (formula evaluated!)'}`,
  );

  const expectAfter = rug.likes + 1;
  t = Date.now();
  let recalcMs: number | null = null;
  let likesAfter: number | null = null;
  for (let i = 0; i < polls; i++) {
    const again = await fetchSnapshot(client);
    const r = again.catalogue.rugs.find((x) => x.id === rug.id);
    if (r && r.likes === expectAfter) {
      recalcMs = Date.now() - t;
      likesAfter = r.likes;
      log(
        `RECALC ${recalcMs} ms: likes ${rug.likes} → ${r.likes}, rating ${r.rating}, visitor state = ${again.voteState.get(visitorHash)?.get(rug.id) ?? 'none'}`,
      );
      break;
    }
    await sleep(pollMs);
  }
  if (recalcMs === null) log('RECALC: counter did not reflect the vote in time (check the header formulas)');

  t = Date.now();
  await insertReactionRows(client, [row('none')]);
  log(`UNDO  ${Date.now() - t} ms: appended a clearing event`);
  for (let i = 0; i < polls; i++) {
    const again = await fetchSnapshot(client);
    const r = again.catalogue.rugs.find((x) => x.id === rug.id);
    if (r && r.likes === rug.likes) {
      log(
        `RECALC ${Date.now() - t} ms: likes back to ${r.likes}; visitor state = ${again.voteState.get(visitorHash)?.get(rug.id) ?? 'none'}`,
      );
      break;
    }
    await sleep(pollMs);
  }

  let containment: RoundTripResult['containment'] = 'skipped';
  if (opts.checkContainment) {
    // The admin writes content through the same credential, so only the append-only logs and the
    // header rows stay hard-protected. Probe the Reactions header with a clearing write: refused
    // (403) when protected, harmless when not (it is rewritten immediately below).
    const rugsId = await client.sheetIdByTitle(TABS.reactions);
    try {
      await client.batchUpdate([
        {
          updateCells: {
            start: { sheetId: rugsId, rowIndex: 0, columnIndex: PRODUCT_COLS.productId },
            rows: [{ values: [{}] }],
            fields: 'userEnteredValue',
          },
        },
      ]);
      containment = 'allowed';
      await client.valuesUpdate(`${TABS.reactions}!A1:F1`, [[...HEADERS.Reactions]], 'RAW');
      log(
        'CONTAIN: updateCells on the Reactions header was ALLOWED — protect the append-only logs for the owner only (SHEET_SETUP §2.3)',
      );
    } catch (e) {
      containment = e instanceof SheetsApiError && e.status === 403 ? 'refused' : 'allowed';
      log(
        `CONTAIN: updateCells on the Reactions header was ${containment} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  const ok = recalcMs !== null && literalCellOk;
  log(ok ? 'ROUND-TRIP OK' : 'ROUND-TRIP INCOMPLETE');
  return {
    ok,
    readMs,
    writeMs,
    recalcMs,
    literalCellOk,
    containment,
    rugId: rug.id,
    likesBefore: rug.likes,
    likesAfter,
    snapshot: snap,
  };
}
