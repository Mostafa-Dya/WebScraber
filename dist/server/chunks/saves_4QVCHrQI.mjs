import { V as TABS, g as assertHeaders } from "./runtime_r-OJmEZZ.mjs";
//#region src/lib/admin/saves.ts
/** Bounded by the existing 200 000-row growth breaker (handler.ts MAX_VOTES_ROWS). */
var SAVES_READ_RANGE = `${TABS.reactions}!A1:F200001`;
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
var text = (v) => v === void 0 || v === null ? "" : String(v).trim();
function buildSavesReport(votes, rugs, clients, now = Date.now) {
	assertHeaders(TABS.reactions, votes?.[0]);
	const decided = /* @__PURE__ */ new Set();
	const likers = /* @__PURE__ */ new Map();
	const dislikers = /* @__PURE__ */ new Map();
	const byClient = /* @__PURE__ */ new Map();
	let rowsRead = 0;
	let rowsDropped = 0;
	for (let i = 1; i < (votes?.length ?? 0); i++) {
		const cells = votes[i] ?? [];
		if (cells.every((c) => text(c) === "")) continue;
		rowsRead++;
		const customer = text(cells[1]);
		const rugId = text(cells[2]);
		const reaction = text(cells[3]).toLowerCase();
		if (!ID_RE.test(rugId) || !CLIENT_RE.test(customer)) {
			rowsDropped++;
			continue;
		}
		if (reaction !== "like" && reaction !== "dislike" && reaction !== "none") {
			rowsDropped++;
			continue;
		}
		const key = `${customer} ${rugId}`;
		if (decided.has(key)) continue;
		decided.add(key);
		if (reaction === "none") continue;
		const bucket = reaction === "like" ? likers : dislikers;
		let set = bucket.get(rugId);
		if (!set) {
			set = /* @__PURE__ */ new Set();
			bucket.set(rugId, set);
		}
		set.add(customer);
		let c = byClient.get(customer);
		if (!c) {
			c = {
				liked: /* @__PURE__ */ new Set(),
				disliked: /* @__PURE__ */ new Set()
			};
			byClient.set(customer, c);
		}
		(reaction === "like" ? c.liked : c.disliked).add(rugId);
	}
	const rugById = new Map(rugs.map((r) => [r.id, r]));
	const ref = (rugId) => {
		const r = rugById.get(rugId);
		return r ? {
			rugId,
			name: r.name,
			slug: r.slug,
			status: r.status
		} : {
			rugId,
			name: rugId,
			slug: "",
			status: "unknown"
		};
	};
	const mostSaved = [.../* @__PURE__ */ new Set([...likers.keys(), ...dislikers.keys()])].map((rugId) => ({
		...ref(rugId),
		saves: likers.get(rugId)?.size ?? 0,
		dislikes: dislikers.get(rugId)?.size ?? 0
	})).sort((a, b) => b.saves - a.saves || a.name.localeCompare(b.name) || a.rugId.localeCompare(b.rugId));
	const knownByCode = new Map(clients.map((c) => [c.code.toLowerCase(), c]));
	const sortRefs = (ids) => [...ids].map(ref).sort((a, b) => a.name.localeCompare(b.name) || a.rugId.localeCompare(b.rugId));
	const byClientOut = [...byClient.entries()].map(([code, sets]) => {
		const known = knownByCode.get(code.toLowerCase());
		const entry = {
			code,
			name: code === "anon" ? "anonymous" : known?.name ?? code,
			known: Boolean(known),
			liked: sortRefs(sets.liked),
			disliked: sortRefs(sets.disliked)
		};
		if (known) entry.status = known.status;
		return entry;
	}).sort((a, b) => {
		const rank = (c) => c.code === "anon" ? 2 : c.known ? 0 : 1;
		return rank(a) - rank(b) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
	});
	return {
		generatedAt: new Date(now()).toISOString(),
		mostSaved,
		byClient: byClientOut,
		rowsRead,
		rowsDropped
	};
}
//#endregion
export { buildSavesReport as n, SAVES_READ_RANGE as t };
