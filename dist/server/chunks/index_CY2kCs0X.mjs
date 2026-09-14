import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { i as getClient, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, h as productFieldsToCells, i as adminPost, l as methodNotAllowed, n as adminGet, o as auditBase, t as AdminError, v as updateRug } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, I as RugUpdate, K as diffFields, g as roundStepOf, j as ID_RE, o as findRugById } from "./read_BGHurOvf.mjs";
import { r as uniqueSlug } from "./ids_DwaqsSKD.mjs";
import { _ as rugFieldsFrom, a as fieldsOfRug, d as loadSnapshot, g as resolveTags, h as resolveCollections, l as freshRug, p as requireAdminHeaders, t as auditable } from "./_shared_Bzx2ocTH.mjs";
import { n as roundUpToStep } from "./price_C7z5lVb8.mjs";
//#region src/pages/api/admin/rugs/[id]/index.ts
var _id__exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	POST: () => POST,
	prerender: () => false
});
function requireRug(snapshot, id) {
	if (!id || !ID_RE.test(id)) throw new AdminError(404, "not found", "no such rug");
	const rug = findRugById(snapshot, id);
	if (!rug) throw new AdminError(404, "not found", `rug "${id}" is not in the sheet`);
	return rug;
}
var GET = adminGet(async ({ context }) => {
	const snapshot = await loadSnapshot();
	return noStore({
		ok: true,
		rug: requireRug(snapshot, context.params.id)
	});
});
var POST = adminPost(RugUpdate, async ({ context, body }) => {
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	requireAdminHeaders(snapshot);
	const rug = requireRug(snapshot, context.params.id);
	const otherSlugs = snapshot.rugs.filter((r) => r.id !== rug.id).map((r) => r.slug);
	let slug = rug.slug;
	if (body.slug && body.slug !== rug.slug) {
		const wanted = body.slug.toLowerCase();
		if (otherSlugs.some((s) => s.toLowerCase() === wanted)) throw new AdminError(409, "slug exists", `Slug "${body.slug}" is already used by another rug.`, { slug: body.slug });
		slug = body.slug;
	} else if (!slug) slug = uniqueSlug(body.name, otherSlugs);
	const collections = resolveCollections(snapshot, body.collections);
	const tags = resolveTags(snapshot, body.tags);
	const priceUsd = body.roundPrice ? roundUpToStep(body.priceUsd, roundStepOf(snapshot.settings)) : body.priceUsd;
	const before = fieldsOfRug(rug);
	const after = rugFieldsFrom(body, {
		slug,
		collections,
		tags,
		priceUsd,
		scrapedAt: rug.scrapedAt
	});
	const diff = diffFields(auditable(before), auditable(after));
	if (diff.changed.length === 0) return noStore({
		ok: true,
		rug,
		unchanged: true
	});
	const audit = buildAuditRow({
		...auditBase(context),
		action: "rug.update",
		targetTab: "Products",
		targetId: rug.id,
		before: diff.before,
		after: diff.after,
		note: `row ${rug.row}`
	});
	const result = await updateRug(client, {
		row: rug.row,
		id: rug.id,
		version: body.version,
		cells: { all: productFieldsToCells(after, rug.id) },
		audit,
		logger: consoleLogger
	});
	await invalidateAfterWrite(context);
	const fresh = await freshRug(client, rug.row, rug.id);
	return noStore({
		ok: true,
		rug: fresh,
		audit: result.audit,
		verified: result.verified,
		changed: diff.changed
	});
});
var ALL = methodNotAllowed("GET, POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/rugs/[id]/index@_@ts
var page = () => _id__exports;
//#endregion
export { page };
