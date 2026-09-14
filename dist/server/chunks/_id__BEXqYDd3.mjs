import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, H as unescapeHTML, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { i as getClient, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { g as roundStepOf, i as fetchAdminSnapshot, j as ID_RE, o as findRugById } from "./read_BGHurOvf.mjs";
import { o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$RugFields } from "./RugFields_sIBnZZvf.mjs";
//#region src/pages/admin/rugs/[id].astro
var _id__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Id,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Id = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Id;
	const id = Astro.params.id ?? "";
	let snapshot;
	let error;
	let rug;
	if (ID_RE.test(id)) try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
		rug = findRugById(snapshot, id);
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin edit-rug read failed", { error: safe });
		error = safe.message;
	}
	if (!rug && !error) Astro.response.status = 404;
	const collections = snapshot?.collections ?? [];
	const tags = snapshot?.tags ?? [];
	const roundStep = snapshot ? roundStepOf(snapshot.settings) : 5;
	const data = rug ? {
		mode: "edit",
		rug,
		collections: collections.map((c) => ({
			id: c.id,
			slug: c.slug,
			name: c.name
		})),
		tags: tags.map((t) => ({
			id: t.id,
			slug: t.slug,
			name: t.name,
			color: t.color ?? ""
		})),
		defaultStatus: rug.status === "draft" ? "draft" : "active",
		roundStep,
		driveScopeOk: null
	} : null;
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": rug ? `Serio Ludere — ${rug.name}` : "Serio Ludere — Rug not found",
		"active": "rugs"
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}${!rug && !error && renderTemplate`<div class="msg err on">
No rug with id "${id}". <a href="/admin/rugs">Back to the catalogue</a> </div>`}${rug && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <p class="hint"> <a href="/admin/rugs">← Catalogue</a> · editing <span class="mono">${rug.id}</span> </p> ${renderComponent($$result, "RugFields", $$RugFields, {
		"mode": "edit",
		"rug": rug,
		"collections": collections,
		"tags": tags,
		"defaultStatus": rug.status === "draft" ? "draft" : "active",
		"roundStep": roundStep,
		"driveScopeOk": null
	})} <script type="application/json" id="admin-data">${unescapeHTML(jsonForScript(data))}<\/script>${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/[id].astro?astro&type=script&index=0&lang.ts")}` })}`}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/[id].astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/[id].astro";
var $$url = "/admin/rugs/[id]";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/rugs/[id]@_@astro
var page = () => _id__exports;
//#endregion
export { page };
