// RFC 4180 CSV serialisation (brief §9), pure. Used by the Shopify export
// (src/lib/admin/export.ts); nothing here knows what a product is.
//
// The rules, and why each one matters here:
//   · A field is quoted only when it must be — it contains `"`, `,`, CR or LF (§2.5–2.7). A rug's
//     `Body (HTML)` routinely contains all four.
//   · A `"` inside a quoted field is doubled (§2.7).
//   · Records end with CRLF (§2.1). Excel and Shopify's importer both accept LF, but CRLF is what
//     the RFC says and what Shopify's own exports emit.
//   · The file opens with a UTF-8 BOM. Excel reads a BOM-less .csv as the system codepage, which
//     turns every "İzmir" and "Kırşehir" in the origin column into mojibake on the owner's machine.
//
// Values are written **verbatim**: no apostrophe is prefixed to a leading `=`, `+`, `-` or `@`.
// Excel's formula-injection prompt is a real concern for user-authored CSVs, but this file is
// re-imported by Shopify, where a sanitising prefix would corrupt every cell it touched — and the
// sheet stores each cell as a literal string already (src/lib/sheets/write.ts `cell`), so nothing
// that reaches here is a formula.

import type { CellValue } from './sheets/client.ts';

/** Excel only detects UTF-8 in a .csv when the file opens with a byte-order mark. */
export const CSV_BOM = '\uFEFF';
export const CSV_EOL = '\r\n';

const MUST_QUOTE = /[",\r\n]/;

/**
 * One field. Booleans become `TRUE`/`FALSE` — Google Sheets hands them back as JSON booleans under
 * `UNFORMATTED_VALUE`, and `TRUE`/`FALSE` is what Shopify writes in `Published` and reads back.
 */
export function csvField(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'boolean'
      ? value
        ? 'TRUE'
        : 'FALSE'
      : typeof value === 'number'
        ? String(value)
        : value;
  return MUST_QUOTE.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(cells: ReadonlyArray<CellValue | null | undefined>): string {
  return cells.map(csvField).join(',');
}

export interface CsvOptions {
  /** Prepend the UTF-8 BOM (default true: these files are opened in Excel before Shopify sees them). */
  bom?: boolean;
}

/** Rows (header first) as one CSV document, CRLF-terminated including the final record. */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<CellValue | null | undefined>>,
  options: CsvOptions = {},
): string {
  const body = rows.map((r) => csvRow(r) + CSV_EOL).join('');
  return (options.bom === false ? '' : CSV_BOM) + body;
}
