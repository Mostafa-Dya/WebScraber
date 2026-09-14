import { i as getClient, kt as PUBLIC_CATALOGUE, vt as consoleLogger, wt as AUTH_SECRET, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as isReservedSlug, c as verifyCustomerToken, n as customerCookieName, t as SLUG_RE } from "./auth_rJQKmKue.mjs";
import { f as RateLimiter, i as isSecureSite } from "./api_jzoAbQWC.mjs";
import { a as LoginThrottle, i as insertVisitRows } from "./write_BpgUvStU.mjs";
import { randomUUID } from "node:crypto";
//#region src/lib/customer/gate.ts
/** Prefixes served without a customer session. `/api/customers` is the login endpoint itself. */
var ALWAYS_PUBLIC = [
	"/admin",
	"/api/admin",
	"/api/customers",
	"/api/health",
	"/api/revalidate",
	"/api/reactions",
	"/api/rates",
	"/api/image",
	"/_astro",
	"/_image",
	"/_server-islands",
	"/_actions",
	"/favicon.ico",
	"/robots.txt",
	"/sitemap.xml",
	"/assets"
];
/** Additional prefixes served only while the public catalogue is switched on. */
var PUBLIC_CATALOGUE_PATHS = [
	"/rugs",
	"/tags",
	"/api/catalogue"
];
function customerRealmEnabled(config) {
	return Boolean(config.secret && config.secret.length >= 32);
}
/** `/hala/` and `/hala` are the same path. */
function normalisePath(pathname) {
	return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
function hasPrefix(pathname, prefixes) {
	return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
/**
* Classifies a path without touching the sheet. `productId` is left unvalidated beyond a coarse
* shape check; the page looks it up and answers 404 when it is not a product.
*/
function classify(pathname, config) {
	const path = normalisePath(pathname);
	if (hasPrefix(path, ALWAYS_PUBLIC)) return { kind: "public" };
	if (config.publicCatalogue) {
		if (path === "" || path === "/") return { kind: "public" };
		if (hasPrefix(path, PUBLIC_CATALOGUE_PATHS)) return { kind: "public" };
	}
	if (!customerRealmEnabled(config)) return { kind: "deny" };
	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0 || segments.length > 2) return { kind: "deny" };
	const slug = segments[0];
	if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return { kind: "deny" };
	const productId = segments[1];
	if (productId !== void 0 && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(productId)) return { kind: "deny" };
	return productId === void 0 ? {
		kind: "customer",
		slug
	} : {
		kind: "customer",
		slug,
		productId
	};
}
/**
* The signed-in slug for this request, or undefined. Only the cookie whose name matches the slug in
* the path is even looked at, so a stale cookie for another buyer is invisible here.
*/
function sessionSlug(context, slug, config) {
	if (!config.secret) return void 0;
	const token = context.cookies.get(customerCookieName(slug, config.isSecureSite))?.value;
	return verifyCustomerToken(token, slug, config.secret, (config.now ?? Date.now)())?.slug;
}
/** One call for the middleware: classify, then attach the session when there is one. */
function customerGate(context, config) {
	const route = classify(context.url.pathname, config);
	if (route.kind !== "customer") return { route };
	const customer = sessionSlug(context, route.slug, config);
	if (customer) context.locals.customer = customer;
	return customer === void 0 ? { route } : {
		route,
		customer
	};
}
//#endregion
//#region src/lib/votes/ua.ts
function uaFamily(ua) {
	const s = (ua ?? "").slice(0, 512);
	if (!s) return "unknown";
	return `${/Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\/|CriOS\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : /bot|crawl|spider|curl|wget|python|node/i.test(s) ? "Bot" : "Other"}/${/Windows/.test(s) ? "Windows" : /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "Other"}`.slice(0, 64);
}
//#endregion
//#region src/lib/customer/visits.ts
/** One row per customer per 30 minutes; a reload inside the window is the same visit. */
var VISIT_WINDOW_MS = 18e5;
/** Referrers are stored for provenance only, so an over-long or hostile value is truncated. */
var MAX_REFERRER = 200;
function visitRow(input) {
	return {
		eventId: input.eventId ?? randomUUID(),
		customerSlug: input.customerSlug,
		occurredAt: new Date(input.now).toISOString(),
		userAgent: uaFamily(input.userAgent),
		referrer: (input.referrer ?? "").slice(0, MAX_REFERRER)
	};
}
/**
* Remembers when each customer was last logged. Bounded: the oldest entries are dropped once the
* map is full, which at worst writes one extra row for a buyer who has been idle a long time.
*/
var VisitThrottle = class {
	seen = /* @__PURE__ */ new Map();
	windowMs;
	maxKeys;
	constructor(windowMs = VISIT_WINDOW_MS, maxKeys = 2e3) {
		this.windowMs = windowMs;
		this.maxKeys = maxKeys;
	}
	/** True when this visit should be written; stamps the customer as seen when it returns true. */
	shouldRecord(customerSlug, now) {
		const last = this.seen.get(customerSlug);
		if (last !== void 0 && now - last < this.windowMs) return false;
		if (this.seen.size >= this.maxKeys && !this.seen.has(customerSlug)) {
			const oldest = this.seen.keys().next();
			if (!oldest.done) this.seen.delete(oldest.value);
		}
		this.seen.set(customerSlug, now);
		return true;
	}
	/** Test seam. */
	clear() {
		this.seen.clear();
	}
};
/**
* Fire-and-forget: returns the row that was written (for tests), or undefined when the visit was
* inside the throttle window or the append failed. Never throws.
*/
async function recordVisit(input, deps) {
	const now = (deps.now ?? Date.now)();
	if (!deps.throttle.shouldRecord(input.customerSlug, now)) return void 0;
	const row = visitRow({
		...input,
		now
	});
	try {
		await deps.append([row]);
		return row;
	} catch (e) {
		deps.logger.error("visit not recorded", {
			customer: input.customerSlug,
			error: serializeError(e)
		});
		return;
	}
}
//#endregion
//#region src/lib/customer/http.ts
var secret = AUTH_SECRET && AUTH_SECRET.length >= 32 ? AUTH_SECRET : void 0;
var customerRuntime = {
	secret,
	publicCatalogue: PUBLIC_CATALOGUE ?? true,
	isSecureSite,
	configured: customerRealmEnabled({ secret }),
	/** Its own limiter, so a buyer's failed logins can never lock the owner out of /admin. */
	throttle: new LoginThrottle(new RateLimiter({ maxKeys: 2e3 })),
	visits: new VisitThrottle()
};
if (!customerRuntime.configured) console.warn("[customer] AUTH_SECRET is unset or shorter than 32 characters: the /{slug} preview realm stays disabled (404).");
function customerGateConfig() {
	return {
		secret: customerRuntime.secret,
		publicCatalogue: customerRuntime.publicCatalogue,
		isSecureSite: customerRuntime.isSecureSite
	};
}
/** What /api/health reports (no secrets). */
function customerHealth() {
	return {
		customerRealm: customerRuntime.configured,
		publicCatalogue: customerRuntime.publicCatalogue
	};
}
/**
* The active customer with this slug, or undefined. Inactive rows are invisible on purpose: the
* owner switches `active` off to end a buyer's access without deleting their reaction history.
*/
function findCustomer(customers, slug) {
	const wanted = slug.toLowerCase();
	return customers.find((c) => c.slug.toLowerCase() === wanted && c.active);
}
/** Fire-and-forget visit row; never throws, never awaited by a render. */
function noteVisit(customerSlug, request) {
	recordVisit({
		customerSlug,
		userAgent: request.headers.get("user-agent"),
		referrer: request.headers.get("referer")
	}, {
		throttle: customerRuntime.visits,
		append: async (rows) => insertVisitRows(getClient(), rows),
		logger: consoleLogger
	});
}
//#endregion
export { noteVisit as a, findCustomer as i, customerHealth as n, customerGate as o, customerRuntime as r, customerGateConfig as t };
