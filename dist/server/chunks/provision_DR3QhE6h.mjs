import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { A as slugify, B as SETTINGS_SEED, C as sizeLabelOf, F as PRODUCT_COLS, I as PRODUCT_HEADER_LABELS, L as PRODUCT_WIDTH, M as SheetsClient, N as HEADERS, P as LEGACY_COLLECTIONS_HEADERS, R as RATES_SEED, S as sizeBandOf, V as TABS, _ as columnLetter, a as getGoogleConnection, c as getSheetIdStore, l as getTokens, m as sheetIdIfAny, mt as extractDriveId, p as resetSheetClient, vt as consoleLogger, w as canonicalCollection, z as REFERENCE_COLLECTION_ORDER } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime, i as adminPost, l as methodNotAllowed, o as auditBase, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { t as BADGE_TAG_NAMES } from "./view_DFjKAQIO.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as z from "zod";
//#region scripts/lib/seed.ts
var AGE_FIXES = { anitque: "Antique" };
function fixAge(age) {
	return AGE_FIXES[age.toLowerCase()] ?? age;
}
function positive(n) {
	return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : "";
}
function buildSeed(rugs, now) {
	const notes = [];
	const seenSlugs = /* @__PURE__ */ new Map();
	const tagNames = /* @__PURE__ */ new Map();
	const collectionsPresent = /* @__PURE__ */ new Map();
	const products = [];
	for (const r of rugs) {
		const name = (r.name ?? "").trim();
		if (!name) {
			notes.push("skipped a rug without a name");
			continue;
		}
		let id = String(r.id ?? "").trim();
		if (!id) {
			id = slugify(name);
			notes.push(`"${name}": blank id → "${id}" (legacy rule)`);
		}
		let slug = slugify(name) || id.toLowerCase();
		const n = seenSlugs.get(slug) ?? 0;
		seenSlugs.set(slug, n + 1);
		if (n > 0) slug = `${slug}-${n + 1}`;
		const collection = canonicalCollection(r.collection ?? "");
		if (collection) collectionsPresent.set(collection.toLowerCase(), collection);
		const tagList = [];
		for (const t of (r.tags ?? "").split(",")) {
			const v = t.trim();
			if (!v || tagList.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
			tagList.push(v);
			if (!tagNames.has(v.toLowerCase())) tagNames.set(v.toLowerCase(), v);
		}
		const photos = [];
		for (const p of r.photos ?? []) {
			const fid = extractDriveId(p);
			if (fid) photos.push(fid);
			else notes.push(`"${name}": photo "${p.slice(0, 50)}" is not a Drive URL and was skipped`);
		}
		const rotate = r.rotate === "force" ? "force" : r.rotate === true ? "true" : "false";
		const status = name === "Test // testing" ? "draft" : "active";
		const width = positive(r.width);
		const length = positive(r.length);
		const flags = rotate === "force" ? ["rotate-force"] : rotate === "true" ? ["rotate"] : [];
		const row = new Array(PRODUCT_WIDTH).fill("");
		row[PRODUCT_COLS.productId] = id;
		row[PRODUCT_COLS.handle] = slug;
		row[PRODUCT_COLS.title] = name;
		row[PRODUCT_COLS.tags] = [...tagList, ...flags].join(", ");
		row[PRODUCT_COLS.published] = status === "active";
		row[PRODUCT_COLS.option1Name] = "Title";
		row[PRODUCT_COLS.option1Value] = "Default Title";
		row[PRODUCT_COLS.variantInventoryQty] = 1;
		row[PRODUCT_COLS.variantInventoryPolicy] = "deny";
		row[PRODUCT_COLS.variantPrice] = positive(r.price);
		row[PRODUCT_COLS.variantRequiresShipping] = true;
		row[PRODUCT_COLS.variantTaxable] = true;
		row[PRODUCT_COLS.imageSrc] = photos[0] ?? "";
		row[PRODUCT_COLS.imageAltText] = name;
		row[PRODUCT_COLS.status] = status;
		row[PRODUCT_COLS.widthCm] = width;
		row[PRODUCT_COLS.lengthCm] = length;
		row[PRODUCT_COLS.sizeLabel] = sizeLabelOf(typeof width === "number" ? width : void 0, typeof length === "number" ? length : void 0);
		row[PRODUCT_COLS.sizeBand] = sizeBandOf(typeof width === "number" ? width : void 0, typeof length === "number" ? length : void 0);
		row[PRODUCT_COLS.material] = (r.material ?? "").trim();
		row[PRODUCT_COLS.method] = (r.method ?? "").trim();
		row[PRODUCT_COLS.origin] = (r.origin ?? "").trim();
		row[PRODUCT_COLS.age] = fixAge((r.age ?? "").trim());
		row[PRODUCT_COLS.collection] = collection;
		row[PRODUCT_COLS.scrapedAt] = now;
		row[PRODUCT_COLS.commitStatus] = photos.length ? "complete" : "";
		if (photos.length > 1) row[PRODUCT_COLS.internalNotes] = `extra photos: ${photos.slice(1).join(" ")}`;
		products.push(row);
	}
	const collections = [];
	let order = 1;
	for (const name of REFERENCE_COLLECTION_ORDER) {
		collections.push([
			slugify(name),
			name,
			slugify(name),
			"",
			now,
			"",
			order++
		]);
		collectionsPresent.delete(name.toLowerCase());
	}
	for (const name of [...collectionsPresent.values()].sort((a, b) => a.localeCompare(b))) {
		collections.push([
			slugify(name),
			name,
			slugify(name),
			"",
			now,
			"",
			order++
		]);
		notes.push(`collection "${name}" is not in the reference list; appended with sort_order ${order - 1}`);
	}
	const seen = new Map([...tagNames.values()].map((n) => [n.trim().toLowerCase(), n]));
	for (const name of BADGE_TAG_NAMES) if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
	return {
		products,
		collections,
		tags: [...seen.values()].sort((a, b) => a.localeCompare(b)).map((name) => [
			slugify(name),
			slugify(name),
			name,
			""
		]),
		notes
	};
}
//#endregion
//#region src/lib/sheets/upgrade.ts
/** True when the header row is exactly the pre-brief Collections shape (lowercased, trimmed). */
function isLegacyCollectionsHeader(actual) {
	return actual.length >= LEGACY_COLLECTIONS_HEADERS.length && LEGACY_COLLECTIONS_HEADERS.every((h, i) => actual[i] === h) && actual[1] !== HEADERS[TABS.collections][1];
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
function collectionsUpgradeRequests(sheetId) {
	return [{ moveDimension: {
		source: {
			sheetId,
			dimension: "COLUMNS",
			startIndex: 2,
			endIndex: 3
		},
		destinationIndex: 1
	} }, { insertDimension: {
		range: {
			sheetId,
			dimension: "COLUMNS",
			startIndex: 4,
			endIndex: 5
		},
		inheritFromBefore: false
	} }];
}
//#endregion
//#region src/lib/sheets/provision.ts
/** Every tab this app owns, including the admin's (docs/ADMIN_SPEC.md §3.2). */
var ALL_TABS = [
	TABS.products,
	TABS.collections,
	TABS.customers,
	TABS.reactions,
	TABS.reactionsArchive,
	TABS.visits,
	TABS.tags,
	TABS.rates,
	TABS.auditLog,
	TABS.settings
];
/** Tabs the admin owns; reported separately so the owner sees what a re-run added. */
var ADMIN_TABS = [
	TABS.customers,
	TABS.auditLog,
	TABS.settings
];
/** Tabs whose header row is written with the brief's own casing rather than the lowercase contract. */
var LABELLED_HEADERS = { [TABS.products]: PRODUCT_HEADER_LABELS };
var SEED_FILE = resolve(process.cwd(), "reference/live_catalogue.2026-09-05.json");
var PERIOD_DECIMAL_LOCALES = /^(en(?!_ZA)|ja|zh|ko|th|ar|he|hi|ms|fil|es_(MX|US))(_[A-Za-z0-9]+)?$/;
/**
* A comma-decimal locale changes Google Sheets' formula syntax, so the array formulas this app
* installs would be written and silently not compute. Checked before anything is created.
*/
function assertPeriodDecimalLocale(info, allow = false) {
	const locale = info.properties?.locale ?? "unknown";
	if (allow || PERIOD_DECIMAL_LOCALES.test(locale)) return;
	throw new Error(`Sheet locale "${locale}" uses a comma decimal separator, which changes the formula syntax. Set File › Settings › Locale to "United States".`);
}
/**
* Brings `client`'s spreadsheet up to the contract. `info` is its `getSpreadsheet()` result, which
* the caller has already read (to check the locale before committing to anything).
*
* Throws on a header mismatch, or on a Products header that does not read back correctly — a
* half-structured sheet must fail loudly rather than be handed to the studio as ready.
*/
async function provisionSheet(client, info, opts = {}) {
	const log = opts.log ?? (() => {});
	const existing = new Set((info.sheets ?? []).map((s) => s.properties.title));
	const missing = ALL_TABS.filter((t) => !existing.has(t));
	if (missing.length) {
		await client.batchUpdate(missing.map((title) => ({ addSheet: { properties: { title } } })));
		client.forgetSheetIds();
		log(`Created tab(s): ${missing.join(", ")}`);
	}
	const adminTabsCreated = missing.filter((t) => ADMIN_TABS.includes(t));
	const adminTabsFound = ADMIN_TABS.filter((t) => existing.has(t));
	const headerRanges = ALL_TABS.map((t) => `${t}!A1:${columnLetter(HEADERS[t].length - 1)}1`);
	const headerRows = await client.batchGet(headerRanges);
	const normalise = (row) => (row ?? []).map((c) => String(c ?? "").trim().toLowerCase());
	const collectionsIndex = ALL_TABS.indexOf(TABS.collections);
	if (collectionsIndex >= 0 && isLegacyCollectionsHeader(normalise(headerRows[collectionsIndex]?.values?.[0]))) {
		await client.batchUpdate(collectionsUpgradeRequests(await client.sheetIdByTitle(TABS.collections)));
		headerRows[collectionsIndex] = {
			range: headerRanges[collectionsIndex],
			values: [[]]
		};
		log(`Upgraded ${TABS.collections} to the brief layout (name/slug swapped, created_at inserted)`);
	}
	for (let i = 0; i < ALL_TABS.length; i++) {
		const tab = ALL_TABS[i];
		const expected = HEADERS[tab];
		const actual = normalise(headerRows[i]?.values?.[0]);
		const empty = actual.every((c) => c === "");
		if (expected.every((h, j) => actual[j] === h)) continue;
		if (!empty && !opts.forceHeaders) throw new Error(`Tab "${tab}" has a header row that does not match the contract (got: ${actual.join(" | ")}). Fix the headers in the sheet or re-run with --force-headers to overwrite row 1.`);
		const labels = LABELLED_HEADERS[tab] ?? expected;
		await client.valuesUpdate(headerRanges[i], [labels.slice()], "RAW");
		log(`Wrote headers for ${tab}`);
	}
	const productsSheet = ((await client.getSpreadsheet("sheets.properties")).sheets ?? []).find((sh) => sh.properties.title === TABS.products);
	const columnCount = productsSheet?.properties.gridProperties?.columnCount ?? 26;
	if (columnCount < PRODUCT_WIDTH) {
		await client.batchUpdate([{ appendDimension: {
			sheetId: productsSheet.properties.sheetId,
			dimension: "COLUMNS",
			length: PRODUCT_WIDTH - columnCount
		} }]);
		log(`Widened ${TABS.products} to ${PRODUCT_WIDTH} columns`);
	}
	const sheetId = async (t) => client.sheetIdByTitle(t);
	const requests = [];
	for (const t of ALL_TABS) requests.push({ updateSheetProperties: {
		properties: {
			sheetId: await sheetId(t),
			gridProperties: { frozenRowCount: 1 }
		},
		fields: "gridProperties.frozenRowCount"
	} });
	const textFormat = {
		cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
		fields: "userEnteredFormat.numberFormat"
	};
	/** Ids and slugs must never be read back as numbers or dates. */
	const asText = [
		[TABS.products, PRODUCT_COLS.productId],
		[TABS.products, PRODUCT_COLS.variantSku],
		[TABS.reactions, 2],
		[TABS.reactionsArchive, 2],
		[TABS.customers, 0],
		[TABS.auditLog, 4]
	];
	for (const [tab, column] of asText) requests.push({ repeatCell: {
		range: {
			sheetId: await sheetId(tab),
			startColumnIndex: column,
			endColumnIndex: column + 1
		},
		...textFormat
	} });
	await client.batchUpdate(requests);
	const protections = await client.getSpreadsheet("sheets.properties,sheets.protectedRanges");
	const protectedDescriptions = new Set((protections.sheets ?? []).flatMap((sh) => (sh.protectedRanges ?? []).map((p) => p.description ?? "")));
	const protReq = [
		{
			description: "Reactions is append-only — the site writes here; never edit or sort it",
			range: {
				sheetId: await sheetId(TABS.reactions),
				startRowIndex: 0,
				endRowIndex: 1
			}
		},
		{
			description: "Visits is append-only — the site writes here",
			range: {
				sheetId: await sheetId(TABS.visits),
				startRowIndex: 0,
				endRowIndex: 1
			}
		},
		{
			description: "AuditLog is append-only; written by the admin",
			range: { sheetId: await sheetId(TABS.auditLog) }
		},
		{
			description: "Customers: password hashes — never edit by hand",
			range: {
				sheetId: await sheetId(TABS.customers),
				startRowIndex: 0,
				endRowIndex: 1
			}
		},
		{
			description: "Settings header (keys are read by the admin)",
			range: {
				sheetId: await sheetId(TABS.settings),
				startRowIndex: 0,
				endRowIndex: 1
			}
		}
	].filter((w) => !protectedDescriptions.has(w.description)).map((w) => ({ addProtectedRange: { protectedRange: {
		range: w.range,
		description: w.description,
		warningOnly: true
	} } }));
	if (protReq.length) await client.batchUpdate(protReq);
	const [ratesData, rugsData, settingsData, tagsData] = await client.batchGet([
		`${TABS.rates}!A2:D`,
		`${TABS.products}!A2:A`,
		`${TABS.settings}!A2:D`,
		`${TABS.tags}!A2:D`
	]);
	const now = (/* @__PURE__ */ new Date()).toISOString();
	if (!ratesData?.values?.length) {
		await client.valuesUpdate(`${TABS.rates}!A2:D${1 + RATES_SEED.length}`, RATES_SEED.map(([c, r, sym]) => [
			c,
			r,
			sym,
			now
		]), "RAW");
		log(`Seeded Rates with the reference values (${RATES_SEED.map(([c]) => c).join(", ")})`);
	}
	if (!settingsData?.values?.length) {
		await client.valuesUpdate(`${TABS.settings}!A2:D${1 + SETTINGS_SEED.length}`, SETTINGS_SEED.map(([k, v]) => [
			k,
			v,
			now,
			"sheet:init"
		]), "RAW");
		log(`Seeded Settings (${SETTINGS_SEED.map(([k]) => k).join(", ")})`);
	}
	log(`Admin tabs: ${adminTabsFound.length ? `found ${adminTabsFound.join(", ")}` : "none found"}${adminTabsCreated.length ? `; created ${adminTabsCreated.join(", ")}` : ""}`);
	const seedMode = opts.seed ?? "live";
	if (!rugsData?.values?.length && seedMode !== "none") {
		const seed = buildSeed(JSON.parse(readFileSync(SEED_FILE, "utf8")).rugs ?? [], now);
		const n = seed.products.length;
		await client.valuesUpdate(`${TABS.products}!A2:AP${n + 1}`, seed.products, "RAW");
		await client.valuesUpdate(`${TABS.collections}!A2:G${seed.collections.length + 1}`, seed.collections, "RAW");
		await client.valuesUpdate(`${TABS.tags}!A2:D${seed.tags.length + 1}`, seed.tags, "RAW");
		log(`Seeded ${n} rugs, ${seed.collections.length} collections, ${seed.tags.length} tags from ${SEED_FILE}`);
		for (const note of seed.notes) log(`  note: ${note}`);
	} else if (rugsData?.values?.length) log(`Rugs already has ${rugsData.values.length} data row(s); seed skipped`);
	const seededTags = seedMode !== "none" && !rugsData?.values?.length;
	const tagRows = seededTags ? [] : tagsData?.values ?? [];
	const haveTags = new Set(tagRows.map((row) => String(row?.[2] ?? "").trim().toLowerCase()).filter(Boolean));
	const missingBadges = seededTags ? [] : BADGE_TAG_NAMES.filter((n) => !haveTags.has(n.toLowerCase()));
	if (missingBadges.length) {
		const firstFree = tagRows.length + 2;
		await client.valuesUpdate(`${TABS.tags}!A${firstFree}:D${firstFree + missingBadges.length - 1}`, missingBadges.map((name) => [
			slugify(name),
			slugify(name),
			name,
			""
		]), "RAW");
		log(`Added badge tag(s): ${missingBadges.join(", ")}`);
	}
	const [check] = await client.batchGet([`${TABS.products}!A1:AP1`]);
	const header = (check?.values?.[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
	const bad = HEADERS.Products.map((h, i) => header[i] === h ? null : `${columnLetter(i)}: "${header[i] ?? ""}" ≠ "${h}"`).filter(Boolean);
	if (bad.length) throw new Error(`Products header mismatch: ${bad.slice(0, 5).join("; ")}`);
	log(`Products header OK (${PRODUCT_WIDTH} columns)`);
}
//#endregion
//#region src/pages/api/admin/google/provision.ts
var provision_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var Body = z.object({ 
/** Shown on the spreadsheet in Drive. The studio sees it there, so it is worth getting right. */
title: z.string().trim().min(1).max(120).default("Serio Ludere — Catalogue") });
var POST = adminPost(Body, async ({ context, body }) => {
	const existing = sheetIdIfAny();
	if (existing) return noStore({
		ok: false,
		error: "sheet exists",
		message: "This site already has a catalogue sheet. Disconnect and reconnect only if you mean to replace it.",
		sheetId: existing
	}, 409);
	const connection = getGoogleConnection();
	if (!connection?.health().connected) return noStore({
		ok: false,
		error: "not connected",
		message: "Connect a Google account first — the catalogue is created in that account’s Drive."
	}, 409);
	const store = getSheetIdStore();
	if (!store.durable) return noStore({
		ok: false,
		error: "no data dir",
		message: "This server has no writable data directory, so a new sheet’s id would be forgotten on restart. Set DATA_DIR and try again."
	}, 409);
	const auth = {
		mode: "oauth_refresh",
		clientId: "",
		clientSecret: "",
		refreshToken: ""
	};
	const spreadsheetId = await SheetsClient.createSpreadsheet(auth, body.title, ALL_TABS, {
		logger: consoleLogger,
		tokens: getTokens()
	});
	const log = [];
	try {
		const client = new SheetsClient({
			spreadsheetId,
			auth,
			logger: consoleLogger
		}, getTokens());
		const info = await client.getSpreadsheet();
		assertPeriodDecimalLocale(info);
		await provisionSheet(client, info, {
			seed: "none",
			log: (m) => log.push(m)
		});
	} catch (e) {
		return noStore({
			ok: false,
			error: "provision failed",
			message: `The spreadsheet was created but could not be set up: ${e instanceof Error ? e.message : String(e)}. Delete it in Drive and try again.`,
			sheetId: spreadsheetId,
			log
		}, 502);
	}
	store.write({
		id: spreadsheetId,
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		createdBy: connection.health().account
	});
	resetSheetClient();
	await recordAuditEvent({
		...auditBase(context),
		action: "auth.google",
		targetTab: "-",
		targetId: "sheet",
		after: {
			created: spreadsheetId,
			title: body.title
		}
	});
	return noStore({
		ok: true,
		sheetId: spreadsheetId,
		url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
		siteUrl: adminRuntime.siteUrl,
		log
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/google/provision@_@ts
var page = () => provision_exports;
//#endregion
export { page };
