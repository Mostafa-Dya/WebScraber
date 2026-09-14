import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, H as unescapeHTML, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { E as collectionSlugs, T as collectionSlug, i as getClient, pt as driveImageUrl, v as orderedCollectionNames, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime } from "./http_BC0ewnLg.mjs";
import { d as syncLabel, f as defaultStatusOf, g as roundStepOf, i as fetchAdminSnapshot } from "./read_BGHurOvf.mjs";
import { h as dataRot, i as badgesFor, o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { t as dims } from "./units_BFAJ7W-k.mjs";
import { n as $$Icon, t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$Button } from "./Button_B8W6yTa7.mjs";
import { t as $$EmptyState } from "./EmptyState_Ngnao7-F.mjs";
import { t as $$Input } from "./Input_DRZzK1XW.mjs";
import { n as $$Chips, t as $$RugFields } from "./RugFields_sIBnZZvf.mjs";
import { t as $$FetchModal } from "./FetchModal_CjOrwyFC.mjs";
import { n as nextRugId } from "./ids_DwaqsSKD.mjs";
import { i as driveScope, m as reservedIds } from "./_shared_Bzx2ocTH.mjs";
//#region src/components/admin/RugCardAdmin.astro
createAstro("https://astro.build");
var $$RugCardAdmin = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugCardAdmin;
	const { rug, collections } = Astro.props;
	const photo = rug.photos[0] ? driveImageUrl(rug.photos[0], 800) : void 0;
	const meta = [dims(rug.widthCm, rug.lengthCm, "cm")].filter(Boolean);
	const price = rug.priceUsd ? `$${rug.priceUsd.toLocaleString("en-US")}` : "";
	const slug = rug.collection.trim() ? collectionSlug(rug.collection, collections) : "";
	const slugs = rug.collections.length ? collectionSlugs(rug.collections, collections).join(" ") : "";
	const search = [
		rug.name,
		rug.id,
		rug.supplierRef,
		rug.slug,
		rug.supplier
	].join(" ").toLowerCase().replace(/[<>]/g, " ");
	const badges = badgesFor(rug.tags);
	return renderTemplate`${maybeRenderHead($$result)}<a${addAttribute(`/admin/rugs/${encodeURIComponent(rug.id)}`, "href")}${addAttribute(["card", `status-${rug.status}`], "class:list")} data-card${addAttribute(rug.id, "data-id")}${addAttribute(slug, "data-collection")}${addAttribute(slugs, "data-collections")}${addAttribute(rug.status, "data-status")}${addAttribute(rug.commitStatus === "pending" ? "photos" : "", "data-attention")}${addAttribute(search, "data-search")} data-astro-cid-lzhbdev7> <div class="ph" data-astro-cid-lzhbdev7> ${photo ? renderTemplate`<img${addAttribute(photo, "src")} alt="" loading="lazy"${addAttribute(dataRot(rug.rotate), "data-rot")} data-astro-cid-lzhbdev7>` : renderTemplate`<span data-astro-cid-lzhbdev7>no photo</span>`} ${rug.photos.length > 1 && renderTemplate`<span class="cnt" data-astro-cid-lzhbdev7>${rug.photos.length}</span>`} ${badges.length > 0 && renderTemplate`<ul class="badges" data-astro-cid-lzhbdev7> ${badges.map((b) => renderTemplate`<li class="badge-corner" data-astro-cid-lzhbdev7>${b}</li>`)} </ul>`} </div> <div class="nm" data-astro-cid-lzhbdev7>${rug.name}</div> <div class="mt" data-astro-cid-lzhbdev7> <span class="mono" data-astro-cid-lzhbdev7>${rug.id}</span> ${meta.map((m) => renderTemplate`<span class="line" data-astro-cid-lzhbdev7>${m}</span>`)} </div> ${price && renderTemplate`<div class="pr" data-astro-cid-lzhbdev7>${price}</div>`} <div${addAttribute(["status", rug.status], "class:list")} data-astro-cid-lzhbdev7>${rug.status}</div> ${rug.commitStatus === "pending" && renderTemplate`<div class="pending" data-astro-cid-lzhbdev7> <span class="status revoked" data-astro-cid-lzhbdev7>photos pending</span> </div>`} </a> ${rug.commitStatus === "pending" && renderTemplate`<button type="button" class="chip retry"${addAttribute(rug.id, "data-retry")} data-astro-cid-lzhbdev7>
Finish photo import
</button>`}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/RugCardAdmin.astro", void 0);
//#endregion
//#region src/components/admin/RugRow.astro
createAstro("https://astro.build");
var $$RugRow = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugRow;
	const { rug, collections } = Astro.props;
	const slug = rug.collection.trim() ? collectionSlug(rug.collection, collections) : "";
	const slugs = rug.collections.length ? collectionSlugs(rug.collections, collections).join(" ") : "";
	const size = dims(rug.widthCm, rug.lengthCm, "cm");
	const price = rug.priceUsd ? `$${rug.priceUsd.toLocaleString("en-US")}` : "";
	const search = [
		rug.name,
		rug.id,
		rug.supplierRef,
		rug.slug,
		rug.supplier
	].join(" ").toLowerCase().replace(/[<>]/g, " ");
	return renderTemplate`${maybeRenderHead($$result)}<div class="irow" data-card data-row${addAttribute(rug.id, "data-id")}${addAttribute(slug, "data-collection")}${addAttribute(slugs, "data-collections")}${addAttribute(rug.status, "data-status")}${addAttribute(rug.commitStatus === "pending" ? "photos" : "", "data-attention")}${addAttribute(search, "data-search")}> <div class="irow__line"> <span class="irow__id">${rug.id}</span> <span class="irow__title" data-cell="name">${rug.name}</span> <span class="irow__collection">${rug.collection}</span> <span class="irow__size">${size}</span> <span class="irow__price">${price}</span> <span class="irow__spacer"></span> <span class="irow__action"> ${rug.commitStatus === "pending" && renderTemplate`<button type="button" class="chip retry"${addAttribute(rug.id, "data-retry")}>
Finish photo import
</button>`} <a${addAttribute(`/admin/rugs/${encodeURIComponent(rug.id)}`, "href")}>Open</a> <button type="button"${addAttribute(rug.id, "data-edit")}>Edit</button> </span> </div> <p class="irow__message" hidden></p> </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/RugRow.astro", void 0);
//#endregion
//#region src/components/admin/RugTable.astro
createAstro("https://astro.build");
var $$RugTable = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugTable;
	const { rugs, collections } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<div class="rugtable" role="table" aria-label="Products"> <div class="rugtable__head" role="row"> <span class="irow__id" role="columnheader">ID</span> <span class="irow__title" role="columnheader">Title</span> <span class="irow__collection" role="columnheader">Collection</span> <span class="irow__size" role="columnheader">Size</span> <span class="irow__price" role="columnheader">Price</span> <span class="irow__spacer"></span> <span class="irow__action"></span> </div> ${rugs.map((rug) => renderTemplate`${renderComponent($$result, "RugRow", $$RugRow, {
		"rug": rug,
		"collections": collections
	})}`)} </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/RugTable.astro", void 0);
//#endregion
//#region src/components/ui/FilterBar.astro
createAstro("https://astro.build");
var $$FilterBar = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$FilterBar;
	const { view = "list", class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["filterbar", className], "class:list")} role="search"> ${renderSlot($$result, $$slots["search"])} ${renderSlot($$result, $$slots["filters"])} <span class="filterbar__spacer"></span> <button type="button" class="filterbar__view"${addAttribute(view === "list" ? "true" : "false", "aria-pressed")} data-view="list"> ${renderComponent($$result, "Icon", $$Icon, { "name": "list" })} <span class="sr-only">Table view</span> </button> <button type="button" class="filterbar__view"${addAttribute(view === "grid" ? "true" : "false", "aria-pressed")} data-view="grid"> ${renderComponent($$result, "Icon", $$Icon, { "name": "grid" })} <span class="sr-only">Gallery view</span> </button> </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/FilterBar.astro", void 0);
//#endregion
//#region src/components/ui/Drawer.astro
createAstro("https://astro.build");
var $$Drawer = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Drawer;
	const { id, title, class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<dialog${addAttribute(id, "id")}${addAttribute(["drawer", className], "class:list")}${addAttribute(`${id}-title`, "aria-labelledby")}> <div class="drawer__grabber" aria-hidden="true"></div> <div class="drawer__header"> <h2 class="drawer__title"${addAttribute(`${id}-title`, "id")}>${title}</h2> <button type="button" class="drawer__close"${addAttribute(id, "data-close")}> ${renderComponent($$result, "Icon", $$Icon, { "name": "close" })} <span class="sr-only">Close</span> </button> </div> <div class="drawer__body">${renderSlot($$result, $$slots["default"])}</div> <div class="drawer__footer">${renderSlot($$result, $$slots["footer"])}</div> </dialog>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Drawer.astro", void 0);
//#endregion
//#region src/pages/admin/rugs/index.astro
var rugs_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Index;
	Astro.csp?.insertDirective("img-src 'self' https://lh3.googleusercontent.com https://cdn.shopify.com https://images.ecarpetwholesale.com data:");
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin rugs read failed", { error: safe });
		error = safe.message;
	}
	const rugs = snapshot?.rugs ?? [];
	const collections = snapshot?.collections ?? [];
	const counts = /* @__PURE__ */ new Map();
	for (const r of rugs) {
		const slugs = r.collections.length ? collectionSlugs(r.collections, collections) : [""];
		for (const key of slugs) counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const names = orderedCollectionNames(rugs.filter((r) => r.collections.length > 0), collections);
	const seen = /* @__PURE__ */ new Set();
	const collectionChips = [{
		value: "*",
		label: "All",
		count: rugs.length,
		pressed: true
	}];
	for (const name of [...collections.map((c) => c.name), ...names]) {
		const slug = collectionSlug(name, collections);
		if (seen.has(slug)) continue;
		seen.add(slug);
		const canonical = collections.find((c) => c.slug === slug)?.name ?? name;
		collectionChips.push({
			value: slug,
			label: canonical,
			count: counts.get(slug) ?? 0
		});
	}
	if (counts.get("")) collectionChips.push({
		value: "__none",
		label: "No collection",
		count: counts.get("")
	});
	const pendingCount = rugs.filter((r) => r.commitStatus === "pending").length;
	const hasActive = rugs.some((r) => r.status === "active");
	const statusChips = [
		{
			value: "active",
			label: "Active",
			pressed: hasActive
		},
		{
			value: "draft",
			label: "Draft"
		},
		{
			value: "archived",
			label: "Archived"
		},
		{
			value: "all",
			label: "Any status",
			pressed: !hasActive
		}
	];
	if (pendingCount > 0) statusChips.push({
		value: "attention",
		label: "Needs photos",
		count: pendingCount
	});
	await driveScope();
	const driveScopeOk = adminRuntime.driveScopeOk ?? null;
	const tags = snapshot?.tags ?? [];
	const settings = snapshot?.settings;
	const defaultStatus = settings ? defaultStatusOf(settings) : "active";
	const roundStep = settings ? roundStepOf(settings) : 5;
	const nextId = snapshot ? nextRugId(snapshot.rugs.map((r) => r.id), reservedIds(snapshot)) : "";
	const addData = {
		mode: "add",
		collections: collections.map((c) => ({
			id: c.id,
			slug: c.slug,
			name: c.name
		})),
		tags: tags.map((t) => ({
			id: t.id,
			slug: t.slug,
			name: t.name,
			color: t.color ?? ""
		})),
		nextId,
		defaultStatus,
		roundStep,
		driveScopeOk,
		adminHeaders: snapshot?.report.adminHeaders ?? "ok"
	};
	const syncLabel_ = snapshot ? syncLabel(snapshot.fetchedAt) : void 0;
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Products",
		"active": "rugs",
		"meta": syncLabel_
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}<div class="page-head"> <div class="page-head__titles"> <h1 class="page-head__title">Products</h1> <p class="page-head__count"> ${rugs.length} ${rugs.length === 1 ? "product" : "products"}${pendingCount > 0 && ` · ${pendingCount} failed to save`} </p> </div> <span class="page-head__rule"></span> ${renderComponent($$result, "Button", $$Button, {
		"href": "/admin/rugs/new",
		"icon": "plus",
		"data-open": "add-rug"
	}, { "default": ($$result) => renderTemplate`Add product` })} </div> ${renderComponent($$result, "FilterBar", $$FilterBar, {}, {
		"search": ($$result) => renderTemplate`<input id="q" class="input filterbar__search" type="search" placeholder="Search ID or title" autocomplete="off" aria-label="Search products">`,
		"filters": ($$result) => renderTemplate`<div class="filterbar__filters"> ${renderComponent($$result, "Input", $$Input, {
			"type": "select",
			"id": "f_collection_filter",
			"name": "collection",
			"label": "Filter by collection",
			"hideLabel": true,
			"class": "filterbar__select"
		}, { "default": ($$result) => renderTemplate` <option value="*">All collections</option> ${collectionChips.map((c) => renderTemplate`<option${addAttribute(c.value, "value")}> ${c.label} (${c.count ?? 0})
</option>`)}` })} ${renderComponent($$result, "Chips", $$Chips, {
			"id": "statusChips",
			"label": "Status",
			"chips": statusChips
		})} </div>`
	})} <p class="hint" id="count" role="status" aria-live="polite"></p> <div id="m-retry" class="msg"></div> <div id="empty-first"${addAttribute(rugs.length !== 0, "hidden")}>  ${collections.length === 0 ? renderTemplate`${renderComponent($$result, "EmptyState", $$EmptyState, {
		"type": "first-run",
		"title": "Start with a collection",
		"message": "Collections group the catalogue for the buyer, and every product belongs to at least one — so the first one comes before the first rug.",
		"href": "/admin/collections"
	})}` : renderTemplate`${renderComponent($$result, "EmptyState", $$EmptyState, {
		"type": "first-run",
		"href": "/admin/rugs/new"
	})}`} </div> <div id="empty-none" hidden> ${renderComponent($$result, "EmptyState", $$EmptyState, { "type": "no-results" })} </div> <div id="table"> ${renderComponent($$result, "RugTable", $$RugTable, {
		"rugs": rugs,
		"collections": collections
	})} </div> <div id="grid" class="grid" hidden> ${rugs.map((rug) => renderTemplate`${renderComponent($$result, "RugCardAdmin", $$RugCardAdmin, {
		"rug": rug,
		"collections": collections
	})}`)} </div> ${renderComponent($$result, "Drawer", $$Drawer, {
		"id": "add-rug",
		"title": "Add product"
	}, {
		"default": ($$result) => renderTemplate` ${renderComponent($$result, "RugFields", $$RugFields, {
			"mode": "add",
			"collections": collections,
			"tags": tags,
			"defaultStatus": defaultStatus,
			"roundStep": roundStep,
			"driveScopeOk": driveScopeOk,
			"nextId": nextId,
			"fetchButton": false
		})}    `,
		"footer": ($$result) => renderTemplate`${renderComponent($$result, "Button", $$Button, {
			"slot": "footer",
			"style": "ghost",
			"data-close": "add-rug"
		}, { "default": ($$result) => renderTemplate`Cancel` })}<span class="drawer__spacer"></span>${renderComponent($$result, "Button", $$Button, {
			"slot": "footer",
			"style": "primary",
			"id": "btnFetch"
		}, { "default": ($$result) => renderTemplate`Fetch` })}`
	})} <script type="application/json" id="admin-data">${unescapeHTML(jsonForScript(addData))}<\/script>${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/index.astro?astro&type=script&index=0&lang.ts")}${renderComponent($$result, "FetchModal", $$FetchModal, {
		"id": "fetch-result",
		"title": "Fetching"
	})} ` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/index.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/rugs/index.astro";
var $$url = "/admin/rugs";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/rugs/index@_@astro
var page = () => rugs_exports;
//#endregion
export { page };
