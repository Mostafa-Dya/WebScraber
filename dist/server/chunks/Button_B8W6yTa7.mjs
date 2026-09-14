import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, T as spreadAttributes, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { n as $$Icon } from "./AdminLayout_cxitWCxh.mjs";
//#region src/components/ui/Button.astro
createAstro("https://astro.build");
var $$Button = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Button;
	const { style = "primary", href, type = "button", disabled = false, loading = false, loadingLabel = "Saving…", icon, class: className, ...rest } = Astro.props;
	const classes = [
		"btn",
		`btn--${style}`,
		loading && "is-loading",
		className
	].filter(Boolean).join(" ");
	const isInert = disabled || loading;
	return renderTemplate`${href ? renderTemplate`${maybeRenderHead($$result)}<a${addAttribute(isInert ? void 0 : href, "href")}${addAttribute(classes, "class")}${addAttribute(isInert ? "true" : void 0, "aria-disabled")}${addAttribute(loading ? "true" : void 0, "aria-busy")}${addAttribute(isInert ? "link" : void 0, "role")}${spreadAttributes(rest)}> ${icon && renderTemplate`${renderComponent($$result, "Icon", $$Icon, {
		"name": icon,
		"class": "btn__icon"
	})}`} ${loading ? loadingLabel : renderTemplate`${renderSlot($$result, $$slots["default"])}`} </a>` : renderTemplate`<button${addAttribute(type, "type")}${addAttribute(classes, "class")}${addAttribute(isInert, "disabled")}${addAttribute(loading ? "true" : void 0, "aria-busy")}${spreadAttributes(rest)}> ${icon && renderTemplate`${renderComponent($$result, "Icon", $$Icon, {
		"name": icon,
		"class": "btn__icon"
	})}`} ${loading ? loadingLabel : renderTemplate`${renderSlot($$result, $$slots["default"])}`} </button>`}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Button.astro", void 0);
//#endregion
export { $$Button as t };
