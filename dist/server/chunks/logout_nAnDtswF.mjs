import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { d as clearSessionCookie } from "./auth_rJQKmKue.mjs";
import { a as adminRuntime, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { c as requestIpHash, u as socketAddressOf } from "./api_jzoAbQWC.mjs";
//#region src/pages/admin/logout.astro
var logout_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Logout,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Logout = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Logout;
	if (!adminRuntime.configured) return new Response("Not found", {
		status: 404,
		headers: { "cache-control": "no-store" }
	});
	if (Astro.request.method !== "POST") return new Response("Method not allowed", {
		status: 405,
		headers: {
			allow: "POST",
			"cache-control": "no-store",
			"content-type": "text/plain; charset=utf-8"
		}
	});
	const session = Astro.locals.admin;
	if (session) {
		adminRuntime.revocations.revoke(session.sid, session.abs);
		await recordAuditEvent({
			action: "auth.logout",
			targetTab: "-",
			targetId: session.user,
			ipHash: requestIpHash(Astro.request, socketAddressOf(Astro)),
			requestId: Astro.locals.requestId ?? "none"
		});
	}
	clearSessionCookie(Astro.cookies, adminRuntime.isSecureSite);
	return Astro.redirect("/admin/login", 303);
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/logout.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/logout.astro";
var $$url = "/admin/logout";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/logout@_@astro
var page = () => logout_exports;
//#endregion
export { page };
