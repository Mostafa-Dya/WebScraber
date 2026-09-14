import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, R as createRenderInstruction, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { n as $$Icon } from "./AdminLayout_cxitWCxh.mjs";
//#region node_modules/astro/dist/runtime/server/render/template-depth.js
function templateEnter(_result) {
	return createRenderInstruction({ type: "template-enter" });
}
function templateExit(_result) {
	return createRenderInstruction({ type: "template-exit" });
}
//#endregion
//#region src/components/ui/Modal.astro
createAstro("https://astro.build");
var $$Modal = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Modal;
	const { id, title, class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<dialog${addAttribute(id, "id")}${addAttribute(["modal", className], "class:list")}${addAttribute(`${id}-title`, "aria-labelledby")}> <div class="modal__header"> <h2 class="modal__title"${addAttribute(`${id}-title`, "id")}>${title}</h2> <button type="button" class="modal__close"${addAttribute(id, "data-close")}> ${renderComponent($$result, "Icon", $$Icon, { "name": "close" })} <span class="sr-only">Close</span> </button> </div> <div class="modal__body">${renderSlot($$result, $$slots["default"])}</div> <div class="modal__footer">${renderSlot($$result, $$slots["footer"])}</div> </dialog>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Modal.astro", void 0);
//#endregion
export { templateEnter as n, templateExit as r, $$Modal as t };
