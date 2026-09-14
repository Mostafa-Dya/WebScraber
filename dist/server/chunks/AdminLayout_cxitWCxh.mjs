import { F as maybeRenderHead, I as renderHead, L as addAttribute, O as renderComponent, P as renderTemplate, T as spreadAttributes, W as createAstro, j as renderSlot } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import "./motion-spec_YyXGDjbF.mjs";
//#region src/components/ui/Icon.astro
createAstro("https://astro.build");
var $$Icon = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Icon;
	const { name, size = 16, class: className, ...rest } = Astro.props;
	const paths = {
		alert: [
			{
				d: "M8 2.2L13.8 13.4H2.2L8 2.2Z",
				cap: "round",
				join: "round"
			},
			{
				d: "M8 6.4V9.5",
				cap: "round",
				join: "round"
			},
			{
				d: "M8 11.2V11.3",
				cap: "round",
				join: "round"
			}
		],
		check: [{
			d: "M3.5 8.5L6.5 11.5L12.5 5",
			cap: "round",
			join: "round"
		}],
		"chevron-down": [{
			d: "M4 6.5L8 10.5L12 6.5",
			cap: "round",
			join: "round"
		}],
		"chevron-right": [{
			d: "M6.5 4L10.5 8L6.5 12",
			cap: "round",
			join: "round"
		}],
		close: [{
			d: "M4 4L12 12",
			cap: "round",
			join: "round"
		}, {
			d: "M12 4L4 12",
			cap: "round",
			join: "round"
		}],
		copy: [{
			d: "M5.6 5.6V3.4H12.6V10.4H10.4",
			cap: "round",
			join: "round"
		}, {
			d: "M3.4 5.6H10.4V12.6H3.4V5.6Z",
			cap: "round",
			join: "round"
		}],
		external: [
			{
				d: "M9.5 3H13V6.5",
				cap: "round",
				join: "round"
			},
			{
				d: "M13 3L7.8 8.2",
				cap: "round",
				join: "round"
			},
			{
				d: "M11 9.2V13H3V5H6.8",
				cap: "round",
				join: "round"
			}
		],
		eye: [{
			d: "M1.8 8C1.8 8 4.2 3.8 8 3.8C11.8 3.8 14.2 8 14.2 8C14.2 8 11.8 12.2 8 12.2C4.2 12.2 1.8 8 1.8 8Z",
			cap: "round",
			join: "round"
		}, {
			d: "M9.9 8C9.9 8.24951 9.85086 8.49658 9.75537 8.7271C9.65989 8.95762 9.51993 9.16707 9.3435 9.3435C9.16707 9.51993 8.95762 9.65989 8.7271 9.75537C8.49658 9.85086 8.24951 9.9 8 9.9C7.75049 9.9 7.50342 9.85086 7.2729 9.75537C7.04238 9.65989 6.83293 9.51993 6.6565 9.3435C6.48007 9.16707 6.34011 8.95762 6.24463 8.7271C6.14914 8.49658 6.1 8.24951 6.1 8C6.1 7.49609 6.30018 7.01282 6.6565 6.6565C7.01282 6.30018 7.49609 6.1 8 6.1C8.50391 6.1 8.98718 6.30018 9.3435 6.6565C9.69982 7.01282 9.9 7.49609 9.9 8Z",
			cap: "round",
			join: "round"
		}],
		"eye-off": [
			{
				d: "M6.3 3.9C6.85826 3.7802 7.43155 3.74647 8 3.8C11.8 3.8 14.2 8 14.2 8C13.6588 8.92641 12.985 9.76866 12.2 10.5",
				cap: "round",
				join: "round"
			},
			{
				d: "M4.3 5C3.29441 5.84289 2.44774 6.8589 1.8 8C1.8 8 4.2 12.2 8 12.2C8.6 12.2 9.2 12.1 9.7 11.9",
				cap: "round",
				join: "round"
			},
			{
				d: "M2.6 2.6L13.4 13.4",
				cap: "round",
				join: "round"
			}
		],
		filter: [{
			d: "M2.8 3.5H13.2L9.2 8.1V12.4L6.8 11.1V8.1L2.8 3.5Z",
			cap: "round",
			join: "round"
		}],
		grid: [
			{
				d: "M3 3H7.4V7.4H3V3Z",
				cap: "round",
				join: "round"
			},
			{
				d: "M8.6 3H13V7.4H8.6V3Z",
				cap: "round",
				join: "round"
			},
			{
				d: "M3 8.6H7.4V13H3V8.6Z",
				cap: "round",
				join: "round"
			},
			{
				d: "M8.6 8.6H13V13H8.6V8.6Z",
				cap: "round",
				join: "round"
			}
		],
		heart: [{
			d: "M8 13.4C8 13.4 2.6 10.2 2.6 6.6C2.40109 5.88392 2.49479 5.11814 2.86048 4.47114C3.22618 3.82414 3.83392 3.34891 4.55 3.15C5.26608 2.95109 6.03186 3.04479 6.67886 3.41048C7.32586 3.77618 7.80109 4.38392 8 5.1C8.19891 4.38392 8.67414 3.77618 9.32114 3.41048C9.96814 3.04479 10.7339 2.95109 11.45 3.15C12.1661 3.34891 12.7738 3.82414 13.1395 4.47114C13.5052 5.11814 13.5989 5.88392 13.4 6.6C13.4 10.2 8 13.4 8 13.4Z",
			cap: "round",
			join: "round"
		}],
		list: [
			{
				d: "M3 4.5H13",
				cap: "round",
				join: "round"
			},
			{
				d: "M3 8H13",
				cap: "round",
				join: "round"
			},
			{
				d: "M3 11.5H13",
				cap: "round",
				join: "round"
			}
		],
		logout: [
			{
				d: "M6.5 3H3V13H6.5",
				cap: "round",
				join: "round"
			},
			{
				d: "M9.5 5.5L12 8L9.5 10.5",
				cap: "round",
				join: "round"
			},
			{
				d: "M12 8H6",
				cap: "round",
				join: "round"
			}
		],
		plus: [{
			d: "M8 3.5V12.5",
			cap: "round",
			join: "round"
		}, {
			d: "M3.5 8H12.5",
			cap: "round",
			join: "round"
		}],
		refresh: [{
			d: "M13 8C12.9922 9.14722 12.5902 10.2569 11.8613 11.1428C11.1324 12.0288 10.1211 12.6371 8.99685 12.8658C7.87263 13.0945 6.70396 12.9296 5.68688 12.3989C4.6698 11.8681 3.86618 11.0037 3.41083 9.95072C2.95548 8.89772 2.87609 7.72015 3.18598 6.61555C3.49588 5.51096 4.17621 4.54653 5.11284 3.88405C6.04948 3.22157 7.18544 2.90134 8.33019 2.97707C9.47493 3.05281 10.5588 3.5199 11.4 4.3",
			cap: "round",
			join: "round"
		}, {
			d: "M13 2.2V5.1H10.1",
			cap: "round",
			join: "round"
		}],
		search: [{
			d: "M11.2 7.1C11.2 8.18739 10.768 9.23024 9.99914 9.99914C9.23024 10.768 8.18739 11.2 7.1 11.2C6.01261 11.2 4.96976 10.768 4.20086 9.99914C3.43196 9.23024 3 8.18739 3 7.1C3 6.01261 3.43196 4.96976 4.20086 4.20086C4.96976 3.43196 6.01261 3 7.1 3C8.18739 3 9.23024 3.43196 9.99914 4.20086C10.768 4.96976 11.2 6.01261 11.2 7.1Z",
			cap: "round",
			join: "round"
		}, {
			d: "M10.2 10.2L13.2 13.2",
			cap: "round",
			join: "round"
		}],
		trash: [
			{
				d: "M3 4.6H13",
				cap: "round",
				join: "round"
			},
			{
				d: "M6.4 4.6V3H9.6V4.6",
				cap: "round",
				join: "round"
			},
			{
				d: "M4.4 4.6L5.1 13H10.9L11.6 4.6",
				cap: "round",
				join: "round"
			}
		]
	}[name];
	return renderTemplate`${maybeRenderHead($$result)}<svg viewBox="0 0 16 16"${addAttribute(size, "width")}${addAttribute(size, "height")} fill="none" aria-hidden="true" focusable="false"${addAttribute(className, "class")}${spreadAttributes(rest)}> ${paths.map((p) => renderTemplate`<path${addAttribute(p.d, "d")} stroke="currentColor"${addAttribute(p.cap, "stroke-linecap")}${addAttribute(p.join, "stroke-linejoin")}></path>`)} </svg>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/Icon.astro", void 0);
//#endregion
//#region src/components/ui/AppShell.astro
createAstro("https://astro.build");
var $$AppShell = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$AppShell;
	const { active, title, meta, class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["shell", className], "class:list")}> <nav class="shell__nav" aria-label="Admin sections"> <div class="shell__brand"> <a class="shell__wordmark" href="/admin/rugs">Serio Ludere</a> <span class="shell__realm">preview admin</span> </div> ${[
		{
			key: "products",
			href: "/admin/rugs",
			icon: "list",
			label: "Products"
		},
		{
			key: "collections",
			href: "/admin/collections",
			icon: "grid",
			label: "Collections"
		},
		{
			key: "customers",
			href: "/admin/clients",
			icon: "heart",
			label: "Customers"
		}
	].map((item) => renderTemplate`<a class="shell__link"${addAttribute(item.href, "href")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")}> ${renderComponent($$result, "Icon", $$Icon, { "name": item.icon })} <span>${item.label}</span> </a>`)} <hr class="divider shell__rule"> ${[{
		key: "audit",
		href: "/admin/audit",
		icon: "list",
		label: "Audit log"
	}, {
		key: "google",
		href: "/admin/google",
		icon: "refresh",
		label: "Google"
	}].map((item) => renderTemplate`<a class="shell__link shell__link--secondary"${addAttribute(item.href, "href")}${addAttribute(active === item.key ? "page" : void 0, "aria-current")}> ${renderComponent($$result, "Icon", $$Icon, { "name": item.icon })} <span>${item.label}</span> </a>`)} ${renderSlot($$result, $$slots["nav-footer"])} </nav> <div class="shell__main"> <header class="shell__topbar"> <h1 class="shell__title">${title}</h1> ${meta && renderTemplate`<span class="shell__meta">${meta}</span>`} ${renderSlot($$result, $$slots["topbar"])} </header> <main class="shell__content">${renderSlot($$result, $$slots["default"])}</main> </div> </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/AppShell.astro", void 0);
//#endregion
//#region src/components/admin/AdminLayout.astro
createAstro("https://astro.build");
var $$AdminLayout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$AdminLayout;
	const TAB_TO_SHELL = {
		add: "products",
		rugs: "products",
		collections: "collections",
		clients: "customers",
		audit: "audit",
		google: "google"
	};
	const { title, active, nav = true, meta } = Astro.props;
	const shellTab = active ? TAB_TO_SHELL[active] : void 0;
	const heading = title.replace(/^Serio Ludere\s*—\s*/, "");
	return renderTemplate`<html lang="en" data-mode="admin"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content"><meta name="robots" content="noindex, nofollow"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">${renderHead($$result)}</head> <body> ${nav ? renderTemplate`${renderComponent($$result, "AppShell", $$AppShell, {
		"active": shellTab,
		"title": heading,
		"meta": meta
	}, {
		"default": ($$result) => renderTemplate`  ${renderSlot($$result, $$slots["default"])} `,
		"topbar": ($$result) => renderTemplate`<form method="post" action="/admin/logout" class="logout"> <button class="shell__logout" type="submit"> ${renderComponent($$result, "Icon", $$Icon, { "name": "logout" })} <span class="sr-only">Log out</span> </button> </form>`
	})}` : renderTemplate`<div class="bare"> <main> ${renderSlot($$result, $$slots["default"])} </main> </div>`} </body> </html>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/admin/AdminLayout.astro", void 0);
//#endregion
export { $$Icon as n, $$AdminLayout as t };
