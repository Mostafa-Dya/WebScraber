import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { jt as REVALIDATE_SECRET, r as getCache, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { c as requestIpHash, l as revalidateState, n as failLimiter, o as noStore } from "./api_jzoAbQWC.mjs";
import { n as invalidateRoutes } from "./invalidate_Bf_aEQKS.mjs";
import { createHash, timingSafeEqual } from "node:crypto";
var FAIL_LIMIT = 10;
var FAIL_WINDOW_MS = 6e5;
function secretsMatch(provided, expected) {
	if (!provided || !expected) return false;
	const a = createHash("sha256").update(provided).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}
function bearerToken(authorization) {
	return /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
}
/**
* Step 1 (no body read, no cache): the constant 401 for any JSON request that fails authentication.
* (Requests without a JSON content type never get here: Astro's origin check answers 403 first.)
*/
function authorize(input, deps) {
	const failKey = `reval-fail:${input.ipHash}`;
	if (!deps.failLimiter.wouldAllow(failKey, FAIL_LIMIT, FAIL_WINDOW_MS).ok) return false;
	if (!secretsMatch(input.token, deps.secret)) {
		deps.failLimiter.allow(failKey, FAIL_LIMIT, FAIL_WINDOW_MS);
		return false;
	}
	return true;
}
async function handleRevalidate(input, deps) {
	if (!authorize(input, deps)) return {
		status: 401,
		body: { ok: false }
	};
	const now = deps.now ?? Date.now;
	const coalesceMs = deps.coalesceMs ?? 4e3;
	const source = typeof input.source === "string" ? input.source.slice(0, 32) : "unknown";
	let cache;
	try {
		cache = deps.getCache();
	} catch {
		return {
			status: 503,
			body: {
				ok: false,
				error: "catalogue unavailable",
				source
			}
		};
	}
	const t = now();
	if (t - deps.state.lastBustAt < coalesceMs) return {
		status: 202,
		body: {
			ok: true,
			coalesced: true,
			source
		}
	};
	deps.state.lastBustAt = t;
	const snapshot = await cache.bust().catch(() => void 0);
	await deps.invalidateRoutes();
	const health = cache.health();
	return {
		status: health.lastRefreshOk ? 200 : 503,
		body: {
			ok: health.lastRefreshOk,
			refreshed: health.lastRefreshOk,
			source,
			snapshotAgeSec: health.snapshotAgeSec,
			rugs: snapshot?.catalogue.rugs.length ?? health.rugs,
			lastError: health.lastError
		}
	};
}
//#endregion
//#region src/pages/api/revalidate.ts
var revalidate_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = async (context) => {
	const { request } = context;
	const token = bearerToken(request.headers.get("authorization"));
	const ipHash = requestIpHash(request);
	if (!authorize({
		token,
		ipHash
	}, {
		secret: REVALIDATE_SECRET,
		failLimiter
	})) return noStore({ ok: false }, 401);
	let source;
	try {
		if ((request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json") && Number(request.headers.get("content-length") ?? 0) <= 4096) source = (await request.json())?.source;
	} catch {}
	const result = await handleRevalidate({
		token,
		ipHash,
		source
	}, {
		secret: REVALIDATE_SECRET,
		getCache,
		invalidateRoutes: () => invalidateRoutes(context, consoleLogger),
		failLimiter,
		state: revalidateState
	});
	return noStore(result.body, result.status);
};
var ALL = () => noStore({
	ok: false,
	error: "method not allowed"
}, 405, { allow: "POST" });
//#endregion
//#region \0virtual:astro:page:src/pages/api/revalidate@_@ts
var page = () => revalidate_exports;
//#endregion
export { page };
