import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { Z as money, f as ratesFor, pt as driveImageUrl, t as baseCurrency, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { a as cardView, c as ratingText, d as siblings, l as relatedCards, m as withLeads, n as SLUG_PARAM_RE, r as activeRugs } from "./view_DFjKAQIO.mjs";
import { t as dims } from "./units_BFAJ7W-k.mjs";
import { a as $$Header, i as $$Layout, n as $$VoteButtons, o as $$Footer, r as $$RugPhoto, t as $$RugCard } from "./RugCard_BzgykWOb.mjs";
//#region src/components/Gallery.astro
createAstro("https://astro.build");
var $$Gallery = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Gallery;
	const { card } = Astro.props;
	const ids = card.photoIds ?? [];
	const first = ids[0];
	const w800 = first ? driveImageUrl(first, 800) : void 0;
	const w1600 = first ? driveImageUrl(first, 1600) : void 0;
	const ar = card.ar ?? "3-4";
	const caption = first ? `Photo 1 of ${ids.length} · click to enlarge` : "No photo yet";
	return renderTemplate`${maybeRenderHead($$result)}<figure class="stage"> <div class="hero" data-plate${addAttribute(ar, "data-ar")}${addAttribute(card.slug, "data-slug")}${addAttribute(first ? void 0 : "", "data-empty")}${addAttribute(card.name, "data-name")}${addAttribute(card.rot, "data-rot")}${addAttribute(w800, "data-src800")}${addAttribute(w1600, "data-src1600")}> ${renderComponent($$result, "RugPhoto", $$RugPhoto, {
		"hero": true,
		"src": w800,
		"full": w1600,
		"alt": card.name,
		"rot": card.rot,
		"ar": ar,
		"widthCm": card.widthCm,
		"lengthCm": card.lengthCm,
		"eager": true,
		"priority": true
	})} ${first && renderTemplate`<button type="button" class="hero-open" aria-label="Open photo viewer"></button>`} </div> <figcaption class="hero-cap" aria-live="polite">${caption}</figcaption> ${ids.length > 1 && renderTemplate`<div class="thumbs" role="group" aria-label="Photos"> ${ids.map((id, i) => renderTemplate`<button type="button" class="thumb" data-plate${addAttribute(i === 0 ? "true" : "false", "aria-pressed")}${addAttribute(`Photo ${i + 1}`, "aria-label")}${addAttribute(i, "data-i")}${addAttribute(driveImageUrl(id, 800), "data-src800")}${addAttribute(driveImageUrl(id, 1600), "data-src1600")}> <img${addAttribute(driveImageUrl(id, 800), "src")} alt="" loading="lazy" decoding="async" data-rug-img data-plate-img${addAttribute(card.rot, "data-rot")}> </button>`)} </div>`} </figure> ${first && renderTemplate`<dialog id="lightbox" class="lb" aria-label="Photo viewer"> <div class="lb-stage" data-plate${addAttribute(ar, "data-ar")}></div> <button type="button" class="lb-close" aria-label="Close" autofocus>
×
</button> ${ids.length > 1 && renderTemplate`<button type="button" class="lb-prev" aria-label="Previous photo">
‹
</button>`} ${ids.length > 1 && renderTemplate`<button type="button" class="lb-next" aria-label="Next photo">
›
</button>`} <p class="lb-count" aria-live="polite"></p> </dialog>`} ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/Gallery.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Gallery.astro", void 0);
//#endregion
//#region src/components/Pager.astro
createAstro("https://astro.build");
var $$Pager = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Pager;
	const { prev, next, index, total, hrefFor } = Astro.props;
	const href = (c) => hrefFor ? hrefFor(c) : `/rugs/${c.slug}`;
	return renderTemplate`${maybeRenderHead($$result)}<div class="pager"> ${prev ? renderTemplate`<a rel="prev"${addAttribute(href(prev), "href")}${addAttribute(`Previous: ${prev.name}`, "aria-label")}>
‹ <span class="word">Prev</span> </a>` : renderTemplate`<span class="is-off" aria-hidden="true">
‹ <span class="word">Prev</span> </span>`} <span class="pos"> ${index} / ${total} </span> ${next ? renderTemplate`<a rel="next"${addAttribute(href(next), "href")}${addAttribute(`Next: ${next.name}`, "aria-label")}> <span class="word">Next</span> ›
</a>` : renderTemplate`<span class="is-off" aria-hidden="true"> <span class="word">Next</span> ›
</span>`} </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Pager.astro", void 0);
//#endregion
//#region src/components/RelatedRugs.astro
createAstro("https://astro.build");
var $$RelatedRugs = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RelatedRugs;
	const { cards, rates, collection, collectionSlug, hrefFor, backHref } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<section class="related" aria-labelledby="related-h"> <h2 id="related-h" class="eyebrow">More from ${collection}</h2> <div class="grid"> ${cards.map((c) => renderTemplate`${renderComponent($$result, "RugCard", $$RugCard, {
		"card": c,
		"rates": rates,
		"related": true,
		"href": hrefFor ? hrefFor(c) : void 0
	})}`)} </div> <a class="back-all"${addAttribute(backHref ?? `/?collection=${collectionSlug}`, "href")}>← All ${collection}</a> </section>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/RelatedRugs.astro", void 0);
//#endregion
//#region src/components/Specs.astro
createAstro("https://astro.build");
var $$Specs = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Specs;
	const { card } = Astro.props;
	const dimText = dims(card.widthCm, card.lengthCm, "cm");
	const rows = [
		["Material", card.material],
		["Age", card.age],
		["Origin", card.origin],
		["Method", card.method]
	].filter(([, v]) => Boolean(v));
	return renderTemplate`${maybeRenderHead($$result)}<dl class="specs"> ${dimText && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <dt>Size</dt> <dd data-dims${addAttribute(card.widthCm ?? "", "data-w")}${addAttribute(card.lengthCm ?? "", "data-l")}> ${dimText} </dd> ` })}`} ${rows.map(([k, v]) => renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <dt>${k}</dt> <dd>${v}</dd> ` })}`)} <dt>Reference</dt> <dd class="ref">${card.id}</dd> </dl>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Specs.astro", void 0);
//#endregion
//#region src/pages/rugs/[slug].astro
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
	const cards = snapshot ? withLeads(activeRugs(catalogue).map((r) => cardView(r, catalogue))) : [];
	const card = snapshot && SLUG_PARAM_RE.test(slug) ? cards.find((c) => c.slug === slug) : void 0;
	if (error || !snapshot) {
		Astro.cache.set(false);
		Astro.response.status = 503;
		Astro.response.statusText = "Service Unavailable";
		Astro.response.headers.set("retry-after", "60");
		Astro.response.headers.set("cache-control", "no-store");
	} else if (!card) {
		Astro.cache.set(false);
		Astro.response.status = 404;
		Astro.response.statusText = "Not Found";
	} else Astro.cache.set({
		maxAge: 60,
		swr: 60,
		tags: ["sheet"]
	});
	const priceText = card ? money(card.priceUsd, baseCurrency, rates, "en-US") : "";
	const rating = card ? ratingText(card.likes, card.dislikes, card.rating) : null;
	const sib = card ? siblings(cards, card.slug) : void 0;
	const related = card ? relatedCards(cards, card.slug, 4) : [];
	const title = card ? `${card.name} — Serio Ludere` : "Serio Ludere — Catalogue";
	const retry = Astro.url.pathname;
	const ghostLines = [
		60,
		40,
		30,
		50,
		35,
		45,
		20
	];
	return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {
		"title": title,
		"rates": rates
	}, { "default": ($$result) => renderTemplate` ${renderComponent($$result, "Header", $$Header, { "rates": rates })} ${maybeRenderHead($$result)}<nav id="nav" class="nav-detail" aria-label="Breadcrumb"> <a class="back"${addAttribute(card ? `/?collection=${card.collectionSlug}` : "/", "href")}>← ${card?.collection || "Catalogue"}</a> ${sib && renderTemplate`${renderComponent($$result, "Pager", $$Pager, {
		"prev": sib.prev,
		"next": sib.next,
		"index": sib.index + 1,
		"total": sib.total
	})}`} </nav> ${!card && error && renderTemplate`<main> <div id="state" class="state" role="status"> ${error} <a class="retry"${addAttribute(retry, "href")}>
Try again
</a> </div> <div class="ghost-spread" aria-hidden="true"> <div class="sk sk-plate"></div> <div> ${ghostLines.map((w) => renderTemplate`<div${addAttribute([
		"sk",
		"sk-line",
		`w${w}`
	], "class:list")}></div>`)} </div> </div> </main>`}${!card && !error && renderTemplate`<main> <div class="plate-empty" data-plate data-empty data-ar="3-4" aria-hidden="true"> <div class="ph-art" data-ar="3-4"> <span class="ph-rug"></span> </div> <div class="ph">photo to come</div> </div> <div id="state" class="state">
This rug is not in the catalogue.
</div> </main>`}${card && renderTemplate`<main class="detail"> ${renderComponent($$result, "Gallery", $$Gallery, { "card": card })} <aside class="info"> <a class="eyebrow"${addAttribute(`/?collection=${card.collectionSlug}`, "href")}> ${card.collection} </a> <h1 class="nm">${card.name}</h1> <div class="price" data-price${addAttribute(card.priceUsd ?? "", "data-usd")}${addAttribute(!priceText, "hidden")}> ${priceText} </div> <div class="vote-row"> ${renderComponent($$result, "VoteButtons", $$VoteButtons, {
		"rugId": card.id,
		"name": card.name,
		"mode": "detail"
	})} <div class="rating"${addAttribute(card.id, "data-rating-for")}${addAttribute(!rating, "hidden")}> ${rating} </div> </div> ${renderComponent($$result, "Specs", $$Specs, { "card": card })} ${card.description && renderTemplate`<p class="desc">${card.description}</p>`} ${card.tags.length > 0 && renderTemplate`<ul class="tags" aria-label="Tags"> ${card.tags.map((t) => renderTemplate`<li> <a${addAttribute(`/tags/${t.slug}`, "href")}>${t.name}</a> </li>`)} </ul>`} </aside> </main>`}${card && related.length > 0 && renderTemplate`${renderComponent($$result, "RelatedRugs", $$RelatedRugs, {
		"cards": related,
		"rates": rates,
		"collection": card.collection,
		"collectionSlug": card.collectionSlug
	})}`}${renderComponent($$result, "Footer", $$Footer, {})} ` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/rugs/[slug].astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/rugs/[slug].astro";
var $$url = "/rugs/[slug]";
//#endregion
//#region \0virtual:astro:page:src/pages/rugs/[slug]@_@astro
var page = () => _slug__exports;
//#endregion
export { page };
