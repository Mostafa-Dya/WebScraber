// Reactions compaction (src/lib/sheets/compact.ts, brief §3 rule 3): newest row per
// (customer_slug, product_id) survives, superseded rows are archived first, the tail is blanked,
// and a second run is a no-op that writes nothing at all.
import { describe, expect, it } from 'vitest';
import { compactReactions, planCompaction } from '../../src/lib/sheets/compact.ts';
import type { CellValue } from '../../src/lib/sheets/client.ts';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { fakeSheet } from './admin-ui/fake-sheets.ts';

/** One Reactions row: event_id, customer_slug, product_id, reaction, source, created_at. */
const ev = (id: string, slug: string, product: string, reaction: string, at: string): CellValue[] => [
  id,
  slug,
  product,
  reaction,
  'card',
  at,
];

/**
 * Newest first, as insertReactionRows leaves the tab (row 2 is the newest event). A factory, not a
 * constant: the fake sheet holds the row arrays it is given and compaction rewrites them in place,
 * exactly as the real tab is rewritten.
 */
const newestFirst = (): CellValue[][] => [
  ev('e9', 'hala', 'SL-021', 'none', '2026-09-08T12:00:00Z'), // hala/SL-021 current
  ev('e8', 'omar', 'SL-022', 'like', '2026-09-08T11:00:00Z'), // omar/SL-022 current
  ev('e7', 'hala', 'SL-021', 'like', '2026-09-08T10:00:00Z'), // superseded by e9
  ev('e6', 'hala', 'SL-022', 'dislike', '2026-09-08T09:00:00Z'), // hala/SL-022 current
  ev('e5', 'omar', 'SL-022', 'dislike', '2026-09-08T08:00:00Z'), // superseded by e8
  ev('e4', 'hala', 'SL-021', 'dislike', '2026-09-08T07:00:00Z'), // superseded by e9
];

describe('planCompaction', () => {
  it('keeps the first row seen per pair and supersedes the rest, in order', () => {
    const { keep, supersede } = planCompaction(newestFirst());
    expect(keep.map((r) => r[0])).toEqual(['e9', 'e8', 'e6']);
    expect(supersede.map((r) => r[0])).toEqual(['e7', 'e5', 'e4']);
    expect(keep.length + supersede.length).toBe(6);
  });

  it('keeps a `none` event: it is the current state, not an absence of one', () => {
    const rows = newestFirst();
    const { keep } = planCompaction(rows);
    expect(keep[0]).toEqual(rows[0]);
    expect(keep[0]![3]).toBe('none');
  });

  it('pairs on customer AND product, tolerating stray whitespace and blank cells', () => {
    const rows: CellValue[][] = [
      ev('a', ' hala ', 'SL-021', 'like', 't3'),
      ev('b', 'hala', ' SL-021 ', 'dislike', 't2'), // same pair once trimmed
      ev('c', 'hala', 'SL-022', 'like', 't1'), // different product
      ev('d', 'omar', 'SL-021', 'like', 't0'), // different customer
      ['e', '', '', '', '', ''], // a malformed row is still a pair of its own
      ['f', '', '', '', '', ''],
    ];
    const { keep, supersede } = planCompaction(rows);
    expect(keep.map((r) => r[0])).toEqual(['a', 'c', 'd', 'e']);
    expect(supersede.map((r) => r[0])).toEqual(['b', 'f']);
  });

  it('is a no-op on an already compact log and on no rows at all', () => {
    const rows = newestFirst();
    const compact = [rows[0]!, rows[1]!, rows[3]!];
    expect(planCompaction(compact)).toEqual({ keep: compact, supersede: [] });
    expect(planCompaction([])).toEqual({ keep: [], supersede: [] });
  });
});

describe('compactReactions', () => {
  it('archives the superseded rows, rewrites the survivors and blanks the tail', async () => {
    const sheet = fakeSheet({ votes: newestFirst() });
    const result = await compactReactions(sheet.client);

    expect(result).toEqual({ read: 6, kept: 3, archived: 3, alreadyCompact: false });

    // Reactions: header + the three survivors, the three rows they vacated blanked.
    expect(sheet.row('Reactions', 1)).toEqual([...HEADERS.Reactions]);
    expect(
      sheet
        .rows('Reactions')
        .slice(0, 3)
        .map((r) => r[0]),
    ).toEqual(['e9', 'e8', 'e6']);
    expect(sheet.rows('Reactions').slice(3, 6)).toEqual([
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ]);

    // ReactionsArchive: its header was written first, then the superseded rows appended below it.
    expect(sheet.row('ReactionsArchive', 1)).toEqual([...HEADERS.ReactionsArchive]);
    expect(sheet.rows('ReactionsArchive').map((r) => r[0])).toEqual(['e7', 'e5', 'e4']);
  });

  it('archives before it rewrites, so a failure between the writes loses no history', async () => {
    const sheet = fakeSheet({ votes: newestFirst() });
    await compactReactions(sheet.client);
    const ranges = sheet.writes.flat().map((w) => {
      const entry = Object.entries(w as Record<string, { range: string }>)[0];
      return `${entry?.[0]} ${entry?.[1].range}`;
    });
    expect(ranges).toEqual([
      'valuesUpdate ReactionsArchive!A1:F1', // header seeded
      'valuesAppend ReactionsArchive!A1', // history saved …
      'valuesUpdate Reactions!A1:F4', // … only then the tab is rewritten
      'valuesUpdate Reactions!A5:F7', // tail blanked
    ]);
  });

  it('is safe to run twice: the second run finds nothing superseded and writes nothing', async () => {
    const sheet = fakeSheet({ votes: newestFirst() });
    await compactReactions(sheet.client);
    const writesAfterFirst = sheet.writes.length;
    const kept = sheet.rows('Reactions').map((r) => [...r]);

    const second = await compactReactions(sheet.client);
    expect(second).toEqual({ read: 3, kept: 3, archived: 0, alreadyCompact: true });
    expect(sheet.writes).toHaveLength(writesAfterFirst);
    expect(sheet.rows('Reactions')).toEqual(kept);
    expect(sheet.rows('ReactionsArchive').map((r) => r[0])).toEqual(['e7', 'e5', 'e4']);
  });

  it('reports what it would do and writes nothing on a dry run', async () => {
    const sheet = fakeSheet({ votes: newestFirst() });
    const result = await compactReactions(sheet.client, { dryRun: true });
    expect(result).toEqual({ read: 6, kept: 3, archived: 0, alreadyCompact: false });
    expect(sheet.writes).toHaveLength(0);
    expect(sheet.rows('Reactions')).toHaveLength(6);
  });

  it('leaves an existing archive header alone and appends below the rows already there', async () => {
    const sheet = fakeSheet({
      votes: newestFirst(),
      archive: [[...HEADERS.ReactionsArchive], ev('old', 'nadia', 'SL-001', 'like', 't-old')],
    });
    await compactReactions(sheet.client);
    expect(sheet.rows('ReactionsArchive').map((r) => r[0])).toEqual(['old', 'e7', 'e5', 'e4']);
    expect(sheet.writes.flat().filter((w) => 'valuesUpdate' in (w as object))).toHaveLength(2); // no header seed
  });

  it('does nothing to a tab that holds only its header', async () => {
    const sheet = fakeSheet({ votes: [] });
    expect(await compactReactions(sheet.client)).toEqual({
      read: 0,
      kept: 0,
      archived: 0,
      alreadyCompact: true,
    });
    expect(sheet.writes).toHaveLength(0);
  });
});
