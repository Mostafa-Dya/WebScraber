import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { Z as money, f as ratesFor, t as baseCurrency, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { a as noteVisit, i as findCustomer } from "./http_B6fRxdq_.mjs";
import { a as $$PreviewControls, i as $$PreviewFooter, n as $$PreviewLayout, r as $$PreviewHeader, t as $$Reactions } from "./Reactions_CnCiNzo9.mjs";
import { a as STUDIO_NAME } from "./prepaint_Cst9YLzz.mjs";
import { a as cardView, f as tagSlug, i as badgesFor, p as visibleLikes, r as activeRugs } from "./view_DFjKAQIO.mjs";
import { t as dims } from "./units_BFAJ7W-k.mjs";
//#region src/components/customer/PreviewGate.astro
createAstro("https://astro.build");
var $$PreviewGate = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$PreviewGate;
	const { slug } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<main class="pv-gate" data-astro-cid-3tatj4of> <section class="pv-gate-col" data-astro-cid-3tatj4of> <div class="pv-gate-brand" data-astro-cid-3tatj4of> <p class="pv-h1" data-astro-cid-3tatj4of>${STUDIO_NAME}</p> <p class="pv-lede" data-astro-cid-3tatj4of>A private preview, prepared for you</p> </div> <form class="pv-gate-form" method="post"${addAttribute(`/api/customers/${slug}/login`, "action")}${addAttribute(slug, "data-gate")} data-astro-cid-3tatj4of> <label class="sr-only" for="gate-password" data-astro-cid-3tatj4of>Password</label> <div class="pv-field" data-astro-cid-3tatj4of> <input class="pv-input" id="gate-password" name="password" type="password" placeholder="Enter your password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required maxlength="200" data-astro-cid-3tatj4of> <button type="button" class="pv-eye" data-gate-reveal aria-pressed="false" data-astro-cid-3tatj4of> <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false" data-astro-cid-3tatj4of> <path d="M1.8 8C1.8 8 4.2 3.8 8 3.8C11.8 3.8 14.2 8 14.2 8C14.2 8 11.8 12.2 8 12.2C4.2 12.2 1.8 8 1.8 8Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3tatj4of></path> <path d="M9.9 8C9.9 9.04934 9.04934 9.9 8 9.9C6.95066 9.9 6.1 9.04934 6.1 8C6.1 6.95066 6.95066 6.1 8 6.1C9.04934 6.1 9.9 6.95066 9.9 8Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-3tatj4of></path> </svg> <span class="sr-only" data-astro-cid-3tatj4of>Show password</span> </button> </div> <button type="submit" class="pv-btn" data-gate-submit data-astro-cid-3tatj4of>View the catalogue</button> <p class="pv-gate-error" data-gate-error role="alert" hidden data-astro-cid-3tatj4of></p> </form> <div class="pv-gate-note" data-astro-cid-3tatj4of> <p data-astro-cid-3tatj4of>The rugs you like and dislike are shared with ${STUDIO_NAME}.</p> <p class="pv-gate-note-2" data-astro-cid-3tatj4of>It helps us show you more of what you&rsquo;re drawn to.</p> </div> </section> </main> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewGate.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewGate.astro", void 0);
//#endregion
//#region src/components/customer/ProductCard.astro
createAstro("https://astro.build");
var $$ProductCard = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$ProductCard;
	const { card, rates, baseCurrency, href, eager = false, priority = false } = Astro.props;
	const sizeText = dims(card.widthCm, card.lengthCm, "cm", "·");
	const priceText = money(card.priceUsd, baseCurrency, rates, "en-US");
	const badges = badgesFor(card.tags.map((t) => t.name));
	const likes = visibleLikes(card.likes);
	return renderTemplate`${maybeRenderHead($$result)}<article class="pv-card" data-astro-cid-xknkw5pj> <div class="pv-card-image" data-astro-cid-xknkw5pj> ${card.photoUrl ? renderTemplate`<img${addAttribute(card.photoUrl, "src")}${addAttribute(card.name, "alt")}${addAttribute(eager ? "eager" : "lazy", "loading")}${addAttribute(priority ? "high" : void 0, "fetchpriority")} decoding="async" data-astro-cid-xknkw5pj>` : renderTemplate`<span class="pv-card-empty" data-astro-cid-xknkw5pj>Photo to come</span>`} ${badges.length > 0 && renderTemplate`<ul class="pv-card-badges" data-astro-cid-xknkw5pj> ${badges.map((b) => renderTemplate`<li class="pv-badge" data-astro-cid-xknkw5pj>${b}</li>`)} </ul>`} <a class="pv-card-hit"${addAttribute(href, "href")} tabindex="-1" aria-hidden="true" data-astro-cid-xknkw5pj></a> <div class="pv-card-react" data-astro-cid-xknkw5pj>  <span class="pv-card-likes"${addAttribute(likes, "data-like-count")}${addAttribute(likes === void 0, "hidden")} data-astro-cid-xknkw5pj> ${likes ?? ""} </span> ${renderComponent($$result, "Reactions", $$Reactions, {
		"rugId": card.id,
		"mode": "card",
		"data-astro-cid-xknkw5pj": true
	})} </div> </div> <div class="pv-card-text" data-astro-cid-xknkw5pj> <p class="pv-card-name" data-astro-cid-xknkw5pj><a${addAttribute(href, "href")} data-astro-cid-xknkw5pj>${card.name}</a></p> <p class="pv-card-size" data-dims${addAttribute(card.widthCm ?? "", "data-w")}${addAttribute(card.lengthCm ?? "", "data-l")}${addAttribute("·", "data-sep")}${addAttribute(!sizeText, "hidden")} data-astro-cid-xknkw5pj> ${sizeText} </p> <p class="pv-card-price" data-price${addAttribute(card.priceUsd ?? "", "data-usd")}${addAttribute(!priceText, "hidden")} data-astro-cid-xknkw5pj> ${priceText} </p> </div> </article>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/ProductCard.astro", void 0);
//#endregion
//#region src/components/customer/TagFilters.astro
createAstro("https://astro.build");
var $$TagFilters = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$TagFilters;
	const { tags } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<nav class="pv-filters" aria-label="Filter rugs" data-astro-cid-rx43hjfk> <button type="button" class="pv-chip is-on" data-filter="all" aria-pressed="true" data-astro-cid-rx43hjfk>All</button> ${tags.map((t) => renderTemplate`<button type="button" class="pv-chip"${addAttribute(t.slug, "data-filter")} aria-pressed="false" data-astro-cid-rx43hjfk> ${t.name} </button>`)} <button type="button" class="pv-chip pv-chip-liked" data-filter="liked" aria-pressed="false" data-astro-cid-rx43hjfk> <span class="pv-chip-heart" aria-hidden="true" data-astro-cid-rx43hjfk> <svg viewBox="0 0 16 16" width="12" height="12" fill="none" data-astro-cid-rx43hjfk> <path d="M8 13.4C8 13.4 2.6 10.2 2.6 6.6C2.40109 5.88392 2.49479 5.11814 2.86048 4.47114C3.22618 3.82414 3.83392 3.34891 4.55 3.15C5.26608 2.95109 6.03186 3.04479 6.67886 3.41048C7.32586 3.77618 7.80109 4.38392 8 5.1C8.19891 4.38392 8.67414 3.77618 9.32114 3.41048C9.96814 3.04479 10.7339 2.95109 11.45 3.15C12.1661 3.34891 12.7738 3.82414 13.1395 4.47114C13.5052 5.11814 13.5989 5.88392 13.4 6.6C13.4 10.2 8 13.4 8 13.4Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-rx43hjfk></path> </svg> </span>
Liked <span class="pv-chip-count" data-liked-count data-astro-cid-rx43hjfk>0</span> </button> </nav> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/customer/TagFilters.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/TagFilters.astro", void 0);
//#endregion
//#region src/pages/[slug]/index.astro
var _slug__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Index;
	const slug = (Astro.params.slug ?? "").toLowerCase();
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
	Astro.cache?.set(false);
	Astro.response.headers.set("cache-control", "no-store");
	if (error || !snapshot) {
		Astro.response.status = 503;
		Astro.response.statusText = "Service Unavailable";
		Astro.response.headers.set("retry-after", "60");
	} else if (!customer) {
		Astro.response.status = 404;
		Astro.response.statusText = "Not Found";
	}
	if (customer && signedIn) noteVisit(slug, Astro.request);
	const cards = (customer && signedIn ? activeRugs(catalogue) : []).map((r) => cardView(r, catalogue));
	const counts = /* @__PURE__ */ new Map();
	for (const card of cards) for (const t of card.tags) {
		const key = t.slug || tagSlug(t.name, catalogue.tags);
		const seen = counts.get(key);
		if (seen) seen.count += 1;
		else counts.set(key, {
			slug: key,
			name: t.name,
			count: 1
		});
	}
	const MAX_TAG_CHIPS = 8;
	const tags = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, MAX_TAG_CHIPS);
	return renderTemplate`${renderComponent($$result, "PreviewLayout", $$PreviewLayout, {
		"title": "Serio Ludere",
		"rates": rates,
		"customer": signedIn ? slug : void 0,
		"data-astro-cid-z2nrcivh": true
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<main class="pv-state" data-astro-cid-z2nrcivh> <p class="pv-h3" data-astro-cid-z2nrcivh>Could not load the catalogue.</p> <p class="pv-lede" data-astro-cid-z2nrcivh> <a${addAttribute(`/${slug}`, "href")} data-astro-cid-z2nrcivh>Try again</a> </p> </main>`}${!error && !customer && renderTemplate`<main class="pv-state" data-astro-cid-z2nrcivh> <p class="pv-h3" data-astro-cid-z2nrcivh>This preview link is not active.</p> <p class="pv-lede" data-astro-cid-z2nrcivh>Ask the studio for a new one.</p> </main>`}${!error && customer && !signedIn && renderTemplate`${renderComponent($$result, "PreviewGate", $$PreviewGate, {
		"slug": slug,
		"data-astro-cid-z2nrcivh": true
	})}`}${!error && customer && signedIn && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` ${renderComponent($$result, "PreviewHeader", $$PreviewHeader, {
		"home": `/${slug}`,
		"data-astro-cid-z2nrcivh": true
	})} <main class="pv-main" data-astro-cid-z2nrcivh> <section class="pv-wrap pv-title" data-astro-cid-z2nrcivh> <div class="pv-title-row" data-astro-cid-z2nrcivh> <h1 class="pv-h1" data-astro-cid-z2nrcivh>The collection</h1> <span class="pv-spacer" aria-hidden="true" data-astro-cid-z2nrcivh></span> ${renderComponent($$result, "PreviewControls", $$PreviewControls, {
		"rates": rates,
		"sort": true,
		"data-astro-cid-z2nrcivh": true
	})} </div> <p class="pv-lede" data-astro-cid-z2nrcivh> <span class="pv-wide-only" data-astro-cid-z2nrcivh>Every rug we have available. </span>Mark what draws you — and what
              doesn&rsquo;t.
</p> </section> ${tags.length > 0 && renderTemplate`<section class="pv-wrap" data-astro-cid-z2nrcivh> ${renderComponent($$result, "TagFilters", $$TagFilters, {
		"tags": tags,
		"data-astro-cid-z2nrcivh": true
	})} </section>`} <section class="pv-wrap" data-astro-cid-z2nrcivh> ${cards.length > 0 ? renderTemplate`<div class="pv-grid" data-astro-cid-z2nrcivh> ${cards.map((card, i) => renderTemplate`<div data-card${addAttribute(card.id, "data-rug")}${addAttribute(card.tags.map((t) => t.slug || tagSlug(t.name, catalogue.tags)).join(" "), "data-tags")}${addAttribute(visibleLikes(card.likes), "data-likes")} data-astro-cid-z2nrcivh> ${renderComponent($$result, "ProductCard", $$ProductCard, {
		"card": card,
		"rates": rates,
		"baseCurrency": baseCurrency,
		"href": `/${slug}/${encodeURIComponent(card.id)}`,
		"eager": i < 4,
		"priority": i === 0,
		"data-astro-cid-z2nrcivh": true
	})} </div>`)} </div>` : renderTemplate`<p class="pv-lede" data-astro-cid-z2nrcivh>No rugs published yet.</p>`} <p class="pv-lede" data-grid-empty hidden data-astro-cid-z2nrcivh>
Nothing matches that filter yet.
</p> </section> </main> ${renderComponent($$result, "PreviewFooter", $$PreviewFooter, { "data-astro-cid-z2nrcivh": true })} ` })}`}${(error || !customer) && renderTemplate`${renderComponent($$result, "PreviewFooter", $$PreviewFooter, { "data-astro-cid-z2nrcivh": true })}`}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/index.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/index.astro";
var $$url = "/[slug]";
//#endregion
//#region \0virtual:astro:page:src/pages/[slug]/index@_@astro
var page = () => _slug__exports;
//#endregion
export { page };
