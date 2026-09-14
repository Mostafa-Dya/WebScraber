import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, T as spreadAttributes, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { n as $$Icon } from "./AdminLayout_cxitWCxh.mjs";
//#region src/components/ui/Input.astro
createAstro("https://astro.build");
var $$Input = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Input;
	const { type = "text", name, id = name, label, hideLabel = false, value, placeholder, hint, error, errorTone = "danger", required = false, disabled = false, readonly = false, rows, class: className, ...rest } = Astro.props;
	const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : void 0;
	const inputClasses = [
		"input",
		`input--${type}`,
		error && errorTone === "danger" && "is-error",
		className
	].filter(Boolean).join(" ");
	const shared = {
		id,
		name,
		"aria-invalid": error && errorTone === "danger" ? "true" : void 0,
		"aria-describedby": describedBy,
		required,
		disabled,
		readonly,
		...rest
	};
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["field", className], "class:list")}> <label${addAttribute(["field__label", hideLabel && "sr-only"], "class:list")}${addAttribute(id, "for")}>${label}</label> <div class="input-wrap"> ${type === "textarea" ? renderTemplate`<textarea${addAttribute(inputClasses, "class")}${addAttribute(placeholder, "placeholder")}${addAttribute(rows ?? 3, "rows")}${spreadAttributes(shared)}>
          ${value}
        </textarea>` : type === "select" ? renderTemplate`<select${addAttribute(inputClasses, "class")}${spreadAttributes(shared)}> ${renderSlot($$result, $$slots["default"])} </select>` : renderTemplate`<input${addAttribute(inputClasses, "class")}${addAttribute(type, "type")}${addAttribute(value, "value")}${addAttribute(placeholder, "placeholder")}${spreadAttributes(shared)}>`} ${type === "select" && renderTemplate`${renderComponent($$result, "Icon", $$Icon, {
		"name": "chevron-down",
		"class": "input__affordance"
	})}`} ${type === "password" && renderTemplate`<button type="button" class="input__affordance"${addAttribute(id, "data-reveal")}${addAttribute(id, "aria-controls")} aria-pressed="false"> ${renderComponent($$result, "Icon", $$Icon, {
		"name": "eye",
		"data-glyph": "eye"
	})} ${renderComponent($$result, "Icon", $$Icon, {
		"name": "eye-off",
		"data-glyph": "eye-off",
		"hidden": true
	})} <span class="sr-only">Show password</span> </button>`} </div> ${hint && !error && renderTemplate`<p class="field__message"${addAttribute(`${id}-hint`, "id")}> ${hint} </p>`} ${error && renderTemplate`<p${addAttribute(["field__message", `field__message--${errorTone}`], "class:list")}${addAttribute(`${id}-error`, "id")}${addAttribute(errorTone === "danger" ? "alert" : void 0, "role")}> ${error} </p>`} </div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Input.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Input.astro", void 0);
//#endregion
export { $$Input as t };
