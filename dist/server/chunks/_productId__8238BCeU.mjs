import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { Z as money, f as ratesFor, t as baseCurrency, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { i as findCustomer } from "./http_B6fRxdq_.mjs";
import { a as $$PreviewControls, i as $$PreviewFooter, n as $$PreviewLayout, r as $$PreviewHeader, t as $$Reactions } from "./Reactions_CnCiNzo9.mjs";
import { a as cardView, r as activeRugs } from "./view_DFjKAQIO.mjs";
import { t as dims } from "./units_BFAJ7W-k.mjs";
//#region src/components/customer/SpecTable.astro
createAstro("https://astro.build");
var $$SpecTable = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$SpecTable;
	const { rows, widthCm, lengthCm } = Astro.props;
	const hasSize = Boolean(widthCm && lengthCm);
	const shown = rows.filter((r) => r.key === "Size" ? hasSize : r.value.trim() !== "");
	return renderTemplate`${maybeRenderHead($$result)}<aside class="pv-spec" data-astro-cid-ldikxqp5> <p class="pv-h4 pv-spec-title" data-astro-cid-ldikxqp5>Specification</p> <dl class="pv-spec-list" data-astro-cid-ldikxqp5> ${shown.map((row) => renderTemplate`<div class="pv-spec-row" data-astro-cid-ldikxqp5> <dt class="pv-label pv-muted" data-astro-cid-ldikxqp5>${row.key}</dt> <dd${addAttribute(row.key === "Size" && hasSize ? "" : void 0, "data-dims")}${addAttribute(row.key === "Size" && hasSize ? widthCm : void 0, "data-w")}${addAttribute(row.key === "Size" && hasSize ? lengthCm : void 0, "data-l")}${addAttribute(row.key === "Size" && hasSize ? "·" : void 0, "data-sep")} data-astro-cid-ldikxqp5> ${row.value} </dd> </div>`)} </dl> </aside>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/SpecTable.astro", void 0);
//#endregion
//#region src/pages/[slug]/[productId].astro
var _productId__exports = /* @__PURE__ */ __exportAll({
	default: () => $$ProductId,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$ProductId = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$ProductId;
	const slug = (Astro.params.slug ?? "").toLowerCase();
	const productId = Astro.params.productId ?? "";
	const { snapshot, error } = await loadCatalogue();
	const catalogue = snapshot?.catalogue ?? {
		rugs: [],
		collections: [],
		tags: [],
		rates: [],
		customers: []
	};
	const rates = ratesFor(catalogue);
	const customer = snapshot ? findCustomer(catalogue.customers, slug) : void 0;
	const signedIn = Astro.locals.customer === slug;
	const card = (customer && signedIn ? activeRugs(catalogue).map((r) => cardView(r, catalogue)) : []).find((c) => c.id === productId);
	Astro.cache?.set(false);
	Astro.response.headers.set("cache-control", "no-store");
	if (error || !snapshot) {
		Astro.response.status = 503;
		Astro.response.statusText = "Service Unavailable";
		Astro.response.headers.set("retry-after", "60");
	} else if (!customer) {
		Astro.response.status = 404;
		Astro.response.statusText = "Not Found";
	} else if (!signedIn) return Astro.redirect(`/${slug}`, 303);
	else if (!card) {
		Astro.response.status = 404;
		Astro.response.statusText = "Not Found";
	}
	const priceText = card ? money(card.priceUsd, baseCurrency, rates, "en-US") : "";
	const sizeText = card ? dims(card.widthCm, card.lengthCm, "cm", "·") : "";
	const photos = card?.photoUrls?.length ? card.photoUrls : card?.photoUrl ? [card.photoUrl] : [];
	const specRows = card ? [
		{
			key: "Size",
			value: sizeText
		},
		{
			key: "Material",
			value: card.material
		},
		{
			key: "Method",
			value: card.method
		},
		{
			key: "Origin",
			value: card.origin
		},
		{
			key: "Pile",
			value: card.pile
		},
		{
			key: "Age",
			value: card.age
		}
	] : [];
	const title = card ? `${card.name} — Serio Ludere` : "Serio Ludere";
	return renderTemplate`${renderComponent($$result, "PreviewLayout", $$PreviewLayout, {
		"title": title,
		"rates": rates,
		"customer": signedIn ? slug : void 0,
		"data-astro-cid-w72pnaip": true
	}, { "default": ($$result) => renderTemplate`${customer && renderTemplate`${renderComponent($$result, "PreviewHeader", $$PreviewHeader, {
		"home": `/${slug}`,
		"back": {
			href: `/${slug}`,
			label: "Back to the collection",
			shortLabel: "Back"
		},
		"data-astro-cid-w72pnaip": true
	})}`}${error && renderTemplate`${maybeRenderHead($$result)}<main class="pv-state" data-astro-cid-w72pnaip> <p class="pv-h3" data-astro-cid-w72pnaip>Could not load the catalogue.</p> <p class="pv-lede" data-astro-cid-w72pnaip> <a${addAttribute(Astro.url.pathname, "href")} data-astro-cid-w72pnaip>Try again</a> </p> </main>`}${!error && !card && renderTemplate`<main class="pv-state" data-astro-cid-w72pnaip> <p class="pv-h3" data-astro-cid-w72pnaip> ${customer ? "This rug is not in your preview." : "This preview link is not active."} </p> ${customer && renderTemplate`<p class="pv-lede" data-astro-cid-w72pnaip> <a${addAttribute(`/${slug}`, "href")} data-astro-cid-w72pnaip>Back to the collection</a> </p>`} </main>`}${card && renderTemplate`<main class="pv-main" data-astro-cid-w72pnaip> <section class="pv-hero" data-astro-cid-w72pnaip> ${photos[0] ? renderTemplate`<img${addAttribute(photos[0], "src")}${addAttribute(card.name, "alt")} data-hero-img fetchpriority="high" decoding="async" data-astro-cid-w72pnaip>` : renderTemplate`<span class="pv-hero-empty" data-astro-cid-w72pnaip>Photo to come</span>`} <div class="pv-hero-react" data-astro-cid-w72pnaip> ${renderComponent($$result, "Reactions", $$Reactions, {
		"rugId": card.id,
		"mode": "detail",
		"data-astro-cid-w72pnaip": true
	})} </div> </section> ${photos.length > 1 && renderTemplate`<section class="pv-wrap pv-thumbwrap" data-astro-cid-w72pnaip> <div class="pv-thumbs" data-thumbs role="toolbar" aria-label="Photographs" data-astro-cid-w72pnaip> ${photos.map((src, i) => renderTemplate`<button type="button"${addAttribute(["pv-thumb", { "is-on": i === 0 }], "class:list")}${addAttribute(src, "data-full")}${addAttribute(`${card.name}, photograph ${i + 1}`, "data-alt")}${addAttribute(i === 0 ? "true" : void 0, "aria-current")} data-astro-cid-w72pnaip> <img${addAttribute(src, "src")}${addAttribute(`Photograph ${i + 1}`, "alt")} loading="lazy" decoding="async" data-astro-cid-w72pnaip> </button>`)} </div> </section>`} <section class="pv-body" data-astro-cid-w72pnaip> <div class="pv-detail-text" data-astro-cid-w72pnaip> <h1 class="pv-h1" data-astro-cid-w72pnaip>${card.name}</h1> <div class="pv-price-row" data-astro-cid-w72pnaip> <p class="pv-price" data-price${addAttribute(card.priceUsd ?? "", "data-usd")}${addAttribute(!priceText, "hidden")} data-astro-cid-w72pnaip> ${priceText} </p> <span class="pv-spacer" aria-hidden="true" data-astro-cid-w72pnaip></span> ${renderComponent($$result, "PreviewControls", $$PreviewControls, {
		"rates": rates,
		"data-astro-cid-w72pnaip": true
	})} </div> ${card.description && renderTemplate`<p class="pv-detail-desc" data-astro-cid-w72pnaip>${card.description}</p>`} <div class="pv-react-row" data-astro-cid-w72pnaip> ${renderComponent($$result, "Reactions", $$Reactions, {
		"rugId": card.id,
		"mode": "detail",
		"data-astro-cid-w72pnaip": true
	})} <p class="pv-react-note" data-react-note aria-live="off" data-astro-cid-w72pnaip></p> </div> </div> ${renderComponent($$result, "SpecTable", $$SpecTable, {
		"rows": specRows,
		"widthCm": card.widthCm,
		"lengthCm": card.lengthCm,
		"data-astro-cid-w72pnaip": true
	})} </section> </main>`}${renderComponent($$result, "PreviewFooter", $$PreviewFooter, { "data-astro-cid-w72pnaip": true })} ` })} ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro";
var $$url = "/[slug]/[productId]";
//#endregion
//#region \0virtual:astro:page:src/pages/[slug]/[productId]@_@astro
var page = () => _productId__exports;
//#endregion
export { page };
