// One batchGet per refresh → validated snapshot (docs/ADR.md D3, D5.2), plus the cheap metadata
// read that feeds the Votes growth breaker (ADR D4).
import type { SheetsClient, ValueRange } from './client.ts';
import { READ_RANGES, TABS } from './contract.ts';
import { parseSnapshot } from './parse.ts';
import type { Snapshot } from './types.ts';
import type { SnapshotMeta } from './cache.ts';

/** Content tabs subject to the "more than 10 % of rows failing rejects the refresh" rule. */
const GUARDED_TABS: readonly string[] = [
  TABS.products,
  TABS.collections,
  TABS.tags,
  TABS.rates,
  TABS.customers,
];
export const MAX_DROPPED_RATIO = 0.1;

export async function fetchRanges(client: SheetsClient): Promise<ValueRange[]> {
  return client.batchGet(READ_RANGES);
}

/** Reactions grid row count (grows with every append) for the growth breaker; one small read per refresh. */
export async function fetchMeta(client: SheetsClient): Promise<SnapshotMeta> {
  const info = await client.getSpreadsheet('sheets.properties');
  const reactions = (info.sheets ?? []).find((s) => s.properties.title === TABS.reactions);
  const rowCount = reactions?.properties.gridProperties?.rowCount;
  return { votesRowsTotal: typeof rowCount === 'number' ? rowCount : undefined };
}

/** Parses and applies the per-tab rejection rule; throws to reject the whole refresh. */
export function snapshotFromRanges(ranges: readonly ValueRange[], now: () => number = Date.now): Snapshot {
  const parsed = parseSnapshot(ranges);
  for (const tab of GUARDED_TABS) {
    const s = parsed.report.stats[tab];
    if (!s) continue;
    const rows = s.kept + s.dropped;
    if (rows > 0 && s.dropped / rows > MAX_DROPPED_RATIO) {
      throw new Error(`refresh rejected: ${s.dropped} of ${rows} ${tab} rows failed validation`);
    }
  }
  return { ...parsed, fetchedAt: now() };
}

export async function fetchSnapshot(client: SheetsClient, now: () => number = Date.now): Promise<Snapshot> {
  return snapshotFromRanges(await fetchRanges(client), now);
}
