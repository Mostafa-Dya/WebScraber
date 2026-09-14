import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, H as unescapeHTML, L as addAttribute, O as renderComponent, P as renderTemplate, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { n as templateEnter, r as templateExit, t as $$Modal } from "./Modal_BPowp8-c.mjs";
import { i as getClient, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { d as syncLabel, i as fetchAdminSnapshot } from "./read_BGHurOvf.mjs";
import { o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { n as $$Icon, t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$Button } from "./Button_B8W6yTa7.mjs";
import { t as $$EmptyState } from "./EmptyState_Ngnao7-F.mjs";
import { t as $$Input } from "./Input_DRZzK1XW.mjs";
//#region src/pages/admin/collections.astro
var collections_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Collections,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
var $$Collections = createComponent(async ($$result, $$props, $$slots) => {
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin collections read failed", { error: safe });
		error = safe.message;
	}
	const rugs = snapshot?.rugs ?? [];
	const rugCount = (name) => rugs.filter((r) => r.collection.trim().toLowerCase() === name.trim().toLowerCase()).length;
	const tagCount = (name) => rugs.filter((r) => r.tags.some((t) => t.trim().toLowerCase() === name.trim().toLowerCase())).length;
	const collections = (snapshot?.collections ?? []).slice().sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name));
	const tags = snapshot?.tags ?? [];
	const data = {
		collections: collections.map((c) => ({
			...c,
			rugs: rugCount(c.name)
		})),
		tags: tags.map((t) => ({
			...t,
			rugs: tagCount(t.name)
		}))
	};
	const syncLabel_ = snapshot ? syncLabel(snapshot.fetchedAt) : void 0;
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Collections",
		"active": "collections",
		"meta": syncLabel_
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}<section class="stack" aria-labelledby="h-collections"> <div class="page-head"> <div class="page-head__titles"> <h1 class="page-head__title">Collections</h1> <p class="page-head__count" id="collectionCount"> ${collections.length} ${collections.length === 1 ? "collection" : "collections"} </p> </div> <span class="page-head__rule"></span> ${renderComponent($$result, "Button", $$Button, {
		"icon": "plus",
		"data-open": "new-collection"
	}, { "default": ($$result) => renderTemplate`New collection` })} </div> <p class="hint">
Order = the tabs on the site. Renaming a collection does not rewrite its rugs — they keep the old name
      and drop out of the tab until re-saved.
</p> <div id="m5" class="msg"></div> <div class="crow__columns" aria-hidden="true"> <span class="crow__col-name">Collection</span> <span class="crow__rule"></span> <span class="crow__col-count">Products</span> </div> <ul class="crow-list" id="collectionList" aria-labelledby="h-collections"> ${collections.map((c, i) => renderTemplate`<li class="crow"${addAttribute(c.id, "data-id")}${addAttribute(c.version, "data-version")}${addAttribute(c.name, "data-name")}${addAttribute(String(c.sortOrder ?? i + 1), "data-order")}${addAttribute(c.slug, "data-slug")}> <div class="crow__head"> <span class="crow__name">${c.name}</span> <span class="crow__rule"></span> <span class="crow__count"> ${rugCount(c.name)} ${rugCount(c.name) === 1 ? "product" : "products"} </span>  <button type="button" class="btn btn--ghost crow__move crow__move--up" data-act="up"${addAttribute(i === 0, "disabled")}${addAttribute(`Move ${c.name} up`, "aria-label")}> ${renderComponent($$result, "Icon", $$Icon, { "name": "chevron-down" })} </button> <button type="button" class="btn btn--ghost crow__move" data-act="down"${addAttribute(i === collections.length - 1, "disabled")}${addAttribute(`Move ${c.name} down`, "aria-label")}> ${renderComponent($$result, "Icon", $$Icon, { "name": "chevron-down" })} </button> <button type="button" class="btn btn--ghost" data-act="edit">
Edit
</button> </div> ${c.description && renderTemplate`<p class="crow__description">${c.description}</p>`} ${c.description && renderTemplate`<button type="button" class="crow__more" data-act="expand">
See more
</button>`} <div class="crow__edit" hidden> <input class="input" data-field="name"${addAttribute(c.name, "value")}${addAttribute(`Name of ${c.name}`, "aria-label")}> <input class="input" data-field="description"${addAttribute(c.description, "value")}${addAttribute(`Description of ${c.name}`, "aria-label")}> <input class="input" data-field="cover"${addAttribute(c.coverImageUrl ?? "", "value")}${addAttribute(`Cover of ${c.name}`, "aria-label")}> <button type="button" class="btn btn--primary" data-act="save">
Save
</button> <button type="button" class="btn btn--ghost" data-act="cancel">
Cancel
</button> </div> </li>`)} </ul> ${collections.length === 0 && renderTemplate`${renderComponent($$result, "EmptyState", $$EmptyState, {
		"type": "first-run",
		"title": "No collections yet",
		"message": "Collections group the catalogue for the buyer. A rug can sit in several at once."
	})}`} <p class="hint">
Each collection carries its own description. Collapsed clamps it to one line so the list stays
      scannable; See more expands that row in place rather than navigating away, so two collections can be
      compared side by side.
</p> ${renderComponent($$result, "Modal", $$Modal, {
		"id": "new-collection",
		"title": "New collection"
	}, {
		"default": ($$result) => renderTemplate` <p>Collections group the catalogue for the buyer. A rug can sit in several at once.</p> <div class="modal__fields"> ${renderComponent($$result, "Input", $$Input, {
			"name": "c_name",
			"label": "Name",
			"placeholder": "Shiraz",
			"hint": "Required, and must be unique."
		})} ${renderComponent($$result, "Input", $$Input, {
			"type": "textarea",
			"name": "c_description",
			"label": "Description",
			"hint": "Shown to buyers on the collection. The list clamps it to one line and expands on See more."
		})} ${renderComponent($$result, "Input", $$Input, {
			"name": "c_cover",
			"label": "Cover image (Drive id / URL)"
		})} </div>  `,
		"footer": ($$result) => renderTemplate`${renderComponent($$result, "Fragment", Fragment, { "slot": "footer" }, { "default": ($$result) => renderTemplate` ${renderComponent($$result, "Button", $$Button, {
			"style": "ghost",
			"data-close": "new-collection"
		}, { "default": ($$result) => renderTemplate`Cancel` })} ${renderComponent($$result, "Button", $$Button, {
			"id": "btnAddCollection",
			"icon": "plus"
		}, { "default": ($$result) => renderTemplate`Create collection` })} ` })}`
	})} <div id="m6" class="msg"></div> </section> <section class="stack" aria-labelledby="h-tags"> <h3 id="h-tags">Tags</h3> <p class="hint">Click a tag to rename it or change its colour. Rugs keep the tag names they store.</p> <div class="chips" id="tagList" role="group" aria-label="Tags"> ${tags.map((t) => renderTemplate`<button type="button" class="chip"${addAttribute(t.id, "data-id")}${addAttribute(t.version, "data-version")}${addAttribute(t.name, "data-name")}${addAttribute(t.color ?? "", "data-color")}${addAttribute(tagCount(t.name), "data-rugs")}> ${t.name} </button>`)} </div> ${tags.length === 0 && renderTemplate`<div class="msg busy on">No tags yet.</div>`} <div id="tagEdit" class="fields" hidden> <div class="f"> <label for="t_name">Tag name</label> <input id="t_name" autocomplete="off"> </div> <div class="f"> <label for="t_color">Colour</label> <input id="t_color" type="color" value="#bb3e03"> </div> <div class="f"> <label class="chk" for="t_noColor"><input type="checkbox" id="t_noColor"> no colour</label> </div> <div class="f actions"> <button class="go" id="btnSaveTag" type="button">Save tag</button> <button class="go alt" id="btnCancelTag" type="button">Cancel</button> </div> <p class="hint" id="tagEditHint"></p> </div> <div id="m7" class="msg"></div> <div class="fields"> <div class="f"> <label for="nt_name">New tag</label> <input id="nt_name" placeholder="Name" autocomplete="off"> </div> <div class="f"> <label for="nt_color">Colour (optional)</label> <input id="nt_color" type="color" value="#bb3e03"> </div> <div class="f"> <label class="chk" for="nt_noColor"><input type="checkbox" id="nt_noColor" checked> no colour</label> </div> </div> <div class="actions"> <button class="go" id="btnAddTag" type="button">Add tag</button> </div> <div id="m8" class="msg"></div> </section> <template id="moveTpl">${templateEnter($$result)}<button type="button" class="btn btn--ghost crow__move">${renderComponent($$result, "Icon", $$Icon, { "name": "chevron-down" })}</button>${templateExit($$result)}</template> <script type="application/json" id="admin-data">${unescapeHTML(jsonForScript(data))}<\/script>${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/collections.astro?astro&type=script&index=0&lang.ts")}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/collections.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/collections.astro";
var $$url = "/admin/collections";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/collections@_@astro
var page = () => collections_exports;
//#endregion
export { page };
