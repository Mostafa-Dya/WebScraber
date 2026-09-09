// `sheet:init` refuses to rewrite a header row that does not match the contract, because row 1 alone
// would leave every data row under the wrong column. Collections is the one legacy tab that can be
// repaired *with* its data, and this pins that it is detected and transformed exactly once.
import { describe, expect, it } from 'vitest';
import { HEADERS, LEGACY_COLLECTIONS_HEADERS, TABS } from '../../src/lib/sheets/contract.ts';
import { collectionsUpgradeRequests, isLegacyCollectionsHeader } from '../../src/lib/sheets/upgrade.ts';

describe('isLegacyCollectionsHeader', () => {
  it('recognises the pre-brief layout', () => {
    expect(isLegacyCollectionsHeader([...LEGACY_COLLECTIONS_HEADERS])).toBe(true);
    // Trailing junk a human added is not a reason to refuse the repair.
    expect(isLegacyCollectionsHeader([...LEGACY_COLLECTIONS_HEADERS, 'notes'])).toBe(true);
  });

  it('leaves the contract layout alone, so a second run is a no-op', () => {
    expect(isLegacyCollectionsHeader([...HEADERS[TABS.collections]])).toBe(false);
  });

  it('refuses anything it does not recognise, rather than guessing', () => {
    expect(isLegacyCollectionsHeader([])).toBe(false);
    expect(isLegacyCollectionsHeader(['id', 'slug'])).toBe(false);
    expect(
      isLegacyCollectionsHeader(['id', 'slug', 'title', 'description', 'cover_image_url', 'sort_order']),
    ).toBe(false);
  });
});

describe('collectionsUpgradeRequests', () => {
  /** Applies the two requests to a row of column labels, the way Sheets applies them to the grid. */
  const apply = (row: string[]): string[] => {
    const out = [...row];
    const [moved] = out.splice(2, 1); // moveDimension source [2,3)
    out.splice(1, 0, moved!); // destinationIndex 1
    out.splice(4, 0, ''); // insertDimension at [4,5)
    return out;
  };

  it('turns the legacy column order into the contract order', () => {
    const before = [...LEGACY_COLLECTIONS_HEADERS];
    const after = apply(before);
    // The blank is where `created_at` goes; sheet:init writes the labels afterwards.
    expect(after).toEqual(['id', 'name', 'slug', 'description', '', 'cover_image_url', 'sort_order']);
    expect(after).toHaveLength(HEADERS[TABS.collections].length);
  });

  it('carries a data row with the header, which is the whole point', () => {
    // A real row under the legacy header: id, slug, name, description, cover, order.
    const row = ['c1', 'kilims', 'Kilims', 'Flatweaves from Denizli.', 'https://img', '1'];
    expect(apply(row)).toEqual([
      'c1',
      'Kilims', // name, now in B
      'kilims', // slug, now in C
      'Flatweaves from Denizli.',
      '', // created_at, empty for a row that predates it
      'https://img',
      '1',
    ]);
  });

  it('emits a move then an insert against the named sheet', () => {
    const [move, insert] = collectionsUpgradeRequests(99) as [
      {
        moveDimension: {
          source: { sheetId: number; startIndex: number; endIndex: number };
          destinationIndex: number;
        };
      },
      { insertDimension: { range: { sheetId: number; startIndex: number; endIndex: number } } },
    ];
    expect(move.moveDimension.source).toMatchObject({ sheetId: 99, startIndex: 2, endIndex: 3 });
    expect(move.moveDimension.destinationIndex).toBe(1);
    expect(insert.insertDimension.range).toMatchObject({ sheetId: 99, startIndex: 4, endIndex: 5 });
  });
});
