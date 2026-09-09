// The Shopify CSV export (src/lib/admin/export.ts, brief §9): the 23 Shopify columns lead in
// Shopify's own order, the rug columns and Product ID trail, headers come from the contract's
// casing, and a drifted sheet header is refused rather than silently mis-exported.
import { describe, expect, it } from 'vitest';
import {
  EXPORT_COLUMNS,
  RUG_COLUMNS,
  SHOPIFY_COLUMNS,
  SHOPIFY_CONTENT_DISPOSITION,
  SHOPIFY_CSV_FILENAME,
  shopifyCsvHeader,
  shopifyCsvRows,
  shopifyProductsCsv,
} from '../../../src/lib/admin/export.ts';
import { CSV_BOM } from '../../../src/lib/csv.ts';
import type { CellValue } from '../../../src/lib/sheets/client.ts';
import {
  HEADERS,
  PRODUCT_COLS,
  PRODUCT_HEADER_LABELS,
  PRODUCT_WIDTH,
} from '../../../src/lib/sheets/contract.ts';
import { SheetContractError } from '../../../src/lib/sheets/errors.ts';
import { rugRow } from '../../helpers/ranges.ts';

const header = (): CellValue[] => [...HEADERS.Products];

/** The header row plus `rows`, as `Products!A1:AP` comes back from batchGet. */
const values = (...rows: CellValue[][]): CellValue[][] => [header(), ...rows];

describe('column order (brief §9)', () => {
  it('leads with exactly the 23 Shopify columns, Handle first and Status last', () => {
    expect(SHOPIFY_COLUMNS).toHaveLength(23);
    expect(SHOPIFY_COLUMNS[0]).toBe(PRODUCT_COLS.handle);
    expect(SHOPIFY_COLUMNS[22]).toBe(PRODUCT_COLS.status);
    // Contiguous B..X in the sheet: Shopify's order is the tab's order minus our leading key column.
    expect(SHOPIFY_COLUMNS).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
    expect(EXPORT_COLUMNS.slice(0, 23)).toEqual(SHOPIFY_COLUMNS);
  });

  it('keeps every remaining column exactly once: the export is a permutation of the tab', () => {
    expect(EXPORT_COLUMNS).toHaveLength(PRODUCT_WIDTH);
    expect([...EXPORT_COLUMNS].sort((a, b) => a - b)).toEqual(
      Array.from({ length: PRODUCT_WIDTH }, (_, i) => i),
    );
    expect(new Set(EXPORT_COLUMNS).size).toBe(PRODUCT_WIDTH);
  });

  it('trails Product ID and the rug fields, which Shopify ignores on import', () => {
    expect(RUG_COLUMNS[0]).toBe(PRODUCT_COLS.productId);
    expect(RUG_COLUMNS).toContain(PRODUCT_COLS.internalNotes);
    expect(RUG_COLUMNS).toContain(PRODUCT_COLS.sizeBand);
    expect(SHOPIFY_COLUMNS).not.toContain(PRODUCT_COLS.productId);
  });

  it('takes the header text from the contract labels, not the tab s lower-cased headers', () => {
    const row = shopifyCsvHeader();
    expect(row).toHaveLength(PRODUCT_WIDTH);
    expect(row.slice(0, 8)).toEqual([
      'Handle',
      'Title',
      'Body (HTML)',
      'Vendor',
      'Product Category',
      'Type',
      'Tags',
      'Published',
    ]);
    expect(row[23]).toBe('Product ID');
    expect(row.at(-1)).toBe('Internal Notes');
    expect(row.every((label) => PRODUCT_HEADER_LABELS.includes(label as never))).toBe(true);
  });
});

describe('shopifyCsvRows', () => {
  it('reorders each row and pads the trailing blanks Sheets omits', () => {
    const rows = shopifyCsvRows(values(rugRow({ id: 'SL-021', name: 'Winks', slug: 'winks' })));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(PRODUCT_WIDTH);
    expect(rows[0]![0]).toBe('winks'); // Handle
    expect(rows[0]![1]).toBe('Winks'); // Title
    expect(rows[0]![23]).toBe('SL-021'); // Product ID, now trailing
  });

  it('pads a short row instead of dropping cells off the end', () => {
    const rows = shopifyCsvRows(values(['SL-030', 'short-row', 'Short']));
    expect(rows[0]).toHaveLength(PRODUCT_WIDTH);
    expect(rows[0]![0]).toBe('short-row');
    expect(rows[0]![23]).toBe('SL-030');
    expect(rows[0]!.at(-1)).toBe('');
  });

  it('ignores blank spacer rows but keeps a row that has only a handle or only an id', () => {
    const rows = shopifyCsvRows(
      values(
        ['SL-021', 'winks', 'Winks'],
        [],
        ['', '', '', '', ''],
        ['', 'orphan-handle', 'No id yet'],
        ['SL-022', '', 'No handle yet'],
      ),
    );
    expect(rows.map((r) => [r[0], r[23]])).toEqual([
      ['winks', 'SL-021'],
      ['orphan-handle', ''],
      ['', 'SL-022'],
    ]);
  });

  it('reads nothing out of an empty tab or an undefined range', () => {
    expect(shopifyCsvRows(undefined)).toEqual([]);
    expect(shopifyCsvRows([header()])).toEqual([]);
  });
});

describe('shopifyProductsCsv', () => {
  it('emits the BOM, the header record and one CRLF-terminated record per product', () => {
    const csv = shopifyProductsCsv(
      values(
        rugRow({ id: 'SL-021', slug: 'winks', name: 'Winks', price_usd: 576 }),
        rugRow({ id: 'SL-022', slug: 'yellow', name: 'Yellow', price_usd: 900 }),
      ),
    );
    expect(csv.startsWith(`${CSV_BOM}Handle,Title,Body (HTML),`)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split('\r\n');
    expect(lines.at(-1)).toBe(''); // trailing CRLF on the last record
    expect(lines).toHaveLength(4); // header + two products + the empty tail
    expect(lines[1]!.startsWith('winks,Winks,')).toBe(true);
    expect(lines[2]!.startsWith('yellow,Yellow,')).toBe(true);
  });

  it('quotes commas, quotes and newlines coming out of the sheet', () => {
    const row = new Array<CellValue>(PRODUCT_WIDTH).fill('');
    row[PRODUCT_COLS.productId] = 'SL-040';
    row[PRODUCT_COLS.handle] = 'kilim';
    row[PRODUCT_COLS.title] = 'Kilim, "Denizli"';
    row[PRODUCT_COLS.bodyHtml] = '<p>One</p>\n<p>Two</p>';
    row[PRODUCT_COLS.published] = true;
    row[PRODUCT_COLS.variantPrice] = 1250;
    const csv = shopifyProductsCsv(values(row));
    expect(csv).toContain('kilim,"Kilim, ""Denizli""","<p>One</p>\n<p>Two</p>"');
    expect(csv).toContain(',TRUE,'); // Published, as Shopify writes it
    expect(csv).toContain(',1250,'); // Variant Price, unquoted number
  });

  it('refuses a tab whose headers have drifted rather than exporting the wrong field', () => {
    const drifted = header();
    drifted[PRODUCT_COLS.variantPrice] = 'price_usd';
    expect(() => shopifyProductsCsv([drifted, rugRow()])).toThrow(SheetContractError);
    expect(() => shopifyProductsCsv(undefined)).toThrow(SheetContractError);
  });

  it('names the download the way the brief does', () => {
    expect(SHOPIFY_CSV_FILENAME).toBe('serio-ludere-products.csv');
    expect(SHOPIFY_CONTENT_DISPOSITION).toBe('attachment; filename="serio-ludere-products.csv"');
  });
});
