import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { l as methodNotAllowed, n as adminGet } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { n as nextRugId } from "./ids_DwaqsSKD.mjs";
import { d as loadSnapshot, m as reservedIds } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/rugs/next-id.ts
var next_id_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
var GET = adminGet(async () => {
	const snapshot = await loadSnapshot();
	return noStore({
		ok: true,
		id: nextRugId(snapshot.rugs.map((r) => r.id), reservedIds(snapshot))
	});
});
var ALL = methodNotAllowed("GET");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/rugs/next-id@_@ts
var page = () => next_id_exports;
//#endregion
export { page };
