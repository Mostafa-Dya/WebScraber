import { Mt as SITE_URL, Nt as TRUSTED_PROXY_HOPS, Pt as VOTE_SALT, Tt as CLIENT_IP_HEADER } from "./runtime_r-OJmEZZ.mjs";
import { createHmac, randomBytes } from "node:crypto";
//#region src/lib/ip.ts
var IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
var IPV6 = /^[0-9a-fA-F:.]{2,45}$/;
function isIp(value) {
	const m = IPV4.exec(value);
	if (m) return m.slice(1).every((o) => Number(o) <= 255);
	return value.includes(":") && IPV6.test(value);
}
function clientIp(headers, opts) {
	const name = opts.header.trim().toLowerCase();
	if (name) {
		const direct = headers.get(name);
		if (direct) {
			const v = direct.split(",").pop()?.trim() ?? "";
			if (isIp(v)) return v;
		}
	}
	const xff = headers.get("x-forwarded-for");
	if (!xff) return isIp(opts.socketAddress ?? "") ? opts.socketAddress : void 0;
	const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
	const hops = Math.max(1, Math.floor(opts.trustedHops));
	const idx = parts.length - hops;
	if (idx < 0) return isIp(opts.socketAddress ?? "") ? opts.socketAddress : void 0;
	const v = parts[idx] ?? "";
	if (isIp(v)) return v;
	return isIp(opts.socketAddress ?? "") ? opts.socketAddress : void 0;
}
//#endregion
//#region src/lib/votes/identity.ts
var VISITOR_ID_RE = /^[a-f0-9]{32}$/;
/** `__Host-` requires Secure; plain name on http (local development). */
function visitorCookieName(secure) {
	return secure ? "__Host-sl_v" : "sl_v";
}
function newVisitorId() {
	return randomBytes(16).toString("hex");
}
function hmac32(salt, value) {
	return createHmac("sha256", salt).update(value).digest("hex").slice(0, 32);
}
/** Stored in Votes column E: HMAC-SHA256(VOTE_SALT, cookieId), 32 hex chars. */
function visitorHash(salt, visitorId) {
	return hmac32(salt, `v:${visitorId}`);
}
/** Rate-limit key only; never stored. */
function ipHash(salt, ip) {
	return hmac32(salt, `ip:${ip ?? "unknown"}`);
}
//#endregion
//#region src/lib/votes/ratelimit.ts
/** Keys that must survive eviction (the global bucket protects the Sheets quota). */
var PROTECTED_KEYS = /* @__PURE__ */ new Set(["global"]);
var RateLimiter = class {
	now;
	maxKeys;
	windows = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		this.now = options.now ?? Date.now;
		this.maxKeys = options.maxKeys ?? 1e4;
	}
	/** Consumes one unit from `key`'s window if allowed. */
	allow(key, limit, windowMs) {
		const t = this.now();
		let w = this.windows.get(key);
		if (!w || t - w.start >= w.windowMs) {
			w = {
				start: t,
				windowMs,
				count: 0
			};
			this.windows.set(key, w);
			if (this.windows.size > this.maxKeys) this.prune();
		}
		if (w.count >= limit) return {
			ok: false,
			retryAfterSec: Math.max(1, Math.ceil((w.start + w.windowMs - t) / 1e3)),
			remaining: 0
		};
		w.count += 1;
		return {
			ok: true,
			retryAfterSec: 0,
			remaining: limit - w.count
		};
	}
	/** Peeks without consuming (used to check every limit before consuming any); the live window keeps its own length. */
	wouldAllow(key, limit, _windowMs) {
		const t = this.now();
		const w = this.windows.get(key);
		if (!w || t - w.start >= w.windowMs) return {
			ok: true,
			retryAfterSec: 0,
			remaining: limit
		};
		if (w.count >= limit) return {
			ok: false,
			retryAfterSec: Math.max(1, Math.ceil((w.start + w.windowMs - t) / 1e3)),
			remaining: 0
		};
		return {
			ok: true,
			retryAfterSec: 0,
			remaining: limit - w.count
		};
	}
	/** Gives back one unit (a write that failed must not burn the visitor's budget). */
	refund(key) {
		const w = this.windows.get(key);
		if (w && w.count > 0) w.count -= 1;
	}
	get size() {
		return this.windows.size;
	}
	prune() {
		const t = this.now();
		for (const [k, w] of this.windows) if (t - w.start >= w.windowMs) this.windows.delete(k);
		if (this.windows.size > this.maxKeys) {
			const excess = this.windows.size - this.maxKeys;
			let dropped = 0;
			for (const k of [...this.windows.keys()]) {
				if (dropped >= excess) break;
				if (PROTECTED_KEYS.has(k)) continue;
				this.windows.delete(k);
				dropped++;
			}
		}
	}
};
//#endregion
//#region src/lib/api.ts
var limiter = new RateLimiter();
/** Failed revalidate attempts get their own small limiter: those keys are attacker-driven. */
var failLimiter = new RateLimiter({ maxKeys: 2e3 });
var inflight = /* @__PURE__ */ new Set();
var revalidateState = { lastBustAt: 0 };
var startedAt = Date.now();
var siteOrigin = new URL(SITE_URL).origin;
var isSecureSite = siteOrigin.startsWith("https://");
if (!isSecureSite && process.env.NODE_ENV === "production") console.warn("[site] SITE_URL is not https: the vote cookie is minted as \"sl_v\" without Secure/__Host-. Use an https SITE_URL in production (ADR D8).");
/**
* Astro's `context.clientAddress`, or undefined. The getter THROWS when the adapter cannot supply a
* peer address (a prerendered route, or an adapter without the capability), so it is never read bare.
*/
function socketAddressOf(ctx) {
	try {
		return ctx?.clientAddress;
	} catch {
		return;
	}
}
/**
* @param socketAddress Astro's `context.clientAddress`. Pass it wherever a context is in scope: it is
* the last-resort identity that keeps every visitor out of one shared rate-limit bucket when no
* proxy header is configured. See `IpOptions.socketAddress`.
*/
function requestIpHash(request, socketAddress) {
	const ip = clientIp(request.headers, {
		header: CLIENT_IP_HEADER,
		trustedHops: TRUSTED_PROXY_HOPS,
		socketAddress
	});
	return ipHash(VOTE_SALT, ip);
}
/** JSON response that must never be cached (votes, revalidate, health). */
function noStore(body, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			...extraHeaders
		}
	});
}
var MAX_JSON_BODY = 4096;
/** Admin JSON bodies (a rug with a 4 000-char description and 12 photo ids): docs/ADMIN_SPEC.md §2.3. */
var ADMIN_MAX_JSON_BODY = 65536;
/**
* Cross-site posture for JSON POSTs (ADR D8): JSON only, small (`maxBytes`, default 4 KiB for the
* public endpoints), same-origin fetch metadata when present.
*/
function rejectCrossSite(request, maxBytes = MAX_JSON_BODY) {
	if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return noStore({
		ok: false,
		error: "unsupported media type"
	}, 415);
	if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return noStore({
		ok: false,
		error: "payload too large"
	}, 413);
	const site = request.headers.get("sec-fetch-site");
	if (site && site !== "same-origin" && site !== "none") return noStore({
		ok: false,
		error: "forbidden"
	}, 403);
	if (!site) {
		const origin = request.headers.get("origin");
		if (origin && origin !== siteOrigin) return noStore({
			ok: false,
			error: "forbidden"
		}, 403);
	}
}
//#endregion
export { limiter as a, requestIpHash as c, startedAt as d, RateLimiter as f, visitorHash as g, visitorCookieName as h, isSecureSite as i, revalidateState as l, newVisitorId as m, failLimiter as n, noStore as o, VISITOR_ID_RE as p, inflight as r, rejectCrossSite as s, ADMIN_MAX_JSON_BODY as t, socketAddressOf as u };
