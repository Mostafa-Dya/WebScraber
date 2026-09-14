import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, H as unescapeHTML, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { i as getClient, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime } from "./http_BC0ewnLg.mjs";
import { f as defaultStatusOf, g as roundStepOf, i as fetchAdminSnapshot } from "./read_BGHurOvf.mjs";
import { o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$RugFields } from "./RugFields_sIBnZZvf.mjs";
import { t as $$FetchModal } from "./FetchModal_CjOrwyFC.mjs";
import { n as nextRugId } from "./ids_DwaqsSKD.mjs";
import { i as driveScope, m as reservedIds } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/admin/rugs/new.astro
var new_exports = /* @__PURE__ */ __exportAll({
	default: () => $$New,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$New = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$New;
	Astro.csp?.insertDirective("img-src 'self' https://lh3.googleusercontent.com https://cdn.shopify.com https://images.ecarpetwholesale.com data:");
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin add-rug read failed", { error: safe });
		error = safe.message;
	}
	await driveScope();
	const driveScopeOk = adminRuntime.driveScopeOk ?? null;
	const collections = snapshot?.collections ?? [];
	const tags = snapshot?.tags ?? [];
	const settings = snapshot?.settings;
	const defaultStatus = settings ? defaultStatusOf(settings) : "active";
	const roundStep = settings ? roundStepOf(settings) : 5;
	const nextId = snapshot ? nextRugId(snapshot.rugs.map((r) => r.id), reservedIds(snapshot)) : "";
	const data = {
		mode: "add",
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
		nextId,
		defaultStatus,
		roundStep,
		driveScopeOk,
		adminHeaders: snapshot?.report.adminHeaders ?? "ok"
	};
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Add rug",
		"active": "add"
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}${snapshot?.report.adminHeaders === "missing" && renderTemplate`<div class="msg err on">
Rugs W1:Z1 are blank — run <span class="kbd">npm run sheet:init</span> before adding rugs.
</div>`}${renderComponent($$result, "RugFields", $$RugFields, {
		"mode": "add",
		"collections": collections,
		"tags": tags,
		"defaultStatus": defaultStatus,
		"roundStep": roundStep,
		"driveScopeOk": driveScopeOk,
		"nextId": nextId
	})} <script type="application/json" id="admin-data">${unescapeHTML(jsonForScript(data))}<\/script>${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/new.astro?astro&type=script&index=0&lang.ts")}${renderComponent($$result, "FetchModal", $$FetchModal, {
		"id": "fetch-result",
		"title": "Fetching"
	})} ` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/new.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/new.astro";
var $$url = "/admin/rugs/new";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/rugs/new@_@astro
var page = () => new_exports;
//#endregion
export { page };
