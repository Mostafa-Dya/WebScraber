import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as PRODUCT_COLS, I as PRODUCT_HEADER_LABELS, L as PRODUCT_WIDTH, V as TABS, g as assertHeaders, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { l as methodNotAllowed, n as adminGet } from "./http_BC0ewnLg.mjs";
var MUST_QUOTE = /[",\r\n]/;
/**
* One field. Booleans become `TRUE`/`FALSE` — Google Sheets hands them back as JSON booleans under
* `UNFORMATTED_VALUE`, and `TRUE`/`FALSE` is what Shopify writes in `Published` and reads back.
*/
function csvField(value) {
	if (value === null || value === void 0) return "";
	const text = typeof value === "boolean" ? value ? "TRUE" : "FALSE" : typeof value === "number" ? String(value) : value;
	return MUST_QUOTE.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
function csvRow(cells) {
	return cells.map(csvField).join(",");
}
/** Rows (header first) as one CSV document, CRLF-terminated including the final record. */
function toCsv(rows, options = {}) {
	const body = rows.map((r) => csvRow(r) + "\r\n").join("");
	return (options.bom === false ? "" : "﻿") + body;
}
var SHOPIFY_CONTENT_DISPOSITION = `attachment; filename="serio-ludere-products.csv"`;
var SHOPIFY_CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
/** The 23 Shopify product-CSV columns, in Shopify's order (brief §9). These lead the file. */
var SHOPIFY_COLUMNS = [
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
	PRODUCT_COLS.status
];
/** Our key column plus the rug fields; ignored by Shopify's importer, kept for the studio. */
var RUG_COLUMNS = [
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
	PRODUCT_COLS.internalNotes
];
/** Every Products column, Shopify's 23 first. A permutation of 0…PRODUCT_WIDTH-1 (asserted in tests). */
var EXPORT_COLUMNS = [...SHOPIFY_COLUMNS, ...RUG_COLUMNS];
/** The header record: Shopify's own casing, from the contract. */
function shopifyCsvHeader() {
	return EXPORT_COLUMNS.map((i) => PRODUCT_HEADER_LABELS[i]);
}
var isBlank = (v) => v === void 0 || v === null || String(v).trim() === "";
/**
* Data rows in export order. Short rows (Sheets omits trailing blanks) are padded, over-long rows
* are ignored past column AP, and a row with no `Product ID` **and** no `Handle` is a spacer the
* owner left in the tab, not a product.
*/
function shopifyCsvRows(values) {
	const out = [];
	for (let i = 1; i < (values?.length ?? 0); i++) {
		const cells = values[i] ?? [];
		if (isBlank(cells[PRODUCT_COLS.productId]) && isBlank(cells[PRODUCT_COLS.handle])) continue;
		const padded = Array.from({ length: PRODUCT_WIDTH }, (_, c) => cells[c] ?? "");
		out.push(EXPORT_COLUMNS.map((c) => padded[c]));
	}
	return out;
}
/**
* `Products!A1:AP` (header row included) as the whole CSV document: BOM, header, one record per
* product. Throws SheetContractError when the tab's headers have drifted — the route maps that to
* 503, which is the right answer for "the sheet no longer matches the contract".
*/
function shopifyProductsCsv(values) {
	assertHeaders(TABS.products, values?.[0]);
	return toCsv([shopifyCsvHeader(), ...shopifyCsvRows(values)]);
}
//#endregion
//#region src/pages/api/admin/export/shopify-csv.ts
var shopify_csv_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
var GET = adminGet(async () => {
	const [products] = await getClient().batchGet([`${TABS.products}!A1:AP`]);
	return new Response(shopifyProductsCsv(products?.values), {
		status: 200,
		headers: {
			"content-type": SHOPIFY_CSV_CONTENT_TYPE,
			"content-disposition": SHOPIFY_CONTENT_DISPOSITION,
			"cache-control": "no-store",
			"x-content-type-options": "nosniff"
		}
	});
});
var ALL = methodNotAllowed("GET");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/export/shopify-csv@_@ts
var page = () => shopify_csv_exports;
//#endregion
export { page };
