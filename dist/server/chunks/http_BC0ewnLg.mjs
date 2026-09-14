import { At as RETAIL_MARKUP, Ct as ADMIN_USER, F as PRODUCT_COLS, L as PRODUCT_WIDTH, Mt as SITE_URL, N as HEADERS, O as joinCollections, St as ADMIN_SESSION_SECRET, V as TABS, _t as SheetsApiError, gt as SheetContractError, i as getClient, r as getCache, vt as consoleLogger, xt as ADMIN_PASSWORD_HASH, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { g as setSessionCookie, h as refreshSession, l as Revocations, p as needsReissue, u as adminCookieName, v as verifyToken } from "./auth_rJQKmKue.mjs";
import { c as requestIpHash, f as RateLimiter, i as isSecureSite, l as revalidateState, n as failLimiter, o as noStore, s as rejectCrossSite, t as ADMIN_MAX_JSON_BODY, u as socketAddressOf } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, U as UnauditableError, V as issuesOf, W as auditRowToCells, l as rowVersion, r as adminRugFromCells, u as rugVersion } from "./read_BGHurOvf.mjs";
import { t as invalidateCatalogue } from "./invalidate_Bf_aEQKS.mjs";
import { a as LoginThrottle, n as cellOrClear, t as buildInsertRows } from "./write_BpgUvStU.mjs";
import { randomBytes } from "node:crypto";
//#region src/lib/admin/gate.ts
var ADMIN_PAGE = /^\/admin(\/|$)/;
var ADMIN_API = /^\/api\/admin(\/|$)/;
var PUBLIC_ADMIN = /* @__PURE__ */ new Set(["/admin/login", "/admin/logout"]);
function adminConfigured(config) {
	return Boolean(config.secret && config.secret.length >= 32 && config.passwordHash);
}
function noStoreHeaders(response) {
	response.headers.set("cache-control", "no-store");
	response.headers.set("x-robots-tag", "noindex, nofollow");
	return response;
}
function json(body, status) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"x-content-type-options": "nosniff"
		}
	});
}
function notFound(api) {
	return api ? json({
		ok: false,
		error: "not found"
	}, 404) : new Response("Not found", {
		status: 404,
		headers: { "content-type": "text/plain; charset=utf-8" }
	});
}
/** `/admin/login/` and `/admin/login` are the same public path. */
function normalisePath(pathname) {
	return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
async function adminGate(context, next, config) {
	const pathname = normalisePath(context.url.pathname);
	const api = ADMIN_API.test(pathname);
	if (!ADMIN_PAGE.test(pathname) && !api) return next();
	context.cache.set(false);
	context.locals.requestId = randomBytes(8).toString("hex");
	if (!adminConfigured(config)) return noStoreHeaders(notFound(api));
	const now = (config.now ?? Date.now)();
	const cookieName = adminCookieName(config.isSecureSite);
	const session = verifyToken(context.cookies.get(cookieName)?.value, config.secret, now, config.revoked);
	if (session) context.locals.admin = session;
	let response;
	if (!session && !PUBLIC_ADMIN.has(pathname)) response = api ? json({
		ok: false,
		error: "unauthorized"
	}, 401) : context.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`, 303);
	else {
		response = await next();
		if (session && needsReissue(session, now)) setSessionCookie(context.cookies, refreshSession(session, now), config.secret, config.isSecureSite, now);
	}
	return noStoreHeaders(response);
}
//#endregion
//#region src/lib/admin/lock.ts
var AsyncMutex = class {
	tail = Promise.resolve();
	waiting = 0;
	/** Runs `fn` after every previously queued call has settled; errors propagate, the queue continues. */
	async run(fn) {
		const prior = this.tail;
		let release;
		this.tail = new Promise((resolve) => {
			release = resolve;
		});
		this.waiting += 1;
		try {
			await prior;
			return await fn();
		} finally {
			this.waiting -= 1;
			release();
		}
	}
	/** Calls queued or running. */
	get pending() {
		return this.waiting;
	}
};
var adminLock = new AsyncMutex();
function withAdminLock(fn) {
	return adminLock.run(fn);
}
var VersionMismatchError = class extends Error {
	status = 409;
	code = "version mismatch";
	tab;
	row;
	/** The row as it is now (A..Z for Rugs, A.. for the others). */
	fresh;
	constructor(tab, row, fresh, reason) {
		super(`${tab} row ${row}: ${reason}`);
		this.name = "VersionMismatchError";
		this.tab = tab;
		this.row = row;
		this.fresh = fresh;
	}
};
var RowConflictError = class extends Error {
	status = 409;
	code = "row conflict";
	constructor(message) {
		super(message);
		this.name = "RowConflictError";
	}
};
var UnsafeRequestError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "UnsafeRequestError";
	}
};
/**
* Every Products cell A..AP in column order (brief §9). `featured` and `rotate` have no column in
* the Shopify set, so they ride on Tags as the flags `featured` / `rotate` / `rotate-force`.
*/
function productFieldsToCells(f, id) {
	const flags = [];
	if (f.featured) flags.push("featured");
	if (f.rotate === "force") flags.push("rotate-force");
	else if (f.rotate === "true") flags.push("rotate");
	const tags = [...f.tags, ...flags].join(", ");
	const cells = new Array(PRODUCT_WIDTH).fill("");
	cells[PRODUCT_COLS.productId] = id;
	cells[PRODUCT_COLS.handle] = f.slug;
	cells[PRODUCT_COLS.title] = f.name;
	cells[PRODUCT_COLS.bodyHtml] = f.description;
	cells[PRODUCT_COLS.vendor] = f.vendor ?? "";
	cells[PRODUCT_COLS.productCategory] = f.productCategory ?? "";
	cells[PRODUCT_COLS.type] = f.productType ?? "";
	cells[PRODUCT_COLS.tags] = tags;
	cells[PRODUCT_COLS.published] = f.status === "active";
	cells[PRODUCT_COLS.option1Name] = "Title";
	cells[PRODUCT_COLS.option1Value] = "Default Title";
	cells[PRODUCT_COLS.variantSku] = f.supplierRef;
	cells[PRODUCT_COLS.variantGrams] = f.variantGrams;
	cells[PRODUCT_COLS.variantInventoryQty] = 1;
	cells[PRODUCT_COLS.variantInventoryPolicy] = "deny";
	cells[PRODUCT_COLS.variantPrice] = f.priceUsd;
	cells[PRODUCT_COLS.variantCompareAtPrice] = f.compareAtPrice;
	cells[PRODUCT_COLS.variantRequiresShipping] = true;
	cells[PRODUCT_COLS.variantTaxable] = true;
	cells[PRODUCT_COLS.imageSrc] = f.photos[0] ?? "";
	cells[PRODUCT_COLS.imageAltText] = f.imageAltText ?? f.name;
	cells[PRODUCT_COLS.seoTitle] = f.seoTitle ?? "";
	cells[PRODUCT_COLS.seoDescription] = f.seoDescription ?? "";
	cells[PRODUCT_COLS.status] = f.status;
	cells[PRODUCT_COLS.widthCm] = f.widthCm;
	cells[PRODUCT_COLS.lengthCm] = f.lengthCm;
	cells[PRODUCT_COLS.sizeLabel] = f.sizeLabel ?? "";
	cells[PRODUCT_COLS.sizeBand] = f.sizeBand ?? "";
	cells[PRODUCT_COLS.material] = f.material;
	cells[PRODUCT_COLS.method] = f.method;
	cells[PRODUCT_COLS.origin] = f.origin;
	cells[PRODUCT_COLS.age] = f.age;
	cells[PRODUCT_COLS.pile] = f.pile ?? "";
	cells[PRODUCT_COLS.shape] = f.shape ?? "";
	cells[PRODUCT_COLS.collection] = joinCollections(f.collections);
	cells[PRODUCT_COLS.sourceUrl] = f.sourceUrl;
	cells[PRODUCT_COLS.sourceSite] = f.supplier;
	cells[PRODUCT_COLS.driveFolderId] = f.driveFolderId ?? "";
	cells[PRODUCT_COLS.driveFolderUrl] = f.driveFolderUrl ?? "";
	cells[PRODUCT_COLS.scrapedAt] = f.scrapedAt ?? "";
	cells[PRODUCT_COLS.commitStatus] = f.commitStatus ?? "";
	cells[PRODUCT_COLS.internalNotes] = f.notes;
	return cells;
}
/** One row of literal cells at 1-based `row`, starting at zero-based `columnIndex`. */
function buildRowUpdate(sheetId, row, columnIndex, cells) {
	return { updateCells: {
		start: {
			sheetId,
			rowIndex: row - 1,
			columnIndex
		},
		rows: [{ values: cells.map(cellOrClear) }],
		fields: "userEnteredValue"
	} };
}
function buildAuditInsert(auditSheetId, audit) {
	return buildInsertRows(auditSheetId, 1, [auditRowToCells(audit)]);
}
function buildAppendRows(sheetId, length = 50) {
	return { appendDimension: {
		sheetId,
		dimension: "ROWS",
		length
	} };
}
/** Update: B{row}:AP{row} (everything except the Product ID) + the audit row, in one batch. */
function buildRugUpdateRequests(ids, row, cells, audit) {
	if (cells.all.length !== PRODUCT_WIDTH) throw new UnsafeRequestError(`product update needs ${PRODUCT_WIDTH} cells, got ${cells.all.length}`);
	const requests = [buildRowUpdate(ids.rugs, row, PRODUCT_COLS.handle, cells.all.slice(1)), ...buildAuditInsert(ids.auditLog, audit)];
	assertRugRequestsSafe(requests, ids.rugs, "update");
	return requests;
}
/** Insert: optional appendDimension first, then A{row}:AP{row} + the audit row. */
function buildRugInsertRequests(ids, targetRow, rowCount, cells, audit) {
	if (cells.all.length !== PRODUCT_WIDTH) throw new UnsafeRequestError(`product insert needs ${PRODUCT_WIDTH} cells, got ${cells.all.length}`);
	if (targetRow < 2) throw new UnsafeRequestError("product insert target must be below the header");
	const requests = [];
	if (targetRow > rowCount) requests.push(buildAppendRows(ids.rugs, Math.max(50, targetRow - rowCount)));
	requests.push(buildRowUpdate(ids.rugs, targetRow, PRODUCT_COLS.productId, cells.all), ...buildAuditInsert(ids.auditLog, audit));
	assertRugRequestsSafe(requests, ids.rugs, "insert");
	return requests;
}
/**
* Walks every request and refuses anything that could damage the Products tab: an `updateCells`
* touching the Product ID on an update, row inserts/deletes, `appendCells`, deletes anywhere, or a
* write past the last column. Called by every builder; exported for the unit test.
*/
function assertRugRequestsSafe(requests, rugsSheetId, mode) {
	const forbidden = new Set(mode === "update" ? [PRODUCT_COLS.productId] : []);
	for (const raw of requests) {
		const req = raw;
		if ("deleteDimension" in req || "deleteRange" in req || "deleteSheet" in req) throw new UnsafeRequestError("admin writes never delete");
		if (req.insertDimension?.range?.sheetId === rugsSheetId) throw new UnsafeRequestError("never insert rows into Products");
		if (req.appendCells?.sheetId === rugsSheetId) throw new UnsafeRequestError("never appendCells on Products");
		const update = req.updateCells;
		if (!update || update.start?.sheetId !== rugsSheetId) continue;
		if (update.range !== void 0) throw new UnsafeRequestError("Products updates must use `start`, not `range`");
		const from = update.start?.columnIndex ?? 0;
		const width = Math.max(0, ...(update.rows ?? []).map((r) => r.values?.length ?? 0));
		if (mode === "update" && from === 0) throw new UnsafeRequestError("Products updates never start at column A");
		for (let c = from; c < from + width; c++) if (forbidden.has(c)) throw new UnsafeRequestError(`Products ${mode} covers protected column index ${c}`);
		if (from + width > PRODUCT_WIDTH) throw new UnsafeRequestError("Products write past the last column");
	}
}
function onSheetIdError(client, e) {
	if (e instanceof SheetsApiError && e.status === 400 && /sheetId|No grid with id/i.test(e.message)) client.forgetSheetIds();
	throw e;
}
async function rugsRowCount(client) {
	const n = ((await client.getSpreadsheet("sheets.properties")).sheets ?? []).find((s) => s.properties.title === TABS.products)?.properties.gridProperties?.rowCount;
	if (typeof n !== "number") throw new SheetsApiError(502, "Rugs grid row count unavailable");
	return n;
}
/** Rugs A..Z of one row as read (missing trailing cells → absent). */
async function readRugRow(client, row) {
	const [vr] = await client.batchGet([`${TABS.products}!A${row}:AP${row}`]);
	return vr?.values?.[0] ?? [];
}
var cellText = (v) => v === void 0 || v === null ? "" : String(v).trim();
async function verifyRug(client, row, id, audit, logger) {
	let a;
	try {
		a = cellText((await readRugRow(client, row))[PRODUCT_COLS.productId]);
	} catch (e) {
		logger?.error("rug write verify read failed", {
			row,
			id,
			error: serializeError(e)
		});
		return false;
	}
	if (a === id) return true;
	logger?.error("rug write verify mismatch", {
		row,
		expected: id,
		found: a
	});
	try {
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		await client.batchUpdate(buildAuditInsert(auditSheetId, {
			...audit,
			note: `verify-failed: A${row}="${a}"`
		}));
	} catch (e) {
		logger?.error("verify-failed audit row not written", { error: serializeError(e) });
	}
	return false;
}
/**
* Update one rug: (a) re-read A{row}:Z{row}; (b) assert `A === id` and hash === `version`, else
* VersionMismatchError with the fresh row; (c) one batchUpdate (B:P + U:Z + audit); (d) read back.
*/
async function updateRug(client, args) {
	return withAdminLock(async () => {
		const fresh = await readRugRow(client, args.row);
		if (cellText(fresh[PRODUCT_COLS.productId]) !== args.id) throw new VersionMismatchError(TABS.products, args.row, fresh, `expected id "${args.id}"`);
		if (rugVersion(fresh) !== args.version) throw new VersionMismatchError(TABS.products, args.row, fresh, "row changed since it was read");
		const requests = buildRugUpdateRequests({
			rugs: await client.sheetIdByTitle(TABS.products),
			auditLog: await client.sheetIdByTitle(TABS.auditLog)
		}, args.row, args.cells, args.audit);
		try {
			await client.batchUpdate(requests);
		} catch (e) {
			onSheetIdError(client, e);
		}
		const verified = await verifyRug(client, args.row, args.id, args.audit, args.logger);
		return {
			row: args.row,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified
		};
	});
}
/** Target row for a bottom insert on any tab: `(A2:A values).length + 2`. */
async function nextRowOf(client, tab) {
	const [vr] = await client.batchGet([`${tab}!A2:A`]);
	return (vr?.values?.length ?? 0) + 2;
}
/**
* Insert a new rug at the first row after the last id: asserts A..P and T..Z of the target are
* empty (Q:S spills are ignored), appends grid rows in the same batch when needed, writes
* A:P + T:Z + audit atomically, reads back. `cells.aToP[0]` must be the id.
*/
async function insertRug(client, args) {
	const id = cellText(args.cells.all[0]);
	if (!id) throw new UnsafeRequestError("insertRug: the Product ID (column A) is required");
	return withAdminLock(async () => {
		const [targetRow, rowCount] = await Promise.all([nextRowOf(client, TABS.products), rugsRowCount(client)]);
		if (targetRow <= rowCount) {
			if ((await readRugRow(client, targetRow)).some((c) => cellText(c) !== "")) throw new RowConflictError(`Products row ${targetRow} is not blank; retry`);
		}
		const requests = buildRugInsertRequests({
			rugs: await client.sheetIdByTitle(TABS.products),
			auditLog: await client.sheetIdByTitle(TABS.auditLog)
		}, targetRow, rowCount, args.cells, args.audit);
		try {
			await client.batchUpdate(requests);
		} catch (e) {
			onSheetIdError(client, e);
		}
		const verified = await verifyRug(client, targetRow, id, args.audit, args.logger);
		return {
			row: targetRow,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified
		};
	});
}
function widthOf(tab) {
	return HEADERS[tab].length;
}
async function readRow(client, tab, row) {
	const last = String.fromCharCode(64 + widthOf(tab));
	const [vr] = await client.batchGet([`${tab}!A${row}:${last}${row}`]);
	return vr?.values?.[0] ?? [];
}
/**
* Collections / Tags / Settings / Clients: whole-row update (A..) guarded by the whole-row version
* token and, when given, the expected first cell (id / key / code).
*/
async function updateRow(client, args) {
	const width = widthOf(args.tab);
	if (args.cells.length !== width) throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
	if (args.row < 2) throw new UnsafeRequestError("never write the header row");
	return withAdminLock(async () => {
		const fresh = await readRow(client, args.tab, args.row);
		if (args.expectFirstCell !== void 0 && cellText(fresh[0]) !== args.expectFirstCell) throw new VersionMismatchError(args.tab, args.row, fresh, `expected "${args.expectFirstCell}" in column A`);
		if (rowVersion(fresh, width) !== args.version) throw new VersionMismatchError(args.tab, args.row, fresh, "row changed since it was read");
		const sheetId = await client.sheetIdByTitle(args.tab);
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		try {
			await client.batchUpdate([buildRowUpdate(sheetId, args.row, 0, args.cells), ...buildAuditInsert(auditSheetId, args.audit)]);
		} catch (e) {
			onSheetIdError(client, e);
		}
		return {
			row: args.row,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified: true
		};
	});
}
/** Collections / Tags / Settings: insert at the bottom (same target-row rule as Rugs). */
async function insertRowAtBottom(client, args) {
	const width = widthOf(args.tab);
	if (args.cells.length !== width) throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
	return withAdminLock(async () => {
		const targetRow = await nextRowOf(client, args.tab);
		const rowCount = (((await client.getSpreadsheet("sheets.properties")).sheets ?? []).find((s) => s.properties.title === args.tab)?.properties)?.gridProperties?.rowCount ?? 0;
		if (targetRow <= rowCount) {
			if ((await readRow(client, args.tab, targetRow)).some((c) => cellText(c) !== "")) throw new RowConflictError(`${args.tab} row ${targetRow} is not blank; retry`);
		}
		const sheetId = await client.sheetIdByTitle(args.tab);
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		const requests = [];
		if (targetRow > rowCount) requests.push(buildAppendRows(sheetId, Math.max(50, targetRow - rowCount)));
		requests.push(buildRowUpdate(sheetId, targetRow, 0, args.cells), ...buildAuditInsert(auditSheetId, args.audit));
		try {
			await client.batchUpdate(requests);
		} catch (e) {
			onSheetIdError(client, e);
		}
		return {
			row: targetRow,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified: true
		};
	});
}
/** Clients: newest-first at row 2 (no formulas on that tab), with the audit row in the same batch. */
async function insertTopRow(client, args) {
	const width = widthOf(args.tab);
	if (args.cells.length !== width) throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
	return withAdminLock(async () => {
		await args.precheck?.();
		const sheetId = await client.sheetIdByTitle(args.tab);
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		try {
			await client.batchUpdate([...buildInsertRows(sheetId, 1, [args.cells]), ...buildAuditInsert(auditSheetId, args.audit)]);
		} catch (e) {
			onSheetIdError(client, e);
		}
		return {
			row: 2,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified: true
		};
	});
}
/**
* Collections reorder: rewrites one column (`sort_order`, F) for every listed row in one batch.
* Each row's column A is checked against the expected id first (no version tokens, §3.4).
*/
async function updateColumnCells(client, args) {
	if (args.columnIndex < 1 || args.columnIndex >= widthOf(args.tab)) throw new UnsafeRequestError("column out of range");
	if (args.updates.some((u) => u.row < 2)) throw new UnsafeRequestError("never write the header row");
	return withAdminLock(async () => {
		const ranges = args.updates.map((u) => `${args.tab}!A${u.row}:A${u.row}`);
		const read = ranges.length ? await client.batchGet(ranges) : [];
		args.updates.forEach((u, i) => {
			const found = cellText(read[i]?.values?.[0]?.[0]);
			if (found !== u.expectFirstCell) throw new VersionMismatchError(args.tab, u.row, read[i]?.values?.[0] ?? [], `expected "${u.expectFirstCell}", found "${found}"`);
		});
		const sheetId = await client.sheetIdByTitle(args.tab);
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		try {
			await client.batchUpdate([...args.updates.map((u) => buildRowUpdate(sheetId, u.row, args.columnIndex, [u.value])), ...buildAuditInsert(auditSheetId, args.audit)]);
		} catch (e) {
			onSheetIdError(client, e);
		}
		return {
			row: args.updates[0]?.row ?? 0,
			audit: {
				row: 2,
				action: args.audit.action
			},
			verified: true
		};
	});
}
/** A stand-alone audit row (login, logout, lockout, scrape, photo import) at AuditLog row 2. */
async function appendAudit(client, audit) {
	return withAdminLock(async () => {
		const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
		try {
			await client.batchUpdate(buildAuditInsert(auditSheetId, audit));
		} catch (e) {
			onSheetIdError(client, e);
		}
		return {
			row: 2,
			action: audit.action
		};
	});
}
//#endregion
//#region src/lib/admin/http.ts
var secret = ADMIN_SESSION_SECRET && ADMIN_SESSION_SECRET.length >= 32 ? ADMIN_SESSION_SECRET : void 0;
var passwordHash = ADMIN_PASSWORD_HASH || void 0;
var adminRuntime = {
	secret,
	passwordHash,
	user: ADMIN_USER || "owner",
	isSecureSite,
	siteUrl: SITE_URL,
	/** Bootstrap markup from the environment; the Settings tab wins when set (§3.2). */
	retailMarkup: RETAIL_MARKUP,
	configured: adminConfigured({
		secret,
		passwordHash
	}),
	revocations: new Revocations(),
	/** Login failures share the small attacker-driven limiter with /api/revalidate. */
	throttle: new LoginThrottle(failLimiter),
	/** Per-session API limits (§1.3). */
	limiter: new RateLimiter({ maxKeys: 1e3 }),
	/** Filled by the Drive scope check (Phase 10); undefined = not checked yet. */
	driveScopeOk: void 0
};
if (!adminRuntime.configured && (ADMIN_PASSWORD_HASH || ADMIN_SESSION_SECRET)) console.warn("[admin] only one of ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET is set (or the secret is shorter than 32 characters): /admin stays disabled (404).");
var adminStats = { writeFailures: 0 };
/** What /api/health reports (no secrets). */
function adminHealth() {
	return {
		adminConfigured: adminRuntime.configured,
		adminWriteFailures: adminStats.writeFailures,
		driveScopeOk: adminRuntime.driveScopeOk ?? null
	};
}
function gateConfig() {
	return {
		secret: adminRuntime.secret,
		passwordHash: adminRuntime.passwordHash,
		revoked: adminRuntime.revocations,
		isSecureSite: adminRuntime.isSecureSite
	};
}
var AdminError = class extends Error {
	status;
	code;
	extra;
	constructor(status, code, message, extra) {
		super(message ?? code);
		this.name = "AdminError";
		this.status = status;
		this.code = code;
		this.extra = extra;
	}
};
var ADMIN_RATES = {
	read: {
		limit: 120,
		windowMs: 6e4
	},
	mutation: {
		limit: 30,
		windowMs: 6e4
	},
	scrape: {
		limit: 10,
		windowMs: 6e4
	},
	scrapeGlobal: {
		limit: 30,
		windowMs: 6e5
	},
	photos: {
		limit: 5,
		windowMs: 6e4
	}
};
/** 429 + Retry-After when the session's window for `kind` is exhausted (the scrape kind also checks the global window). */
function sessionRateLimit(kind, session) {
	const l = ADMIN_RATES[kind];
	const keys = [[`${kind}:${session.sid}`, l]];
	if (kind === "scrape") keys.push(["scrape:global", ADMIN_RATES.scrapeGlobal]);
	for (const [key, lim] of keys) {
		const d = adminRuntime.limiter.wouldAllow(key, lim.limit, lim.windowMs);
		if (!d.ok) return noStore({
			ok: false,
			error: "too many requests"
		}, 429, { "retry-after": String(d.retryAfterSec) });
	}
	for (const [key, lim] of keys) adminRuntime.limiter.allow(key, lim.limit, lim.windowMs);
}
/** The gate already required a session (401); this is the typed, defensive re-check. */
function requireSession(context) {
	const session = context.locals.admin;
	if (!session) throw new AdminError(401, "unauthorized");
	return session;
}
function adminContext(context) {
	return {
		context,
		session: requireSession(context),
		requestId: context.locals.requestId ?? "none",
		ipHash: requestIpHash(context.request, socketAddressOf(context)),
		actor: adminRuntime.user
	};
}
/** Everything an AuditInput needs from the request (actor, ip hash, request id). */
function auditBase(context) {
	return {
		actor: adminRuntime.user,
		ipHash: requestIpHash(context.request, socketAddressOf(context)),
		requestId: context.locals.requestId ?? "none"
	};
}
/** Cross-site posture (415/413/403), JSON parse (400), zod safeParse (400 with issues). */
async function parseBody(request, schema, maxBytes = ADMIN_MAX_JSON_BODY) {
	const rejected = rejectCrossSite(request, maxBytes);
	if (rejected) return {
		ok: false,
		response: rejected
	};
	let raw;
	try {
		const text = await request.text();
		if (text.length > maxBytes) return {
			ok: false,
			response: noStore({
				ok: false,
				error: "payload too large"
			}, 413)
		};
		raw = text ? JSON.parse(text) : {};
	} catch {
		return {
			ok: false,
			response: noStore({
				ok: false,
				error: "bad request"
			}, 400)
		};
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) return {
		ok: false,
		response: noStore({
			ok: false,
			error: "invalid body",
			issues: issuesOf(parsed.error)
		}, 400)
	};
	return {
		ok: true,
		data: parsed.data
	};
}
/** Maps every failure shape to the §2.3 response; counts 5xx in adminStats.writeFailures. */
function errorToResponse(e, logger = consoleLogger) {
	let response;
	if (e instanceof AdminError) response = noStore({
		ok: false,
		error: e.code,
		...e.message !== e.code ? { message: e.message } : {},
		...e.extra ?? {}
	}, e.status);
	else if (e instanceof UnauditableError) response = noStore({
		ok: false,
		error: e.code,
		message: e.message
	}, 422);
	else if (e instanceof VersionMismatchError) {
		const rug = e.tab === "Products" ? adminRugFromCells(e.fresh, e.row) : void 0;
		response = noStore({
			ok: false,
			error: e.code,
			tab: e.tab,
			row: e.row,
			...rug ? { rug } : { fresh: e.fresh }
		}, 409);
	} else if (e instanceof RowConflictError) response = noStore({
		ok: false,
		error: e.code,
		message: e.message
	}, 409);
	else if (e instanceof SheetsApiError && (e.status === 429 || e.status === 503)) response = noStore({
		ok: false,
		error: "sheet unavailable"
	}, 503, { "retry-after": "30" });
	else if (e instanceof SheetContractError) response = noStore({
		ok: false,
		error: "sheet contract",
		message: serializeError(e).message
	}, 503);
	else {
		logger.error("admin request failed", { error: serializeError(e) });
		response = noStore({
			ok: false,
			error: "internal error",
			message: serializeError(e).message
		}, 500);
	}
	if (response.status >= 500) adminStats.writeFailures += 1;
	return response;
}
function methodNotAllowed(allow) {
	return () => noStore({
		ok: false,
		error: "method not allowed"
	}, 405, { allow });
}
/** GET endpoint: session, `read` rate limit, error mapping. */
function adminGet(handler) {
	return async (context) => {
		try {
			const ctx = adminContext(context);
			const limited = sessionRateLimit("read", ctx.session);
			if (limited) return limited;
			return await handler(ctx);
		} catch (e) {
			return errorToResponse(e);
		}
	};
}
/** POST endpoint: cross-site posture, `kind` rate limit, zod body, error mapping. */
function adminPost(schema, handler, kind = "mutation") {
	return async (context) => {
		try {
			const ctx = adminContext(context);
			const rejected = rejectCrossSite(context.request, ADMIN_MAX_JSON_BODY);
			if (rejected) return rejected;
			const limited = sessionRateLimit(kind, ctx.session);
			if (limited) return limited;
			const body = await parseBody(context.request, schema);
			if (!body.ok) return body.response;
			return await handler({
				...ctx,
				body: body.data
			});
		} catch (e) {
			return errorToResponse(e);
		}
	};
}
/**
* Best-effort audit row for events that are not part of a mutation batch (auth.*, scrape.fetch,
* photo.import): never throws, logs failures. Returns the AuditLog row (2) or undefined.
*/
async function recordAuditEvent(input, logger = consoleLogger) {
	try {
		const row = buildAuditRow({
			...input,
			actor: input.actor ?? adminRuntime.user
		});
		return await appendAudit(getClient(), row);
	} catch (e) {
		logger.error("audit event not written", {
			action: input.action,
			error: serializeError(e)
		});
		return;
	}
}
/** After a successful mutation: bust the data cache and purge the route cache (never throws). */
function invalidateAfterWrite(context) {
	return invalidateCatalogue(getCache, context, {
		state: revalidateState,
		logger: consoleLogger
	});
}
//#endregion
export { updateRow as _, adminRuntime as a, invalidateAfterWrite as c, requireSession as d, insertRowAtBottom as f, updateColumnCells as g, productFieldsToCells as h, adminPost as i, methodNotAllowed as l, insertTopRow as m, adminGet as n, auditBase as o, insertRug as p, adminHealth as r, gateConfig as s, AdminError as t, recordAuditEvent as u, updateRug as v, adminGate as y };
