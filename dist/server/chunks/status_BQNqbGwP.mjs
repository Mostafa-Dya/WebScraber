import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { i as getClient, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, h as productFieldsToCells, i as adminPost, l as methodNotAllowed, o as auditBase, t as AdminError, v as updateRug } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { F as RugStatus, G as buildAuditRow, j as ID_RE, o as findRugById } from "./read_BGHurOvf.mjs";
import { a as fieldsOfRug, d as loadSnapshot, l as freshRug, p as requireAdminHeaders } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/rugs/[id]/status.ts
var status_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(RugStatus, async ({ context, body }) => {
	const id = context.params.id;
	if (!id || !ID_RE.test(id)) throw new AdminError(404, "not found", "no such rug");
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	requireAdminHeaders(snapshot);
	const rug = findRugById(snapshot, id);
	if (!rug) throw new AdminError(404, "not found", `rug "${id}" is not in the sheet`);
	if (rug.status === body.status) return noStore({
		ok: true,
		rug,
		unchanged: true
	});
	const fields = {
		...fieldsOfRug(rug),
		status: body.status
	};
	const audit = buildAuditRow({
		...auditBase(context),
		action: "rug.status",
		targetTab: "Products",
		targetId: rug.id,
		before: { status: rug.status },
		after: { status: body.status },
		note: `row ${rug.row}`
	});
	const result = await updateRug(client, {
		row: rug.row,
		id: rug.id,
		version: body.version,
		cells: { all: productFieldsToCells(fields, rug.id) },
		audit,
		logger: consoleLogger
	});
	await invalidateAfterWrite(context);
	const fresh = await freshRug(client, rug.row, rug.id);
	return noStore({
		ok: true,
		rug: fresh,
		audit: result.audit,
		verified: result.verified
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/rugs/[id]/status@_@ts
var page = () => status_exports;
//#endregion
export { page };
