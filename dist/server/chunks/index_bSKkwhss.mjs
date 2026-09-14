import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { A as slugify, V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { c as invalidateAfterWrite, f as insertRowAtBottom, i as adminPost, l as methodNotAllowed, n as adminGet, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { D as CollectionInput, G as buildAuditRow } from "./read_BGHurOvf.mjs";
import { c as freshCollection, d as loadSnapshot, f as nowIso, n as checkCover } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/collections/index.ts
var collections_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	POST: () => POST,
	prerender: () => false
});
var GET = adminGet(async () => {
	const snapshot = await loadSnapshot();
	return noStore({
		ok: true,
		collections: snapshot.collections
	});
});
var POST = adminPost(CollectionInput, async ({ context, body }) => {
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	const slug = slugify(body.name);
	if (!slug) throw new AdminError(422, "bad name", "The name needs at least one letter or digit.");
	const clash = snapshot.collections.find((c) => c.slug === slug || c.name.trim().toLowerCase() === body.name.toLowerCase());
	if (clash) throw new AdminError(409, "slug exists", `Collection "${clash.name}" already exists (${clash.slug}).`, { slug });
	const cover = checkCover(body.coverImageUrl);
	const sortOrder = Math.max(0, ...snapshot.collections.map((c) => c.sortOrder ?? 0)) + 1;
	const audit = buildAuditRow({
		...auditBase(context),
		action: "collection.create",
		targetTab: "Collections",
		targetId: slug,
		after: {
			id: slug,
			slug,
			name: body.name,
			description: body.description,
			coverImageUrl: cover,
			sortOrder
		}
	});
	const result = await insertRowAtBottom(client, {
		tab: TABS.collections,
		cells: [
			slug,
			body.name,
			slug,
			body.description,
			nowIso(),
			cover,
			sortOrder
		],
		audit
	});
	await invalidateAfterWrite(context);
	const collection = await freshCollection(client, result.row);
	return noStore({
		ok: true,
		collection,
		audit: result.audit
	}, 201);
});
var ALL = methodNotAllowed("GET, POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/collections/index@_@ts
var page = () => collections_exports;
//#endregion
export { page };
