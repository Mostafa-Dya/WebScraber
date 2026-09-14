import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as $$RugCard } from "./RugCard_BzgykWOb.mjs";
//#region src/components/RugGrid.astro
createAstro("https://astro.build");
var $$RugGrid = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugGrid;
	const { cards, rates, active, state, error = false, eager = 0, hrefFor } = Astro.props;
	let left = eager;
	const loadMode = cards.map((c) => {
		if (!(active === void 0 || c.collectionSlugs.includes(active)) || left <= 0) return "lazy";
		left -= 1;
		return left === eager - 1 ? "priority" : "eager";
	});
	const retry = Astro.url.pathname + Astro.url.search;
	const ghosts = Array.from({ length: 8 }, (_, i) => i);
	return renderTemplate`${maybeRenderHead($$result)}<main> ${state && !error && cards.length === 0 && renderTemplate`<div class="plate-empty" data-plate data-empty data-ar="3-4" aria-hidden="true"> <div class="ph-art" data-ar="3-4"> <span class="ph-rug"></span> </div> <div class="ph">photo to come</div> </div>`} ${state && renderTemplate`<div id="state" class="state"${addAttribute(error ? "status" : void 0, "role")}> ${state} ${error && renderTemplate`<a class="retry"${addAttribute(retry, "href")}>
Try again
</a>`} </div>`} ${error && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <p class="sr-only">Loading catalogue</p> <div class="grid ghost" aria-hidden="true"> ${ghosts.map(() => renderTemplate`<div class="card"> <div class="sk sk-plate"></div> <div class="sk sk-line w60"></div> <div class="sk sk-line w40"></div> <div class="sk sk-line w30"></div> <div class="sk sk-line w20"></div> </div>`)} </div> ` })}`} <p id="grid-live" class="sr-only" aria-live="polite"></p> ${cards.length > 0 && renderTemplate`<div id="grid" class="grid" role="tabpanel" aria-label="Rugs"> ${cards.map((card, i) => renderTemplate`${renderComponent($$result, "RugCard", $$RugCard, {
		"card": card,
		"rates": rates,
		"hidden": active !== void 0 && !card.collectionSlugs.includes(active),
		"eager": loadMode[i] !== "lazy",
		"priority": loadMode[i] === "priority",
		"href": hrefFor ? hrefFor(card) : void 0
	})}`)} </div>`} </main>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/RugGrid.astro", void 0);
//#endregion
export { $$RugGrid as t };
