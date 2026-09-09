// Reactions compaction (brief §3 rule 3). The tab is append-only and **newest-first** — new events
// are inserted at row 2 (`insertReactionRows`, ADR D4) — so the current state of a
// (customer_slug, product_id) pair is its topmost row and everything below it is history. Compaction
// copies the superseded rows to `ReactionsArchive`, then rewrites `Reactions` from the survivors.
//
// Shared on purpose by the CLI (`npm run reactions:compact`, scripts/compact-reactions.ts) and by
// `POST /api/admin/compact-reactions` (brief §14), so the two can never drift apart.
//
// Manual, never automatic, never while a buyer is active: the tab is rewritten in place, so a
// reaction landing mid-compaction would be lost. Safe to run twice — a second run finds nothing
// superseded and writes nothing at all.
import type { CellValue, SheetsClient } from './client.ts';
import { HEADERS, TABS } from './contract.ts';

const REACTIONS_RANGE = `${TABS.reactions}!A1:F`;
const ARCHIVE_HEADER_RANGE = `${TABS.reactionsArchive}!A1:F1`;
const COLUMNS = HEADERS.Reactions.length; // A:F

const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v).trim());

export interface CompactPlan {
  keep: CellValue[][];
  supersede: CellValue[][];
}

/** Newest-first input: the first row seen for a (customer, product) pair wins. Pure. */
export function planCompaction(rows: readonly CellValue[][]): CompactPlan {
  const keep: CellValue[][] = [];
  const supersede: CellValue[][] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const pair = `${text(row[1])} ${text(row[2])}`;
    if (seen.has(pair)) supersede.push(row);
    else {
      seen.add(pair);
      keep.push(row);
    }
  }
  return { keep, supersede };
}

/** The three calls compaction makes; a Pick so tests can pass a small double. */
export type CompactClient = Pick<SheetsClient, 'batchGet' | 'valuesUpdate' | 'valuesAppend'>;

export interface CompactOptions {
  /** Report what would happen and write nothing (`npm run reactions:compact -- --dry-run`). */
  dryRun?: boolean;
}

export interface CompactResult {
  /** Data rows read from the tab (the header is not counted). */
  read: number;
  /** Rows that survive: one per (customer_slug, product_id) pair. */
  kept: number;
  /** Superseded rows moved to ReactionsArchive; 0 when the tab was already compact or on a dry run. */
  archived: number;
  /** True when nothing needed doing — the idempotent second run. */
  alreadyCompact: boolean;
}

/**
 * Reads the tab, archives the superseded rows and rewrites the survivors.
 *
 * The order matters: the archive append happens **first**, so a failure between the two writes
 * leaves duplicated history rather than lost history. The rewrite then blanks the tail so the rows
 * the survivors no longer occupy are empty, not stale copies.
 */
export async function compactReactions(
  client: CompactClient,
  options: CompactOptions = {},
): Promise<CompactResult> {
  const [reactions, archiveHeader] = await client.batchGet([REACTIONS_RANGE, ARCHIVE_HEADER_RANGE]);
  const rows = reactions?.values ?? [];
  if (rows.length < 2) return { read: 0, kept: 0, archived: 0, alreadyCompact: true };

  const data = rows.slice(1);
  const { keep, supersede } = planCompaction(data);
  const result: CompactResult = {
    read: data.length,
    kept: keep.length,
    archived: supersede.length,
    alreadyCompact: supersede.length === 0,
  };
  if (supersede.length === 0 || options.dryRun) return { ...result, archived: 0 };

  // The archive tab may never have been written to; give it its header before appending.
  if (!archiveHeader?.values?.[0]?.length) {
    await client.valuesUpdate(ARCHIVE_HEADER_RANGE, [[...HEADERS.ReactionsArchive]], 'RAW');
  }
  // 1. Archive the superseded rows (append; never overwrites).
  await client.valuesAppend(`${TABS.reactionsArchive}!A1`, supersede, 'INSERT_ROWS');
  // 2. Rewrite the tab: header + survivors, then blank the tail.
  await client.valuesUpdate(
    `${TABS.reactions}!A1:F${keep.length + 1}`,
    [[...HEADERS.Reactions], ...keep],
    'RAW',
  );
  const blankRows = data.length - keep.length;
  if (blankRows > 0) {
    const blank: CellValue[][] = Array.from({ length: blankRows }, () => Array<CellValue>(COLUMNS).fill(''));
    await client.valuesUpdate(`${TABS.reactions}!A${keep.length + 2}:F${data.length + 1}`, blank, 'RAW');
  }
  return result;
}
