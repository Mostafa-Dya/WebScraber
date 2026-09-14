import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { n as $$Icon } from "./AdminLayout_cxitWCxh.mjs";
//#region src/components/ui/CopyButton.astro
createAstro("https://astro.build");
var $$CopyButton = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$CopyButton;
	const { value, label = "Copy link", copiedLabel = "Copied", class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<button type="button"${addAttribute(["copy", className], "class:list")}${addAttribute(value, "data-copy")}${addAttribute(copiedLabel, "data-copied-label")}${addAttribute(label, "data-label")}> ${renderComponent($$result, "Icon", $$Icon, {
		"name": "copy",
		"class": "copy__icon--default"
	})} ${renderComponent($$result, "Icon", $$Icon, {
		"name": "check",
		"class": "copy__icon--copied"
	})} <span data-copy-label>${label}</span> </button>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/CopyButton.astro", void 0);
//#endregion
export { $$CopyButton as t };
