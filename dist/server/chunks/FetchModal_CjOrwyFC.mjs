import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { n as $$Icon } from "./AdminLayout_cxitWCxh.mjs";
//#region src/components/ui/FetchModal.astro
createAstro("https://astro.build");
var $$FetchModal = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$FetchModal;
	const { id, title = "Fetched result", loading = false, class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<dialog${addAttribute(id, "id")}${addAttribute(["fetch", className], "class:list")}${addAttribute(`${id}-title`, "aria-labelledby")}> <div class="fetch__header"> <h2 class="fetch__title"${addAttribute(`${id}-title`, "id")} data-fetch-title>${title}</h2> <button type="button" class="fetch__close"${addAttribute(id, "data-close")}> ${renderComponent($$result, "Icon", $$Icon, { "name": "close" })} <span class="sr-only">Close</span> </button> </div>  <div class="fetch__bar" role="progressbar" aria-label="Fetching" data-fetch-bar${addAttribute(!loading, "hidden")}></div> <div class="fetch__body" data-fetch-body>${renderSlot($$result, $$slots["default"])}</div> <div class="fetch__footer" data-fetch-footer>${renderSlot($$result, $$slots["footer"])}</div> </dialog>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/FetchModal.astro", void 0);
//#endregion
export { $$FetchModal as t };
