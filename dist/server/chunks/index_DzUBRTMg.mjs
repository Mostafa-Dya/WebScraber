import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { i as getClient, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, h as productFieldsToCells, i as adminPost, l as methodNotAllowed, n as adminGet, o as auditBase, p as insertRug, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, P as RugInput, g as roundStepOf } from "./read_BGHurOvf.mjs";
import { n as nextRugId, r as uniqueSlug, t as idProblem } from "./ids_DwaqsSKD.mjs";
import { _ as rugFieldsFrom, d as loadSnapshot, f as nowIso, g as resolveTags, h as resolveCollections, l as freshRug, m as reservedIds, o as filterRugs, p as requireAdminHeaders, t as auditable } from "./_shared_Bzx2ocTH.mjs";
import { n as roundUpToStep } from "./price_C7z5lVb8.mjs";
//#region src/pages/api/admin/rugs/index.ts
var rugs_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	POST: () => POST,
	prerender: () => false
});
var GET = adminGet(async ({ context }) => {
	const snapshot = await loadSnapshot();
	const { searchParams } = context.url;
	return noStore({
		ok: true,
		rugs: filterRugs(snapshot.rugs, searchParams.get("status"), searchParams.get("q")),
		collections: snapshot.collections,
		tags: snapshot.tags,
		adminHeaders: snapshot.report.adminHeaders
	});
});
var POST = adminPost(RugInput, async ({ context, body }) => {
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	requireAdminHeaders(snapshot);
	const allIds = snapshot.rugs.map((r) => r.id);
	const reserved = reservedIds(snapshot);
	let id;
	if (body.id) {
		const problem = idProblem(body.id, allIds, reserved);
		if (problem) throw new AdminError(problem.includes("already exists") ? 409 : 422, "id problem", problem, { id: body.id });
		id = body.id;
	} else id = nextRugId(allIds, reserved);
	const allSlugs = snapshot.rugs.map((r) => r.slug);
	let slug;
	if (body.slug) {
		const wanted = body.slug.toLowerCase();
		if (allSlugs.some((s) => s.toLowerCase() === wanted)) throw new AdminError(409, "slug exists", `Slug "${body.slug}" is already used by another rug.`, { slug: body.slug });
		slug = body.slug;
	} else slug = uniqueSlug(body.name, allSlugs);
	const collections = resolveCollections(snapshot, body.collections);
	const tags = resolveTags(snapshot, body.tags);
	const priceUsd = body.roundPrice ? roundUpToStep(body.priceUsd, roundStepOf(snapshot.settings)) : body.priceUsd;
	const fields = rugFieldsFrom(body, {
		slug,
		collections,
		tags,
		priceUsd
	});
	const now = nowIso();
	const audit = buildAuditRow({
		...auditBase(context),
		action: "rug.create",
		targetTab: "Products",
		targetId: id,
		after: {
			id,
			...auditable(fields),
			roundPrice: body.roundPrice,
			requestedPrice: body.priceUsd ?? null
		}
	});
	const result = await insertRug(client, {
		cells: { all: productFieldsToCells({
			...fields,
			scrapedAt: fields.scrapedAt ?? now
		}, id) },
		audit,
		logger: consoleLogger
	});
	await invalidateAfterWrite(context);
	const rug = await freshRug(client, result.row, id);
	return noStore({
		ok: true,
		rug,
		row: result.row,
		audit: result.audit,
		verified: result.verified
	}, 201);
});
var ALL = methodNotAllowed("GET, POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/rugs/index@_@ts
var page = () => rugs_exports;
//#endregion
export { page };
