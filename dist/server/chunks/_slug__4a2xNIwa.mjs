import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { f as ratesFor, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { a as cardView, n as SLUG_PARAM_RE, r as activeRugs, u as rugsWithTag } from "./view_DFjKAQIO.mjs";
import { a as $$Header, i as $$Layout, o as $$Footer } from "./RugCard_BzgykWOb.mjs";
import { t as $$RugGrid } from "./RugGrid_B3UNNFEP.mjs";
//#region src/pages/tags/[slug].astro
var _slug__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Slug,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Slug = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Slug;
	const slug = Astro.params.slug ?? "";
	const { snapshot, error } = await loadCatalogue();
	const catalogue = snapshot?.catalogue ?? {
		rugs: [],
		collections: [],
		tags: [],
		rates: [],
		customers: []
	};
	const rates = ratesFor(catalogue);
	const found = snapshot && SLUG_PARAM_RE.test(slug) ? rugsWithTag(activeRugs(catalogue), slug, catalogue) : void 0;
	if (error || !snapshot) {
		Astro.cache.set(false);
		Astro.response.status = 503;
		Astro.response.statusText = "Service Unavailable";
		Astro.response.headers.set("retry-after", "60");
		Astro.response.headers.set("cache-control", "no-store");
	} else if (!found) {
		Astro.cache.set(false);
		Astro.response.status = 404;
		Astro.response.statusText = "Not Found";
	} else Astro.cache.set({
		maxAge: 60,
		swr: 60,
		tags: ["sheet"]
	});
	const cards = found ? found.rugs.map((r) => cardView(r, catalogue)) : [];
	const state = error ?? (!found ? "No such tag." : cards.length === 0 ? "No rugs carry this tag yet." : void 0);
	const n = cards.length;
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": found ? `${found.name} — Serio Ludere` : "Serio Ludere — Catalogue",
		"rates": rates
	}, { "default": ($$result) => renderTemplate` ${renderComponent($$result, "Header", $$Header, { "rates": rates })} ${maybeRenderHead($$result)}<nav id="nav" class="nav-detail" aria-label="Breadcrumb"> <a class="back" href="/">← Catalogue</a> </nav> ${found && renderTemplate`<section class="lede"> <div class="standfirst"> <p class="eyebrow">
Tag · ${found.name} · ${n} ${n === 1 ? "rug" : "rugs"} </p> </div> </section>`}${renderComponent($$result, "RugGrid", $$RugGrid, {
		"cards": cards,
		"rates": rates,
		"state": state,
		"error": Boolean(error),
		"eager": 4
	})} ${renderComponent($$result, "Footer", $$Footer, {})} ` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/tags/[slug].astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/tags/[slug].astro";
var $$url = "/tags/[slug]";
//#endregion
//#region \0virtual:astro:page:src/pages/tags/[slug]@_@astro
var page = () => _slug__exports;
//#endregion
export { page };
