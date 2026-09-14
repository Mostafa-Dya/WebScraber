import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { _ as updateRow, c as invalidateAfterWrite, i as adminPost, l as methodNotAllowed, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { B as TagUpdate, G as buildAuditRow, K as diffFields, j as ID_RE } from "./read_BGHurOvf.mjs";
import { d as loadSnapshot, u as freshTag } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/tags/[id].ts
var _id__exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(TagUpdate, async ({ context, body }) => {
	const id = context.params.id;
	if (!id || !ID_RE.test(id)) throw new AdminError(404, "not found", "no such tag");
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	const current = snapshot.tags.find((t) => t.id.toLowerCase() === id.toLowerCase());
	if (!current) throw new AdminError(404, "not found", `tag "${id}" is not in the sheet`);
	const clash = snapshot.tags.find((t) => t.id !== current.id && t.name.trim().toLowerCase() === body.name.toLowerCase());
	if (clash) throw new AdminError(409, "name exists", `Another tag is already called "${clash.name}".`);
	const color = body.color ?? "";
	const diff = diffFields({
		name: current.name,
		color: current.color ?? ""
	}, {
		name: body.name,
		color
	});
	if (diff.changed.length === 0) return noStore({
		ok: true,
		tag: current,
		unchanged: true
	});
	const audit = buildAuditRow({
		...auditBase(context),
		action: "tag.update",
		targetTab: "Tags",
		targetId: current.id,
		before: diff.before,
		after: diff.after,
		note: `row ${current.row}`
	});
	const result = await updateRow(client, {
		tab: TABS.tags,
		row: current.row,
		version: body.version,
		cells: [
			current.id,
			current.slug,
			body.name,
			color
		],
		audit
	});
	await invalidateAfterWrite(context);
	const tag = await freshTag(client, current.row);
	const detached = body.name.trim().toLowerCase() === current.name.trim().toLowerCase() ? 0 : snapshot.rugs.filter((r) => r.tags.some((t) => t.trim().toLowerCase() === current.name.trim().toLowerCase())).length;
	return noStore({
		ok: true,
		tag,
		audit: result.audit,
		detached
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/tags/[id]@_@ts
var page = () => _id__exports;
//#endregion
export { page };
