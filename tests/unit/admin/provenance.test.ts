// `scraped_at` is server-owned provenance and must survive every write path.
//
// THE BUG. `productFieldsToCells` builds a FULL-WIDTH row and sets
// `cells[PRODUCT_COLS.scrapedAt] = f.scrapedAt ?? ''`, and `buildRugUpdateRequests` writes the whole
// slice. The create path stamped the date inline and the retry path preserved it, but neither
// `fieldsOfRug` nor `rugFieldsFrom` carried the field — so an ordinary edit (a price, a title, the
// inline rename) and a status change each wrote an empty string over it.
//
// Nothing caught it because every test asserted the cells it cared about, and no test asserted the
// cells it did not. This one asserts the field that nothing edits and everything overwrites.
import { describe, expect, it } from 'vitest';
import { productFieldsToCells } from '../../../src/lib/admin/write.ts';
import { fieldsOfRug, rugFieldsFrom } from '../../../src/pages/api/admin/_shared.ts';
import { PRODUCT_COLS } from '../../../src/lib/sheets/contract.ts';
import type { AdminRug } from '../../../src/lib/admin/read.ts';

const SCRAPED = '2026-09-01T10:00:00Z';

/** A rug as the admin read returns it, scraped a fortnight ago. */
const rug = {
  id: 'SL-021',
  row: 2,
  version: 'a1b2c3d4e5f60718',
  slug: 'winks',
  name: 'Winks',
  description: '',
  collections: ['Kilims'],
  collection: 'Kilims',
  tags: [],
  photos: [],
  material: '',
  method: '',
  age: '',
  origin: '',
  priceUsd: 1200,
  rotate: 'false',
  featured: false,
  status: 'active',
  sourceUrl: 'https://karavanrug.com/products/winks',
  supplier: 'karavanrug',
  supplierRef: '1389',
  notes: '',
  commitStatus: '',
  driveFolderId: '',
  driveFolderUrl: '',
  scrapedAt: SCRAPED,
} as unknown as AdminRug;

/** The body an edit posts. It has no `scrapedAt` — `RugUpdate` does not carry one, by design. */
const body = {
  name: 'Winks II',
  description: '',
  collections: ['Kilims'],
  tags: [],
  photos: [],
  material: '',
  method: '',
  age: '',
  origin: '',
  rotate: 'false',
  featured: false,
  status: 'active',
  supplier: 'karavanrug',
  supplierRef: '1389',
  notes: '',
  commitStatus: '',
  driveFolderId: '',
  driveFolderUrl: '',
  roundPrice: false,
} as never;

const cellFor = (f: Parameters<typeof productFieldsToCells>[0]): unknown =>
  productFieldsToCells(f, 'SL-021')[PRODUCT_COLS.scrapedAt];

describe('scraped_at survives every write path', () => {
  it('survives an ordinary edit — the rename, the price change, the retitle', () => {
    const after = rugFieldsFrom(body, {
      slug: 'winks',
      collections: ['Kilims'],
      tags: [],
      priceUsd: 1200,
      scrapedAt: rug.scrapedAt,
    });
    expect(cellFor(after)).toBe(SCRAPED);
  });

  it('survives a status change, which rebuilds the row from fieldsOfRug alone', () => {
    const fields = { ...fieldsOfRug(rug), status: 'archived' as const };
    expect(cellFor(fields)).toBe(SCRAPED);
  });

  it('round-trips through fieldsOfRug unchanged', () => {
    expect(fieldsOfRug(rug).scrapedAt).toBe(SCRAPED);
  });

  it('is left blank rather than invented when the row never had one', () => {
    // A rug typed in by hand has no scrape date, and the write must not fabricate one.
    const fields = fieldsOfRug({ ...rug, scrapedAt: '' } as unknown as AdminRug);
    expect(cellFor(fields)).toBe('');
  });
});
