import { A as slugify, D as displayCollection, E as collectionSlugs, T as collectionSlug, k as normaliseKey, pt as driveImageUrl, v as orderedCollectionNames } from "./runtime_r-OJmEZZ.mjs";
//#region src/lib/rotate.ts
function dataRot(rotate) {
	if (rotate === "force") return "force";
	return rotate === "true" ? "1" : "0";
}
//#endregion
//#region src/lib/view.ts
var BUCKETS = [
	["1-2", .5],
	["2-3", 2 / 3],
	["3-4", .75],
	["1-1", 1],
	["4-3", 4 / 3],
	["3-2", 1.5],
	["2-1", 2]
];
var LANDSCAPE = [
	"1-1",
	"4-3",
	"3-2",
	"2-1"
];
/**
* The plate a photo is shown in, predicted before the first byte: portrait when the sheet says so
* (rot '1') or when the rug is longer than wide; unknown dims → the reference's 3/4.
*/
function plateRatio(widthCm, lengthCm, rot) {
	if (!widthCm || !lengthCm) return "3-4";
	const lo = Math.min(widthCm, lengthCm);
	const hi = Math.max(widthCm, lengthCm);
	const r = rot === "1" || lengthCm >= widthCm ? lo / hi : hi / lo;
	let best = "3-4";
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [bucket, value] of BUCKETS) {
		const d = Math.abs(Math.log(r) - Math.log(value));
		if (d < bestDistance) {
			bestDistance = d;
			best = bucket;
		}
	}
	return best;
}
function activeRugs(catalogue) {
	return catalogue.rugs.filter((r) => r.status === "active");
}
function tagSlug(name, tags) {
	return tags.find((t) => normaliseKey(t.name) === normaliseKey(name))?.slug ?? slugify(name);
}
/**
* Tags that earn a corner badge on the card (owner, 2026-09-13): "whenever a product has the tag
* Signed or/and Antique, this should be visible as a tag on the top left corner of the product card
* for both admin and customer".
*
* Two names, not a general "badge any tag" mechanism: these two say something about provenance that
* a buyer scanning a grid wants to see without opening anything. Badging every tag would turn the
* corner into a second filter strip and bury exactly the signal this is for.
*/
var BADGE_TAG_NAMES = ["Signed", "Antique"];
/**
* The badges a rug's tags earn, in BADGE_TAG_NAMES order rather than the sheet's.
*
* Fixed order so a rug that is both Signed and Antique always reads the same way round, whichever
* order the owner happened to type the tags in. Matching is case-insensitive: the Tags tab holds the
* canonical spelling, but a rug row may carry whatever the owner typed.
*/
function badgesFor(tagNames) {
	const have = new Set(tagNames.map(normaliseKey));
	return BADGE_TAG_NAMES.filter((name) => have.has(normaliseKey(name)));
}
/** The like count to display, or undefined when it has not yet earned its place on the card. */
function visibleLikes(likes) {
	return likes !== void 0 && likes >= 5 ? likes : void 0;
}
function cardView(rug, catalogue) {
	const photoUrls = rug.photos.map((id) => driveImageUrl(id, 1600));
	return {
		id: rug.id,
		slug: rug.slug,
		name: rug.name,
		collection: displayCollection(rug.collection),
		collectionSlug: collectionSlug(rug.collection, catalogue.collections),
		collections: (rug.collections?.length ? rug.collections : [""]).map(displayCollection),
		collectionSlugs: collectionSlugs(rug.collections ?? [], catalogue.collections),
		photoUrl: rug.photos[0] ? driveImageUrl(rug.photos[0], 800) : void 0,
		photoUrls,
		rot: dataRot(rug.rotate),
		widthCm: rug.widthCm,
		lengthCm: rug.lengthCm,
		material: rug.material,
		age: rug.age,
		origin: rug.origin,
		method: rug.method,
		pile: rug.pile,
		description: rug.description,
		priceUsd: rug.priceUsd,
		likes: rug.likes,
		dislikes: rug.dislikes,
		rating: rug.rating,
		tags: rug.tags.map((name) => ({
			name,
			slug: tagSlug(name, catalogue.tags)
		})),
		ar: plateRatio(rug.widthCm, rug.lengthCm, dataRot(rug.rotate)),
		featured: rug.featured,
		photoIds: rug.photos,
		altPhotoUrl: rug.photos[1] ? driveImageUrl(rug.photos[1], 800) : void 0
	};
}
/**
* Lead-first ordering (docs/DESIGN.md §3.5): in every collection with at least three rugs, the first
* featured rug whose plate is landscape or square moves to the front of the collection's run and
* spans two columns. Idempotent; everything else keeps its relative order.
*/
function withLeads(cards) {
	const out = cards.map((c) => ({
		...c,
		lead: false
	}));
	const runs = /* @__PURE__ */ new Map();
	for (const c of out) {
		const run = runs.get(c.collectionSlug) ?? [];
		run.push(c);
		runs.set(c.collectionSlug, run);
	}
	for (const run of runs.values()) {
		if (run.length < 3) continue;
		const lead = run.find((c) => c.featured === true && LANDSCAPE.includes(c.ar ?? "3-4"));
		if (!lead) continue;
		lead.lead = true;
		const firstIdx = out.indexOf(run[0]);
		const leadIdx = out.indexOf(lead);
		if (leadIdx !== firstIdx) {
			out.splice(leadIdx, 1);
			out.splice(firstIdx, 0, lead);
		}
	}
	return out;
}
/**
* The cards that share at least one collection with `me`, in grid order.
*
* Overlap rather than equal primaries (owner requirement 2026-09-13): a rug filed under both Kilims
* and Antique sits in two runs, and a buyer browsing either one should be able to walk to it. `me`
* is always in the result, because a card always shares a collection with itself.
*/
function sameCollectionRun(cards, me) {
	const mine = new Set(me.collectionSlugs);
	return cards.filter((c) => c.collectionSlugs.some((s) => mine.has(s)));
}
/** Position of a rug within its collection, in grid order; no wrap-around. */
function siblings(cards, slug) {
	const me = cards.find((c) => c.slug === slug);
	if (!me) return void 0;
	const run = sameCollectionRun(cards, me);
	const i = run.indexOf(me);
	return {
		index: i,
		total: run.length,
		prev: run[i - 1],
		next: run[i + 1]
	};
}
/** Up to n rugs from the same collection, starting after the current one and wrapping around. */
function relatedCards(cards, slug, n = 4) {
	const me = cards.find((c) => c.slug === slug);
	if (!me) return [];
	const run = sameCollectionRun(cards, me);
	const i = run.indexOf(me);
	return [...run.slice(i + 1), ...run.slice(0, i)].slice(0, n);
}
/**
* Tabs in the reference order (Collections.sort_order, else the ORDER list), with counts.
* Every spelling that resolves to one slug ("Kilims" / "kilims" / "Wabi-sabi" / "Wabi Sabi") is one
* tab whose count matches the cards the client filter shows; blank collections count under "More".
*/
function navTabs(rugs, catalogue) {
	const displayed = rugs.map((r) => ({
		...r,
		collection: displayCollection(r.collection),
		collections: (r.collections?.length ? r.collections : [""]).map(displayCollection)
	}));
	const names = orderedCollectionNames(displayed, catalogue.collections);
	const tabs = [];
	const seen = /* @__PURE__ */ new Set();
	for (const name of names) {
		const slug = collectionSlug(name, catalogue.collections);
		if (seen.has(slug)) continue;
		seen.add(slug);
		const canonical = catalogue.collections.find((c) => c.slug === slug)?.name ?? name;
		tabs.push({
			name: canonical,
			slug,
			count: displayed.filter((r) => collectionSlugs(r.collections, catalogue.collections).includes(slug)).length,
			description: catalogue.collections.find((c) => c.slug === slug)?.description.trim() ?? ""
		});
	}
	return tabs;
}
/** "4.6 · 23 votes" in the mono meta idiom; null when nobody has voted. */
function ratingText(likes, dislikes, rating) {
	const votes = likes + dislikes;
	if (votes === 0) return null;
	return `${rating.toFixed(1)} · ${votes} ${votes === 1 ? "vote" : "votes"}`;
}
function rugsWithTag(rugs, slug, catalogue) {
	const tag = catalogue.tags.find((t) => t.slug === slug);
	const matches = rugs.filter((r) => r.tags.some((name) => tagSlug(name, catalogue.tags) === slug));
	if (!tag && matches.length === 0) return void 0;
	return {
		name: tag?.name ?? matches[0]?.tags.find((n) => tagSlug(n, catalogue.tags) === slug) ?? slug,
		rugs: matches
	};
}
/**
* JSON safe for a <script type="application/json"> block (ADR D12): `<`, `>`, `&` and the two
* Unicode line separators become JSON \uXXXX escapes so <\/script> can never appear.
*/
function jsonForScript(value) {
	return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
var SLUG_PARAM_RE = /^[a-z0-9-]{1,80}$/;
//#endregion
export { cardView as a, ratingText as c, siblings as d, tagSlug as f, dataRot as h, badgesFor as i, relatedCards as l, withLeads as m, SLUG_PARAM_RE as n, jsonForScript as o, visibleLikes as p, activeRugs as r, navTabs as s, BADGE_TAG_NAMES as t, rugsWithTag as u };
