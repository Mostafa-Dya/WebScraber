import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { N as HEADERS, V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, i as adminPost, l as methodNotAllowed, o as auditBase, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { A as CompactReactionsRequest } from "./read_BGHurOvf.mjs";
//#region src/lib/sheets/compact.ts
var REACTIONS_RANGE = `${TABS.reactions}!A1:F`;
var ARCHIVE_HEADER_RANGE = `${TABS.reactionsArchive}!A1:F1`;
var COLUMNS = HEADERS.Reactions.length;
var text = (v) => v === void 0 || v === null ? "" : String(v).trim();
/** Newest-first input: the first row seen for a (customer, product) pair wins. Pure. */
function planCompaction(rows) {
	const keep = [];
	const supersede = [];
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		const pair = `${text(row[1])} ${text(row[2])}`;
		if (seen.has(pair)) supersede.push(row);
		else {
			seen.add(pair);
			keep.push(row);
		}
	}
	return {
		keep,
		supersede
	};
}
/**
* Reads the tab, archives the superseded rows and rewrites the survivors.
*
* The order matters: the archive append happens **first**, so a failure between the two writes
* leaves duplicated history rather than lost history. The rewrite then blanks the tail so the rows
* the survivors no longer occupy are empty, not stale copies.
*/
async function compactReactions(client, options = {}) {
	const [reactions, archiveHeader] = await client.batchGet([REACTIONS_RANGE, ARCHIVE_HEADER_RANGE]);
	const rows = reactions?.values ?? [];
	if (rows.length < 2) return {
		read: 0,
		kept: 0,
		archived: 0,
		alreadyCompact: true
	};
	const data = rows.slice(1);
	const { keep, supersede } = planCompaction(data);
	const result = {
		read: data.length,
		kept: keep.length,
		archived: supersede.length,
		alreadyCompact: supersede.length === 0
	};
	if (supersede.length === 0 || options.dryRun) return {
		...result,
		archived: 0
	};
	if (!archiveHeader?.values?.[0]?.length) await client.valuesUpdate(ARCHIVE_HEADER_RANGE, [[...HEADERS.ReactionsArchive]], "RAW");
	await client.valuesAppend(`${TABS.reactionsArchive}!A1`, supersede, "INSERT_ROWS");
	await client.valuesUpdate(`${TABS.reactions}!A1:F${keep.length + 1}`, [[...HEADERS.Reactions], ...keep], "RAW");
	const blankRows = data.length - keep.length;
	if (blankRows > 0) {
		const blank = Array.from({ length: blankRows }, () => Array(COLUMNS).fill(""));
		await client.valuesUpdate(`${TABS.reactions}!A${keep.length + 2}:F${data.length + 1}`, blank, "RAW");
	}
	return result;
}
//#endregion
//#region src/pages/api/admin/compact-reactions.ts
var compact_reactions_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(CompactReactionsRequest, async ({ context }) => {
	const result = await compactReactions(getClient());
	await recordAuditEvent({
		...auditBase(context),
		action: "reactions.compact",
		targetTab: "Reactions",
		targetId: TABS.reactions,
		after: {
			read: result.read,
			kept: result.kept,
			archived: result.archived
		},
		note: result.alreadyCompact ? `already compact (${result.kept} rows)` : `${result.archived} superseded rows archived; ${result.kept} kept`
	});
	if (result.archived > 0) await invalidateAfterWrite(context);
	return noStore({
		ok: true,
		kept: result.kept,
		archived: result.archived
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/compact-reactions@_@ts
var page = () => compact_reactions_exports;
//#endregion
export { page };
