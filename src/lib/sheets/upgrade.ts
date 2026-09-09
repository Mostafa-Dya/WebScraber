// In-place structural upgrades for a spreadsheet created before brief v0.5, used by
// `scripts/init-sheet.ts`. Pure request builders so they can be tested without a network.
//
// `sheet:init` creates missing tabs but deliberately refuses to overwrite a header row that does not
// match the contract: rewriting row 1 alone would leave every data row sitting under the wrong
// column, which is worse than an error. The one legacy tab that can be repaired *with* its data is
// `Collections`, because the change is a column move plus an insert — operations that carry the
// cells along with the header.
//
//   before  id | slug | name | description | cover_image_url | sort_order
//   after   id | name | slug | description | created_at | cover_image_url | sort_order
//
// Anything else still aborts and asks a human, which is the right default.
import { HEADERS, LEGACY_COLLECTIONS_HEADERS, TABS } from './contract.ts';

/** True when the header row is exactly the pre-brief Collections shape (lowercased, trimmed). */
export function isLegacyCollectionsHeader(actual: readonly string[]): boolean {
  return (
    actual.length >= LEGACY_COLLECTIONS_HEADERS.length &&
    LEGACY_COLLECTIONS_HEADERS.every((h, i) => actual[i] === h) &&
    // A tab that already carries the new header is not legacy, whatever else trails it.
    actual[1] !== HEADERS[TABS.collections][1]
  );
}

/**
 * The two requests that turn the legacy layout into the contract one, in order:
 *
 *   1. move column C (`name`) in front of column B (`slug`), which swaps the pair and takes every
 *      row's values with it;
 *   2. insert one empty column at E for `created_at`, pushing `cover_image_url` and `sort_order`
 *      right.
 *
 * `sheet:init` writes the header labels afterwards, so this only has to get the data into the right
 * columns. Applying it twice is prevented by `isLegacyCollectionsHeader`, not by the requests
 * themselves: the second run sees the new header and does nothing.
 */
export function collectionsUpgradeRequests(sheetId: number): unknown[] {
  return [
    {
      // Sheets resolves destinationIndex against the pre-move grid: moving [2,3) to 1 puts `name`
      // at B and slides `slug` to C.
      moveDimension: {
        source: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        destinationIndex: 1,
      },
    },
    {
      insertDimension: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        inheritFromBefore: false,
      },
    },
  ];
}
