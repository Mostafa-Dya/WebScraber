import { F as maybeRenderHead, H as unescapeHTML, I as renderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, j as renderSlot, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { X as SUPPORTED_CURRENCIES } from "./runtime_r-OJmEZZ.mjs";
import { a as STUDIO_NAME, n as STUDIO_EMAIL, t as prepaint_default } from "./prepaint_Cst9YLzz.mjs";
import { o as jsonForScript } from "./view_DFjKAQIO.mjs";
//#region src/components/customer/PreviewControls.astro
createAstro("https://astro.build");
var $$PreviewControls = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$PreviewControls;
	const { rates, sort = false } = Astro.props;
	const fromSheet = Object.keys(rates.rates).filter((c) => c in rates.symbols);
	const currencies = fromSheet.length ? ["USD", ...fromSheet.filter((c) => c !== "USD")] : [...SUPPORTED_CURRENCIES];
	return renderTemplate`${maybeRenderHead($$result)}<div class="pv-controls" data-astro-cid-nulwyfnx> <div class="pv-seg" id="unitTog" role="group" aria-label="Units" data-astro-cid-nulwyfnx> <button type="button" data-u="cm" class="on" aria-pressed="true" data-astro-cid-nulwyfnx>cm</button> <button type="button" data-u="ft" aria-pressed="false" data-astro-cid-nulwyfnx> <span class="pv-seg-long" data-astro-cid-nulwyfnx>ft / in</span><span class="pv-seg-short" data-astro-cid-nulwyfnx>ft</span> </button> </div> ${sort && renderTemplate`<div class="pv-select" data-astro-cid-nulwyfnx>  <select id="sortBy" aria-label="Sort rugs" data-astro-cid-nulwyfnx> <option value="featured" data-astro-cid-nulwyfnx>Featured</option> <option value="liked" data-astro-cid-nulwyfnx>Most liked</option> </select> <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false" data-astro-cid-nulwyfnx> <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-nulwyfnx></path> </svg> </div>`} <div class="pv-select" data-astro-cid-nulwyfnx> <select id="cur" aria-label="Currency" data-astro-cid-nulwyfnx> ${currencies.map((c) => renderTemplate`<option data-astro-cid-nulwyfnx>${c}</option>`)} </select> <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true" focusable="false" data-astro-cid-nulwyfnx> <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-nulwyfnx></path> </svg> </div> </div>  ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewControls.astro?astro&type=script&index=0&lang.ts")} ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewControls.astro?astro&type=script&index=1&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewControls.astro", void 0);
//#endregion
//#region src/components/customer/PreviewFooter.astro
var $$PreviewFooter = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${maybeRenderHead($$result)}<footer class="pv-footer" data-astro-cid-6utd2e3i> <div class="pv-footer-row" data-astro-cid-6utd2e3i> <div class="pv-footer-col" data-astro-cid-6utd2e3i> <p class="pv-h4" data-astro-cid-6utd2e3i>${STUDIO_NAME}</p> <p class="pv-footer-ask" data-astro-cid-6utd2e3i>Questions, or want to see one in person?</p> </div> <div class="pv-footer-col" data-astro-cid-6utd2e3i> <p class="pv-label pv-muted" data-astro-cid-6utd2e3i>Contact</p> <p class="pv-footer-email" data-astro-cid-6utd2e3i><a${addAttribute(`mailto:${STUDIO_EMAIL}`, "href")} data-astro-cid-6utd2e3i>${STUDIO_EMAIL}</a></p> </div> <div class="pv-footer-col pv-footer-fine" data-astro-cid-6utd2e3i> <p data-astro-cid-6utd2e3i>Prices are indicative and convert at an approximate rate.</p> <p data-astro-cid-6utd2e3i>The rugs you like are shared with ${STUDIO_NAME}.</p> </div> </div> </footer>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewFooter.astro", void 0);
//#endregion
//#region src/components/customer/PreviewHeader.astro
createAstro("https://astro.build");
var $$PreviewHeader = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$PreviewHeader;
	const { home, back } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<header${addAttribute(["pv-header", back && "pv-header--detail"], "class:list")} data-astro-cid-lgr6x3gv> ${back ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <a class="pv-back"${addAttribute(back.href, "href")}${addAttribute(back.label, "aria-label")} data-astro-cid-lgr6x3gv> <span aria-hidden="true" data-astro-cid-lgr6x3gv>←</span> <span class="pv-back-long" aria-hidden="true" data-astro-cid-lgr6x3gv> ${back.label} </span> ${back.shortLabel && renderTemplate`<span class="pv-back-short" aria-hidden="true" data-astro-cid-lgr6x3gv> ${back.shortLabel} </span>`} </a> <span class="pv-spacer" aria-hidden="true" data-astro-cid-lgr6x3gv></span>  <a class="pv-wordmark pv-wordmark-trailing pv-h4"${addAttribute(home, "href")} data-astro-cid-lgr6x3gv>
Serio Ludere
</a> ` })}` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <a class="pv-wordmark pv-h3"${addAttribute(home, "href")} data-astro-cid-lgr6x3gv>
Serio Ludere
</a> <span class="pv-spacer" aria-hidden="true" data-astro-cid-lgr6x3gv></span> ` })}`} </header>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewHeader.astro", void 0);
//#endregion
//#region src/components/customer/PreviewLayout.astro
createAstro("https://astro.build");
var $$PreviewLayout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$PreviewLayout;
	const { title, rates, customer } = Astro.props;
	return renderTemplate`<html lang="en" data-mode="preview"${addAttribute(customer, "data-customer")}> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet"><link rel="expect" href="#pv-ready" blocking="render"><script type="application/json" id="sl-rates">${unescapeHTML(jsonForScript(rates))}<\/script>${renderHead($$result)}</head> <body class="pv"> ${renderSlot($$result, $$slots["default"])} <script>${unescapeHTML(prepaint_default)}<\/script><span id="pv-ready" hidden></span> </body> </html>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewLayout.astro", void 0);
//#endregion
//#region src/components/customer/Reactions.astro
createAstro("https://astro.build");
var $$Reactions = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Reactions;
	const { rugId, mode = "card" } = Astro.props;
	const showDislike = mode === "detail";
	return renderTemplate`${maybeRenderHead($$result)}<div class="pv-react" data-react${addAttribute(rugId, "data-rug")} data-astro-cid-b63lxulx> <button type="button" class="pv-circle" data-vote="like"${addAttribute(mode, "data-source")}${addAttribute(rugId, "data-rug")} aria-pressed="false" data-astro-cid-b63lxulx> <span class="pv-glyph" aria-hidden="true" data-astro-cid-b63lxulx> <svg viewBox="0 0 16 16" width="16" height="16" fill="none" data-astro-cid-b63lxulx> <path d="M8 13.4C8 13.4 2.6 10.2 2.6 6.6C2.40109 5.88392 2.49479 5.11814 2.86048 4.47114C3.22618 3.82414 3.83392 3.34891 4.55 3.15C5.26608 2.95109 6.03186 3.04479 6.67886 3.41048C7.32586 3.77618 7.80109 4.38392 8 5.1C8.19891 4.38392 8.67414 3.77618 9.32114 3.41048C9.96814 3.04479 10.7339 2.95109 11.45 3.15C12.1661 3.34891 12.7738 3.82414 13.1395 4.47114C13.5052 5.11814 13.5989 5.88392 13.4 6.6C13.4 10.2 8 13.4 8 13.4Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-b63lxulx></path> </svg> </span> <span class="sr-only" data-astro-cid-b63lxulx>Like this rug</span> </button> ${showDislike && renderTemplate`<button type="button" class="pv-circle" data-vote="dislike"${addAttribute(mode, "data-source")}${addAttribute(rugId, "data-rug")} aria-pressed="false" data-astro-cid-b63lxulx> <span class="pv-glyph" aria-hidden="true" data-astro-cid-b63lxulx> <svg viewBox="0 0 16 16" width="16" height="16" fill="none" data-astro-cid-b63lxulx> <path d="M4 4L12 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-b63lxulx></path> <path d="M12 4L4 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-b63lxulx></path> </svg> </span> <span class="sr-only" data-astro-cid-b63lxulx>Not for me</span> </button>`} <span class="pv-sync" data-react-sync aria-hidden="true" data-astro-cid-b63lxulx></span> <span class="pv-alert" data-react-alert aria-hidden="true" data-astro-cid-b63lxulx> <svg viewBox="0 0 12 12" width="12" height="12" fill="none" data-astro-cid-b63lxulx> <path d="M6 1.5 11 10.5H1L6 1.5Z" stroke="currentColor" stroke-linejoin="round" data-astro-cid-b63lxulx></path> <path d="M6 5v2.2" stroke="currentColor" stroke-linecap="round" data-astro-cid-b63lxulx></path> <path d="M6 8.9v.1" stroke="currentColor" stroke-linecap="round" data-astro-cid-b63lxulx></path> </svg> </span> </div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/customer/Reactions.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/customer/Reactions.astro", void 0);
//#endregion
export { $$PreviewControls as a, $$PreviewFooter as i, $$PreviewLayout as n, $$PreviewHeader as r, $$Reactions as t };
