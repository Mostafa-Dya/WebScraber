import { C as sizeLabelOf, G as hostnameProblem, H as JINA_HOST, J as SCRAPED_FIELDS, K as isAllowedImageUrl, S as sizeBandOf, U as SUPPLIER_HOSTS, W as guardedAgent, Y as ScrapeError, bt as silentLogger, q as validateOutboundUrl, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { r as supplierRetail, t as pricingRuleName } from "./price_C7z5lVb8.mjs";
import { fetch } from "undici";
import * as cheerio from "cheerio";
var ScrapeCache = class {
	ttlMs;
	max;
	now;
	entries = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		this.ttlMs = options.ttlMs ?? 9e5;
		this.max = options.maxEntries ?? 100;
		this.now = options.now ?? Date.now;
	}
	get(key) {
		const hit = this.entries.get(key);
		if (!hit) return void 0;
		if (this.now() - hit.at >= this.ttlMs) {
			this.entries.delete(key);
			return;
		}
		this.entries.delete(key);
		this.entries.set(key, hit);
		return hit;
	}
	set(key, value) {
		this.entries.delete(key);
		this.entries.set(key, {
			data: value.data,
			via: value.via,
			at: this.now()
		});
		while (this.entries.size > this.max) {
			const oldest = this.entries.keys().next().value;
			if (oldest === void 0) break;
			this.entries.delete(oldest);
		}
	}
	delete(key) {
		this.entries.delete(key);
	}
	clear() {
		this.entries.clear();
	}
	get size() {
		return this.entries.size;
	}
};
/** The process-wide cache used by `scrapeRug` unless a caller supplies its own. */
var defaultScrapeCache = new ScrapeCache();
//#endregion
//#region src/lib/scrape/detect.ts
var ECG_HOSTS = ["ecarpetgallery.com", "www.ecarpetgallery.com"];
var KV_HOSTS = ["karavanrug.com", "www.karavanrug.com"];
/** `/us_en/red-5x8-andelz-area-rugs-380114` → urlKey + sku (store code optional, forced to us_en). */
var ECG_PATH_RE = /^\/(?:(us_en|ca_en|eu_en|ca_fr)\/)?([a-z0-9-]+?-(\d{4,}))\/?$/;
/** `/products/<handle>` (Shopify). */
var KV_PATH_RE = /^\/products\/([a-z0-9-]+)\/?$/;
var ECG_BASE = "https://ecarpetgallery.com/us_en/";
var KV_BASE = "https://karavanrug.com/products/";
function supplierForHost(hostname) {
	const h = hostname.toLowerCase();
	if (ECG_HOSTS.includes(h)) return "ecarpetgallery";
	if (KV_HOSTS.includes(h)) return "karavanrug";
}
/**
* Parses a pasted supplier link. http is rewritten to https; userinfo, ports, tracking query/hash
* and anything off the allow-list are refused. Paths are compared lowercased ([assumption]: Magento
* url keys and Shopify handles are lowercase).
*/
function detectSupplier(input) {
	const raw = input.trim();
	if (!raw) return { error: "invalid_url" };
	let url;
	try {
		url = new URL(raw);
	} catch {
		return { error: "invalid_url" };
	}
	if (url.protocol === "http:") url.protocol = "https:";
	if (url.protocol !== "https:") return { error: "invalid_url" };
	if (url.username || url.password || url.port) return { error: "invalid_url" };
	if (hostnameProblem(url.hostname)) return { error: "invalid_url" };
	const supplier = supplierForHost(url.hostname);
	if (!supplier) return { error: "unsupported_host" };
	const path = url.pathname.toLowerCase();
	if (supplier === "ecarpetgallery") {
		const m = ECG_PATH_RE.exec(path);
		const urlKey = m?.[2];
		const sku = m?.[3];
		if (!urlKey || !sku) return { error: "invalid_url" };
		const sourceUrl = `${ECG_BASE}${urlKey}`;
		return {
			supplier,
			urlKey,
			sku,
			supplierRef: sku,
			sourceUrl,
			htmlUrl: sourceUrl
		};
	}
	const handle = KV_PATH_RE.exec(path)?.[1];
	if (!handle) return { error: "invalid_url" };
	const sourceUrl = `${KV_BASE}${handle}`;
	return {
		supplier,
		handle,
		supplierRef: handle,
		sourceUrl,
		jsUrl: `${sourceUrl}.js`,
		jsonUrl: `${sourceUrl}.json`,
		htmlUrl: sourceUrl
	};
}
/**
* Manual-entry pre-fill (§4.8): supplier and reference from the pasted URL alone — the last 4+ digit
* run for ECG, the handle for KV — even when the link is not a product page. Undefined for other hosts.
*/
function manualFallback(input) {
	const raw = input.trim();
	if (!raw) return void 0;
	let url;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return;
	}
	const host = url.hostname.toLowerCase();
	const supplier = /(^|\.)ecarpetgallery\.com$/.test(host) ? "ecarpetgallery" : /(^|\.)karavanrug\.com$/.test(host) ? "karavanrug" : void 0;
	if (!supplier) return void 0;
	if (url.protocol === "http:") url.protocol = "https:";
	url.search = "";
	url.hash = "";
	url.username = "";
	url.password = "";
	const path = url.pathname;
	return {
		supplier,
		supplierRef: supplier === "ecarpetgallery" ? [...path.matchAll(/\d{4,}/g)].at(-1)?.[0] ?? "" : /\/products\/([a-z0-9-]+)/i.exec(path)?.[1]?.toLowerCase() ?? "",
		sourceUrl: url.toString()
	};
}
/** The manual pre-fill for a successfully detected link. */
function manualFromDetected(det) {
	return {
		supplier: det.supplier,
		supplierRef: det.supplierRef,
		sourceUrl: det.sourceUrl
	};
}
//#endregion
//#region src/lib/scrape/text.ts
/** Whitespace-collapsed, trimmed string; '' for nothing. */
function collapse(s) {
	return (s ?? "").replace(/\s+/g, " ").trim();
}
//#endregion
//#region src/lib/scrape/money.ts
var CODE_RE = /\b(USD|CAD|EUR|GBP|TRY|AED|SAR|MXN|AUD|CHF|JPY)\b/i;
var NUMBER_RE = /\d(?:[\d.,]|\s(?=\d))*\d|\d/;
/** ISO-4217-looking code → uppercase; anything else undefined. */
function normaliseCurrency(code) {
	if (typeof code !== "string") return void 0;
	const c = code.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(c) ? c : void 0;
}
/**
* Amount from free text: keeps digits and separators; with both `,` and `.` the last one is the
* decimal separator; a lone `,` followed by exactly two digits is decimal, otherwise thousands;
* repeated `.` are thousands. `USD $1,290 Estimated Retail` → 1290, `4,000.00` → 4000,
* `1.234,50` → 1234.5, `1,50` → 1.5.
*/
function parseAmount(text) {
	if (!text) return void 0;
	const m = NUMBER_RE.exec(text);
	if (!m) return void 0;
	let s = m[0].replace(/\s+/g, "");
	const lastComma = s.lastIndexOf(",");
	const lastDot = s.lastIndexOf(".");
	if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
	else if (lastComma >= 0) s = s.split(",").length - 1 === 1 && /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
	else if (lastDot >= 0) {
		if (s.split(".").length - 1 > 1) s = s.replace(/\./g, "");
	}
	const n = Number(s);
	return Number.isFinite(n) && n >= 0 ? n : void 0;
}
/** Currency from a code or a symbol: `CA$`/`C$` → CAD, `US$`/`$` → USD, `€`, `£`, `₺`/`TL` → TRY. */
function detectCurrency(text) {
	if (!text) return void 0;
	const code = CODE_RE.exec(text)?.[1];
	if (code) return code.toUpperCase();
	if (/(?:CA|C)\$/.test(text)) return "CAD";
	if (/US\$|\$/.test(text)) return "USD";
	if (text.includes("€")) return "EUR";
	if (text.includes("£")) return "GBP";
	if (text.includes("₺") || /\bTL\b/.test(text)) return "TRY";
}
/** `USD $700 ECARPETGALLERY` → { amount: 700, currency: 'USD' }; undefined without an amount. */
function parseMoney(text) {
	const amount = parseAmount(text);
	if (amount === void 0) return void 0;
	return {
		amount,
		currency: detectCurrency(text)
	};
}
/**
* `priceUsd = seenPrice` when USD; otherwise the Rates-tab conversion (flagged as an estimate);
* undefined (manual entry) when no rate exists. A missing currency is treated as USD.
*/
function priceToUsd(seenPrice, seenCurrency, convert) {
	if (seenPrice === void 0 || !Number.isFinite(seenPrice)) return {};
	const currency = normaliseCurrency(seenCurrency) ?? "USD";
	if (currency === "USD") return { priceUsd: seenPrice };
	const converted = convert?.(seenPrice, currency);
	if (converted !== void 0 && Number.isFinite(converted) && converted > 0) return {
		priceUsd: Math.round(converted * 100) / 100,
		warning: `price converted from ${currency} ${seenPrice} with the Rates tab (estimate)`
	};
	return { warning: `price is in ${currency} and no rate is available — enter the USD price manually` };
}
//#endregion
//#region src/lib/scrape/jsonld.ts
function isRecord$2(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str$2(v) {
	if (typeof v === "string") return collapse(v) || void 0;
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
}
/** Every object node found in the page's ld+json scripts (arrays and `@graph` walked). */
function jsonLdNodes($) {
	const out = [];
	const walk = (node) => {
		if (Array.isArray(node)) for (const n of node) walk(n);
		else if (isRecord$2(node)) {
			out.push(node);
			if (node["@graph"] !== void 0) walk(node["@graph"]);
		}
	};
	$("script[type=\"application/ld+json\"]").each((_, el) => {
		const raw = $(el).text();
		if (!raw.trim()) return;
		try {
			walk(JSON.parse(raw));
		} catch {}
	});
	return out;
}
function hasType(node, type) {
	const t = node["@type"];
	if (typeof t === "string") return t === type;
	return Array.isArray(t) && t.includes(type);
}
function imageList(v) {
	const list = Array.isArray(v) ? v : v === void 0 ? [] : [v];
	const out = [];
	for (const item of list) {
		const url = typeof item === "string" ? item : isRecord$2(item) ? str$2(item.url ?? item.contentUrl) : void 0;
		if (url) out.push(url);
	}
	return out;
}
/** The first `@type: Product` node with its first Offer flattened. */
function findLdProduct(nodes) {
	const product = nodes.find((n) => hasType(n, "Product"));
	if (!product) return void 0;
	const offersRaw = product.offers;
	const offer = Array.isArray(offersRaw) ? offersRaw.find(isRecord$2) : isRecord$2(offersRaw) ? offersRaw : void 0;
	const priceRaw = offer?.price ?? offer?.lowPrice;
	const price = typeof priceRaw === "number" ? priceRaw : parseAmount(str$2(priceRaw));
	return {
		name: str$2(product.name),
		description: typeof product.description === "string" ? product.description.trim() || void 0 : void 0,
		sku: str$2(product.sku) ?? str$2(offer?.sku),
		price,
		currency: normaliseCurrency(offer?.priceCurrency),
		images: imageList(product.image)
	};
}
/** Convenience: rung 2 straight off a loaded document. */
function extractJsonLd($) {
	return findLdProduct(jsonLdNodes($));
}
//#endregion
//#region src/lib/scrape/generic.ts
function loadHtml(html) {
	return cheerio.load(html);
}
/** First non-empty `content` among the given meta selectors. */
function metaContent($, ...selectors) {
	for (const sel of selectors) {
		const v = collapse($(sel).first().attr("content"));
		if (v) return v;
	}
}
/** Ladder rung 3 on its own: OpenGraph / `product:` meta and microdata, with no JSON-LD fallback. */
function extractOpenGraph($) {
	const priceMeta = metaContent($, "meta[property=\"product:price:amount\"]", "meta[property=\"og:price:amount\"]", "meta[itemprop=\"price\"]");
	const currencyMeta = metaContent($, "meta[property=\"product:price:currency\"]", "meta[property=\"og:price:currency\"]", "meta[itemprop=\"priceCurrency\"]");
	return {
		title: metaContent($, "meta[property=\"og:title\"]") ?? collapse($("title").first().text()) ?? void 0,
		description: metaContent($, "meta[property=\"og:description\"]", "meta[name=\"description\"]"),
		image: metaContent($, "meta[property=\"og:image:secure_url\"]", "meta[property=\"og:image\"]"),
		price: parseAmount(priceMeta),
		currency: normaliseCurrency(currencyMeta),
		sku: metaContent($, "meta[itemprop=\"sku\"]")
	};
}
/** OG/product meta → microdata → JSON-LD, in the spec's order, for the fields every adapter needs. */
function extractGeneric($) {
	const ld = findLdProduct(jsonLdNodes($));
	const og = extractOpenGraph($);
	return {
		title: og.title ?? ld?.name,
		description: og.description ?? (ld?.description ? collapse(ld.description) : void 0),
		image: og.image ?? ld?.images[0],
		price: og.price ?? ld?.price,
		currency: og.currency ?? ld?.currency,
		sku: og.sku ?? ld?.sku,
		ld
	};
}
/**
* HTML fragment → plain text, one line per block (`<br>`, `</p>`, `</div>`, `</li>`, headings…),
* entities decoded, blank lines dropped.
*/
function htmlToText(html) {
	if (!html) return "";
	const prepared = html.replace(/<br\b[^>]*>/gi, "\n").replace(/<\/(?:p|div|li|tr|h[1-6]|ul|ol|table|section|blockquote|dd|dt)>/gi, "\n").replace(/<\/(?:td|th)>/gi, " ");
	return cheerio.load(`<div id="__scrape_root">${prepared}</div>`)("#__scrape_root").text().split("\n").map((line) => collapse(line)).filter(Boolean).join("\n");
}
var LABEL_LINE_RE = /^([A-Za-z][A-Za-z &/()'-]{0,39}?)\s*:\s*(.+)$/;
/** `Label: value` lines → lowercased label → value (first occurrence wins). */
function labelValueLines(text) {
	const out = /* @__PURE__ */ new Map();
	for (const line of text.split("\n")) {
		const m = LABEL_LINE_RE.exec(line.trim());
		const label = m?.[1] ? collapse(m[1]).toLowerCase() : "";
		const value = m?.[2] ? collapse(m[2]) : "";
		if (label && value && !out.has(label)) out.set(label, value);
	}
	return out;
}
/** First keyword (case-insensitive, hyphen/space tolerant) present in `text`, in its canonical spelling. */
function firstKeyword(text, keywords) {
	const hay = text.toLowerCase();
	for (const kw of keywords) {
		const pattern = kw.toLowerCase().replace(/[-\s]+/g, "[-\\s]?");
		if (new RegExp(`\\b${pattern}\\b`).test(hay)) return kw;
	}
}
/** Splits a comma / pipe / slash separated value into tidy, non-empty parts. */
function splitList(value) {
	if (!value) return [];
	return value.split(/\s*[,|]\s*|\s+\/\s+/).map((v) => collapse(v)).filter(Boolean);
}
/** `VINTAGE LARGE RUGS` → `Vintage Large Rugs`; `terracotta` → `Terracotta`; mixed case untouched. */
function tidyTag(s) {
	const v = collapse(s);
	if (!/[a-z]/i.test(v)) return v;
	if (v === v.toUpperCase()) return v.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
	if (v === v.toLowerCase()) return v.charAt(0).toUpperCase() + v.slice(1);
	return v;
}
/** Case-insensitive de-duplication preserving first spelling and order; optional cap. */
function dedupeStrings(list, max = Number.POSITIVE_INFINITY) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const raw of list) {
		const v = collapse(raw);
		if (!v) continue;
		const key = v.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(v);
		if (out.length >= max) break;
	}
	return out;
}
//#endregion
//#region src/lib/scrape/size.ts
/** `202 x 315 cm`, `4.3 x 11.9 feet / 130 x 360 cm`, `65 x 362 cm`, `82x300 cm`. */
var CM_PAIR_RE = /(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)\s*cm\b/i;
/** `4'3" x 7'5"`, `6'8" x 10'4"`, `10'0" × 12'1"` (straight or curly quotes, inches optional). */
var FT_IN_PAIR_RE = /(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d)?)?\s*(?:"|''|”|″)?\s*[x×]\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d)?)?\s*(?:"|''|”|″)?/;
/** KV's `4.3 x 11.9 feet` / `10.0 x 12.1 ft`: the fraction is inches (last resort, flagged). */
var FEET_DOT_INCHES_PAIR_RE = /(\d{1,2})(?:\.(\d{1,2}))?\s*[x×]\s*(\d{1,2})(?:\.(\d{1,2}))?\s*(?:ft|feet)\b/i;
/** One side as ECG prints it in the Width / Length rows: `4'5"`, `10'0"`, `6' 11"`, `7'`. */
var FT_IN_SIDE_RE = /^\s*(\d{1,2})\s*(?:['’′]|ft|feet)\s*(?:(\d{1,2}(?:\.\d)?)\s*(?:"|''|”|″|in(?:ch(?:es)?)?)?)?\s*$/i;
function ftInToCm(feet, inches = 0) {
	return Math.round((feet * 12 + inches) * 2.54);
}
/** Orders a pair so that width ≤ length (the form has a swap button). */
function orderPair(a, b) {
	return a <= b ? {
		widthCm: a,
		lengthCm: b,
		swapped: false
	} : {
		widthCm: b,
		lengthCm: a,
		swapped: true
	};
}
function num$1(s) {
	return s ? Number(s.replace(",", ".")) : 0;
}
function ftInLabel(ft, inch) {
	return `${ft}'${inch}"`;
}
/** `4'5"` → 135; `10'0"` → 305; `7'` → 213; undefined for anything else. */
function parseFeetInchesSide(text) {
	if (!text) return void 0;
	const m = FT_IN_SIDE_RE.exec(text);
	if (!m?.[1]) return void 0;
	const ft = Number(m[1]);
	const inches = num$1(m[2]);
	if (!Number.isFinite(ft) || inches >= 12) return void 0;
	const cm = ftInToCm(ft, inches);
	return cm > 0 ? cm : void 0;
}
/**
* Finds a rug size anywhere in `text`: explicit cm pair first, then feet-inches, then KV's
* feet.inches shorthand. Returns integer cm ordered width ≤ length, or undefined.
*/
function parseSize(text) {
	if (!text) return void 0;
	const cm = CM_PAIR_RE.exec(text);
	if (cm?.[1] && cm[2]) {
		const a = Math.round(num$1(cm[1]));
		const b = Math.round(num$1(cm[2]));
		if (a > 0 && b > 0) {
			const ordered = orderPair(a, b);
			return {
				...ordered,
				sizeRaw: cm[0].trim(),
				source: "cm",
				note: ordered.swapped ? `width/length swapped so that width ≤ length (${cm[0].trim()})` : void 0
			};
		}
	}
	const ft = FT_IN_PAIR_RE.exec(text);
	if (ft?.[1] && ft[3]) {
		const f1 = Number(ft[1]);
		const i1 = num$1(ft[2]);
		const f2 = Number(ft[3]);
		const i2 = num$1(ft[4]);
		if (i1 < 12 && i2 < 12) {
			const a = ftInToCm(f1, i1);
			const b = ftInToCm(f2, i2);
			if (a > 0 && b > 0) {
				const ordered = orderPair(a, b);
				return {
					...ordered,
					sizeRaw: ft[0].trim(),
					source: "ftin",
					note: `no cm on page; converted ${ftInLabel(f1, i1)} × ${ftInLabel(f2, i2)} → ${ordered.widthCm} × ${ordered.lengthCm} cm${ordered.swapped ? " (swapped so that width ≤ length)" : ""}`
				};
			}
		}
	}
	const fd = FEET_DOT_INCHES_PAIR_RE.exec(text);
	if (fd?.[1] && fd[3]) {
		const f1 = Number(fd[1]);
		const i1 = fd[2] === void 0 ? 0 : Number(fd[2]);
		const f2 = Number(fd[3]);
		const i2 = fd[4] === void 0 ? 0 : Number(fd[4]);
		if (i1 < 12 && i2 < 12) {
			const a = ftInToCm(f1, i1);
			const b = ftInToCm(f2, i2);
			if (a > 0 && b > 0) {
				const ordered = orderPair(a, b);
				return {
					...ordered,
					sizeRaw: fd[0].trim(),
					source: "feet.inches",
					note: `no cm on page; read "${fd[0].trim()}" as feet.inches (${ftInLabel(f1, i1)} × ${ftInLabel(f2, i2)}) → ${ordered.widthCm} × ${ordered.lengthCm} cm — check it`
				};
			}
		}
	}
}
var SECONDARY_FAILED_WARNING = "secondary images could not be resolved; the primary photo was kept";
function asPhoto(p) {
	if (!p) return void 0;
	const photo = typeof p === "string" ? { url: p } : p;
	return photo.url && isAllowedImageUrl(photo.url) ? photo : void 0;
}
/**
* Resolves the primary image first, then the rest of the gallery. `gallery` is a thunk so its cost
* (and its failure) is contained: whatever it throws is reported through `onError` and the result
* still carries the primary photo.
*/
function resolvePhotos(gallery, opts = {}) {
	const max = opts.max ?? 12;
	const primary = asPhoto(opts.primary);
	const photos = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (p) => {
		if (!p || photos.length >= max) return;
		const key = p.original ?? p.url;
		if (seen.has(key)) return;
		seen.add(key);
		photos.push(p);
	};
	push(primary);
	let warning;
	let rest = [];
	try {
		rest = gallery();
	} catch (e) {
		warning = SECONDARY_FAILED_WARNING;
		opts.onError?.(e);
	}
	for (const p of rest) push(asPhoto(p));
	if (!photos.length) push(asPhoto(opts.fallback));
	return {
		primaryImage: photos[0]?.url,
		photos,
		warning
	};
}
/** The primary image of an already-built list (used when re-deriving a cached scrape). */
function primaryImageOf(photos) {
	return photos?.[0]?.url;
}
//#endregion
//#region src/lib/scrape/ecg.ts
/** The block page (`Attention Required! | Cloudflare`, ~5.5 KB, 403) or the JS challenge interstitial. */
var CHALLENGE_TITLE_RE = /<title>[^<]*(?:Attention Required!\s*\|\s*Cloudflare|Just a moment)/i;
var CHALLENGE_MARKER_RE = /id="cf-error-details"|window\._cf_chl_opt|data-translate="block_headline"/;
function isCloudflareChallenge(status, body, headers) {
	if (headers?.get("cf-mitigated") === "challenge") return true;
	const head = body.slice(0, 2e4);
	if (CHALLENGE_TITLE_RE.test(head)) return true;
	return (status === 403 || status === 503) && CHALLENGE_MARKER_RE.test(head);
}
/** The gallery component's inline JSON: `images: [{ thumb, img, full, caption, … }, …]`. */
var ECG_GALLERY_RE = /\bimages:\s*(\[[\s\S]*?\])\s*[,}]/;
var CACHE_SEGMENT_RE = /\/cache\/[0-9a-f]{32}\//;
/**
* GTM dataLayer `item_sku` of the `view_item` event → else the URL's sku → else the first item_sku
* on the page (related products carry their own, so they never override a known URL sku).
*/
function ecgSku(html, urlSku) {
	const view = /"event":"view_item[^"]*"[\s\S]{0,2000}?"item_sku":"(\d+)"/.exec(html)?.[1];
	if (view) return view;
	if (urlSku) return urlSku;
	return /"item_sku":"(\d+)"/.exec(html)?.[1] ?? "";
}
function isRecord$1(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str$1(v) {
	return typeof v === "string" && v.trim() ? v.trim() : void 0;
}
/** Full-size gallery images (`full` preferred), with the un-cached original as an alternative. */
function ecgGalleryPhotos(html, max = 12) {
	const raw = ECG_GALLERY_RE.exec(html)?.[1];
	if (!raw) return [];
	let entries;
	try {
		entries = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(entries)) return [];
	const photos = [];
	const seen = /* @__PURE__ */ new Set();
	for (const entry of entries) {
		if (!isRecord$1(entry)) continue;
		if (str$1(entry.type) && entry.type !== "image") continue;
		const url = str$1(entry.full) ?? str$1(entry.img) ?? str$1(entry.thumb);
		if (!url || !isAllowedImageUrl(url)) continue;
		const original = url.replace(CACHE_SEGMENT_RE, "/");
		if (seen.has(original)) continue;
		seen.add(original);
		photos.push({
			url,
			original: original !== url ? original : void 0
		});
		if (photos.length >= max) break;
	}
	return photos;
}
var TAG_ROWS = [
	"collection",
	"style",
	"pattern",
	"color",
	"rug type"
];
var IGNORED_ROWS = /* @__PURE__ */ new Set(["new", "remarks"]);
/** `table.additional-attributes` rows → lowercased label → value (junk rows dropped). */
function ecgSpecRows(html) {
	const $ = loadHtml(html);
	const specs = /* @__PURE__ */ new Map();
	$("table.additional-attributes tr").each((_, tr) => {
		const label = collapse($(tr).find("th").first().text()).toLowerCase();
		const value = collapse($(tr).find("td").first().text());
		if (!label || !value || IGNORED_ROWS.has(label) || value.toUpperCase() === "NA") return;
		if (!specs.has(label)) specs.set(label, value);
	});
	return specs;
}
/** Builds the ScrapedRug for an ECG product page (the caller has already ruled out challenge pages). */
function parseEcg(det, html) {
	const $ = loadHtml(html);
	const g = extractGeneric($);
	const warnings = [];
	const supplierTitle = collapse(g.title?.replace(/\s*\|\s*ECARPETGALLERY\s*$/i, "")) || collapse($("h1.page-title").first().text());
	const description = collapse(g.description) || collapse($(".product.attribute .value").first().text()) || void 0;
	let seenPrice = g.price;
	let seenCurrency = g.currency;
	if (seenPrice === void 0) {
		const money = parseMoney($(".pricing-div .final-price").first().text());
		if (money) {
			seenPrice = money.amount;
			seenCurrency ??= money.currency;
		}
	}
	let currencyAssumed = false;
	if (seenPrice !== void 0 && !seenCurrency) {
		seenCurrency = "USD";
		currencyAssumed = true;
		warnings.push("currency not stated on the page; USD assumed (us_en store)");
	}
	const retailEstimate = collapse($(".pricing-div .retail-price").first().text()) || void 0;
	const specs = ecgSpecRows(html);
	const widthRaw = specs.get("width");
	const lengthRaw = specs.get("length");
	const w = parseFeetInchesSide(widthRaw);
	const l = parseFeetInchesSide(lengthRaw);
	let widthCm;
	let lengthCm;
	let sizeRaw;
	const fieldStatus = {};
	if (w && l) {
		const ordered = orderPair(w, l);
		widthCm = ordered.widthCm;
		lengthCm = ordered.lengthCm;
		sizeRaw = `${widthRaw} x ${lengthRaw}`;
		fieldStatus.widthCm = "inferred";
		fieldStatus.lengthCm = "inferred";
		fieldStatus.sizeRaw = "inferred";
		warnings.push(`no cm on page; converted ${widthRaw} × ${lengthRaw} → ${widthCm} × ${lengthCm} cm${ordered.swapped ? " (swapped so that width ≤ length)" : ""}`);
	} else {
		const size = parseSize(supplierTitle);
		if (size) {
			widthCm = size.widthCm;
			lengthCm = size.lengthCm;
			sizeRaw = size.sizeRaw;
			fieldStatus.widthCm = "inferred";
			fieldStatus.lengthCm = "inferred";
			fieldStatus.sizeRaw = "inferred";
			if (size.note) warnings.push(size.note);
		}
	}
	const tagsSuggested = dedupeStrings(TAG_ROWS.flatMap((row) => splitList(specs.get(row))), 20);
	const resolved = resolvePhotos(() => ecgGalleryPhotos(html), { fallback: g.image });
	if (resolved.warning) warnings.push(resolved.warning);
	return {
		supplier: "ecarpetgallery",
		supplierRef: ecgSku(html, det.sku),
		sourceUrl: `${ECG_BASE}${det.urlKey}`,
		supplierTitle,
		description,
		widthCm,
		lengthCm,
		sizeRaw,
		material: specs.get("material"),
		method: specs.get("weave"),
		age: specs.get("age"),
		origin: specs.get("made in"),
		seenPrice,
		seenCurrency,
		currencyAssumed,
		retailEstimate,
		tagsSuggested,
		photos: resolved.photos,
		primaryImage: resolved.primaryImage,
		warnings,
		fieldStatus
	};
}
/** Content types a supplier page / Shopify endpoint may answer with. */
var TEXT_TYPES = [
	"text/html",
	"application/xhtml+xml",
	"application/json",
	"application/javascript",
	"text/javascript"
];
var BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
var ACCEPT = {
	html: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	json: "application/json,text/javascript;q=0.9,*/*;q=0.5"
};
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
var impitPromise;
/** Loads impit once; null when the native binding is missing (KV still works through undici). */
function loadImpit(logger) {
	impitPromise ??= import("impit").then((mod) => new mod.Impit({
		browser: "chrome",
		timeout: 15e3,
		followRedirects: false,
		vanillaFallback: true
	}), (e) => {
		logger.warn("impit failed to load; supplier fetches fall back to the guarded undici client", { error: serializeError(e) });
		return null;
	});
	return impitPromise;
}
/** The real transport: impit for `client: 'impit'` (when it loads), guarded undici otherwise. */
var defaultTransport = async (url, init) => {
	if (init.client === "impit") {
		const impit = await loadImpit(init.logger ?? silentLogger);
		if (impit) {
			const r = await impit.fetch(url, {
				headers: init.headers,
				signal: init.signal,
				redirect: "manual"
			});
			return {
				status: r.status,
				headers: r.headers,
				body: r.body,
				via: "impit",
				abort: () => r.abort()
			};
		}
	}
	const r = await fetch(url, {
		headers: {
			"User-Agent": BROWSER_USER_AGENT,
			...init.headers
		},
		signal: init.signal,
		redirect: "manual",
		dispatcher: guardedAgent()
	});
	return {
		status: r.status,
		headers: r.headers,
		body: r.body,
		via: "undici",
		abort: () => {
			r.body?.cancel().catch(() => {});
		}
	};
};
/** Maps transport / stream errors onto ScrapeError codes (timeouts and aborts → `timeout`). */
function toScrapeError(e, context) {
	if (e instanceof ScrapeError) return e;
	const name = e instanceof Error ? e.name : "";
	const ctor = typeof e === "object" && e !== null ? e.constructor.name : "";
	const message = e instanceof Error ? e.message : String(e);
	if (/timeout|timed out|abort/i.test(`${name} ${ctor} ${message}`)) return new ScrapeError("timeout", `request timed out${context ? ` (${context})` : ""}`);
	const safe = serializeError(e);
	return new ScrapeError("fetch_failed", `network error${context ? ` (${context})` : ""}: ${safe.message}${safe.cause ? ` — ${safe.cause}` : ""}`);
}
function requestSignal(outer, ms) {
	const timer = AbortSignal.timeout(ms);
	return outer ? AbortSignal.any([outer, timer]) : timer;
}
async function readCapped(res, maxBytes, context) {
	if (!res.body) return /* @__PURE__ */ new Uint8Array();
	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => {});
				res.abort?.();
				throw new ScrapeError("fetch_failed", `response body exceeds ${maxBytes} bytes (${context})`, res.status);
			}
			chunks.push(value);
		}
	} catch (e) {
		throw toScrapeError(e, context);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}
function decode(bytes, contentType) {
	const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
	if (charset) try {
		return new TextDecoder(charset).decode(bytes);
	} catch {}
	return new TextDecoder("utf-8").decode(bytes);
}
/**
* GET `url` as text through `client`, following at most `maxHops` re-validated redirects. HTTP error
* statuses are returned (the caller decides: 403 → blocked, 404 → not_found); transport failures,
* refused redirects, over-cap bodies and unexpected content types throw `ScrapeError`.
*/
async function fetchText(url, client, opts) {
	const transport = opts.transport ?? defaultTransport;
	const logger = opts.logger ?? silentLogger;
	const maxBytes = opts.maxBytes ?? 4194304;
	const maxHops = opts.maxHops ?? 3;
	const allowHosts = opts.allowHosts ?? SUPPLIER_HOSTS;
	const accept = opts.accept ?? TEXT_TYPES;
	let current = validateOutboundUrl(url, allowHosts, "fetch URL").toString();
	const headers = {
		Accept: ACCEPT[opts.kind],
		"Accept-Language": "en-US,en;q=0.9",
		...opts.headers
	};
	for (let hop = 0;; hop++) {
		const signal = requestSignal(opts.signal, opts.requestTimeoutMs ?? 1e4);
		if (signal.aborted) throw toScrapeError(signal.reason, current);
		if (opts.throttle) try {
			const waited = await opts.throttle.take(new URL(current).hostname, opts.signal);
			if (waited > 0) logger.info("host throttle", {
				url: current,
				waitedMs: waited
			});
		} catch (e) {
			throw toScrapeError(e, current);
		}
		let res;
		try {
			res = await transport(current, {
				headers,
				signal,
				client,
				logger
			});
		} catch (e) {
			throw toScrapeError(e, current);
		}
		const via = res.via ?? client;
		if (REDIRECT_STATUSES.has(res.status)) {
			res.abort?.();
			const location = res.headers.get("location");
			if (!location) throw new ScrapeError("fetch_failed", `redirect without a Location header (${current})`, res.status);
			if (hop >= maxHops) throw new ScrapeError("fetch_failed", `too many redirects (more than ${maxHops})`, res.status);
			let next;
			try {
				next = validateOutboundUrl(new URL(location, current), allowHosts, "redirect target");
			} catch (e) {
				const reason = e instanceof Error ? e.message : String(e);
				throw new ScrapeError("fetch_failed", `redirect refused: ${reason}`, res.status);
			}
			logger.info("following redirect", {
				from: current,
				to: next.toString(),
				status: res.status
			});
			current = next.toString();
			continue;
		}
		const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
		if (res.status < 400 && !accept.some((t) => contentType.startsWith(t))) {
			res.abort?.();
			throw new ScrapeError("fetch_failed", `unexpected content-type "${contentType || "none"}" (${current})`, res.status);
		}
		const bytes = await readCapped(res, maxBytes, current);
		const body = decode(bytes, contentType);
		if (res.status === 403) logger.warn("supplier answered 403", {
			url: current,
			via,
			bytes: bytes.byteLength
		});
		return {
			status: res.status,
			url: current,
			contentType,
			body,
			hops: hop,
			via,
			headers: res.headers
		};
	}
}
//#endregion
//#region src/lib/scrape/jina.ts
var JINA_BASE = "https://r.jina.ai/";
function jinaUrl(outbound) {
	return `${JINA_BASE}${outbound}`;
}
/** Jina answers with `text/plain` even for the raw-HTML format, so that type is accepted here only. */
var JINA_ACCEPT = [
	"text/plain",
	"text/html",
	"application/json"
];
async function fetchViaJina(outbound, opts) {
	return {
		...await fetchText(jinaUrl(outbound), "undici", {
			...opts,
			kind: "html",
			allowHosts: [JINA_HOST],
			accept: JINA_ACCEPT,
			maxHops: 0,
			headers: {
				"X-Return-Format": "html",
				...opts.headers
			}
		}),
		via: "jina"
	};
}
//#endregion
//#region src/lib/scrape/shopify.ts
/**
* Hosts known **not** to be Shopify, so rung 1 is skipped rather than spending a request (and a
* politeness gap) on a guaranteed 404. ecarpetgallery.com is Magento 2 / Hyvä (ADMIN_SPEC §4.4).
*/
var NON_SHOPIFY_HOSTS = ["ecarpetgallery.com", "www.ecarpetgallery.com"];
function isRecord(v) {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v) {
	return typeof v === "string" ? v : void 0;
}
function num(v) {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim()) {
		const n = Number(v);
		return Number.isFinite(n) ? n : void 0;
	}
}
function tagList(v) {
	if (Array.isArray(v)) return v.filter((t) => typeof t === "string");
	if (typeof v === "string") return splitList(v);
	return [];
}
function absolute(src) {
	return src.startsWith("//") ? `https:${src}` : src;
}
function imageEntries(v) {
	if (!Array.isArray(v)) return [];
	const out = [];
	for (const item of v) if (typeof item === "string") out.push({ src: absolute(item) });
	else if (isRecord(item)) {
		if (str(item.media_type) && item.media_type !== "image") continue;
		const src = str(item.src) ?? (isRecord(item.preview_image) ? str(item.preview_image.src) : void 0);
		if (src) out.push({
			src: absolute(src),
			width: num(item.width),
			height: num(item.height)
		});
	}
	return out;
}
/** True for a body that could be a Shopify JSON payload (cheap check before parsing). */
function looksLikeJson(body) {
	if (!body) return false;
	const head = body.trimStart();
	return head.startsWith("{") || head.startsWith("[");
}
/**
* Whether rung 1 should spend a request on this URL: every host except the ones we have verified are
* not Shopify. A URL that is not shaped like a Shopify product route is still probed (stores can
* rewrite the route), which is what "Shopify JSON first for every URL" means in practice.
*/
function shouldProbeShopify(productUrl) {
	try {
		return !NON_SHOPIFY_HOSTS.includes(new URL(productUrl).hostname.toLowerCase());
	} catch {
		return false;
	}
}
/** Parses the `.js` body, else the `.json` body; undefined when neither is a Shopify product. */
function parseShopifyProduct(js, json) {
	if (js) try {
		const p = JSON.parse(js);
		if (isRecord(p) && str(p.title) && str(p.handle)) {
			const variant = Array.isArray(p.variants) ? p.variants.find(isRecord) : void 0;
			return {
				title: collapse(str(p.title)),
				handle: str(p.handle) ?? "",
				descriptionHtml: str(p.description) ?? "",
				tags: tagList(p.tags),
				priceCents: num(p.price) ?? (variant ? num(variant.price) : void 0),
				variantSku: variant ? str(variant.sku) : void 0,
				images: tagList(p.images).map(absolute),
				media: imageEntries(p.media),
				source: "js"
			};
		}
	} catch {}
	if (json) try {
		const wrapper = JSON.parse(json);
		const p = isRecord(wrapper) && isRecord(wrapper.product) ? wrapper.product : void 0;
		if (p && str(p.title) && str(p.handle)) {
			const variant = Array.isArray(p.variants) ? p.variants.find(isRecord) : void 0;
			return {
				title: collapse(str(p.title)),
				handle: str(p.handle) ?? "",
				descriptionHtml: str(p.body_html) ?? "",
				tags: tagList(p.tags),
				variantPrice: variant ? num(variant.price) : void 0,
				variantSku: variant ? str(variant.sku) : void 0,
				images: imageEntries(p.images).map((i) => i.src),
				media: imageEntries(p.images),
				source: "json"
			};
		}
	} catch {}
}
/** Shopify CDN resize parameter for the Drive import; the original is kept as `original`. */
function withWidth(src, width) {
	return `${src}${src.includes("?") ? "&" : "?"}width=${width}`;
}
/** Full-size candidates from `media[]` (else `images[]`), foreign hosts dropped, de-duplicated. */
function shopifyPhotos(product, max = 12) {
	const photos = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (src, width, height) => {
		if (photos.length >= max || seen.has(src) || !isAllowedImageUrl(src)) return;
		seen.add(src);
		photos.push({
			url: withWidth(src, 1600),
			original: src,
			width,
			height
		});
	};
	for (const m of product.media) push(m.src, m.width, m.height);
	if (!photos.length) for (const src of product.images) push(src);
	return photos;
}
/** `price` in major units: cents from `.js`, the variant price from `.json`. */
function shopifyPrice(product) {
	if (product.priceCents !== void 0) return Math.round(product.priceCents) / 100;
	return product.variantPrice;
}
/**
* Rung 1 of the brief's §11 ladder as a draft the merge can consume. Size is read out of the title
* and the description, so it is always marked `inferred`; Shopify has no size field of its own.
*/
function shopifyRung(product, max = 12) {
	const text = htmlToText(product.descriptionHtml);
	const size = parseSize(product.title) ?? parseSize(text);
	return {
		rung: "shopify",
		supplierRef: product.variantSku,
		supplierTitle: product.title,
		description: text || void 0,
		seenPrice: shopifyPrice(product),
		widthCm: size?.widthCm,
		lengthCm: size?.lengthCm,
		sizeRaw: size?.sizeRaw,
		tagsSuggested: dedupeStrings(product.tags.map(tidyTag).filter((t) => t.toLowerCase() !== "rugs"), 20),
		photos: shopifyPhotos(product, max),
		warnings: size?.note ? [size.note] : void 0,
		inferred: [
			"widthCm",
			"lengthCm",
			"sizeRaw"
		]
	};
}
//#endregion
//#region src/lib/scrape/karavan.ts
/** Historic names: KV's product payload is an ordinary Shopify one (`shopify.ts`). */
var parseKaravanProduct = parseShopifyProduct;
var KV_METHOD_KEYWORDS = [
	"Kilim",
	"Cicim",
	"Soumak",
	"Tulu",
	"Handwoven",
	"Hand-knotted"
];
/** Headings that KV prints on their own line with the value on the next (`Size` / `305 x 370 cm …`). */
var KV_HEADINGS = [
	"stock code",
	"size",
	"material",
	"technique",
	"age",
	"origin",
	"colors",
	"colours",
	"style",
	"dyes",
	"condition"
];
var DESCRIPTION_MAX = 4e3;
/** `Label: value` lines plus KV's heading-on-its-own-line blocks. */
function parseKaravanSpecs(descriptionHtml) {
	const text = htmlToText(descriptionHtml);
	const specs = labelValueLines(text);
	const lines = text.split("\n");
	for (let i = 0; i < lines.length - 1; i++) {
		const heading = collapse(lines[i]).replace(/:$/, "").toLowerCase();
		const key = KV_HEADINGS.find((h) => heading === h || h === "material" && heading.startsWith("material"));
		const next = collapse(lines[i + 1]);
		if (key && next && !specs.has(key)) specs.set(key, next);
	}
	return {
		text,
		specs
	};
}
/**
* Builds the ScrapedRug for a KV handle from whichever bodies were fetched. Undefined when no product
* body parsed. `seenCurrency` comes from the HTML's JSON-LD / og meta, else USD is assumed and flagged.
*/
function parseKaravan(handle, src) {
	const product = parseKaravanProduct(src.js, src.json);
	if (!product) return void 0;
	const warnings = [];
	const { text, specs } = parseKaravanSpecs(product.descriptionHtml);
	const fieldStatus = {};
	let seenCurrency;
	let currencyAssumed = false;
	let ldSku;
	let ldPrice;
	let ogImage;
	if (src.html) {
		const g = extractGeneric(loadHtml(src.html));
		seenCurrency = g.ld?.currency ?? g.currency;
		ldSku = g.ld?.sku;
		ldPrice = g.ld?.price ?? g.price;
		ogImage = g.image;
	}
	if (!seenCurrency) {
		seenCurrency = "USD";
		currencyAssumed = true;
		warnings.push(src.html ? "currency not stated on the product page; USD assumed" : "product page not read; currency USD assumed");
	}
	seenCurrency = normaliseCurrency(seenCurrency) ?? "USD";
	const seenPrice = shopifyPrice(product) ?? ldPrice;
	const stockCode = specs.get("stock code");
	const supplierRef = stockCode ?? product.variantSku ?? ldSku ?? handle;
	if (!stockCode) fieldStatus.supplierRef = "inferred";
	const sizeText = specs.get("size");
	const sizeFromSpec = parseSize(sizeText);
	const size = sizeFromSpec ?? parseSize(product.title) ?? parseSize(text);
	if (size && (!sizeFromSpec || size.source !== "cm")) {
		fieldStatus.widthCm = "inferred";
		fieldStatus.lengthCm = "inferred";
		fieldStatus.sizeRaw = "inferred";
	}
	if (size?.note) warnings.push(size.note);
	const material = specs.get("material");
	const technique = specs.get("technique");
	const method = technique ?? firstKeyword(`${product.title}\n${text}`, KV_METHOD_KEYWORDS) ?? void 0;
	if (!technique && method) fieldStatus.method = "inferred";
	for (const key of ["dyes", "condition"]) {
		const v = specs.get(key);
		if (v) warnings.push(`${key === "dyes" ? "Dyes" : "Condition"}: ${v}`);
	}
	const tagsSuggested = dedupeStrings([
		...splitList(specs.get("colors") ?? specs.get("colours")),
		...splitList(specs.get("style")),
		...product.tags
	].map(tidyTag).filter((t) => t.toLowerCase() !== "rugs"), 20);
	const resolved = resolvePhotos(() => shopifyPhotos(product), { fallback: ogImage });
	if (resolved.warning) warnings.push(resolved.warning);
	let description = text || void 0;
	if (description && description.length > 4e3) {
		description = description.slice(0, DESCRIPTION_MAX);
		warnings.push(`description truncated to ${DESCRIPTION_MAX} characters`);
	}
	return {
		supplier: "karavanrug",
		supplierRef: collapse(supplierRef),
		sourceUrl: `${KV_BASE}${handle}`,
		supplierTitle: product.title,
		description,
		widthCm: size?.widthCm,
		lengthCm: size?.lengthCm,
		sizeRaw: sizeText ?? size?.sizeRaw,
		material,
		method,
		age: specs.get("age"),
		origin: specs.get("origin"),
		seenPrice,
		seenCurrency,
		currencyAssumed,
		tagsSuggested,
		photos: resolved.photos,
		primaryImage: resolved.primaryImage,
		warnings,
		fieldStatus
	};
}
//#endregion
//#region src/lib/scrape/ladder.ts
/** brief §11, in order. `source` (the per-host adapter) is the last, most specific rung. */
var LADDER_ORDER = [
	"shopify",
	"jsonld",
	"opengraph",
	"source"
];
var RUNG_FIELDS = [
	"supplierRef",
	"supplierTitle",
	"description",
	"widthCm",
	"lengthCm",
	"sizeRaw",
	"material",
	"method",
	"age",
	"origin",
	"seenPrice",
	"seenCurrency",
	"retailEstimate",
	"tagsSuggested",
	"photos"
];
/**
* Indexes a rug by field name. Every `ScrapedField` is a declared key of `ScrapedRug`, so reading and
* writing through this view is safe; TypeScript just has no index signature for it.
*/
function fieldBag(rug) {
	return rug;
}
/** True for a value the form would show: a non-blank string, a finite number, a non-empty list. */
function present(value) {
	if (value === void 0 || value === null) return false;
	if (typeof value === "string") return value.trim() !== "";
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.length > 0;
	return true;
}
/** Merges rung drafts in the brief's ladder order: for each field, the first rung with a value wins. */
function mergeRungs(drafts) {
	const ordered = LADDER_ORDER.flatMap((rung) => drafts.filter((d) => d.rung === rung));
	const values = {};
	const from = {};
	const inferred = {};
	const warnings = [];
	for (const draft of ordered) {
		for (const field of RUNG_FIELDS) {
			if (from[field] !== void 0) continue;
			const value = draft[field];
			if (!present(value)) continue;
			values[field] = value;
			from[field] = draft.rung;
			if (draft.inferred?.includes(field)) inferred[field] = "inferred";
		}
		for (const w of draft.warnings ?? []) if (!warnings.includes(w)) warnings.push(w);
	}
	return {
		values,
		from,
		inferred,
		warnings
	};
}
/**
* Fills the blanks of a per-source result from the earlier, generic rungs (the adapter is the most
* specific reading of the page, so anything it did read wins). Returns the fields that were filled.
*/
function fillBlanks(rug, values) {
	const filled = [];
	for (const field of RUNG_FIELDS) {
		if (present(fieldBag(rug)[field])) continue;
		const value = values[field];
		if (!present(value)) continue;
		fieldBag(rug)[field] = value;
		filled.push(field);
	}
	return filled;
}
function autoStatus(rug, field, value) {
	if (!present(value)) return "missing";
	switch (field) {
		case "sizeLabel":
		case "sizeBand":
		case "suggestedRetailUsd": return "inferred";
		case "seenCurrency": return rug.currencyAssumed ? "inferred" : "found";
		case "priceUsd": {
			const currency = normaliseCurrency(rug.seenCurrency) ?? "USD";
			return rug.currencyAssumed || currency !== "USD" ? "inferred" : "found";
		}
		default: return "found";
	}
}
/** Keeps only the `inferred` marks of a status map, so re-running `finaliseScraped` is idempotent. */
function inferredHints(map) {
	const out = {};
	for (const [field, status] of Object.entries(map ?? {})) if (status === "inferred") out[field] = "inferred";
	return out;
}
/**
* Resolves every derivation a `ScrapedProduct` carries and completes its `fieldStatus`: the Size
* Label and Size Band from `src/lib/size.ts`, the primary image, and `found` / `inferred` / `missing`
* for all 20 fields. A hint can only mark a present field as `inferred` — a status is never claimed
* for a value that is not there. Pure and idempotent; the input is not mutated.
*/
function finaliseScraped(rug, hints = {}) {
	const out = {
		...rug,
		tagsSuggested: [...rug.tagsSuggested],
		photos: rug.photos.map((p) => ({ ...p })),
		warnings: [...rug.warnings],
		sizeLabel: sizeLabelOf(rug.widthCm, rug.lengthCm),
		sizeBand: sizeBandOf(rug.widthCm, rug.lengthCm),
		primaryImage: primaryImageOf(rug.photos) ?? rug.primaryImage,
		fieldStatus: {}
	};
	const merged = {
		...inferredHints(rug.fieldStatus),
		...inferredHints(hints)
	};
	const status = {};
	for (const field of SCRAPED_FIELDS) {
		const value = fieldBag(out)[field];
		const auto = autoStatus(out, field, value);
		status[field] = auto !== "missing" && merged[field] === "inferred" ? "inferred" : auto;
	}
	out.fieldStatus = status;
	return out;
}
/**
* Same treatment for the partial a failed parse still produced (ADMIN_SPEC §4.8: a 422 keeps the
* form open with whatever was read), so those fields are flagged too. Anything too incomplete to
* finalise is returned untouched.
*/
function finalisePartial(data) {
	return typeof data.supplier === "string" && typeof data.sourceUrl === "string" && typeof data.supplierRef === "string" && typeof data.supplierTitle === "string" && Array.isArray(data.tagsSuggested) && Array.isArray(data.photos) && Array.isArray(data.warnings) ? finaliseScraped(data) : data;
}
/** Size read out of free text (a title, a description) is derived, never stated — always `inferred`. */
function sizeRungFields(...texts) {
	for (const text of texts) {
		const size = parseSize(text);
		if (size) return {
			widthCm: size.widthCm,
			lengthCm: size.lengthCm,
			sizeRaw: size.sizeRaw
		};
	}
	return {};
}
var SIZE_FIELDS = [
	"widthCm",
	"lengthCm",
	"sizeRaw"
];
/** Ladder rung 2 for a JSON-LD `Product`. */
function jsonLdRung(ld) {
	const size = sizeRungFields(ld.name, ld.description);
	return {
		rung: "jsonld",
		supplierRef: ld.sku,
		supplierTitle: ld.name,
		description: collapse(ld.description) || void 0,
		seenPrice: ld.price,
		seenCurrency: ld.currency,
		photos: ld.images.filter(isAllowedImageUrl).map((url) => ({ url })),
		...size,
		inferred: SIZE_FIELDS
	};
}
/** Ladder rung 3 for OpenGraph / `product:` meta and microdata. */
function openGraphRung($) {
	const og = extractOpenGraph($);
	const size = sizeRungFields(og.title, og.description);
	const primary = og.image && isAllowedImageUrl(og.image) ? [{ url: og.image }] : [];
	return {
		rung: "opengraph",
		supplierRef: og.sku,
		supplierTitle: og.title,
		description: og.description,
		seenPrice: og.price,
		seenCurrency: og.currency,
		photos: primary,
		...size,
		inferred: SIZE_FIELDS
	};
}
/** Rungs 2 and 3 of a fetched HTML page, parsed once. */
function htmlRungs(html) {
	const $ = loadHtml(html);
	const ld = extractJsonLd($);
	return ld ? [jsonLdRung(ld), openGraphRung($)] : [openGraphRung($)];
}
/** True when the per-source rung left a field the generic rungs could still fill. */
function hasBlanks(rug) {
	return RUNG_FIELDS.some((field) => !present(fieldBag(rug)[field]));
}
/**
* A `ScrapedRug` built from the generic rungs alone — what a Shopify store with no per-source
* adapter yields. The identity fields come from the caller (they are never scraped).
*/
function draftToRug(supplier, sourceUrl, merged, fallbackRef = "") {
	const values = merged.values;
	const resolved = resolvePhotos(() => values.photos ?? []);
	const warnings = [...merged.warnings];
	if (resolved.warning) warnings.push(resolved.warning);
	const fieldStatus = { ...merged.inferred };
	if (!values.supplierRef && fallbackRef) fieldStatus.supplierRef = "inferred";
	return {
		supplier,
		supplierRef: values.supplierRef ?? fallbackRef,
		sourceUrl,
		supplierTitle: values.supplierTitle ?? "",
		description: values.description,
		widthCm: values.widthCm,
		lengthCm: values.lengthCm,
		sizeRaw: values.sizeRaw,
		material: values.material,
		method: values.method,
		age: values.age,
		origin: values.origin,
		seenPrice: values.seenPrice,
		seenCurrency: values.seenCurrency,
		retailEstimate: values.retailEstimate,
		tagsSuggested: values.tagsSuggested ?? [],
		photos: resolved.photos,
		primaryImage: resolved.primaryImage,
		warnings,
		fieldStatus
	};
}
var ROBOTS_MAX_BYTES = 524288;
/** robots.txt is `text/plain`; a few stores serve it as HTML or octet-stream. */
var ROBOTS_ACCEPT = [
	"text/plain",
	"text/html",
	"application/octet-stream",
	"text/x-robots"
];
/**
* The token our group is matched on. We present a browser User-Agent (§4.3), so in practice the
* applicable group is the catch-all `*`; the resolver still honours a named group if a store ever
* addresses one of these tokens.
*/
var ROBOTS_AGENT_TOKENS = ["serioludere", "*"];
/** No robots.txt, an error, or an empty file: everything is allowed. */
var ALLOW_ALL = {
	agent: "",
	rules: []
};
/** Splits a robots.txt into its `User-agent` groups. Comments and unknown fields are ignored. */
function parseRobotsGroups(text) {
	const groups = [];
	let current;
	/** A run of consecutive `User-agent` lines addresses one group. */
	let agentRun = false;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.split("#")[0]?.trim() ?? "";
		if (!line) continue;
		const colon = line.indexOf(":");
		if (colon <= 0) continue;
		const field = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();
		if (field === "user-agent") {
			if (!current || !agentRun) {
				current = {
					agents: [],
					rules: []
				};
				groups.push(current);
				agentRun = true;
			}
			if (value) current.agents.push(value.toLowerCase());
			continue;
		}
		if (field !== "allow" && field !== "disallow") continue;
		agentRun = false;
		if (!current) continue;
		if (!value) continue;
		current.rules.push({
			allow: field === "allow",
			pattern: value
		});
	}
	return groups.filter((g) => g.agents.length > 0);
}
/** Picks the group for our tokens: an exact token match first (longest wins), else `*`. */
function rulesFor(groups, tokens = ROBOTS_AGENT_TOKENS) {
	const wanted = tokens.map((t) => t.toLowerCase());
	let best;
	for (const group of groups) for (const agent of group.agents) {
		const rank = wanted.indexOf(agent);
		if (rank < 0) continue;
		if (!best || rank < best.rank) best = {
			agent,
			rank,
			rules: [...group.rules]
		};
		else if (best.agent === agent) best.rules.push(...group.rules);
	}
	return best ? {
		agent: best.agent,
		rules: best.rules
	} : ALLOW_ALL;
}
/** robots.txt text → the rules that apply to us. */
function parseRobots(text, tokens = ROBOTS_AGENT_TOKENS) {
	return rulesFor(parseRobotsGroups(text), tokens);
}
function patternToRegExp(pattern) {
	const anchored = pattern.endsWith("$");
	const source = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	return new RegExp(`^${source}${anchored ? "$" : ""}`);
}
/** The pattern's specificity when it matches `path` (its length in characters), else undefined. */
function patternMatch(pattern, path) {
	if (!pattern) return void 0;
	try {
		return patternToRegExp(pattern).test(path) ? pattern.length : void 0;
	} catch {
		return;
	}
}
/** RFC 9309 §2.2.2: the longest matching pattern decides; a tie goes to Allow. */
function isPathAllowed(rules, path) {
	const target = path.startsWith("/") ? path : `/${path}`;
	let best;
	for (const rule of rules.rules) {
		const length = patternMatch(rule.pattern, target);
		if (length === void 0) continue;
		if (!best || length > best.length || length === best.length && rule.allow) best = {
			length,
			allow: rule.allow
		};
	}
	return best ? best.allow : true;
}
/** Per-host cache of the parsed rules: 1 h TTL, at most 100 hosts (least recently used out first). */
var RobotsCache = class {
	ttlMs;
	max;
	now;
	entries = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		this.ttlMs = options.ttlMs ?? 36e5;
		this.max = options.maxEntries ?? 100;
		this.now = options.now ?? Date.now;
	}
	get(host) {
		const key = host.toLowerCase();
		const hit = this.entries.get(key);
		if (!hit) return void 0;
		if (this.now() - hit.at >= this.ttlMs) {
			this.entries.delete(key);
			return;
		}
		this.entries.delete(key);
		this.entries.set(key, hit);
		return hit.rules;
	}
	set(host, rules) {
		const key = host.toLowerCase();
		this.entries.delete(key);
		this.entries.set(key, {
			rules,
			at: this.now()
		});
		while (this.entries.size > this.max) {
			const oldest = this.entries.keys().next().value;
			if (oldest === void 0) break;
			this.entries.delete(oldest);
		}
	}
	clear() {
		this.entries.clear();
	}
	get size() {
		return this.entries.size;
	}
};
/** The process-wide robots cache used by `scrapeRug` unless a caller supplies its own. */
var defaultRobotsCache = new RobotsCache();
/**
* Fetches (once per host, then from cache) and evaluates `/robots.txt` for `target`. Never throws:
* a 404, a non-2xx, a transport failure or an unreadable body all mean "allowed".
*/
async function robotsAllows(target, opts = {}) {
	const logger = opts.logger ?? silentLogger;
	const cache = opts.cache ?? defaultRobotsCache;
	let url;
	try {
		url = new URL(target);
	} catch {
		return {
			allowed: true,
			reason: "unreadable",
			rules: ALLOW_ALL,
			cached: false
		};
	}
	const host = url.hostname.toLowerCase();
	const path = `${url.pathname}${url.search}`;
	const hit = cache.get(host);
	if (hit) return {
		allowed: isPathAllowed(hit, path),
		reason: verdict(hit, path),
		rules: hit,
		cached: true
	};
	let rules = ALLOW_ALL;
	let reason = "no-robots";
	try {
		const res = await fetchText(`https://${host}/robots.txt`, opts.client ?? "undici", {
			...opts.fetchOpts,
			kind: "html",
			allowHosts: [host],
			accept: ROBOTS_ACCEPT,
			maxBytes: ROBOTS_MAX_BYTES
		});
		if (res.status >= 400) logger.info("robots.txt unavailable; treating the host as allowed", {
			host,
			status: res.status
		});
		else {
			rules = parseRobots(res.body, opts.tokens);
			reason = "allowed";
		}
	} catch (e) {
		logger.info("robots.txt could not be read; treating the host as allowed", {
			host,
			message: toScrapeError(e).message
		});
		reason = "unreadable";
	}
	cache.set(host, rules);
	return {
		allowed: isPathAllowed(rules, path),
		reason: verdict(rules, path, reason),
		rules,
		cached: false
	};
}
function verdict(rules, path, fallback = "allowed") {
	if (!isPathAllowed(rules, path)) return "disallowed";
	return rules.rules.length ? "allowed" : fallback;
}
/** setTimeout that rejects with the signal's reason if the wait is aborted. */
var realSleep = (ms, signal) => new Promise((resolve, reject) => {
	if (signal?.aborted) {
		reject(signal.reason ?? /* @__PURE__ */ new Error("aborted"));
		return;
	}
	const timer = setTimeout(() => {
		signal?.removeEventListener("abort", onAbort);
		resolve();
	}, ms);
	if (typeof timer === "object" && "unref" in timer) timer.unref();
	function onAbort() {
		clearTimeout(timer);
		reject(signal?.reason ?? /* @__PURE__ */ new Error("aborted"));
	}
	signal?.addEventListener("abort", onAbort, { once: true });
});
var HostThrottle = class {
	minGapMs;
	maxWaitMs;
	maxHosts;
	now;
	sleep;
	/** host → epoch ms at which the next request to it may start. Insertion order = recency. */
	next = /* @__PURE__ */ new Map();
	constructor(options = {}) {
		this.minGapMs = options.minGapMs ?? 2e3;
		this.maxWaitMs = options.maxWaitMs ?? 5e3;
		this.maxHosts = options.maxHosts ?? 500;
		this.now = options.now ?? Date.now;
		this.sleep = options.sleep ?? realSleep;
	}
	key(host) {
		return host.trim().toLowerCase();
	}
	/** Pure: how long a request to `host` would have to wait right now. No reservation is made. */
	waitFor(host) {
		const earliest = this.next.get(this.key(host));
		if (earliest === void 0) return 0;
		return Math.min(Math.max(0, earliest - this.now()), this.maxWaitMs);
	}
	/**
	* Reserves the next slot for `host` and waits for it. Returns the ms actually waited (0 for the
	* first request to a host, or once the gap has already elapsed). Rejects with the signal's reason
	* when the outer deadline fires during the wait.
	*/
	async take(host, signal) {
		const key = this.key(host);
		const t = this.now();
		const earliest = this.next.get(key) ?? t;
		const start = Math.max(t, earliest);
		this.next.delete(key);
		this.next.set(key, start + this.minGapMs);
		this.prune(t);
		const wait = Math.min(start - t, this.maxWaitMs);
		if (wait > 0) await this.sleep(wait, signal);
		return wait;
	}
	/** Drops the least recently used hosts once the map is over its cap. */
	prune(t) {
		while (this.next.size > this.maxHosts) {
			const oldest = this.next.keys().next().value;
			if (oldest === void 0) break;
			this.next.delete(oldest);
		}
		if (this.next.size > this.maxHosts / 2) {
			for (const [host, at] of this.next) if (at <= t) this.next.delete(host);
		}
	}
	/** Test/ops helper. */
	clear() {
		this.next.clear();
	}
	get size() {
		return this.next.size;
	}
};
/** The process-wide throttle used by `scrapeRug` unless a caller supplies its own. */
var defaultHostThrottle = new HostThrottle();
//#endregion
//#region src/lib/scrape/index.ts
function cloneRug(data) {
	return {
		...data,
		tagsSuggested: [...data.tagsSuggested],
		photos: data.photos.map((p) => ({ ...p })),
		warnings: [...data.warnings],
		fieldStatus: { ...data.fieldStatus }
	};
}
/**
* Applies §4.7 / §7 to a raw scrape: USD conversion (Rates tab), then the retail suggestion when a
* markup is configured, then the derivations every `ScrapedProduct` carries (Size Label, Size Band,
* primary image, per-field status). Pure; returns a new object.
*/
function finalisePricing(data, opts) {
	const out = cloneRug(data);
	const { priceUsd, warning } = priceToUsd(out.seenPrice, out.seenCurrency, opts.convertToUsd);
	out.priceUsd = priceUsd;
	if (warning) out.warnings.push(warning);
	const step = opts.roundStep !== void 0 && Number.isInteger(opts.roundStep) && opts.roundStep > 0 ? opts.roundStep : 5;
	const retail = supplierRetail(out.supplier, priceUsd, opts.markup, step);
	const rule = pricingRuleName(out.supplier);
	if (retail !== void 0) {
		out.suggestedRetailUsd = retail;
		out.markupApplied = rule === void 0 ? opts.markup : void 0;
		out.pricingRule = rule;
		out.roundStep = step;
	} else {
		out.suggestedRetailUsd = void 0;
		out.markupApplied = void 0;
		out.pricingRule = void 0;
		out.roundStep = void 0;
	}
	return finaliseScraped(out);
}
function fail(code, message, status, data) {
	return {
		ok: false,
		code,
		message,
		status,
		data
	};
}
function fromError(e) {
	const err = toScrapeError(e);
	return {
		ok: false,
		code: err.code,
		message: err.message,
		status: err.status
	};
}
/** robots.txt for the target host was read once; every other outbound URL is vetted against it. */
function robotsRefusal(url, ctx) {
	try {
		const u = new URL(url);
		if (isPathAllowed(ctx.robots, `${u.pathname}${u.search}`)) return void 0;
		ctx.logger.warn("robots.txt disallows the URL", { url });
		return fail("blocked", `robots.txt on ${u.hostname} disallows ${u.pathname}`);
	} catch {
		return;
	}
}
/** Classifies one ECG response: challenge → blocked, 404 → not_found, other 4xx/5xx → fetch_failed, else parse. */
function attemptEcg(det, res, ctx) {
	if (isCloudflareChallenge(res.status, res.body, res.headers)) {
		ctx.logger.warn("ecarpetgallery challenge page", {
			url: res.url,
			status: res.status,
			via: res.via
		});
		return fail("blocked", `ecarpetgallery.com refused the request (Cloudflare, HTTP ${res.status})`, res.status);
	}
	if (res.status === 404) return fail("not_found", "product page not found (HTTP 404)", 404);
	if (res.status >= 400) return fail("fetch_failed", `ecarpetgallery.com answered HTTP ${res.status}`, res.status);
	const data = parseEcg(det, res.body);
	if (hasBlanks(data)) fillBlanks(data, mergeRungs(htmlRungs(res.body)).values);
	if (!data.supplierTitle || data.seenPrice === void 0) return fail("parse_failed", data.supplierTitle ? "no price found on the product page" : "could not read the product page", res.status, data);
	return {
		ok: true,
		data,
		via: res.via
	};
}
async function scrapeEcg(det, ctx) {
	let first;
	try {
		first = attemptEcg(det, await fetchText(det.htmlUrl, "impit", {
			...ctx.fetchOpts,
			kind: "html"
		}), ctx);
	} catch (e) {
		first = fromError(e);
	}
	if (first.ok || first.code === "not_found" || !ctx.jina || ctx.signal.aborted) return first;
	ctx.logger.info("trying the Jina Reader fallback", {
		url: det.htmlUrl,
		reason: first.code
	});
	let second;
	try {
		const res = await fetchViaJina(det.htmlUrl, ctx.fetchOpts);
		second = res.status >= 400 ? fail("fetch_failed", `Jina Reader answered HTTP ${res.status}`, res.status) : attemptEcg(det, res, ctx);
	} catch (e) {
		second = fromError(e);
	}
	if (second.ok) return second;
	return {
		...!first.ok && first.data ? first : second.data ? second : first,
		message: `${first.message}; Jina fallback: ${second.message}`
	};
}
/**
* The brief's §11 ladder for a Shopify-shaped product URL: rung 1 is the product JSON
* (`/products/<handle>.js`, then `<url>.json`), rungs 2-3 are the HTML page's JSON-LD and
* OpenGraph/microdata, rung 4 is the per-source adapter when the host has one. Rungs 1-3 alone are
* enough for a store we have no adapter for, and they rescue a product whose JSON payload is broken.
*/
async function scrapeShopifyFirst(det, ctx) {
	let js;
	let json;
	let lastError;
	let jsOk = false;
	let jsonOk = false;
	if (shouldProbeShopify(det.sourceUrl)) {
		const refusal = robotsRefusal(det.jsUrl, ctx);
		if (refusal) return refusal;
		try {
			js = await fetchText(det.jsUrl, "impit", {
				...ctx.fetchOpts,
				kind: "json"
			});
		} catch (e) {
			lastError = fromError(e);
		}
		if (js?.status === 404) return fail("not_found", "product not found (HTTP 404)", 404);
		jsOk = js !== void 0 && js.status < 400 && looksLikeJson(js.body);
		if (!jsOk) {
			if (js && js.status >= 400) lastError = fail(js.status === 403 ? "blocked" : "fetch_failed", `karavanrug.com answered HTTP ${js.status} for the .js endpoint`, js.status);
			if (ctx.signal.aborted && lastError) return lastError;
			const jsonRefusal = robotsRefusal(det.jsonUrl, ctx);
			if (jsonRefusal) return jsonRefusal;
			try {
				json = await fetchText(det.jsonUrl, "impit", {
					...ctx.fetchOpts,
					kind: "json"
				});
			} catch (e) {
				lastError = fromError(e);
			}
			if (json?.status === 404) return fail("not_found", "product not found (HTTP 404)", 404);
			jsonOk = json !== void 0 && json.status < 400 && looksLikeJson(json.body);
			if (!jsonOk && json && json.status >= 400) return fail(json.status === 403 ? "blocked" : "fetch_failed", `karavanrug.com answered HTTP ${json.status}`, json.status);
		}
	}
	let html;
	if (!ctx.signal.aborted && !robotsRefusal(det.htmlUrl, ctx)) try {
		const res = await fetchText(det.htmlUrl, "impit", {
			...ctx.fetchOpts,
			kind: "html"
		});
		if (res.status < 400) html = res;
		else ctx.logger.warn("karavanrug.com product page unavailable; currency assumed", { status: res.status });
	} catch (e) {
		const err = toScrapeError(e);
		if (err.code === "timeout" && ctx.signal.aborted) return {
			ok: false,
			code: "timeout",
			message: err.message
		};
		ctx.logger.warn("karavanrug.com product page fetch failed; currency assumed", { message: err.message });
	}
	const jsBody = jsOk ? js?.body : void 0;
	const jsonBody = json && json.status < 400 ? json.body : void 0;
	const product = parseShopifyProduct(jsBody, jsonBody);
	const rungs = [];
	if (product) rungs.push(shopifyRung(product));
	if (html) rungs.push(...htmlRungs(html.body));
	const merged = mergeRungs(rungs);
	const via = (jsOk ? js?.via : jsonOk ? json?.via : html?.via) ?? "impit";
	const refined = parseKaravan(det.handle, {
		js: jsBody,
		json: jsonBody,
		html: html?.body
	});
	const data = refined ?? (rungs.length ? draftToRug(det.supplier, det.sourceUrl, merged, det.handle) : void 0);
	if (!data) return lastError ?? fail("parse_failed", "the Shopify product payload could not be parsed");
	if (refined) fillBlanks(data, merged.values);
	if (data.seenPrice === void 0) return fail("parse_failed", "no price in the Shopify product payload", void 0, data);
	return {
		ok: true,
		data,
		via
	};
}
/**
* Scrapes one supplier product URL (§4). Never throws: every outcome is a ScrapeOk or ScrapeFail
* (with `manual` pre-filled whenever the supplier was recognised).
*/
async function scrapeRug(input, opts = {}) {
	const now = opts.now ?? Date.now;
	const started = now();
	const logger = opts.logger ?? silentLogger;
	const cache = opts.cache ?? defaultScrapeCache;
	const pricing = {
		convertToUsd: opts.convertToUsd,
		markup: opts.markup,
		roundStep: opts.roundStep
	};
	const det = detectSupplier(input);
	if ("error" in det) {
		const message = det.error === "unsupported_host" ? "only ecarpetgallery.com and karavanrug.com product links are supported" : "not a supported product link";
		return {
			ok: false,
			code: det.error,
			message,
			manual: manualFallback(input)
		};
	}
	const manual = manualFromDetected(det);
	if (!opts.force) {
		const hit = cache.get(det.sourceUrl);
		if (hit) {
			const data = finalisePricing(hit.data, pricing);
			return {
				ok: true,
				data,
				primaryImage: data.primaryImage,
				via: hit.via,
				cached: true,
				ms: now() - started
			};
		}
	}
	const controller = new AbortController();
	const timeoutMs = opts.timeoutMs ?? 2e4;
	const timer = setTimeout(() => controller.abort(new ScrapeError("timeout", `scrape exceeded ${timeoutMs} ms`)), timeoutMs);
	if (typeof timer === "object" && "unref" in timer) timer.unref();
	const fetchOpts = {
		transport: opts.fetchImpl,
		signal: controller.signal,
		requestTimeoutMs: opts.requestTimeoutMs,
		throttle: opts.throttle ?? defaultHostThrottle,
		logger
	};
	const ctx = {
		fetchOpts,
		signal: controller.signal,
		logger,
		jina: opts.jinaFallback ?? true,
		robots: {
			agent: "",
			rules: []
		}
	};
	try {
		if (opts.respectRobots !== false) {
			const verdict = await robotsAllows(det.sourceUrl, {
				cache: opts.robots ?? defaultRobotsCache,
				client: SUPPLIER_HOSTS.includes(new URL(det.sourceUrl).hostname) ? "impit" : "undici",
				fetchOpts,
				logger
			});
			ctx.robots = verdict.rules;
			if (!verdict.allowed) {
				logger.warn("robots.txt disallows the product URL", {
					url: det.sourceUrl,
					agent: verdict.rules.agent
				});
				return {
					ok: false,
					code: "blocked",
					message: `robots.txt on ${new URL(det.sourceUrl).hostname} disallows this URL`,
					manual
				};
			}
		}
		const attempt = det.supplier === "ecarpetgallery" ? await scrapeEcg(det, ctx) : await scrapeShopifyFirst(det, ctx);
		const ms = now() - started;
		if (!attempt.ok) {
			const code = controller.signal.aborted ? "timeout" : attempt.code;
			logger.warn("scrape failed", {
				supplier: det.supplier,
				ref: det.supplierRef,
				code,
				status: attempt.status,
				ms
			});
			return {
				ok: false,
				code,
				status: attempt.status,
				message: attempt.message,
				manual,
				data: attempt.data ? finalisePartial(attempt.data) : void 0
			};
		}
		cache.set(det.sourceUrl, {
			data: attempt.data,
			via: attempt.via
		});
		logger.info("scrape ok", {
			supplier: det.supplier,
			ref: attempt.data.supplierRef,
			via: attempt.via,
			ms
		});
		const data = finalisePricing(attempt.data, pricing);
		return {
			ok: true,
			data,
			primaryImage: data.primaryImage,
			via: attempt.via,
			cached: false,
			ms
		};
	} catch (e) {
		const err = toScrapeError(e);
		logger.error("scrape crashed", {
			supplier: det.supplier,
			code: err.code,
			message: err.message
		});
		return {
			ok: false,
			code: err.code,
			status: err.status,
			message: err.message,
			manual
		};
	} finally {
		clearTimeout(timer);
	}
}
//#endregion
export { detectSupplier as n, scrapeRug as t };
