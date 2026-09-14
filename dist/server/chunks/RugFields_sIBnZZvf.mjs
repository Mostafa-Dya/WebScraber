import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { pt as driveImageUrl } from "./runtime_r-OJmEZZ.mjs";
//#region src/components/admin/Chips.astro
createAstro("https://astro.build");
var $$Chips = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Chips;
	const { id, label, chips, multi = false } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<div class="chips"${addAttribute(id, "id")} role="group"${addAttribute(label, "aria-label")}${addAttribute(multi ? "true" : "false", "data-multi")}> ${chips.map((c) => renderTemplate`<button type="button"${addAttribute(["chip", { on: c.pressed === true }], "class:list")}${addAttribute(c.value, "data-value")}${addAttribute(c.pressed ? "true" : "false", "aria-pressed")}> ${c.label} ${c.count !== void 0 && ` ${c.count}`} </button>`)} </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/Chips.astro", void 0);
//#endregion
//#region src/components/ui/Checkbox.astro
createAstro("https://astro.build");
var $$Checkbox = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Checkbox;
	const { name, id = name, label, checked = false, indeterminate = false, disabled = false, value, class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<label${addAttribute(["check", className], "class:list")}${addAttribute(id, "for")}> <input class="check__box" type="checkbox"${addAttribute(id, "id")}${addAttribute(name, "name")}${addAttribute(value, "value")}${addAttribute(checked, "checked")}${addAttribute(disabled, "disabled")}${addAttribute(indeterminate ? "true" : void 0, "data-indeterminate")}> <span>${label}</span> </label>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Checkbox.astro", void 0);
//#endregion
//#region src/components/ui/MultiSelect.astro
createAstro("https://astro.build");
var $$MultiSelect = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$MultiSelect;
	const { id, name, label, options, placeholder = "Select…", required = false, class: className } = Astro.props;
	const chosen = options.filter((o) => o.selected === true);
	const summary = chosen.length === 0 ? placeholder : chosen[0].label;
	const extra = chosen.length > 1 ? `+${chosen.length - 1}` : "";
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["msel", className], "class:list")}${addAttribute(id, "id")} data-multi-select${addAttribute(placeholder, "data-placeholder")}${addAttribute(required ? "true" : void 0, "data-required")}> <details class="msel__wrap"> <summary class="msel__trigger"> <span class="msel__label sr-only">${label}</span> <span${addAttribute(["msel__value", { "is-empty": chosen.length === 0 }], "class:list")} data-msel-value> ${summary} </span> ${extra && renderTemplate`<span class="msel__more" data-msel-more> ${extra} </span>`} <svg class="msel__chevron" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"> <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path> </svg> </summary> <div class="msel__panel" role="group"${addAttribute(label, "aria-label")}> ${options.map((o) => renderTemplate`${renderComponent($$result, "Checkbox", $$Checkbox, {
		"class": "msel__opt",
		"id": `${id}__${o.value.replace(/[^A-Za-z0-9_-]+/g, "-")}`,
		"name": name,
		"value": o.value,
		"label": o.label,
		"checked": o.selected === true
	})}`)} ${options.length === 0 && renderTemplate`<p class="msel__empty">No collections yet — add one first.</p>`} </div> </details> </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/MultiSelect.astro", void 0);
//#endregion
//#region src/components/admin/RugFields.astro
createAstro("https://astro.build");
var $$RugFields = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugFields;
	const { mode, rug, collections, tags, defaultStatus, roundStep, driveScopeOk, nextId, fetchButton = true } = Astro.props;
	const edit = mode === "edit";
	const v = (s) => s === void 0 ? "" : String(s);
	const pressed = new Set(rug?.tags.map((t) => t.toLowerCase()) ?? []);
	const tagChips = tags.map((t) => ({
		value: t.name,
		label: t.name,
		pressed: pressed.has(t.name.toLowerCase())
	}));
	const status = rug?.status ?? defaultStatus;
	const openSite = rug ? `/rugs/${rug.slug}` : "#";
	const chosenCollections = new Set((rug?.collections ?? []).map((c) => c.trim().toLowerCase()));
	return renderTemplate` ${maybeRenderHead($$result)}<div class="addform">  <div class="f"> <label for="f_id">Rug number (id)</label> <input id="f_id"${addAttribute(rug?.id ?? nextId ?? "", "value")}${addAttribute(edit, "readonly")} autocomplete="off"> <p class="hint">Must be unique. It names the Drive folder and keys the sheet row.</p> </div> <div class="row"> ${!edit && renderTemplate`<div class="f grow"> <label for="yourName">Your name for this rug</label> <input id="yourName" placeholder="e.g. Khal Mohammadi" autocomplete="off"> </div>`} <div class="f narrow"> <span class="f__legend">Collections</span> ${renderComponent($$result, "MultiSelect", $$MultiSelect, {
		"id": "f_collection",
		"name": "collection",
		"label": "Collections",
		"placeholder": "Choose collections…",
		"required": true,
		"options": collections.map((c) => ({
			value: c.name,
			label: c.name,
			selected: chosenCollections.has(c.name.trim().toLowerCase())
		}))
	})} </div> </div> <div class="f"> <span class="f__legend">Tags</span> <div class="tagrow"> ${renderComponent($$result, "Chips", $$Chips, {
		"id": "tagChips",
		"label": "Tags",
		"chips": tagChips,
		"multi": true
	})} <div class="newtag"> <label class="sr-only" for="newTag">New tag name</label> <input id="newTag" placeholder="New tag" autocomplete="off"> <button class="chip" id="btnNewTag" type="button">
Add tag
</button> </div> </div> </div> ${!edit && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <div class="f"> <label for="url">Supplier product link</label> <div class="row"> <div class="grow"> <input id="url" placeholder="ecarpetgallery.com or karavanrug.com" inputmode="url" autocomplete="off"> </div> ${fetchButton && renderTemplate`<button class="go" id="btnFetch" type="button">
Fetch
</button>`} </div> </div> <p class="hint">Your name is what clients see. The link only supplies size, material, age and price.</p> <p class="hint" id="supplierTitle" hidden></p> <div id="m1" class="msg"></div> ` })}`} </div> <div id="preview"${addAttribute(["preview", { on: edit }], "class:list")}> <div class="fields"> <div class="f"> <label for="f_slug">Slug (URL)</label> <div class="pair"> <input id="f_slug"${addAttribute(rug?.slug ?? "", "value")} autocomplete="off"> <button class="chip" id="btnSlug" type="button" title="Regenerate from the name">↻</button> </div> </div> <div class="f"> <label for="f_name">Name (what clients see)</label> <input id="f_name"${addAttribute(rug?.name ?? "", "value")} autocomplete="off"> </div> <div class="f wide"> <label for="f_description">Description</label> <textarea id="f_description" rows="3">${rug?.description ?? ""}</textarea> </div> <div class="f"> <label for="f_width">Width (cm)</label> <input id="f_width" inputmode="numeric"${addAttribute(v(rug?.widthCm), "value")}> </div> <div class="f"> <label for="f_length">Length (cm)</label> <div class="pair"> <input id="f_length" inputmode="numeric"${addAttribute(v(rug?.lengthCm), "value")}> <button class="chip" id="btnSwap" type="button" title="Swap width and length">⇄</button> </div> </div> <div class="f"> <label for="f_material">Material</label> <input id="f_material"${addAttribute(rug?.material ?? "", "value")}> </div> <div class="f"> <label for="f_method">Method</label> <input id="f_method"${addAttribute(rug?.method ?? "", "value")}> </div> <div class="f"> <label for="f_age">Age</label> <input id="f_age"${addAttribute(rug?.age ?? "", "value")}> </div> <div class="f"> <label for="f_origin">Origin</label> <input id="f_origin"${addAttribute(rug?.origin ?? "", "value")}> </div> <div class="f"> <label for="f_price">Retail price (USD)</label> <div class="pair"> <input id="f_price" inputmode="decimal"${addAttribute(v(rug?.priceUsd), "value")}> <button class="chip" id="btnRound" type="button">Round to ${roundStep}</button> </div> </div> <div class="f"> <label for="f_rotate">Rotate</label> <select id="f_rotate"> <option value="false"${addAttribute((rug?.rotate ?? "false") === "false", "selected")}>no</option> <option value="true"${addAttribute(rug?.rotate === "true", "selected")}>portrait (turn a landscape file)</option> <option value="force"${addAttribute(rug?.rotate === "force", "selected")}>force</option> </select> </div> <div class="f"> <label for="f_status">Status</label> <select id="f_status"> <option value="active"${addAttribute(status === "active", "selected")}>active</option> <option value="draft"${addAttribute(status === "draft", "selected")}>draft</option> <option value="archived"${addAttribute(status === "archived", "selected")}>archived</option> </select> </div> <div class="f"> <label class="chk" for="f_featured"><input type="checkbox" id="f_featured"${addAttribute(rug?.featured === true, "checked")}> Featured</label> </div> <div class="f"> <label for="f_sourceUrl">Supplier link</label> <input id="f_sourceUrl" inputmode="url"${addAttribute(rug?.sourceUrl ?? "", "value")} autocomplete="off"> </div> <div class="f"> <label for="f_supplier">Supplier</label> <select id="f_supplier"> <option value=""${addAttribute(!rug?.supplier, "selected")}>— owned / other</option> <option value="ecarpetgallery"${addAttribute(rug?.supplier === "ecarpetgallery", "selected")}>ecarpetgallery</option> <option value="karavanrug"${addAttribute(rug?.supplier === "karavanrug", "selected")}>karavanrug</option> </select> </div> <div class="f"> <label for="f_supplierRef">Supplier ref</label> <input id="f_supplierRef"${addAttribute(rug?.supplierRef ?? "", "value")} autocomplete="off"> </div> <div class="f wide"> <label for="f_notes">Notes (internal)</label> <textarea id="f_notes" rows="2">${rug?.notes ?? ""}</textarea> </div> </div> <p class="hint" id="ftHint" hidden></p> <p class="hint" id="priceHint" hidden></p> <p class="hint" id="tagHint" hidden></p> <ul class="hint warnings" id="warnings" hidden></ul> <div class="stack"> <h3>Photos <span class="cnt-inline" id="photoCount"></span></h3> <div id="photoStrip" class="grid photos"> ${rug?.photos.map((id, i) => renderTemplate`<div class="card tile"> <div class="ph"> <img${addAttribute(driveImageUrl(id, 800), "src")} alt="" loading="lazy"> </div> <div class="mt"> ${i + 1} · ${id} </div> </div>`)} </div> <p class="hint" id="photoHint" hidden>
Drive is not authorised — photos are not saved; paste Drive ids below instead (SHEET_SETUP §6).
</p> <div class="f wide"> <label for="f_photos">Drive photo ids or links — one per line, first = card image</label> <textarea id="f_photos" rows="3">${rug?.photos.join("\n") ?? ""}</textarea> </div> </div> <div class="actions"> ${!edit && renderTemplate`<label class="chk"> <input type="checkbox" id="savePhotos"${addAttribute(driveScopeOk === true, "checked")}${addAttribute(driveScopeOk !== true, "disabled")}>
Save photos to Drive
</label>`} <label class="chk"> <input type="checkbox" id="roundOnSave"${addAttribute(!edit, "checked")}>
Round price to ${roundStep} on save
</label> ${!edit && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <button class="go" id="btnAdd" type="button">
Add to sheet
</button> <button class="go alt" id="btnClear" type="button">
Clear
</button> ` })}`} ${edit && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <button class="go" id="btnSave" type="button">
Save
</button> <button class="go alt" id="btnArchive" type="button"${addAttribute(status === "archived", "hidden")}>
Archive
</button> <button class="go alt" id="btnRestore" type="button"${addAttribute(status !== "archived", "hidden")}>
Restore
</button> <a id="openSite" class="chip"${addAttribute(openSite, "href")} target="_blank" rel="noopener"${addAttribute(status === "active" ? void 0 : "true", "aria-disabled")}>
Open on site
</a> ` })}`} </div> <div id="m2" class="msg"></div> <input type="hidden" id="f_version"${addAttribute(rug?.version ?? "", "value")}> ${edit && rug && renderTemplate`<p class="hint mono">
❤ ${rug.likes} · 👎 ${rug.dislikes} · rating ${rug.rating.toFixed(2)} · row ${rug.row} · created${" "} ${rug.scrapedAt || "—"} · updated ${rug.scrapedAt || "—"} </p>`} </div> ${edit && renderTemplate`<dialog id="confirm"> <p id="confirmText"></p> <div class="actions"> <button class="go" id="confirmYes" type="button">
Yes
</button> <button class="go alt" id="confirmNo" type="button">
Cancel
</button> </div> </dialog>`}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/RugFields.astro", void 0);
//#endregion
export { $$Chips as n, $$RugFields as t };
