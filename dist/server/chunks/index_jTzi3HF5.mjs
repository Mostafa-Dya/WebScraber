import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { f as ratesFor, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { a as cardView, m as withLeads, r as activeRugs, s as navTabs } from "./view_DFjKAQIO.mjs";
import { a as $$Header, i as $$Layout, o as $$Footer } from "./RugCard_BzgykWOb.mjs";
import { t as $$RugGrid } from "./RugGrid_B3UNNFEP.mjs";
//#region src/components/CollectionNav.astro
createAstro("https://astro.build");
var $$CollectionNav = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$CollectionNav;
	const { tabs, active } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<nav id="nav" role="tablist" aria-label="Collections"> ${tabs.map((t) => renderTemplate`<button type="button" role="tab"${addAttribute(`tab-${t.slug}`, "id")}${addAttribute(t.slug === active ? "on" : "", "class")}${addAttribute(t.slug, "data-collection")}${addAttribute(t.slug === active ? "true" : "false", "aria-selected")} aria-controls="grid"${addAttribute(t.slug === active ? 0 : -1, "tabindex")}>${t.name}<span class="n">${t.count}</span></button>`)} <span class="ink" aria-hidden="true"></span> </nav> <section class="lede"> ${tabs.map((t) => renderTemplate`<div class="standfirst" data-standfirst${addAttribute(t.slug, "data-collection")}${addAttribute(t.slug !== active, "hidden")}> <p class="eyebrow"> ${t.name} · ${t.count} ${t.count === 1 ? "rug" : "rugs"} </p> ${t.description && renderTemplate`<p class="lede-text" data-lede> <span class="lede-body">${t.description}</span> <button type="button" class="lede-more" data-lede-more hidden>
See more
</button> </p>`} </div>`)} </section> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/CollectionNav.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/CollectionNav.astro", void 0);
//#endregion
//#region src/pages/index.astro
var pages_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	prerender: () => false,
	url: () => ""
});
createAstro("https://astro.build");
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Index;
	const { snapshot, error } = await loadCatalogue();
	if (error || !snapshot) {
		Astro.cache.set(false);
		Astro.response.status = 503;
		Astro.response.statusText = "Service Unavailable";
		Astro.response.headers.set("retry-after", "60");
		Astro.response.headers.set("cache-control", "no-store");
	} else Astro.cache.set({
		maxAge: 60,
		swr: 60,
		tags: ["sheet"]
	});
	const catalogue = snapshot?.catalogue ?? {
		rugs: [],
		collections: [],
		tags: [],
		rates: [],
		customers: []
	};
	const rugs = snapshot ? activeRugs(catalogue) : [];
	const tabs = navTabs(rugs, catalogue);
	const active = tabs[0]?.slug;
	const cards = withLeads(rugs.map((r) => cardView(r, catalogue)));
	const rates = ratesFor(catalogue);
	const state = error ?? (rugs.length === 0 ? "No rugs published yet." : void 0);
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": "Serio Ludere — Catalogue",
		"rates": rates
	}, { "default": ($$result) => renderTemplate` ${renderComponent($$result, "Header", $$Header, { "rates": rates })} ${tabs.length > 0 && renderTemplate`${renderComponent($$result, "CollectionNav", $$CollectionNav, {
		"tabs": tabs,
		"active": active
	})}`}${tabs.length === 0 && renderTemplate`${maybeRenderHead($$result)}<nav id="nav" aria-label="Collections"></nav>`}${renderComponent($$result, "RugGrid", $$RugGrid, {
		"cards": cards,
		"rates": rates,
		"active": active,
		"state": state,
		"error": Boolean(error),
		"eager": 4
	})} ${renderComponent($$result, "Footer", $$Footer, {})} ` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/index.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/index.astro";
//#endregion
//#region \0virtual:astro:page:src/pages/index@_@astro
var page = () => pages_exports;
//#endregion
export { page };
