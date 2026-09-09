// The `Products` tab as a Shopify-importable CSV (brief §9, §14), pure. The route
// (src/pages/api/admin/export/shopify-csv.ts) reads `Products!A1:AP` and hands the values here.
//
// Column order. The brief pins the tab to Shopify's product-CSV format "so it imports without
// remapping". `PRODUCT_HEADER_LABELS` is the *sheet's* order, which puts our manually assigned
// `Product ID` in column A; the export re-orders so the **23 Shopify columns lead**, Handle first,
// exactly as Shopify's own export writes them.
//
// The rug columns are **kept**, trailing the Shopify block, together with `Product ID`. Shopify's
// importer ignores columns it does not recognise, so they cost nothing on import, and keeping them
// makes the same file the studio's own round-trippable export — `Product ID` is how every other tab
// addresses a row (docs/ADR.md D4), so a file without it could not be matched back to the sheet.
//
// Header text comes from `PRODUCT_HEADER_LABELS`, never from the sheet's own header row: the sheet
// stores headers lower-cased (`HEADERS.Products`) and Shopify matches column names case-sensitively.
// The sheet's header row is still validated first, so a renamed column fails loudly (503) instead of
// silently exporting the wrong field under the right label.

import { toCsv } from '../csv.ts';
import type { CellValue } from '../sheets/client.ts';
import { PRODUCT_COLS, PRODUCT_HEADER_LABELS, PRODUCT_WIDTH, TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';

export const SHOPIFY_CSV_FILENAME = 'serio-ludere-products.csv';
export const SHOPIFY_CONTENT_DISPOSITION = `attachment; filename="${SHOPIFY_CSV_FILENAME}"`;
export const SHOPIFY_CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** The 23 Shopify product-CSV columns, in Shopify's order (brief §9). These lead the file. */
export const SHOPIFY_COLUMNS: readonly number[] = [
  PRODUCT_COLS.handle,
  PRODUCT_COLS.title,
  PRODUCT_COLS.bodyHtml,
  PRODUCT_COLS.vendor,
  PRODUCT_COLS.productCategory,
  PRODUCT_COLS.type,
  PRODUCT_COLS.tags,
  PRODUCT_COLS.published,
  PRODUCT_COLS.option1Name,
  PRODUCT_COLS.option1Value,
  PRODUCT_COLS.variantSku,
  PRODUCT_COLS.variantGrams,
  PRODUCT_COLS.variantInventoryQty,
  PRODUCT_COLS.variantInventoryPolicy,
  PRODUCT_COLS.variantPrice,
  PRODUCT_COLS.variantCompareAtPrice,
  PRODUCT_COLS.variantRequiresShipping,
  PRODUCT_COLS.variantTaxable,
  PRODUCT_COLS.imageSrc,
  PRODUCT_COLS.imageAltText,
  PRODUCT_COLS.seoTitle,
  PRODUCT_COLS.seoDescription,
  PRODUCT_COLS.status,
];

/** Our key column plus the rug fields; ignored by Shopify's importer, kept for the studio. */
export const RUG_COLUMNS: readonly number[] = [
  PRODUCT_COLS.productId,
  PRODUCT_COLS.widthCm,
  PRODUCT_COLS.lengthCm,
  PRODUCT_COLS.sizeLabel,
  PRODUCT_COLS.sizeBand,
  PRODUCT_COLS.material,
  PRODUCT_COLS.method,
  PRODUCT_COLS.origin,
  PRODUCT_COLS.age,
  PRODUCT_COLS.pile,
  PRODUCT_COLS.shape,
  PRODUCT_COLS.collection,
  PRODUCT_COLS.sourceUrl,
  PRODUCT_COLS.sourceSite,
  PRODUCT_COLS.driveFolderId,
  PRODUCT_COLS.driveFolderUrl,
  PRODUCT_COLS.scrapedAt,
  PRODUCT_COLS.commitStatus,
  PRODUCT_COLS.internalNotes,
];

/** Every Products column, Shopify's 23 first. A permutation of 0…PRODUCT_WIDTH-1 (asserted in tests). */
export const EXPORT_COLUMNS: readonly number[] = [...SHOPIFY_COLUMNS, ...RUG_COLUMNS];

/** The header record: Shopify's own casing, from the contract. */
export function shopifyCsvHeader(): string[] {
  return EXPORT_COLUMNS.map((i) => PRODUCT_HEADER_LABELS[i]!);
}

const isBlank = (v: CellValue | undefined): boolean =>
  v === undefined || v === null || String(v).trim() === '';

/**
 * Data rows in export order. Short rows (Sheets omits trailing blanks) are padded, over-long rows
 * are ignored past column AP, and a row with no `Product ID` **and** no `Handle` is a spacer the
 * owner left in the tab, not a product.
 */
export function shopifyCsvRows(values: CellValue[][] | undefined): CellValue[][] {
  const out: CellValue[][] = [];
  for (let i = 1; i < (values?.length ?? 0); i++) {
    const cells = values![i] ?? [];
    if (isBlank(cells[PRODUCT_COLS.productId]) && isBlank(cells[PRODUCT_COLS.handle])) continue;
    const padded: CellValue[] = Array.from({ length: PRODUCT_WIDTH }, (_, c) => cells[c] ?? '');
    out.push(EXPORT_COLUMNS.map((c) => padded[c]!));
  }
  return out;
}

/**
 * `Products!A1:AP` (header row included) as the whole CSV document: BOM, header, one record per
 * product. Throws SheetContractError when the tab's headers have drifted — the route maps that to
 * 503, which is the right answer for "the sheet no longer matches the contract".
 */
export function shopifyProductsCsv(values: CellValue[][] | undefined): string {
  assertHeaders(TABS.products, values?.[0]);
  return toCsv([shopifyCsvHeader(), ...shopifyCsvRows(values)]);
}
