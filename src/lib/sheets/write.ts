// The two writes the customer preview makes: reaction rows at the top of the Reactions tab, and
// in one atomic batchUpdate (insertDimension + updateCells with literal values). A batch carries
// every buffered reaction from one flush, so a burst costs one write against the quota (brief §3).
import type { CellValue, SheetsClient } from './client.ts';
import { TABS } from './contract.ts';
import { SheetsApiError } from './errors.ts';
import type { ReactionRow, VisitRow } from './types.ts';

export type CellData =
  | { userEnteredValue: { stringValue: string } | { numberValue: number } | { boolValue: boolean } }
  | Record<string, never>;

/** Literal cell: numbers as numberValue, booleans as boolValue, everything else as stringValue. */
export function cell(v: CellValue): CellData {
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  // stringValue is stored literally: a leading "=" can never become a formula (formula-injection safe).
  return { userEnteredValue: { stringValue: v } };
}

/**
 * Admin writes (docs/ADMIN_SPEC.md §3.4): a blank field is sent as `{}` — an empty CellData inside the
 * `userEnteredValue` field mask clears the cell — so an update can erase a value, not only overwrite it.
 */
export function cellOrClear(v: CellValue | undefined | null): CellData {
  if (v === undefined || v === null || (typeof v === 'string' && v === '')) return {};
  return cell(v);
}

export function reactionRowToCells(row: ReactionRow): CellValue[] {
  return [row.eventId, row.customerSlug, row.productId, row.reaction, row.source, row.createdAt];
}

/**
 * Generalised newest-first insert (any tab, ADMIN_SPEC §3.4): inserts `cells.length` rows at
 * zero-based `rowIndex` (1 = sheet row 2) and fills them with literal values in the same batch.
 * `cells[0]` lands on the inserted row closest to the top.
 */
export function buildInsertRows(
  sheetId: number,
  rowIndex: number,
  cells: ReadonlyArray<ReadonlyArray<CellValue | undefined | null>>,
): unknown[] {
  return [
    {
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + cells.length },
        inheritFromBefore: false,
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex, columnIndex: 0 },
        rows: cells.map((r) => ({ values: r.map(cellOrClear) })),
        fields: 'userEnteredValue',
      },
    },
  ];
}

/**
 * Builds the two requests; exported for tests and for the Phase-5 concurrency harness.
 * rows[0] lands on sheet row 2 (newest); the parser is order-independent within a batch (ADR D4).
 */
export function buildInsertRequests(sheetId: number, rows: readonly ReactionRow[]): unknown[] {
  return buildInsertRows(sheetId, 1, rows.map(reactionRowToCells));
}

/**
 * Inserts `rows` as the newest rows (row 2 onwards) of the Reactions tab. Atomic per call.
 * Retries a stale sheetId once (a recreated tab gets a new random id).
 */
export async function insertReactionRows(client: SheetsClient, rows: readonly ReactionRow[]): Promise<void> {
  if (rows.length === 0) return;
  const attempt = async (): Promise<void> => {
    const sheetId = await client.sheetIdByTitle(TABS.reactions);
    await client.batchUpdate(buildInsertRequests(sheetId, rows));
  };
  try {
    await attempt();
  } catch (e) {
    if (e instanceof SheetsApiError && e.status === 400 && /sheetId|No grid with id/i.test(e.message)) {
      client.forgetSheetIds();
      await attempt();
      return;
    }
    throw e;
  }
}

export function visitRowToCells(row: VisitRow): CellValue[] {
  return [row.eventId, row.customerSlug, row.occurredAt, row.userAgent, row.referrer];
}

/**
 * Inserts `rows` as the newest rows of the Visits tab, with the same atomic insert+fill the
 * Reactions log uses. Visits are append-only and never read back by the catalogue, so a failure
 * here is logged by the caller and never fails a render.
 */
export async function insertVisitRows(client: SheetsClient, rows: readonly VisitRow[]): Promise<void> {
  if (rows.length === 0) return;
  const attempt = async (): Promise<void> => {
    const sheetId = await client.sheetIdByTitle(TABS.visits);
    await client.batchUpdate(buildInsertRows(sheetId, 1, rows.map(visitRowToCells)));
  };
  try {
    await attempt();
  } catch (e) {
    if (e instanceof SheetsApiError && e.status === 400 && /sheetId|No grid with id/i.test(e.message)) {
      client.forgetSheetIds();
      await attempt();
      return;
    }
    throw e;
  }
}
