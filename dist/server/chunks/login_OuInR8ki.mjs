import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { _ as verifyPassword, a as isReservedSlug, f as hashPassword, n as customerCookieName, o as makeCustomerToken, s as newCustomerSession, t as SLUG_RE } from "./auth_rJQKmKue.mjs";
import { c as requestIpHash, o as noStore, s as rejectCrossSite, u as socketAddressOf } from "./api_jzoAbQWC.mjs";
import { i as findCustomer, r as customerRuntime } from "./http_B6fRxdq_.mjs";
import * as z from "zod";
//#region src/pages/api/customers/[slug]/login.ts
var login_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var Body = z.object({ password: z.string().min(1).max(200) });
/** A real scrypt verification against a throwaway hash, so a miss costs what a hit costs. */
var DUMMY_HASH = hashPassword("customer-realm-timing-equaliser", {
	N: 2 ** 17,
	r: 8,
	p: 1
});
var POST = async (context) => {
	const { request, cookies, params } = context;
	const rejected = rejectCrossSite(request);
	if (rejected) return rejected;
	if (!customerRuntime.configured) return noStore({
		ok: false,
		error: "not found"
	}, 404);
	const slug = (params.slug ?? "").toLowerCase();
	if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return noStore({
		ok: false,
		error: "not found"
	}, 404);
	let raw;
	try {
		raw = await request.json();
	} catch {
		return noStore({
			ok: false,
			error: "bad request"
		}, 400);
	}
	const parsed = Body.safeParse(raw);
	if (!parsed.success) return noStore({
		ok: false,
		error: "bad request"
	}, 400);
	const ip = requestIpHash(request, socketAddressOf(context));
	const check = customerRuntime.throttle.check(ip);
	if (!check.ok) return noStore({
		ok: false,
		error: "too many attempts",
		retryAfterSec: check.retryAfterSec
	}, 429, { "retry-after": String(Math.max(1, check.retryAfterSec)) });
	const { snapshot } = await loadCatalogue();
	if (!snapshot) return noStore({
		ok: false,
		error: "unavailable"
	}, 503, { "retry-after": "30" });
	const customer = findCustomer(snapshot.catalogue.customers, slug);
	if (!(verifyPassword(customer?.passwordHash || DUMMY_HASH, parsed.data.password) && Boolean(customer))) {
		const failure = customerRuntime.throttle.fail(ip);
		return noStore({
			ok: false,
			error: "invalid credentials"
		}, 401, { ...failure.retryAfterSec ? { "retry-after": String(failure.retryAfterSec) } : {} });
	}
	customerRuntime.throttle.succeed(ip);
	const now = Date.now();
	const session = newCustomerSession(slug, now);
	cookies.set(customerCookieName(slug, customerRuntime.isSecureSite), makeCustomerToken(session, customerRuntime.secret), {
		httpOnly: true,
		secure: customerRuntime.isSecureSite,
		sameSite: "lax",
		path: "/",
		maxAge: Math.max(1, Math.floor((session.exp - now) / 1e3))
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
//#region \0virtual:astro:page:src/pages/api/customers/[slug]/login@_@ts
var page = () => login_exports;
//#endregion
export { page };
