import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { Pt as VOTE_SALT, i as getClient, r as getCache, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as isReservedSlug, c as verifyCustomerToken, n as customerCookieName, t as SLUG_RE } from "./auth_rJQKmKue.mjs";
import { a as limiter, c as requestIpHash, g as visitorHash, h as visitorCookieName, i as isSecureSite, m as newVisitorId, o as noStore, p as VISITOR_ID_RE, r as inflight, s as rejectCrossSite } from "./api_jzoAbQWC.mjs";
import { r as insertReactionRows } from "./write_BpgUvStU.mjs";
import { r as customerRuntime } from "./http_B6fRxdq_.mjs";
import { p as visibleLikes } from "./view_DFjKAQIO.mjs";
import * as z from "zod";
//#region src/lib/votes/handler.ts
var DEFAULT_LIMITS = {
	perVisitor: {
		limit: 120,
		windowMs: 6e5
	},
	perIp: {
		limit: 240,
		windowMs: 6e5
	},
	perRugPerIp: {
		limit: 20,
		windowMs: 36e5
	},
	global: {
		limit: 30,
		windowMs: 6e4
	}
};
var Item = z.object({
	productId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
	reaction: z.enum([
		"like",
		"dislike",
		"none"
	]),
	source: z.enum(["card", "detail"]).default("card")
});
/** A single reaction or a flushed batch; the single form keeps the endpoint easy to curl. */
var Body = z.union([z.object({ items: z.array(Item).min(1).max(25) }), Item.transform((i) => ({ items: [i] }))]);
function toState(v) {
	return v === "like" ? "liked" : v === "dislike" ? "disliked" : "none";
}
async function handleReactions(input, deps) {
	const limits = deps.limits ?? DEFAULT_LIMITS;
	const now = deps.now ?? Date.now;
	const newId = deps.eventId ?? (() => crypto.randomUUID());
	const parsed = Body.safeParse(input.body);
	if (!parsed.success) return {
		status: 400,
		body: {
			ok: false,
			error: "bad request"
		}
	};
	const items = parsed.data.items;
	if (items.some((i) => i.source === "card" && i.reaction === "dislike")) return {
		status: 400,
		body: {
			ok: false,
			error: "a card cannot dislike"
		}
	};
	const ids = [...new Set(items.map((i) => i.productId))];
	const keys = [
		[`v:${input.visitorHash}`, limits.perVisitor],
		[`ip:${input.ipHash}`, limits.perIp],
		...ids.map((id) => [`rug:${id}:${input.ipHash}`, limits.perRugPerIp]),
		["global", limits.global]
	];
	for (const [key, l] of keys) {
		const d = deps.limiter.wouldAllow(key, l.limit, l.windowMs);
		if (!d.ok) return {
			status: 429,
			body: {
				ok: false,
				error: "too many votes"
			},
			retryAfterSec: d.retryAfterSec
		};
	}
	let snapshot;
	try {
		snapshot = await deps.cache.get();
	} catch {
		return {
			status: 503,
			body: {
				ok: false,
				error: "catalogue unavailable"
			},
			retryAfterSec: 60
		};
	}
	const total = deps.cache.votesRowsTotal;
	if (total !== void 0 && total > (deps.maxVotesRows ?? 2e5)) {
		deps.logger?.error("reactions growth breaker tripped", { reactionRowsTotal: total });
		return {
			status: 503,
			body: {
				ok: false,
				error: "voting is paused"
			},
			retryAfterSec: 3600
		};
	}
	const guards = ids.map((id) => `${input.visitorHash}|${id}`);
	if (guards.some((g) => deps.inflight.has(g))) return {
		status: 429,
		body: {
			ok: false,
			error: "vote in progress"
		},
		retryAfterSec: 1
	};
	for (const g of guards) deps.inflight.add(g);
	try {
		const createdAt = new Date(now()).toISOString();
		const rows = [];
		const applied = [];
		const results = [];
		let unknown = 0;
		for (const item of items) {
			const product = snapshot.catalogue.rugs.find((r) => r.id === item.productId && r.status === "active");
			if (!product) {
				unknown++;
				continue;
			}
			const previous = deps.cache.currentVote(input.visitorHash, item.productId);
			const next = item.reaction;
			const nextVote = next === "none" ? "none" : next;
			if (nextVote !== previous) {
				rows.push({
					eventId: newId(),
					customerSlug: input.visitorHash,
					productId: item.productId,
					reaction: next,
					source: item.source,
					createdAt
				});
				const a = deps.cache.applyVote(item.productId, input.visitorHash, previous, nextVote);
				if (a) applied.push({
					delta: a.delta,
					productId: item.productId
				});
			}
			const fresh = deps.cache.peek()?.catalogue.rugs.find((r) => r.id === item.productId) ?? product;
			results.push({
				productId: item.productId,
				state: toState(nextVote),
				likes: fresh.likes,
				dislikes: fresh.dislikes,
				rating: fresh.rating
			});
		}
		if (results.length === 0 && unknown > 0) return {
			status: 400,
			body: {
				ok: false,
				error: "unknown rug"
			}
		};
		if (rows.length === 0) return {
			status: 200,
			body: {
				ok: true,
				results
			}
		};
		for (const [key, l] of keys) deps.limiter.allow(key, l.limit, l.windowMs);
		try {
			await deps.insert(rows);
		} catch (e) {
			for (const a of applied) deps.cache.discardVote(a.delta);
			for (const [key] of keys) deps.limiter.refund(key);
			deps.logger?.error("reaction write failed", {
				error: serializeError(e),
				count: rows.length
			});
			return {
				status: 503,
				body: {
					ok: false,
					error: "could not record the vote"
				},
				retryAfterSec: 30
			};
		}
		for (const r of results) {
			const fresh = deps.cache.peek()?.catalogue.rugs.find((p) => p.id === r.productId);
			if (fresh) {
				r.likes = fresh.likes;
				r.dislikes = fresh.dislikes;
				r.rating = fresh.rating;
			}
		}
		return {
			status: 200,
			body: {
				ok: true,
				results
			}
		};
	} finally {
		for (const g of guards) deps.inflight.delete(g);
	}
}
//#endregion
//#region src/pages/api/reactions.ts
var reactions_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var ONE_YEAR = 31536e3;
/** The verified customer slug this batch belongs to, or undefined. */
function claimedCustomer(body, cookies) {
	if (!customerRuntime.configured || !customerRuntime.secret) return void 0;
	const claim = body?.customer;
	if (typeof claim !== "string") return void 0;
	const slug = claim.toLowerCase();
	if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return void 0;
	const token = cookies.get(customerCookieName(slug, customerRuntime.isSecureSite))?.value;
	return verifyCustomerToken(token, slug, customerRuntime.secret, Date.now())?.slug;
}
var POST = async ({ request, cookies }) => {
	const rejected = rejectCrossSite(request);
	if (rejected) return rejected;
	let body;
	try {
		body = await request.json();
	} catch {
		return noStore({
			ok: false,
			error: "bad request"
		}, 400);
	}
	const cookieName = visitorCookieName(isSecureSite);
	let visitorId = cookies.get(cookieName)?.value;
	if (!visitorId || !VISITOR_ID_RE.test(visitorId)) visitorId = newVisitorId();
	let deps;
	try {
		const cache = getCache();
		const client = getClient();
		deps = {
			cache,
			insert: (rows) => insertReactionRows(client, rows),
			limiter,
			inflight,
			logger: consoleLogger
		};
	} catch {
		return noStore({
			ok: false,
			error: "catalogue unavailable"
		}, 503, { "retry-after": "60" });
	}
	const customer = claimedCustomer(body, cookies);
	const result = await handleReactions({
		body,
		visitorHash: customer ?? `anon-${visitorHash(VOTE_SALT, visitorId)}`,
		ipHash: requestIpHash(request)
	}, deps);
	cookies.set(cookieName, visitorId, {
		httpOnly: true,
		secure: isSecureSite,
		sameSite: "lax",
		path: "/",
		maxAge: ONE_YEAR
	});
	const headers = {};
	if (result.retryAfterSec) headers["retry-after"] = String(result.retryAfterSec);
	return noStore(withVisibleCounts(result.body, customer !== void 0), result.status, headers);
};
/**
* Apply the >= 5 like threshold to what a NAMED BUYER is told (owner requirement, 2026-09-13).
*
* The endpoint echoed every product's exact `likes`, `dislikes` and `rating` back to whoever asked.
* That made it a read oracle rather than a side effect of voting: a body of 25 `reaction: "none"`
* items writes nothing, spends no rate-limit budget, and returns 25 exact counts — so hiding the
* number on the card achieved nothing.
*
* The split is by realm, because the two realms genuinely differ. A named buyer is in the private
* preview, where the threshold applies and where nothing reads these fields anyway (the preview card
* has no `[data-rating-for]`, which is all `paintCounts` updates). An anonymous visitor is on the
* public catalogue, whose card renders a real "4.6 · 23 votes" line and needs the totals to repaint
* it. `rating` goes with `likes`: it is `likes / (likes + dislikes) x 5`, so returning it alongside
* `dislikes` hands back the count the threshold just removed.
*/
function withVisibleCounts(body, isNamedCustomer) {
	if (!isNamedCustomer || !body.results) return body;
	return {
		...body,
		results: body.results.map((r) => {
			const shown = visibleLikes(r.likes);
			return shown === void 0 ? {
				...r,
				likes: 0,
				dislikes: 0,
				rating: 0
			} : {
				...r,
				likes: shown
			};
		})
	};
}
var ALL = () => noStore({
	ok: false,
	error: "method not allowed"
}, 405, { allow: "POST" });
//#endregion
//#region \0virtual:astro:page:src/pages/api/reactions@_@ts
var page = () => reactions_exports;
//#endregion
export { page };
