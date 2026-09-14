import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { N as HEADERS, V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, g as updateColumnCells, i as adminPost, l as methodNotAllowed, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, O as CollectionReorder } from "./read_BGHurOvf.mjs";
import { d as loadSnapshot } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/collections/reorder.ts
var reorder_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var SORT_ORDER_COL = HEADERS.Collections.indexOf("sort_order");
var POST = adminPost(CollectionReorder, async ({ context, body }) => {
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	const byId = new Map(snapshot.collections.map((c) => [c.id.toLowerCase(), c]));
	const seen = /* @__PURE__ */ new Set();
	const ordered = body.order.map((id) => {
		const c = byId.get(id.toLowerCase());
		if (!c) throw new AdminError(400, "unknown id", `"${id}" is not a collection id`, { id });
		if (seen.has(c.id)) throw new AdminError(400, "duplicate id", `"${id}" is listed twice`, { id });
		seen.add(c.id);
		return c;
	});
	if (ordered.length !== snapshot.collections.length) throw new AdminError(400, "incomplete order", "the order must list every collection once");
	const before = snapshot.collections.slice().sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name)).map((c) => c.id);
	const after = ordered.map((c) => c.id);
	if (before.join("|") === after.join("|")) return noStore({
		ok: true,
		collections: snapshot.collections,
		unchanged: true
	});
	const audit = buildAuditRow({
		...auditBase(context),
		action: "collection.reorder",
		targetTab: "Collections",
		targetId: "-",
		before: { order: before },
		after: { order: after }
	});
	const result = await updateColumnCells(client, {
		tab: TABS.collections,
		columnIndex: SORT_ORDER_COL,
		updates: ordered.map((c, i) => ({
			row: c.row,
			expectFirstCell: c.id,
			value: i + 1
		})),
		audit
	});
	await invalidateAfterWrite(context);
	const fresh = await loadSnapshot(client);
	return noStore({
		ok: true,
		collections: fresh.collections,
		audit: result.audit
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/collections/reorder@_@ts
var page = () => reorder_exports;
//#endregion
export { page };
