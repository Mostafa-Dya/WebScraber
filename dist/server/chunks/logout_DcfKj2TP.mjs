import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { a as isReservedSlug, n as customerCookieName, t as SLUG_RE } from "./auth_rJQKmKue.mjs";
import { o as noStore, s as rejectCrossSite } from "./api_jzoAbQWC.mjs";
import { r as customerRuntime } from "./http_B6fRxdq_.mjs";
//#region src/pages/api/customers/[slug]/logout.ts
var logout_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = async ({ request, cookies, params }) => {
	const rejected = rejectCrossSite(request);
	if (rejected) return rejected;
	const slug = (params.slug ?? "").toLowerCase();
	if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return noStore({
		ok: false,
		error: "not found"
	}, 404);
	cookies.delete(customerCookieName(slug, customerRuntime.isSecureSite), {
		path: "/",
		secure: customerRuntime.isSecureSite,
		httpOnly: true,
		sameSite: "lax"
	});
	return noStore({
		ok: true,
		redirect: `/${slug}`
	});
};
var ALL = () => noStore({
	ok: false,
	error: "method not allowed"
}, 405, { allow: "POST" });
//#endregion
//#region \0virtual:astro:page:src/pages/api/customers/[slug]/logout@_@ts
var page = () => logout_exports;
//#endregion
export { page };
