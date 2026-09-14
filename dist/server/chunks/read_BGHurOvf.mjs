import { A as slugify, F as PRODUCT_COLS, L as PRODUCT_WIDTH, N as HEADERS, V as TABS, b as parseProducts, ft as DRIVE_ID_RE, g as assertHeaders, j as splitCollections, x as parseTags, y as parseCollections } from "./runtime_r-OJmEZZ.mjs";
import { a as isReservedSlug } from "./auth_rJQKmKue.mjs";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod";
//#region src/lib/admin/audit.ts
var AUDIT_ACTIONS = [
	"rug.create",
	"rug.update",
	"rug.status",
	"collection.create",
	"collection.update",
	"collection.reorder",
	"tag.create",
	"tag.update",
	"client.create",
	"client.status",
	"client.password",
	"settings.update",
	"photo.import",
	"scrape.fetch",
	"reactions.compact",
	"auth.login",
	"auth.logout",
	"auth.lockout",
	"auth.google"
];
var AUDIT_TABS = [
	"Products",
	"Collections",
	"Tags",
	"Customers",
	"Reactions",
	"Settings",
	"Drive",
	"-"
];
/** Actions whose diff must be complete: a truncated diff refuses the mutation instead. */
var MUTATION_ACTIONS = /* @__PURE__ */ new Set([
	"rug.create",
	"rug.update",
	"rug.status",
	"collection.create",
	"collection.update",
	"collection.reorder",
	"tag.create",
	"tag.update",
	"client.create",
	"client.status",
	"client.password",
	"settings.update"
]);
/** Per-cell cap for the before/after JSON (the sheet cell cap is 50 000). */
var AUDIT_JSON_MAX = 4e4;
var IP_HASH_RE = /^[a-f0-9]{32}$/;
var REQUEST_ID_RE = /^[a-f0-9]{8,32}$/;
var TRUNCATED_MARK = "…[truncated]";
var UnauditableError = class extends Error {
	status = 422;
	code = "unauditable";
	constructor(message) {
		super(message);
		this.name = "UnauditableError";
	}
};
function stableStringify(value) {
	return JSON.stringify(value, (_k, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const o = v;
			return Object.keys(o).sort().reduce((acc, k) => {
				acc[k] = o[k];
				return acc;
			}, {});
		}
		return v;
	});
}
/** Changed keys only (union of both sides), compared by their stable JSON. */
function diffFields(before, after) {
	const keys = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
	const b = {};
	const a = {};
	const changed = [];
	for (const k of [...keys].sort()) if (stableStringify(before[k] ?? null) !== stableStringify(after[k] ?? null)) {
		changed.push(k);
		if (before[k] !== void 0) b[k] = before[k];
		if (after[k] !== void 0) a[k] = after[k];
	}
	return {
		before: b,
		after: a,
		changed
	};
}
function jsonCell(value, mutation, what) {
	if (value === void 0 || value === null) return "";
	const text = stableStringify(value);
	if (text.length <= 4e4) return text;
	if (mutation) throw new UnauditableError(`audit ${what} JSON is ${text.length} chars (limit ${AUDIT_JSON_MAX}); refusing the change`);
	return text.slice(0, 39988) + TRUNCATED_MARK;
}
/**
* Builds the row. Throws UnauditableError when a mutation's diff would not fit (the mutation must
* be refused with 422), and on a malformed ip hash / request id (never a raw IP in the sheet).
*/
function buildAuditRow(input) {
	if (!AUDIT_ACTIONS.includes(input.action)) throw new UnauditableError(`unknown audit action "${input.action}"`);
	if (!AUDIT_TABS.includes(input.targetTab)) throw new UnauditableError(`unknown audit tab "${input.targetTab}"`);
	if (!IP_HASH_RE.test(input.ipHash)) throw new UnauditableError("audit ip_hash must be the 32-hex HMAC, never an address");
	if (!REQUEST_ID_RE.test(input.requestId)) throw new UnauditableError("audit request_id must be hex");
	const mutation = MUTATION_ACTIONS.has(input.action);
	return {
		timestamp: input.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
		actor: String(input.actor || "owner").slice(0, 64),
		action: input.action,
		targetTab: input.targetTab,
		targetId: String(input.targetId ?? "").slice(0, 128),
		before: jsonCell(input.before, mutation, "before"),
		after: jsonCell(input.after, mutation, "after"),
		ipHash: input.ipHash,
		requestId: input.requestId,
		note: String(input.note ?? "").slice(0, 500)
	};
}
/** Cells in HEADERS.AuditLog order (10 columns). */
function auditRowToCells(row) {
	return [
		row.timestamp,
		row.actor,
		row.action,
		row.targetTab,
		row.targetId,
		row.before,
		row.after,
		row.ipHash,
		row.requestId,
		row.note
	];
}
/** Reads `AuditLog!A1:J…` (header first, newest first) into entries with their sheet row number. */
function parseAuditRows(values) {
	assertHeaders(TABS.auditLog, values?.[0]);
	const out = [];
	if (!values) return out;
	const n = HEADERS.AuditLog.length;
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		if (cells.every((c) => c === void 0 || c === null || String(c).trim() === "")) continue;
		const s = (j) => cells[j] === void 0 || cells[j] === null ? "" : String(cells[j]);
		const entry = {
			row: i + 1,
			timestamp: s(0),
			actor: s(1),
			action: s(2),
			targetTab: s(3),
			targetId: s(4),
			before: s(5),
			after: s(6),
			ipHash: s(7),
			requestId: s(8),
			note: s(n - 1)
		};
		out.push(entry);
	}
	return out;
}
//#endregion
//#region src/lib/admin/dto.ts
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var SLUG_RE = /^[a-z0-9-]{1,80}$/;
/**
* The customer code alphabet. Deliberately NARROWER than the Reactions `client` column, and it is
* the narrower of the two that governs.
*
* `_` was permitted here until 2026-09-14 on the belief that both sheet columns shared one alphabet.
* They do not: `ReactionRow.customer_slug` parses with `/^[A-Za-z0-9_-]{1,64}$/`, but the Customers
* tab's own `slug` parses with `SLUG_RE = /^[a-z0-9-]{1,80}$/` (src/lib/sheets/parse.ts:70,142) —
* no underscore. A code containing `_` was therefore written happily and then dropped on every read,
* and because `Customers` is a GUARDED_TAB at MAX_DROPPED_RATIO 0.1 (src/lib/sheets/read.ts:8-17),
* more than one bad row in ten rejected the WHOLE refresh and took the catalogue down with a 503.
* Measured before the fix: 38.9 % of generated codes contained `_`.
*
* So this must stay a subset of SLUG_RE. Widening it re-arms a site-wide outage.
*/
var CLIENT_CODE_RE = /^[a-z0-9]([a-z0-9-]{0,26})[a-z0-9]$/;
var VERSION_RE = /^[a-f0-9]{16}$/;
var Id = z.string().regex(ID_RE);
var Slug = z.string().regex(SLUG_RE);
var Text = (max) => z.string().trim().max(max).default("");
var TagName = z.string().trim().min(1).max(40).refine((t) => !t.includes("|"), "tags may not contain \"|\"");
function isHttpsUrl(u) {
	try {
		const url = new URL(u);
		return url.protocol === "https:" && !url.username && !url.password;
	} catch {
		return false;
	}
}
var HttpsUrl = z.string().trim().max(500).refine(isHttpsUrl, "https only");
/**
* The collections a product belongs to — at least one, at most ten (owner requirement 2026-09-13).
*
* A bare string is accepted and split on "|" so that a single-select form, a hand-written call, or a
* row read back from the sheet all validate without the caller having to know which shape this is.
* splitCollections() trims and de-duplicates case-insensitively, so ["Kilims", "kilims "] is one.
*/
var CollectionList = z.union([z.string(), z.array(z.string())]).transform((v) => splitCollections(Array.isArray(v) ? v.join("|") : v)).pipe(z.array(z.string().min(1).max(80)).min(1).max(10));
var Version = z.string().regex(VERSION_RE);
var RugInput = z.object({
	id: Id.optional(),
	slug: Slug.optional(),
	name: z.string().trim().min(1).max(120),
	description: Text(4e3),
	collections: CollectionList,
	tags: z.array(TagName).max(20).default([]),
	photos: z.array(z.string().regex(DRIVE_ID_RE)).max(12).default([]),
	widthCm: z.number().int().min(10).max(2e3).optional(),
	lengthCm: z.number().int().min(10).max(2e3).optional(),
	material: Text(80),
	method: Text(80),
	age: Text(80),
	origin: Text(80),
	priceUsd: z.number().min(0).max(1e6).multipleOf(.01).optional(),
	rotate: z.enum([
		"force",
		"true",
		"false"
	]).default("false"),
	featured: z.boolean().default(false),
	status: z.enum([
		"active",
		"draft",
		"archived"
	]).default("active"),
	sourceUrl: HttpsUrl.optional(),
	supplier: z.enum([
		"ecarpetgallery",
		"karavanrug",
		""
	]).default(""),
	supplierRef: Text(40),
	notes: Text(2e3),
	roundPrice: z.boolean().default(false),
	/**
	* Brief §12: the row is written `pending` before its photos are uploaded, and updated to
	* `complete` once they land. Blank on a row that never had photos to import.
	*/
	commitStatus: z.enum([
		"pending",
		"complete",
		""
	]).default(""),
	driveFolderId: z.string().trim().max(200).default(""),
	driveFolderUrl: z.string().trim().max(400).default("")
});
var RugUpdate = RugInput.omit({ id: true }).extend({ version: Version });
/** Finishing a half-imported row: the photos that landed, their folder, and the new commit state. */
var RugCommit = z.object({
	version: Version,
	photos: z.array(z.string().regex(DRIVE_ID_RE)).max(12).default([]),
	commitStatus: z.enum([
		"pending",
		"complete",
		""
	]).default("complete"),
	driveFolderId: z.string().trim().max(200).default(""),
	driveFolderUrl: z.string().trim().max(400).default("")
});
var RugStatus = z.object({
	status: z.enum([
		"active",
		"draft",
		"archived"
	]),
	version: Version
});
var CollectionInput = z.object({
	name: z.string().trim().min(1).max(80),
	description: Text(1e3),
	coverImageUrl: z.string().trim().max(500).default("")
});
var CollectionUpdate = CollectionInput.extend({ version: Version });
var CollectionReorder = z.object({ order: z.array(Id).min(1).max(200) });
var TagInput = z.object({
	name: TagName,
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});
var TagUpdate = TagInput.extend({ version: Version });
/** Blank means "generate one for me"; anything else is the owner's own choice, floored at 8. */
var ChosenPassword = z.union([z.literal(""), z.string().trim().min(8, "A password needs at least 8 characters.").max(200)]).optional();
var ClientInput = z.object({
	name: z.string().trim().min(1).max(60),
	note: Text(200),
	password: ChosenPassword
});
var ClientPassword = z.object({
	version: Version,
	password: ChosenPassword
});
var ClientStatus = z.object({
	status: z.enum(["active", "revoked"]),
	version: Version
});
var ScrapeRequest = z.object({
	url: z.string().trim().min(8).max(500),
	force: z.boolean().default(false)
});
var PhotoImportRequest = z.object({
	urls: z.array(HttpsUrl).min(1).max(12),
	/** When given, the photos land in `<root>/<id> — <name>/All Images` (brief §12). */
	productId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional(),
	productName: z.string().trim().max(120).optional(),
	namePrefix: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/),
	/**
	* Which supplier these photos came from, so the per-supplier fixes of 2026-09-13 can be applied
	* to the first image (src/lib/drive/transform.ts). Sent explicitly rather than sniffed from the
	* photo host: Karavan is a Shopify store, so its images arrive from the shared cdn.shopify.com.
	*/
	supplier: z.enum([
		"ecarpetgallery",
		"karavanrug",
		""
	]).default("")
});
var SettingsUpdate = z.object({
	key: z.enum([
		"retail_markup",
		"retail_markup.ecarpetgallery",
		"retail_markup.karavanrug",
		"price_round_step",
		"default_status"
	]),
	value: z.string().trim().max(40)
});
/**
* POST /api/admin/compact-reactions takes no input (brief §14). The empty object still runs the
* shared POST wrapper's JSON posture — content-type, 64 KiB cap, same-origin check — over the
* request, and leaves room for a future `dryRun` without changing the route's shape.
*/
var CompactReactionsRequest = z.object({});
var AuditQuery = z.object({
	offset: z.coerce.number().int().min(0).default(0),
	limit: z.coerce.number().int().min(1).max(200).default(100)
});
/** Compact issue list for the 400 body (path + message; never the input value). */
function issuesOf(error) {
	return error.issues.map((i) => ({
		path: i.path.map(String).join("."),
		message: i.message
	}));
}
//#endregion
//#region src/lib/admin/clients.ts
var ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/**
* Unreserved in a URL path AND accepted by BOTH sheet columns the code is written into.
*
* `-` is the whole set. `_` was here until 2026-09-14 and was a site-down defect: the Customers tab
* parses its `slug` with `/^[a-z0-9-]{1,80}$/`, so an underscored code was dropped on every read and
* the guarded-tab ratio turned a couple of such customers into a catalogue-wide 503. See the note on
* CLIENT_CODE_RE in ./dto.ts. Do not re-add `_`, `~` or `.`.
*/
var FILLER_SYMBOLS = "-";
var FILLER_DIGITS = "0123456789";
var cryptoRandomInt = (max) => {
	if (max <= 0) throw new Error("cryptoRandomInt: max must be positive");
	const limit = Math.floor(256 / max) * max;
	for (;;) for (const b of randomBytes(32)) if (b < limit) return b % max;
};
/** Fisher–Yates, driven by the injected source so a test can make it deterministic. */
function shuffled(items, rnd) {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = rnd(i + 1);
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
/**
* Half the name's characters, shuffled, with digits and symbols woven between them.
*
* "Half" rounds up and never falls below 3, and the pool itself is padded to 4: a one- or two-letter
* name would otherwise produce a route so short it is both ugly and trivially enumerable. Non-Latin
* names slugify to nothing, so they fall back to a fully random code of the same shape rather than
* throwing and blocking the owner from adding that customer at all.
*/
function scrambleName(name, rnd = cryptoRandomInt) {
	let pool = slugify(name).replace(/[^a-z0-9]/g, "") || Array.from({ length: 6 }, () => ALPHABET[rnd(36)]).join("");
	while (pool.length < 4) pool += ALPHABET[rnd(36)];
	const take = Math.min(pool.length, 24, Math.max(3, Math.ceil(pool.length / 2)));
	const picked = shuffled([...pool], rnd).slice(0, take);
	const fillerCount = Math.min(picked.length - 1, 3 + rnd(2));
	const gaps = shuffled(Array.from({ length: picked.length - 1 }, (_, i) => i + 1), rnd).slice(0, Math.max(0, fillerCount));
	const out = [];
	for (let i = 0; i < picked.length; i++) {
		if (gaps.includes(i)) {
			const useSymbol = rnd(4) === 0;
			out.push(useSymbol ? FILLER_SYMBOLS[rnd(1)] : FILLER_DIGITS[rnd(10)]);
		}
		out.push(picked[i]);
	}
	return out.join("");
}
/**
* The customer's route segment. `rnd` is injectable so tests can pin the shuffle.
*
* Throws rather than returning a malformed code: a bad route here would 404 a buyer's only link, and
* failing at creation time is far cheaper than discovering it after the link has been sent.
*/
function clientCode(name, rnd = cryptoRandomInt) {
	const code = scrambleName(name, rnd);
	if (!CLIENT_CODE_RE.test(code)) throw new Error(`generated client code "${code}" is malformed`);
	if (isReservedSlug(code)) throw new Error(`generated client code "${code}" is a reserved route`);
	return code;
}
/**
* A code not already taken (case-insensitive) and not a reserved route.
*
* Eight attempts, not the previous two: the old scheme prefixed the name, so a collision meant two
* buyers with the same name AND the same six random characters — vanishingly rare. This one is
* shorter and drawn from the name's own letters, so two buyers called "Ana Lee" collide far more
* often. Eight tries makes exhausting them a signal that something is wrong, not bad luck.
*/
function newClientCode(name, existing, rnd = cryptoRandomInt) {
	const taken = /* @__PURE__ */ new Set();
	for (const c of existing) taken.add(String(c).trim().toLowerCase());
	for (let attempt = 0; attempt < 8; attempt++) {
		const code = clientCode(name, rnd);
		if (!taken.has(code.toLowerCase())) return code;
	}
	throw new Error("client code collision eight times in a row");
}
/**
* The buyer's private preview link, `${SITE_URL}/${slug}` (brief §1, §10). Always regenerated from
* the runtime SITE_URL, never trusted from the sheet, so moving hosts moves every link at once.
*/
function clientLink(siteUrl, code) {
	if (!CLIENT_CODE_RE.test(code)) throw new Error("clientLink: malformed code");
	return `${new URL(siteUrl).origin}/${code}`;
}
/**
* A client row with the password hash removed — the only shape allowed to leave the server.
*
* Written as an explicit destructure rather than `delete`, so adding a future secret to `ClientRow`
* forces a compile-time decision here instead of silently shipping it.
*/
function withoutSecrets(c) {
	const { passwordHash: _passwordHash, ...safe } = c;
	return safe;
}
/** Customers columns: slug, display_name, password_hash, note, created_at, active. */
function clientToCells(c) {
	return [
		c.code,
		c.name,
		c.passwordHash ?? "",
		c.note,
		c.createdAt,
		c.status === "active"
	];
}
/** Parses `Customers!A1:F` (header first, newest first). Rows with a malformed slug are dropped. */
function parseClients(values) {
	assertHeaders(TABS.customers, values?.[0]);
	const items = [];
	let dropped = 0;
	if (!values) return {
		items,
		dropped
	};
	const text = (v) => v === void 0 || v === null ? "" : String(v).trim();
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		if (cells.every((c) => text(c) === "")) continue;
		const code = text(cells[0]);
		const activeCell = text(cells[5]).toLowerCase();
		const status = activeCell === "false" || activeCell === "0" || activeCell === "no" ? "revoked" : "active";
		if (!CLIENT_CODE_RE.test(code)) {
			dropped++;
			continue;
		}
		items.push({
			row: i + 1,
			code,
			name: text(cells[1]),
			passwordHash: text(cells[2]),
			note: text(cells[3]),
			status,
			createdAt: text(cells[4]),
			createdBy: "",
			link: ""
		});
	}
	return {
		items,
		dropped
	};
}
//#endregion
//#region src/lib/admin/settings.ts
var SETTINGS_KEYS = [
	"retail_markup",
	"retail_markup.ecarpetgallery",
	"retail_markup.karavanrug",
	"price_round_step",
	"default_status"
];
var SUPPLIERS = ["ecarpetgallery", "karavanrug"];
function positiveNumber(raw) {
	const s = raw.trim();
	if (!/^\d+(\.\d+)?$/.test(s)) return void 0;
	const n = Number(s);
	return Number.isFinite(n) && n > 0 ? n : void 0;
}
/** Validates one value for a key; '' clears (undefined). Used by the settings endpoint (400 on !ok). */
function parseSettingValue(key, raw) {
	const s = raw.trim();
	if (s === "") return {
		ok: true,
		value: void 0
	};
	switch (key) {
		case "retail_markup":
		case "retail_markup.ecarpetgallery":
		case "retail_markup.karavanrug": {
			const n = positiveNumber(s);
			return n === void 0 ? {
				ok: false,
				error: `${key} must be a positive number such as 1.6`
			} : {
				ok: true,
				value: n
			};
		}
		case "price_round_step": {
			const n = positiveNumber(s);
			return n === void 0 || !Number.isInteger(n) ? {
				ok: false,
				error: "price_round_step must be a positive whole number"
			} : {
				ok: true,
				value: n
			};
		}
		case "default_status": {
			const v = s.toLowerCase();
			return v === "active" || v === "draft" ? {
				ok: true,
				value: v
			} : {
				ok: false,
				error: "default_status must be active or draft"
			};
		}
	}
}
function isSettingsKey(key) {
	return SETTINGS_KEYS.includes(key);
}
function cellText(v) {
	return v === void 0 || v === null ? "" : String(v).trim();
}
/** Parses `Settings!A1:D` (header first). Unknown keys are kept in `rows` and reported once. */
function parseSettings(values, logger) {
	assertHeaders(TABS.settings, values?.[0]);
	const out = {
		retailMarkupBySupplier: {},
		rows: [],
		warnings: []
	};
	if (!values) return out;
	const seen = /* @__PURE__ */ new Set();
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		const key = cellText(cells[0]);
		if (!key) continue;
		const value = cellText(cells[1]);
		out.rows.push({
			row: i + 1,
			key,
			value,
			updatedAt: cellText(cells[2]) || void 0,
			updatedBy: cellText(cells[3]) || void 0
		});
		if (!isSettingsKey(key)) {
			out.warnings.push(`Settings row ${i + 1}: unknown key "${key.slice(0, 40)}" ignored`);
			continue;
		}
		if (seen.has(key)) {
			out.warnings.push(`Settings row ${i + 1}: duplicate key "${key}" ignored (first row wins)`);
			continue;
		}
		seen.add(key);
		const parsed = parseSettingValue(key, value);
		if (!parsed.ok) {
			out.warnings.push(`Settings row ${i + 1}: ${parsed.error} (got "${value.slice(0, 40)}")`);
			continue;
		}
		if (parsed.value === void 0) continue;
		switch (key) {
			case "retail_markup":
				out.retailMarkup = parsed.value;
				break;
			case "retail_markup.ecarpetgallery":
				out.retailMarkupBySupplier.ecarpetgallery = parsed.value;
				break;
			case "retail_markup.karavanrug":
				out.retailMarkupBySupplier.karavanrug = parsed.value;
				break;
			case "price_round_step":
				out.priceRoundStep = parsed.value;
				break;
			case "default_status": out.defaultStatus = parsed.value;
		}
	}
	for (const w of out.warnings) logger?.warn(w);
	return out;
}
/** Markup lookup order (§3.2): `retail_markup.<supplier>` → `retail_markup` → env `RETAIL_MARKUP` → unset. */
function markupFor(settings, supplier, envMarkup) {
	if (supplier && SUPPLIERS.includes(supplier)) {
		const s = settings.retailMarkupBySupplier[supplier];
		if (s !== void 0) return s;
	}
	if (settings.retailMarkup !== void 0) return settings.retailMarkup;
	return envMarkup !== void 0 && Number.isFinite(envMarkup) && envMarkup > 0 ? envMarkup : void 0;
}
function roundStepOf(settings) {
	return settings.priceRoundStep ?? 5;
}
function defaultStatusOf(settings) {
	return settings.defaultStatus ?? "active";
}
//#endregion
//#region src/lib/admin/read.ts
var ADMIN_READ_RANGES = [
	`${TABS.products}!A1:AP`,
	`${TABS.collections}!A1:G`,
	`${TABS.tags}!A1:D`,
	`${TABS.settings}!A1:D`,
	`${TABS.customers}!A1:F`,
	`${TABS.auditLog}!A1:J101`
];
/**
* The Products tab carries the whole contract now (brief §9), so the admin validates exactly what
* the site validates. 'missing' is reported when the tab has no header row at all — the owner has
* not run `npm run sheet:init` yet.
*/
/**
* The topbar's status line — Figma's App Shell draws "Sheet synced 4 min ago" (25:236) on the right
* of every admin screen, and it was the only thing between the page name and the logout glyph 1160px
* away. The slot was plumbed all the way through AdminLayout and AppShell; no page ever filled it,
* so the bar read as half-finished on every screen.
*
* Deliberately coarse. The exact second is noise to the owner — what they need to know is whether
* what they are looking at is current, and "4 min ago" answers that while "14:32:07" does not.
*/
function syncLabel(fetchedAt, now = Date.now()) {
	const seconds = Math.max(0, Math.round((now - fetchedAt) / 1e3));
	if (seconds < 45) return "Sheet synced just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `Sheet synced ${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `Sheet synced ${hours} h ago`;
	return `Sheet synced ${Math.round(hours / 24)} d ago`;
}
function assertAdminHeaders(headerRow) {
	if (!headerRow || headerRow.every((c) => String(c ?? "").trim() === "")) return "missing";
	assertHeaders(TABS.products, headerRow);
	return "ok";
}
function norm(cells, from, to) {
	const out = [];
	for (let i = from; i < to; i++) {
		const v = cells[i];
		out.push(v === void 0 || v === null ? "" : v);
	}
	return out;
}
function hash16(parts) {
	return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
/**
* Product version token: sha256 over the whole row as read (trailing blanks normalised to '').
* No column is formula-owned any more — counts come from the Reactions log — so nothing is excluded.
*/
function rugVersion(cells) {
	return hash16(norm(cells, 0, PRODUCT_WIDTH));
}
/** Whole-row version token for the small tabs (Collections A:G, Tags A:D, Customers A:F). */
function rowVersion(cells, width) {
	return hash16(norm(cells, 0, width));
}
var isBlank = (c) => c === void 0 || c === null || typeof c === "string" && c.trim() === "";
/**
* The public parsers drop or skip rows silently; this recovers the sheet row number of each kept
* item: kept rows are, in order, the non-blank rows that are neither dropped nor id-less.
*/
function keptRows(values, dropped, needsId) {
	const droppedRows = new Set(dropped.map((d) => d.row));
	const rows = [];
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		if (cells.every(isBlank)) continue;
		if (needsId && isBlank(cells[0])) continue;
		const row = i + 1;
		if (droppedRows.has(row)) continue;
		rows.push(row);
	}
	return rows;
}
var text = (v) => v === void 0 || v === null ? "" : String(v).trim();
function parseAdminRugs(values) {
	const adminHeaders = assertAdminHeaders(values?.[0]);
	if (adminHeaders === "missing") return {
		items: [],
		dropped: [],
		warnings: [],
		adminHeaders
	};
	const parsed = parseProducts(values);
	const rows = keptRows(values ?? [], parsed.dropped, true);
	if (rows.length !== parsed.items.length) throw new Error(`admin read: ${parsed.items.length} rugs parsed but ${rows.length} rows located`);
	return {
		items: parsed.items.map((rug, i) => {
			const row = rows[i];
			return adminRugFrom(rug, values[row - 1] ?? [], row);
		}),
		dropped: parsed.dropped,
		warnings: parsed.warnings,
		adminHeaders
	};
}
function adminRugFrom(rug, cells, row) {
	return {
		...rug,
		row,
		version: rugVersion(cells),
		sourceUrl: text(cells[PRODUCT_COLS.sourceUrl]),
		supplier: text(cells[PRODUCT_COLS.sourceSite]).toLowerCase(),
		supplierRef: text(cells[PRODUCT_COLS.variantSku]),
		notes: text(cells[PRODUCT_COLS.internalNotes])
	};
}
/** One freshly read `Products!A{row}:AP{row}` row → AdminRug (undefined when the row fails validation). */
function adminRugFromCells(cells, row) {
	const header = [...HEADERS.Products];
	const rug = parseProducts([header, cells]).items[0];
	return rug ? adminRugFrom(rug, cells, row) : void 0;
}
function parseAdminCollections(values) {
	const parsed = parseCollections(values);
	const rows = keptRows(values ?? [], parsed.dropped, false);
	if (rows.length !== parsed.items.length) throw new Error(`admin read: ${parsed.items.length} collections parsed but ${rows.length} rows located`);
	const width = HEADERS.Collections.length;
	return {
		items: parsed.items.map((c, i) => {
			const row = rows[i];
			return {
				...c,
				row,
				version: rowVersion(values[row - 1] ?? [], width)
			};
		}),
		dropped: parsed.dropped,
		warnings: parsed.warnings
	};
}
function parseAdminTags(values) {
	const parsed = parseTags(values);
	const rows = keptRows(values ?? [], parsed.dropped, false);
	if (rows.length !== parsed.items.length) throw new Error(`admin read: ${parsed.items.length} tags parsed but ${rows.length} rows located`);
	const width = HEADERS.Tags.length;
	return {
		items: parsed.items.map((t, i) => {
			const row = rows[i];
			return {
				...t,
				row,
				version: rowVersion(values[row - 1] ?? [], width)
			};
		}),
		dropped: parsed.dropped,
		warnings: parsed.warnings
	};
}
function parseAdminClients(values) {
	const parsed = parseClients(values);
	const width = HEADERS.Customers.length;
	return {
		items: parsed.items.map((c) => ({
			...c,
			version: rowVersion(values[c.row - 1] ?? [], width)
		})),
		dropped: parsed.dropped
	};
}
/** Parses the six ADMIN_READ_RANGES value ranges (positional). Throws SheetContractError on a bad header. */
function parseAdminSnapshot(ranges, opts = {}) {
	const [rugsVR, collectionsVR, tagsVR, settingsVR, clientsVR, auditVR] = ranges;
	const rugs = parseAdminRugs(rugsVR?.values);
	const collections = parseAdminCollections(collectionsVR?.values);
	const tags = parseAdminTags(tagsVR?.values);
	const settings = parseSettings(settingsVR?.values, opts.logger);
	const clients = parseAdminClients(clientsVR?.values);
	const audit = parseAuditRows(auditVR?.values);
	return {
		rugs: rugs.items,
		collections: collections.items,
		tags: tags.items,
		settings,
		clients: clients.items,
		audit,
		report: {
			dropped: [
				...rugs.dropped,
				...collections.dropped,
				...tags.dropped
			],
			warnings: [
				...rugs.warnings,
				...collections.warnings,
				...tags.warnings
			],
			adminHeaders: rugs.adminHeaders,
			clientsDropped: clients.dropped
		},
		fetchedAt: (opts.now ?? Date.now)()
	};
}
async function fetchAdminSnapshot(client, opts = {}) {
	return parseAdminSnapshot(await client.batchGet(ADMIN_READ_RANGES), opts);
}
/** Case-insensitive lookups the CRUD endpoints share. */
function findRugById(snapshot, id) {
	const key = id.trim().toLowerCase();
	return snapshot.rugs.find((r) => r.id.toLowerCase() === key);
}
function findCollectionByName(snapshot, name) {
	const key = name.trim().toLowerCase();
	return snapshot.collections.find((c) => c.name.trim().toLowerCase() === key);
}
function findTagByName(snapshot, name) {
	const key = name.trim().toLowerCase();
	return snapshot.tags.find((t) => t.name.trim().toLowerCase() === key);
}
function adminCounts(snapshot) {
	const rugs = {
		active: 0,
		draft: 0,
		archived: 0,
		total: snapshot.rugs.length
	};
	for (const r of snapshot.rugs) rugs[r.status] += 1;
	const clients = {
		active: 0,
		revoked: 0
	};
	for (const c of snapshot.clients) clients[c.status] += 1;
	return {
		rugs,
		collections: snapshot.collections.length,
		tags: snapshot.tags.length,
		clients
	};
}
//#endregion
export { CompactReactionsRequest as A, TagUpdate as B, CLIENT_CODE_RE as C, CollectionInput as D, ClientStatus as E, RugStatus as F, buildAuditRow as G, AUDIT_ACTIONS as H, RugUpdate as I, diffFields as K, ScrapeRequest as L, PhotoImportRequest as M, RugCommit as N, CollectionReorder as O, RugInput as P, SettingsUpdate as R, AuditQuery as S, ClientPassword as T, UnauditableError as U, issuesOf as V, auditRowToCells as W, clientLink as _, findCollectionByName as a, parseClients as b, parseAdminSnapshot as c, syncLabel as d, defaultStatusOf as f, roundStepOf as g, parseSettings as h, fetchAdminSnapshot as i, ID_RE as j, CollectionUpdate as k, rowVersion as l, parseSettingValue as m, adminCounts as n, findRugById as o, markupFor as p, parseAuditRows as q, adminRugFromCells as r, findTagByName as s, ADMIN_READ_RANGES as t, rugVersion as u, clientToCells as v, ClientInput as w, withoutSecrets as x, newClientCode as y, TagInput as z };
