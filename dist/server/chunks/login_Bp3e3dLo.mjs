import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { _ as verifyPassword, g as setSessionCookie, m as newSession } from "./auth_rJQKmKue.mjs";
import { a as adminRuntime, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { c as requestIpHash, u as socketAddressOf } from "./api_jzoAbQWC.mjs";
import { o as sanitiseNext } from "./write_BpgUvStU.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$Button } from "./Button_B8W6yTa7.mjs";
import { t as $$Input } from "./Input_DRZzK1XW.mjs";
//#region src/pages/admin/login.astro
var login_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Login,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Login = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Login;
	const { request, cookies, locals, url } = Astro;
	if (!adminRuntime.configured) return new Response("Not found", {
		status: 404,
		headers: { "cache-control": "no-store" }
	});
	let next = sanitiseNext(url.searchParams.get("next"));
	if (locals.admin) return Astro.redirect(next, 303);
	let message = "";
	let retryAfter = 0;
	let status = 200;
	if (request.method === "POST") {
		let form;
		try {
			form = await request.formData();
		} catch {
			form = void 0;
		}
		const password = String(form?.get("password") ?? "");
		next = sanitiseNext(form?.get("next") ?? next);
		const ipHash = requestIpHash(request, socketAddressOf(Astro));
		const requestId = locals.requestId ?? "none";
		const check = adminRuntime.throttle.check(ipHash);
		if (!check.ok) {
			status = 429;
			retryAfter = check.retryAfterSec;
			if (check.auditLockout) await recordAuditEvent({
				action: "auth.lockout",
				targetTab: "-",
				targetId: check.scope,
				ipHash,
				requestId,
				note: `${check.scope} lockout; retry after ${retryAfter} s`
			});
		} else if (verifyPassword(adminRuntime.passwordHash, password)) {
			adminRuntime.throttle.succeed(ipHash);
			const now = Date.now();
			const session = newSession(adminRuntime.user, now);
			setSessionCookie(cookies, session, adminRuntime.secret, adminRuntime.isSecureSite, now);
			await recordAuditEvent({
				action: "auth.login",
				targetTab: "-",
				targetId: adminRuntime.user,
				ipHash,
				requestId,
				after: {
					user: adminRuntime.user,
					absoluteExpiry: new Date(session.abs).toISOString()
				}
			});
			return Astro.redirect(next, 303);
		} else {
			const fail = adminRuntime.throttle.fail(ipHash);
			status = 401;
			retryAfter = fail.retryAfterSec;
			if (fail.auditLockout) await recordAuditEvent({
				action: "auth.lockout",
				targetTab: "-",
				targetId: fail.scope,
				ipHash,
				requestId,
				note: `${fail.scope} lockout after ${fail.failures} failures; retry after ${retryAfter} s`
			});
		}
		message = status === 429 ? `Too many attempts — wait 60s. ${retryAfter}s remaining.` : retryAfter > 0 ? `That password is not correct. Try again in ${retryAfter} s.` : "That password is not correct.";
	}
	const locked = status === 429;
	Astro.response.status = status;
	if (retryAfter > 0) Astro.response.headers.set("retry-after", String(retryAfter));
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Admin login",
		"nav": false,
		"sub": "Admin — sign in",
		"data-astro-cid-xeimgta2": true
	}, { "default": ($$result) => renderTemplate`  ${maybeRenderHead($$result)}<form method="post" action="/admin/login" class="alogin" data-astro-cid-xeimgta2> <input type="hidden" name="next"${addAttribute(next, "value")} data-astro-cid-xeimgta2> <div class="alogin__brand" data-astro-cid-xeimgta2> <p class="alogin__wordmark" data-astro-cid-xeimgta2>Serio Ludere</p> <p class="alogin__realm" data-astro-cid-xeimgta2>preview admin</p> </div> ${renderComponent($$result, "Input", $$Input, {
		"type": "password",
		"name": "password",
		"label": "Password",
		"autocomplete": "current-password",
		"required": true,
		"disabled": locked,
		"error": message || void 0,
		"errorTone": locked ? "warning" : "danger",
		"data-astro-cid-xeimgta2": true
	})} ${renderComponent($$result, "Button", $$Button, {
		"type": "submit",
		"style": "primary",
		"disabled": locked,
		"class": "alogin__go",
		"data-astro-cid-xeimgta2": true
	}, { "default": ($$result) => renderTemplate`${locked ? "Locked" : "Enter"}` })} <p class="alogin__fine" data-astro-cid-xeimgta2>Private. Sessions expire after 12 hours idle and 7 days at most.</p> </form> ` })} ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/login.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/login.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/login.astro";
var $$url = "/admin/login";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/login@_@astro
var page = () => login_exports;
//#endregion
export { page };
