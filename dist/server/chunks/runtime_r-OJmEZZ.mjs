import { i as setOnSetGetEnv, n as getEnv$1, t as createInvalidVariablesError } from "./runtime_skv-YCY6.mjs";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Agent, fetch as fetch$1 } from "undici";
import { promises } from "node:dns";
import { BlockList, isIP } from "node:net";
import { JWT, UserRefreshClient } from "google-auth-library";
import * as z from "zod";
//#region node_modules/astro/dist/env/validators.js
function getEnvFieldType(options) {
	const optional = options.optional ? options.default !== void 0 ? false : true : false;
	let type;
	if (options.type === "enum") type = options.values.map((v) => `'${v}'`).join(" | ");
	else type = options.type;
	return `${type}${optional ? " | undefined" : ""}`;
}
var stringValidator = ({ max, min, length, url, includes, startsWith, endsWith }) => (input) => {
	if (typeof input !== "string") return {
		ok: false,
		errors: ["type"]
	};
	const errors = [];
	if (max !== void 0 && !(input.length <= max)) errors.push("max");
	if (min !== void 0 && !(input.length >= min)) errors.push("min");
	if (length !== void 0 && !(input.length === length)) errors.push("length");
	if (url !== void 0 && !URL.canParse(input)) errors.push("url");
	if (includes !== void 0 && !input.includes(includes)) errors.push("includes");
	if (startsWith !== void 0 && !input.startsWith(startsWith)) errors.push("startsWith");
	if (endsWith !== void 0 && !input.endsWith(endsWith)) errors.push("endsWith");
	if (errors.length > 0) return {
		ok: false,
		errors
	};
	return {
		ok: true,
		value: input
	};
};
var numberValidator = ({ gt, min, lt, max, int }) => (input) => {
	const num = Number.parseFloat(input ?? "");
	if (isNaN(num)) return {
		ok: false,
		errors: ["type"]
	};
	const errors = [];
	if (gt !== void 0 && !(num > gt)) errors.push("gt");
	if (min !== void 0 && !(num >= min)) errors.push("min");
	if (lt !== void 0 && !(num < lt)) errors.push("lt");
	if (max !== void 0 && !(num <= max)) errors.push("max");
	if (int !== void 0) {
		const isInt = Number.isInteger(num);
		if (!(int ? isInt : !isInt)) errors.push("int");
	}
	if (errors.length > 0) return {
		ok: false,
		errors
	};
	return {
		ok: true,
		value: num
	};
};
var booleanValidator = (input) => {
	const bool = input === "true" ? true : input === "false" ? false : void 0;
	if (typeof bool !== "boolean") return {
		ok: false,
		errors: ["type"]
	};
	return {
		ok: true,
		value: bool
	};
};
var enumValidator = ({ values }) => (input) => {
	if (!(typeof input === "string" ? values.includes(input) : false)) return {
		ok: false,
		errors: ["type"]
	};
	return {
		ok: true,
		value: input
	};
};
function selectValidator(options) {
	switch (options.type) {
		case "string": return stringValidator(options);
		case "number": return numberValidator(options);
		case "boolean": return booleanValidator;
		case "enum": return enumValidator(options);
	}
}
function validateEnvVariable(value, options) {
	const isOptional = options.optional || options.default !== void 0;
	if (isOptional && value === void 0) return {
		ok: true,
		value: options.default
	};
	if (!isOptional && value === void 0) return {
		ok: false,
		errors: ["missing"]
	};
	return selectValidator(options)(value);
}
//#endregion
//#region \0virtual:astro:env/internal
var schema = {
	"GOOGLE_SHEET_ID": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"GOOGLE_AUTH_MODE": {
		"context": "server",
		"access": "secret",
		"values": ["service_account", "oauth_refresh"],
		"default": "service_account",
		"type": "enum"
	},
	"GOOGLE_SERVICE_ACCOUNT_EMAIL": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"GOOGLE_PRIVATE_KEY": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"GOOGLE_OAUTH_CLIENT_ID": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"GOOGLE_OAUTH_CLIENT_SECRET": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"GOOGLE_OAUTH_REFRESH_TOKEN": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"SHEETS_CACHE_TTL": {
		"context": "server",
		"access": "secret",
		"default": 60,
		"type": "number"
	},
	"DATA_DIR": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"CLIENT_IP_HEADER": {
		"context": "server",
		"access": "secret",
		"default": "",
		"type": "string"
	},
	"TRUSTED_PROXY_HOPS": {
		"context": "server",
		"access": "secret",
		"default": 1,
		"type": "number"
	},
	"SITE_URL": {
		"context": "server",
		"access": "secret",
		"url": true,
		"type": "string"
	},
	"REVALIDATE_SECRET": {
		"context": "server",
		"access": "secret",
		"min": 32,
		"type": "string"
	},
	"VOTE_SALT": {
		"context": "server",
		"access": "secret",
		"min": 32,
		"type": "string"
	},
	"ADMIN_PASSWORD_HASH": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"min": 80,
		"type": "string"
	},
	"ADMIN_SESSION_SECRET": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"min": 32,
		"type": "string"
	},
	"ADMIN_USER": {
		"context": "server",
		"access": "secret",
		"default": "owner",
		"type": "string"
	},
	"RETAIL_MARKUP": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "number"
	},
	"GOOGLE_DRIVE_FOLDER_ID": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"type": "string"
	},
	"SCRAPE_JINA_FALLBACK": {
		"context": "server",
		"access": "secret",
		"default": true,
		"type": "boolean"
	},
	"SCRAPE_ECG_GRAPHQL": {
		"context": "server",
		"access": "secret",
		"default": false,
		"type": "boolean"
	},
	"SCRAPE_RESPECT_ROBOTS": {
		"context": "server",
		"access": "secret",
		"default": true,
		"type": "boolean"
	},
	"AUTH_SECRET": {
		"context": "server",
		"access": "secret",
		"optional": true,
		"min": 32,
		"type": "string"
	},
	"PUBLIC_CATALOGUE": {
		"context": "server",
		"access": "secret",
		"default": true,
		"type": "boolean"
	},
	"BASE_CURRENCY": {
		"context": "server",
		"access": "secret",
		"default": "USD",
		"type": "string"
	},
	"FX_API_URL": {
		"context": "server",
		"access": "secret",
		"default": "https://api.frankfurter.dev/v1/latest",
		"type": "string"
	},
	"FX_REFRESH_HOURS": {
		"context": "server",
		"access": "secret",
		"default": 24,
		"type": "number"
	}
};
//#endregion
//#region \0astro:env/server
/** @returns {string} */
var getEnv = (key) => {
	return getEnv$1(key);
};
var _internalGetSecret = (key) => {
	const rawVariable = getEnv(key);
	const variable = rawVariable === "" ? void 0 : rawVariable;
	const options = schema[key];
	const result = validateEnvVariable(variable, options);
	if (result.ok) return result.value;
	const type = getEnvFieldType(options);
	throw createInvalidVariablesError(key, type, result);
};
setOnSetGetEnv(() => {
	GOOGLE_SHEET_ID = _internalGetSecret("GOOGLE_SHEET_ID");
	GOOGLE_AUTH_MODE = _internalGetSecret("GOOGLE_AUTH_MODE");
	GOOGLE_SERVICE_ACCOUNT_EMAIL = _internalGetSecret("GOOGLE_SERVICE_ACCOUNT_EMAIL");
	GOOGLE_PRIVATE_KEY = _internalGetSecret("GOOGLE_PRIVATE_KEY");
	GOOGLE_OAUTH_CLIENT_ID = _internalGetSecret("GOOGLE_OAUTH_CLIENT_ID");
	GOOGLE_OAUTH_CLIENT_SECRET = _internalGetSecret("GOOGLE_OAUTH_CLIENT_SECRET");
	GOOGLE_OAUTH_REFRESH_TOKEN = _internalGetSecret("GOOGLE_OAUTH_REFRESH_TOKEN");
	SHEETS_CACHE_TTL = _internalGetSecret("SHEETS_CACHE_TTL");
	DATA_DIR = _internalGetSecret("DATA_DIR");
	CLIENT_IP_HEADER = _internalGetSecret("CLIENT_IP_HEADER");
	TRUSTED_PROXY_HOPS = _internalGetSecret("TRUSTED_PROXY_HOPS");
	SITE_URL = _internalGetSecret("SITE_URL");
	REVALIDATE_SECRET = _internalGetSecret("REVALIDATE_SECRET");
	VOTE_SALT = _internalGetSecret("VOTE_SALT");
	ADMIN_PASSWORD_HASH = _internalGetSecret("ADMIN_PASSWORD_HASH");
	ADMIN_SESSION_SECRET = _internalGetSecret("ADMIN_SESSION_SECRET");
	ADMIN_USER = _internalGetSecret("ADMIN_USER");
	RETAIL_MARKUP = _internalGetSecret("RETAIL_MARKUP");
	GOOGLE_DRIVE_FOLDER_ID = _internalGetSecret("GOOGLE_DRIVE_FOLDER_ID");
	SCRAPE_JINA_FALLBACK = _internalGetSecret("SCRAPE_JINA_FALLBACK");
	SCRAPE_ECG_GRAPHQL = _internalGetSecret("SCRAPE_ECG_GRAPHQL");
	SCRAPE_RESPECT_ROBOTS = _internalGetSecret("SCRAPE_RESPECT_ROBOTS");
	AUTH_SECRET = _internalGetSecret("AUTH_SECRET");
	PUBLIC_CATALOGUE = _internalGetSecret("PUBLIC_CATALOGUE");
	BASE_CURRENCY = _internalGetSecret("BASE_CURRENCY");
	FX_API_URL = _internalGetSecret("FX_API_URL");
	FX_REFRESH_HOURS = _internalGetSecret("FX_REFRESH_HOURS");
});
var GOOGLE_SHEET_ID = _internalGetSecret("GOOGLE_SHEET_ID");
var GOOGLE_AUTH_MODE = _internalGetSecret("GOOGLE_AUTH_MODE");
var GOOGLE_SERVICE_ACCOUNT_EMAIL = _internalGetSecret("GOOGLE_SERVICE_ACCOUNT_EMAIL");
var GOOGLE_PRIVATE_KEY = _internalGetSecret("GOOGLE_PRIVATE_KEY");
var GOOGLE_OAUTH_CLIENT_ID = _internalGetSecret("GOOGLE_OAUTH_CLIENT_ID");
var GOOGLE_OAUTH_CLIENT_SECRET = _internalGetSecret("GOOGLE_OAUTH_CLIENT_SECRET");
var GOOGLE_OAUTH_REFRESH_TOKEN = _internalGetSecret("GOOGLE_OAUTH_REFRESH_TOKEN");
var SHEETS_CACHE_TTL = _internalGetSecret("SHEETS_CACHE_TTL");
var DATA_DIR = _internalGetSecret("DATA_DIR");
var CLIENT_IP_HEADER = _internalGetSecret("CLIENT_IP_HEADER");
var TRUSTED_PROXY_HOPS = _internalGetSecret("TRUSTED_PROXY_HOPS");
var SITE_URL = _internalGetSecret("SITE_URL");
var REVALIDATE_SECRET = _internalGetSecret("REVALIDATE_SECRET");
var VOTE_SALT = _internalGetSecret("VOTE_SALT");
var ADMIN_PASSWORD_HASH = _internalGetSecret("ADMIN_PASSWORD_HASH");
var ADMIN_SESSION_SECRET = _internalGetSecret("ADMIN_SESSION_SECRET");
var ADMIN_USER = _internalGetSecret("ADMIN_USER");
var RETAIL_MARKUP = _internalGetSecret("RETAIL_MARKUP");
var GOOGLE_DRIVE_FOLDER_ID = _internalGetSecret("GOOGLE_DRIVE_FOLDER_ID");
var SCRAPE_JINA_FALLBACK = _internalGetSecret("SCRAPE_JINA_FALLBACK");
var SCRAPE_ECG_GRAPHQL = _internalGetSecret("SCRAPE_ECG_GRAPHQL");
var SCRAPE_RESPECT_ROBOTS = _internalGetSecret("SCRAPE_RESPECT_ROBOTS");
var AUTH_SECRET = _internalGetSecret("AUTH_SECRET");
var PUBLIC_CATALOGUE = _internalGetSecret("PUBLIC_CATALOGUE");
var BASE_CURRENCY = _internalGetSecret("BASE_CURRENCY");
var FX_API_URL = _internalGetSecret("FX_API_URL");
var FX_REFRESH_HOURS = _internalGetSecret("FX_REFRESH_HOURS");
//#endregion
//#region src/lib/sheets/errors.ts
var SheetsApiError = class extends Error {
	status;
	googleStatus;
	retryable;
	constructor(status, message, googleStatus) {
		super(message);
		this.name = "SheetsApiError";
		this.status = status;
		this.googleStatus = googleStatus;
		this.retryable = status === 429 || status === 503;
	}
};
var SheetContractError = class extends Error {
	tab;
	mismatches;
	constructor(tab, mismatches) {
		super(`Sheet contract violated in tab "${tab}": ${mismatches.join("; ")}`);
		this.name = "SheetContractError";
		this.tab = tab;
		this.mismatches = mismatches;
	}
};
var SCRUB_PATTERNS = [
	/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END[A-Z ]*PRIVATE KEY-----|$)/g,
	/\b(refresh_token|client_secret|assertion|private_key|access_token|id_token|authorization|code_verifier)\b["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s"'&,;}]*/gi,
	/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi,
	/\bya29\.[A-Za-z0-9._-]+/g,
	/\b1\/\/[A-Za-z0-9._-]+/g,
	/\bGOCSPX-[A-Za-z0-9_-]+/g,
	/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g
];
function scrub(s) {
	let out = s;
	for (const re of SCRUB_PATTERNS) out = out.replace(re, "[redacted]");
	return out.slice(0, 500);
}
function summariseCause(e) {
	const cause = e?.cause;
	if (!cause || typeof cause !== "object") return void 0;
	const c = cause;
	const parts = [
		c.name,
		c.code,
		c.message
	].filter((p) => typeof p === "string" || typeof p === "number").map(String);
	return parts.length ? scrub(parts.join(" ")) : void 0;
}
/** Allow-listed view of an error for logging; strips anything that looks like a credential. */
function serializeError(e) {
	const cause = summariseCause(e);
	if (e instanceof SheetsApiError) return {
		name: e.name,
		message: scrub(e.message),
		status: e.status,
		googleStatus: e.googleStatus,
		...cause ? { cause } : {}
	};
	if (e instanceof SheetContractError) return {
		name: e.name,
		message: scrub(e.message),
		tab: e.tab
	};
	if (e instanceof Error) return {
		name: e.name,
		message: scrub(e.message),
		...cause ? { cause } : {}
	};
	return {
		name: "UnknownError",
		message: scrub(String(e))
	};
}
var consoleLogger = {
	info: (msg, data) => console.info(`[sheets] ${msg}`, data ?? ""),
	warn: (msg, data) => console.warn(`[sheets] ${msg}`, data ?? ""),
	error: (msg, data) => console.error(`[sheets] ${msg}`, data ?? "")
};
var silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {}
};
//#endregion
//#region src/lib/drive/client.ts
var DRIVE_API = "https://www.googleapis.com/drive/v3";
var DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
var REQUEST_TIMEOUT_MS$1 = 3e4;
var TOKEN_TIMEOUT_MS$1 = 2e4;
var DriveApiError = class extends Error {
	status;
	googleStatus;
	retryable;
	constructor(status, message, googleStatus) {
		super(message);
		this.name = "DriveApiError";
		this.status = status;
		this.googleStatus = googleStatus;
		this.retryable = status === 429 || status === 503;
	}
};
var driveConsoleLogger = {
	info: (msg, data) => console.info(`[drive] ${msg}`, data ?? ""),
	warn: (msg, data) => console.warn(`[drive] ${msg}`, data ?? ""),
	error: (msg, data) => console.error(`[drive] ${msg}`, data ?? "")
};
async function withTimeout$1(p, ms, what) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`${what} timed out after ${ms} ms`)), ms);
		if (typeof timer === "object" && "unref" in timer) timer.unref();
	});
	try {
		return await Promise.race([p, timeout]);
	} finally {
		clearTimeout(timer);
	}
}
function defaultSleep$1(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Log-safe summary of an error (scrubbed message plus the HTTP status for Drive errors). */
function describeDriveError(e) {
	const safe = { ...serializeError(e) };
	if (e instanceof DriveApiError) {
		safe.status = e.status;
		if (e.googleStatus) safe.googleStatus = e.googleStatus;
	}
	return safe;
}
async function once(fetchImpl, url, opts, token) {
	const headers = { authorization: `Bearer ${token}` };
	let body;
	if (opts.body && "raw" in opts.body) {
		headers["content-type"] = opts.body.contentType;
		body = opts.body.raw;
	} else if (opts.body) {
		headers["content-type"] = "application/json";
		body = JSON.stringify(opts.body.json);
	}
	const res = await fetchImpl(url, {
		method: opts.method,
		headers,
		body,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS$1)
	});
	const text = await res.text();
	let json = {};
	if (text) try {
		json = JSON.parse(text);
	} catch {
		if (res.ok) throw new DriveApiError(502, "non-JSON response from the Drive API");
	}
	if (!res.ok) {
		const err = json.error;
		throw new DriveApiError(res.status, err?.message ?? `HTTP ${res.status}`, err?.status ?? err?.errors?.[0]?.reason);
	}
	return json;
}
function createDriveHttp(options) {
	const fetchImpl = options.fetchImpl ?? fetch;
	const logger = options.logger ?? driveConsoleLogger;
	const sleep = options.sleep ?? defaultSleep$1;
	const maxAttempts = options.maxAttempts ?? 3;
	async function request(opts) {
		const url = new URL(opts.url);
		if (opts.query?.length) url.search = opts.query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
		let token;
		try {
			token = await withTimeout$1(options.getAccessToken(), TOKEN_TIMEOUT_MS$1, "access token request");
		} catch (e) {
			throw new DriveApiError(401, `could not obtain an access token: ${serializeError(e).message}`, "UNAUTHENTICATED");
		}
		let lastError;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) try {
			return await once(fetchImpl, url, opts, token);
		} catch (e) {
			lastError = e;
			const apiError = e instanceof DriveApiError ? e : void 0;
			if (!(apiError ? apiError.retryable : opts.policy === "read") || attempt === maxAttempts) throw e;
			const delay = 1e3 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
			logger.warn(`retrying ${opts.method} ${url.pathname} after ${delay}ms`, {
				attempt,
				error: describeDriveError(e)
			});
			await sleep(delay);
		}
		throw lastError;
	}
	return {
		request,
		fetchImpl,
		logger,
		sleep
	};
}
//#endregion
//#region src/lib/images.ts
var DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,128}$/;
/** Hosts an editor-supplied https image URL may point at (cover images, ADR §5). */
var IMAGE_HOSTS$1 = ["lh3.googleusercontent.com", "drive.google.com"];
/** Extracts a Drive file id from a bare id or any common Drive / lh3 URL shape; null when none. */
function extractDriveId(input) {
	const s = input.trim();
	if (!s) return null;
	if (DRIVE_ID_RE.test(s)) return s;
	let url;
	try {
		url = new URL(s);
	} catch {
		return null;
	}
	const fromQuery = url.searchParams.get("id");
	if (fromQuery && DRIVE_ID_RE.test(fromQuery)) return fromQuery;
	return url.pathname.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]{20,128})(?:[/=]|$)/)?.[1] ?? null;
}
/**
* The direct lh3 URL. Still the upstream the proxy fetches from, and still what the admin's own
* previews use, but no longer what a visitor's browser is pointed at.
*/
function lh3Url(fileId, width = 800) {
	if (!DRIVE_ID_RE.test(fileId)) throw new Error("lh3Url: invalid Drive file id");
	return `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
}
/**
* What a page renders (brief §12). Photos are served from this origin rather than from Drive: Drive
* is not a content network, lh3 is rate-limited and outside our cache and CSP control, and a file id
* addresses one immutable blob — so the proxy can mark it cacheable for a year.
*
* This is the only place an image URL is formed, so switching the upstream again later is one edit.
*/
function driveImageUrl(fileId, width = 800) {
	if (!DRIVE_ID_RE.test(fileId)) throw new Error("driveImageUrl: invalid Drive file id");
	return `/api/image/${fileId}?w=${width}`;
}
/** Normalises an editor-typed image cell: Drive id/URL → lh3, allow-listed https URL → as is, else a reason. */
function normaliseImageUrl(input) {
	const id = extractDriveId(input);
	if (id) return { url: driveImageUrl(id, 1600) };
	let url;
	try {
		url = new URL(input.trim());
	} catch {
		return { reason: "not a Drive id/URL or https URL" };
	}
	if (url.protocol !== "https:") return { reason: "only https URLs are allowed" };
	if (!IMAGE_HOSTS$1.includes(url.hostname)) return { reason: `host "${url.hostname}" is not allow-listed` };
	return { url: url.toString() };
}
var FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
/** Multipart upload cap (§5.2): ECG full images are ~0.9 MB, KV `?width=1600` ~0.4 MB. */
var MAX_UPLOAD_BYTES = 5242880;
/** Hosts the default (interim) downloader accepts (§4.5); the scraper's guarded client replaces it. */
var DOWNLOAD_HOSTS = [
	"images.ecarpetwholesale.com",
	"cdn.shopify.com",
	"karavanrug.com"
];
//#endregion
//#region src/lib/drive/folder.ts
/** Escapes a literal for a Drive `q` string (backslash and single quote). */
function escapeDriveQuery(literal) {
	return literal.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function folderQuery(name) {
	return `name='${escapeDriveQuery(name)}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`;
}
async function hasAnyoneReader(http, folderId) {
	return ((await http.request({
		method: "GET",
		url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`,
		query: [["fields", "permissions(type,role)"]],
		policy: "read"
	})).permissions ?? []).some((p) => p.type === "anyone");
}
async function shareAnyoneReader(http, folderId) {
	await http.request({
		method: "POST",
		url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions`,
		query: [["fields", "id"]],
		body: { json: {
			type: "anyone",
			role: "reader",
			allowFileDiscovery: false
		} },
		policy: "write"
	});
}
async function discoverOrCreate(http, name) {
	const files = (await http.request({
		method: "GET",
		url: `https://www.googleapis.com/drive/v3/files`,
		query: [
			["q", folderQuery(name)],
			["spaces", "drive"],
			["fields", "files(id,name)"],
			["pageSize", "10"]
		],
		policy: "read"
	})).files ?? [];
	const found = files[0];
	if (found) {
		if (files.length > 1) http.logger.warn(`found ${files.length} folders named "${name}"; using the first`, { ids: files.map((f) => f.id) });
		if (!await hasAnyoneReader(http, found.id)) {
			await shareAnyoneReader(http, found.id);
			http.logger.info(`restored the "anyone with the link" permission on folder ${found.id}`);
		}
		http.logger.info(`using Drive folder "${name}" (${found.id}); set GOOGLE_DRIVE_FOLDER_ID=${found.id} to skip this lookup`);
		return found.id;
	}
	const created = await http.request({
		method: "POST",
		url: `${DRIVE_API}/files`,
		query: [["fields", "id"]],
		body: { json: {
			name,
			mimeType: FOLDER_MIME_TYPE
		} },
		policy: "write"
	});
	if (!created.id) throw new DriveApiError(502, "files.create returned no id");
	await shareAnyoneReader(http, created.id);
	http.logger.info(`created Drive folder "${name}" (${created.id}); set GOOGLE_DRIVE_FOLDER_ID=${created.id} to skip this lookup`);
	return created.id;
}
function createFolderResolver(http, options = {}) {
	const name = options.name ?? "Serio Ludere catalogue photos";
	const configured = options.folderId?.trim() || void 0;
	let resolved;
	let pending;
	return async () => {
		if (resolved) return resolved;
		if (configured !== void 0) {
			if (!DRIVE_ID_RE.test(configured)) throw new DriveApiError(400, "GOOGLE_DRIVE_FOLDER_ID is not a Drive file id", "INVALID_ARGUMENT");
			resolved = configured;
			return resolved;
		}
		if (!pending) pending = discoverOrCreate(http, name).then((id) => {
			resolved = id;
			return id;
		}).finally(() => {
			pending = void 0;
		});
		return pending;
	};
}
/** The subfolder every photo of a rug is kept in, beside the duplicated primary. */
var ALL_IMAGES_FOLDER = "All Images";
/**
* `SL-021 — Winks`. The em dash is the brief's; the id leads so the folder list sorts by it and a
* renamed rug keeps its place. Characters Drive dislikes in a name are replaced rather than dropped,
* so two rugs never collapse onto one folder name.
*/
function productFolderName(productId, productName) {
	const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
	const id = clean(productId) || "unknown";
	const name = clean(productName).slice(0, 80);
	return name ? `${id} — ${name}` : id;
}
async function findChildFolder(http, parentId, name) {
	return ((await http.request({
		method: "GET",
		url: `https://www.googleapis.com/drive/v3/files`,
		query: [
			["q", `${folderQuery(name)} and '${escapeDriveQuery(parentId)}' in parents`],
			["spaces", "drive"],
			["fields", "files(id,name)"],
			["pageSize", "10"]
		],
		policy: "read"
	})).files ?? [])[0]?.id;
}
async function createChildFolder(http, parentId, name) {
	const created = await http.request({
		method: "POST",
		url: `${DRIVE_API}/files`,
		query: [["fields", "id"]],
		body: { json: {
			name,
			mimeType: FOLDER_MIME_TYPE,
			parents: [parentId]
		} },
		policy: "write"
	});
	if (!created.id) throw new DriveApiError(502, "files.create returned no id");
	return created.id;
}
async function ensureChild(http, parentId, name) {
	return await findChildFolder(http, parentId, name) ?? await createChildFolder(http, parentId, name);
}
/**
* Finds or creates the two folders one rug needs. No permission call is made on either: they are
* created inside the root, which is already shared with anyone holding the link, and Drive folders
* inherit that. Idempotent, so a retry after a half-finished import reuses what is there.
*/
function createProductFolderResolver(http, ensureRoot) {
	return async (productId, productName) => {
		const root = await ensureRoot();
		const name = productFolderName(productId, productName);
		const folderId = await ensureChild(http, root, name);
		return {
			productId: folderId,
			allImagesId: await ensureChild(http, folderId, ALL_IMAGES_FOLDER),
			name,
			url: `https://drive.google.com/drive/folders/${folderId}`
		};
	};
}
/**
* Every file already sitting in a folder, as `name → id`. Used by the retry path to tell what an
* interrupted import managed to upload: filenames are deterministic (`01-primary`, `winks-02`), so a
* name that is already there is a photo that already landed. One page of 100 covers the 12-photo cap
* many times over.
*/
function createFolderLister(http) {
	return async (folderId) => {
		const list = await http.request({
			method: "GET",
			url: `${DRIVE_API}/files`,
			query: [
				["q", `'${escapeDriveQuery(folderId)}' in parents and trashed=false`],
				["spaces", "drive"],
				["fields", "files(id,name)"],
				["pageSize", "100"]
			],
			policy: "read"
		});
		const out = /* @__PURE__ */ new Map();
		for (const f of list.files ?? []) if (f.name && !out.has(f.name)) out.set(f.name, f.id);
		return out;
	};
}
//#endregion
//#region src/lib/drive/transform.ts
/**
* The media type without its parameters.
*
* Duplicated from upload.ts's `mimeOf` rather than imported: upload.ts imports THIS module, and a
* two-line normaliser is a far smaller cost than a circular import between them.
*/
function bareMime(contentType) {
	return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
/** Formats sharp can decode and re-encode losslessly enough to be worth rewriting. */
var TRANSFORMABLE = /* @__PURE__ */ new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
	"image/tiff"
]);
/**
* The transforms a given photo earns.
*
* `index` is the photo's position in the import, so "first image" means exactly that — the one the
* card shows. Everything after it is left as the supplier sent it.
*/
function transformsFor(supplier, index) {
	if (index !== 0) return [];
	const out = [];
	if (supplier === "karavanrug") out.push("rotate90");
	if (supplier === "karavanrug" || supplier === "ecarpetgallery") out.push("removeBackground");
	return out;
}
/**
* Rotates a quarter turn clockwise.
*
* Clockwise because the owner did not say which way and every Karavan plate this was checked
* against is a landscape file of a portrait rug lying on its right side. If it turns out to be the
* other way, this is a one-character change (90 → 270).
*
* sharp is imported dynamically: it is a native module that Astro already pulls in, and loading it
* eagerly would drag it into every context that touches Drive, tests included.
*/
async function rotate90(bytes) {
	const { default: sharp } = await import("sharp");
	const out = await sharp(bytes).rotate(90).withMetadata().toBuffer();
	return new Uint8Array(out);
}
/**
* Background removal — NOT IMPLEMENTED, by the owner's decision of 2026-09-13.
*
* sharp cannot do this: separating a rug from its backdrop needs a segmentation model, not an image
* filter. The two real options were a hosted API (remove.bg / Photoroom — around $0.20 an image, and
* every supplier photo leaves the studio's control) or a local ONNX model (rembg / BiRefNet — a
* ~180MB download and materially more CPU per import). The owner chose neither for now.
*
* This is the seam where it plugs in: return the new bytes and every caller already handles it. It
* returns the input unchanged rather than throwing, so the transform pipeline stays a no-op until
* there is something real to do.
*/
async function removeBackground(bytes) {
	return bytes;
}
/**
* Runs the transforms this photo earns, and never fails the import.
*
* A photo that cannot be rotated is still a photo the owner wants in Drive. Losing an import because
* sharp could not decode an unusual file — or is not installed on the host at all — would trade a
* cosmetic problem for a missing product image, so every failure falls back to the original bytes
* and reports itself through `skipped`.
*/
async function applyTransforms(input, opts) {
	const wanted = transformsFor(opts.supplier, opts.index);
	if (wanted.length === 0) return {
		...input,
		applied: []
	};
	const mime = bareMime(input.contentType);
	if (!TRANSFORMABLE.has(mime)) return {
		...input,
		applied: [],
		skipped: `cannot transform ${mime || "unknown type"}`
	};
	let bytes = input.bytes;
	const applied = [];
	try {
		for (const t of wanted) if (t === "rotate90") {
			bytes = await rotate90(bytes);
			applied.push(t);
		} else if (t === "removeBackground") {
			const next = await removeBackground(bytes);
			if (next !== bytes) {
				bytes = next;
				applied.push(t);
			}
		}
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		return {
			...input,
			applied: [],
			skipped: detail
		};
	}
	return {
		bytes,
		contentType: input.contentType,
		applied
	};
}
//#endregion
//#region src/lib/drive/upload.ts
var DOWNLOAD_TIMEOUT_MS = 1e4;
var MAX_REDIRECTS = 3;
var REDIRECT_STATUSES = /* @__PURE__ */ new Set([
	301,
	302,
	303,
	307,
	308
]);
var LH3_TIMEOUT_MS = 1e4;
var DownloadError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "DownloadError";
		this.code = code;
	}
};
/** Media type without parameters, lower-cased; '' when absent. */
function mimeOf(contentType) {
	return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}
/** `image/*` except SVG (scriptable, and never a photo). */
function isImageType(mime) {
	return /^image\/[a-z0-9.+-]+$/.test(mime) && !mime.includes("svg");
}
var EXTENSIONS = {
	"image/jpeg": "jpg",
	"image/pjpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/avif": "avif",
	"image/heic": "heic",
	"image/heif": "heif",
	"image/bmp": "bmp",
	"image/tiff": "tif"
};
/** Sanitised file name whose extension matches the bytes actually stored (`<slug>-<n>.jpg` normally). */
function fileNameFor(name, mime) {
	const base = name.replace(/[\p{Cc}/\\]+/gu, "").trim().slice(0, 100).replace(/\.[a-z0-9]{1,5}$/i, "").trim() || "photo";
	const fromMime = mime.replace(/^image\//, "").replace(/^x-/, "").replace(/[^a-z0-9]/g, "");
	return `${base}.${EXTENSIONS[mime] ?? (fromMime || "jpg")}`;
}
function randomBoundary() {
	return `sl_${randomBytes(16).toString("hex")}`;
}
/** `multipart/related` body for `uploadType=multipart`: JSON metadata part, then the media part. */
function buildMultipartBody(input, boundary) {
	const metadata = JSON.stringify(input.metadata);
	const media = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
	let b = boundary ?? randomBoundary();
	while (media.includes(b) || metadata.includes(b)) b = randomBoundary();
	const enc = new TextEncoder();
	const head = enc.encode(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${b}\r\nContent-Type: ${input.mimeType}\r\n\r\n`);
	const tail = enc.encode(`\r\n--${b}--\r\n`);
	const body = new Uint8Array(head.byteLength + input.bytes.byteLength + tail.byteLength);
	body.set(head, 0);
	body.set(input.bytes, head.byteLength);
	body.set(tail, head.byteLength + input.bytes.byteLength);
	return {
		body,
		contentType: `multipart/related; boundary=${b}`,
		boundary: b
	};
}
function validateDownloadUrl(input) {
	let url;
	try {
		url = new URL(input);
	} catch {
		throw new DownloadError("unsupported_host", "not a URL");
	}
	if (url.protocol !== "https:") throw new DownloadError("unsupported_host", "https only");
	if (url.username || url.password || url.port) throw new DownloadError("unsupported_host", "userinfo/port");
	if (!DOWNLOAD_HOSTS.includes(url.hostname.toLowerCase())) throw new DownloadError("unsupported_host", `host "${url.hostname}" is not allow-listed`);
	return url;
}
async function readCapped(res, max) {
	const reader = res.body?.getReader();
	if (!reader) {
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength > max) throw new DownloadError("too_large", `${buf.byteLength} bytes > ${max}`);
		return buf;
	}
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > max) {
			await reader.cancel().catch(() => {});
			throw new DownloadError("too_large", `body exceeds ${max} bytes`);
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}
/**
* Interim downloader until the scraper's guarded undici client is wired in: https + host allow-list,
* manual redirects re-validated per hop, `image/*` only, 5 MB cap enforced while streaming.
* Not DNS-pinned (the allow-listed hosts are constants, so no user-influenced name reaches DNS).
*/
async function defaultDownload(input, fetchImpl = fetch) {
	let url = validateDownloadUrl(input);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let res;
		try {
			res = await fetchImpl(url, {
				method: "GET",
				redirect: "manual",
				headers: { accept: "image/*" },
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
			});
		} catch (e) {
			throw new DownloadError("download_failed", scrub(e instanceof Error ? e.message : String(e)));
		}
		if (REDIRECT_STATUSES.has(res.status)) {
			const location = res.headers.get("location");
			await res.body?.cancel().catch(() => {});
			if (!location) throw new DownloadError("download_failed", `redirect ${res.status} without location`);
			let next;
			try {
				next = new URL(location, url);
			} catch {
				throw new DownloadError("download_failed", "unparseable redirect");
			}
			url = validateDownloadUrl(next.toString());
			continue;
		}
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			throw new DownloadError("download_failed", `HTTP ${res.status}`);
		}
		const contentType = mimeOf(res.headers.get("content-type"));
		if (!isImageType(contentType)) {
			await res.body?.cancel().catch(() => {});
			throw new DownloadError("not_image", contentType || "missing content-type");
		}
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (Number.isFinite(declared) && declared > 5242880) {
			await res.body?.cancel().catch(() => {});
			throw new DownloadError("too_large", `content-length ${declared} > ${MAX_UPLOAD_BYTES}`);
		}
		return {
			bytes: await readCapped(res, MAX_UPLOAD_BYTES),
			contentType
		};
	}
	throw new DownloadError("download_failed", "too many redirects");
}
/** HEADs `lh3.googleusercontent.com/d/<id>=w800` until it answers 200 (fresh files can lag). */
async function waitForLh3(fetchImpl, id, sleep, opts = {}) {
	const attempts = opts.attempts ?? 4;
	const delayMs = opts.delayMs ?? 2e3;
	const url = lh3Url(id, 800);
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const res = await fetchImpl(url, {
				method: "HEAD",
				redirect: "manual",
				signal: AbortSignal.timeout(LH3_TIMEOUT_MS)
			});
			await res.body?.cancel().catch(() => {});
			const type = mimeOf(res.headers.get("content-type"));
			if (res.ok && (type === "" || type.startsWith("image/"))) return true;
		} catch {}
		if (attempt < attempts) await sleep(delayMs);
	}
	return false;
}
function classifyDriveError(e, fallback) {
	const safe = describeDriveError(e);
	const detail = String(safe.message ?? fallback);
	if (e instanceof DriveApiError && (e.status === 401 || e.status === 403)) return {
		error: "drive_not_authorised",
		detail
	};
	return {
		error: fallback,
		detail
	};
}
function createUploader(http, deps) {
	return async (url, name, intoFolderId, opts) => {
		let folderId;
		try {
			folderId = intoFolderId ?? await deps.ensureFolder();
		} catch (e) {
			const out = classifyDriveError(e, "folder_failed");
			http.logger.error("photo import: folder unavailable", { error: describeDriveError(e) });
			return out;
		}
		let downloaded;
		try {
			downloaded = await deps.download(url);
		} catch (e) {
			const code = e instanceof DownloadError ? e.code : "download_failed";
			const detail = scrub(e instanceof Error ? e.message : String(e));
			http.logger.warn(`photo import: download failed (${code})`, { detail });
			return {
				error: code,
				detail
			};
		}
		const mime = mimeOf(downloaded.contentType);
		if (!isImageType(mime)) return {
			error: "not_image",
			detail: mime || "missing content-type"
		};
		const fixed = await applyTransforms(downloaded, {
			supplier: opts?.supplier ?? "",
			index: opts?.index ?? 0
		});
		if (fixed.skipped) http.logger.warn("photo import: transform skipped, storing the original", { detail: fixed.skipped });
		downloaded = {
			bytes: fixed.bytes,
			contentType: fixed.contentType
		};
		const size = downloaded.bytes.byteLength;
		if (size === 0) return {
			error: "download_failed",
			detail: "empty body"
		};
		if (size > 5242880) return {
			error: "too_large",
			detail: `${size} bytes > ${MAX_UPLOAD_BYTES}`
		};
		const fileName = fileNameFor(name, mime);
		const part = buildMultipartBody({
			metadata: {
				name: fileName,
				parents: [folderId],
				mimeType: mime
			},
			bytes: downloaded.bytes,
			mimeType: mime
		});
		let created;
		try {
			created = await http.request({
				method: "POST",
				url: `${DRIVE_UPLOAD_API}/files`,
				query: [["uploadType", "multipart"], ["fields", "id,name,mimeType"]],
				body: {
					raw: part.body,
					contentType: part.contentType
				},
				policy: "write"
			});
		} catch (e) {
			const out = classifyDriveError(e, "upload_failed");
			http.logger.error("photo import: upload failed", { error: describeDriveError(e) });
			return out;
		}
		const id = created.id ?? "";
		if (!DRIVE_ID_RE.test(id)) return {
			error: "upload_failed",
			detail: "unexpected file id"
		};
		if (!await waitForLh3(http.fetchImpl, id, http.sleep, deps.lh3)) {
			http.logger.warn(`photo import: lh3 did not serve ${id} yet`, { name: fileName });
			return {
				error: "not_visible",
				id,
				detail: "lh3 has not served the file yet; it may appear shortly"
			};
		}
		http.logger.info(`photo import: uploaded ${fileName} as ${id}`, {
			bytes: size,
			mime
		});
		return {
			id,
			name: created.name ?? fileName
		};
	};
}
/**
* Copies a file that is already in Drive into another folder under a new name — the "primary
* duplicated deliberately" of brief §12.
*
* It is a copy rather than a second parent because a shortcut or a multi-parent file behaves oddly
* in the Drive UI and the studio browses these folders by hand. One extra copy of one image per rug
* is a price worth paying for a folder that reads like a folder.
*/
function createCopier(http) {
	return async (fileId, name, intoFolderId) => {
		try {
			const created = await http.request({
				method: "POST",
				url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}/copy`,
				query: [["fields", "id,name"]],
				body: { json: {
					name,
					parents: [intoFolderId]
				} },
				policy: "write"
			});
			if (!created.id) return {
				error: "upload_failed",
				detail: "files.copy returned no id"
			};
			return {
				id: created.id,
				name: created.name ?? name
			};
		} catch (e) {
			const out = classifyDriveError(e, "upload_failed");
			http.logger.warn("photo import: copy failed", { error: describeDriveError(e) });
			return out;
		}
	};
}
//#endregion
//#region src/lib/drive/media.ts
/** Drive file ids as the brief pins them (§12). Wider than images.ts DRIVE_ID_RE, which is a
*  storage-format check for ids we minted ourselves; this one guards a path segment. */
var DRIVE_MEDIA_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
function isDriveFileId(value) {
	return typeof value === "string" && DRIVE_MEDIA_ID_RE.test(value);
}
/**
* One `files/{id}?alt=media` GET, never retried: a media read is cheap to repeat from the browser,
* and a retry loop here would multiply the load Drive is already rate-limiting.
*
* `404` and `403` both answer `not_found`: whether an id is unknown or merely invisible to this
* token is not something a caller may probe. Everything else is `drive_error` (502 at the edge).
*/
function createMediaReader(opts) {
	const timeoutMs = opts.timeoutMs ?? 2e4;
	return async (fileId) => {
		if (!isDriveFileId(fileId)) return {
			ok: false,
			error: "bad_id"
		};
		let token;
		try {
			token = await opts.getAccessToken();
		} catch (e) {
			opts.http.logger.warn("image proxy: no access token", { error: serializeError(e) });
			return {
				ok: false,
				error: "drive_error",
				detail: "no access token"
			};
		}
		const url = new URL(`${DRIVE_API}/files/${fileId}`);
		url.search = "alt=media&supportsAllDrives=true";
		let res;
		try {
			res = await opts.http.fetchImpl(url, {
				method: "GET",
				headers: {
					authorization: `Bearer ${token}`,
					accept: "image/*"
				},
				signal: AbortSignal.timeout(timeoutMs)
			});
		} catch (e) {
			const detail = serializeError(e).message;
			opts.http.logger.warn("image proxy: Drive request failed", { detail });
			return {
				ok: false,
				error: "drive_error",
				detail
			};
		}
		if (!res.ok) {
			await res.body?.cancel().catch(() => {});
			if (res.status === 404 || res.status === 403) return {
				ok: false,
				error: "not_found"
			};
			opts.http.logger.warn(`image proxy: Drive answered ${res.status}`);
			return {
				ok: false,
				error: "drive_error",
				detail: `HTTP ${res.status}`
			};
		}
		const contentType = mimeOf(res.headers.get("content-type"));
		if (!isImageType(contentType)) {
			await res.body?.cancel().catch(() => {});
			return {
				ok: false,
				error: "not_an_image",
				detail: contentType || "missing content-type"
			};
		}
		return {
			ok: true,
			body: res.body,
			contentType,
			contentLength: res.headers.get("content-length") ?? void 0
		};
	};
}
/** Widths the proxy will ask lh3 for. A closed set: the width goes into a URL. */
var PROXY_WIDTHS = [
	400,
	800,
	1600
];
function coerceWidth(value) {
	const n = Number(value);
	return PROXY_WIDTHS.includes(n) ? n : 800;
}
/**
* Reads a photo through `lh3.googleusercontent.com`, which is how these files were always served.
*
* Two things this buys over the authenticated API, and they are the reasons it is tried first:
*   * **No token.** The photo folder is shared with anyone holding the link, so lh3 serves it to an
*     anonymous request. The proxy therefore works before the owner has granted the Drive scope, and
*     keeps working if that grant lapses.
*   * **The right number of bytes.** lh3 downscales on demand (`=w800`), where `files?alt=media`
*     returns the original — often several megabytes for a card thumbnail.
*
* The id is validated before it reaches the URL and the width comes from a closed set, so there is
* no input here that can steer the request elsewhere.
*/
function createPublicMediaReader(opts) {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const timeoutMs = opts.timeoutMs ?? 2e4;
	return async (fileId, width = 800) => {
		if (!isDriveFileId(fileId)) return {
			ok: false,
			error: "bad_id"
		};
		const url = `https://lh3.googleusercontent.com/d/${fileId}=w${coerceWidth(width)}`;
		let res;
		try {
			res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
		} catch (e) {
			return {
				ok: false,
				error: "drive_error",
				detail: serializeError(e).message
			};
		}
		if (res.status === 403 || res.status === 404) {
			await res.body?.cancel();
			return {
				ok: false,
				error: "not_found"
			};
		}
		if (!res.ok) {
			await res.body?.cancel();
			return {
				ok: false,
				error: "drive_error",
				detail: `lh3 answered ${res.status}`
			};
		}
		const contentType = mimeOf(res.headers.get("content-type"));
		if (!isImageType(contentType)) {
			await res.body?.cancel();
			return {
				ok: false,
				error: "not_an_image",
				detail: contentType || "missing content-type"
			};
		}
		const contentLength = res.headers.get("content-length");
		return {
			ok: true,
			body: res.body,
			contentType,
			...contentLength ? { contentLength } : {}
		};
	};
}
//#endregion
//#region src/lib/drive/scope.ts
var TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
var TOKENINFO_TIMEOUT_MS = 3e4;
function parseScopes(scope) {
	if (typeof scope !== "string") return [];
	return scope.split(/\s+/).filter(Boolean);
}
function hasDriveScope(scopes) {
	return scopes.includes("https://www.googleapis.com/auth/drive.file") || scopes.includes("https://www.googleapis.com/auth/drive");
}
async function tokenScopes(http, token) {
	const res = await http.fetchImpl(TOKENINFO_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ access_token: token }),
		signal: AbortSignal.timeout(TOKENINFO_TIMEOUT_MS)
	});
	const text = await res.text();
	if (!res.ok) return {
		failed: true,
		status: res.status
	};
	try {
		return { scopes: parseScopes(JSON.parse(text).scope) };
	} catch {
		return {
			failed: true,
			status: 502
		};
	}
}
async function check(opts, now) {
	const { http } = opts;
	let token;
	try {
		token = await opts.getAccessToken();
	} catch (e) {
		http.logger.warn("scope check: could not obtain an access token", { error: serializeError(e) });
		return {
			driveScopeOk: false,
			scopes: [],
			reason: "token_error",
			checkedAt: now
		};
	}
	let scopes;
	try {
		const info = await tokenScopes(http, token);
		if ("failed" in info) {
			http.logger.warn(`scope check: tokeninfo answered ${info.status}`);
			return {
				driveScopeOk: false,
				scopes: [],
				reason: "tokeninfo_failed",
				checkedAt: now
			};
		}
		scopes = info.scopes;
	} catch (e) {
		http.logger.warn("scope check: tokeninfo request failed", { error: serializeError(e) });
		return {
			driveScopeOk: false,
			scopes: [],
			reason: "tokeninfo_failed",
			checkedAt: now
		};
	}
	if (!hasDriveScope(scopes)) return {
		driveScopeOk: false,
		scopes,
		reason: "scope_missing",
		checkedAt: now
	};
	if (opts.probe === false) return {
		driveScopeOk: true,
		scopes,
		checkedAt: now
	};
	try {
		await http.request({
			method: "GET",
			url: `${DRIVE_API}/files`,
			query: [
				["pageSize", "1"],
				["fields", "files(id)"],
				["spaces", "drive"]
			],
			policy: "read"
		});
		return {
			driveScopeOk: true,
			scopes,
			checkedAt: now
		};
	} catch (e) {
		const status = e instanceof DriveApiError ? e.status : 0;
		const reason = status === 403 ? "api_disabled" : status === 401 ? "token_error" : "probe_failed";
		http.logger.warn(`scope check: Drive probe failed (${reason})`, { error: describeDriveError(e) });
		return {
			driveScopeOk: false,
			scopes,
			reason,
			checkedAt: now
		};
	}
}
function createScopeChecker(opts) {
	const now = opts.now ?? Date.now;
	const ttl = opts.ttlMs ?? 6e5;
	const failTtl = opts.failTtlMs ?? 6e4;
	let cached;
	let pending;
	return async () => {
		const t = now();
		if (cached && t - cached.checkedAt < (cached.driveScopeOk ? ttl : failTtl)) return cached;
		if (!pending) pending = check(opts, t).then((status) => {
			cached = status;
			return status;
		}).finally(() => {
			pending = void 0;
		});
		return pending;
	};
}
//#endregion
//#region src/lib/drive/proxy.ts
/** A year, immutable: the id is the version, so a cached response can never go stale. */
var IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";
function fail(status, error, retryAfter) {
	const headers = {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	};
	if (retryAfter) headers["retry-after"] = retryAfter;
	return new Response(JSON.stringify({
		ok: false,
		error
	}), {
		status,
		headers
	});
}
/**
* 400 malformed id · 503 no Drive client · 404 unknown id · 415 not an image · 502 Drive failed ·
* 200 the bytes, streamed, with the year-long immutable cache header and Drive's own content-type.
*/
async function driveImageResponse(fileId, deps, width) {
	if (!isDriveFileId(fileId)) return fail(400, "bad file id");
	if (!deps.readPublic && !deps.readMedia) return fail(503, "drive_not_authorised", "3600");
	let result;
	try {
		result = deps.readPublic ? await deps.readPublic(fileId, width) : await deps.readMedia(fileId);
		if (!result.ok && result.error !== "bad_id" && deps.readPublic && deps.readMedia) {
			const authed = await deps.readMedia(fileId);
			if (authed.ok) result = authed;
		}
	} catch (e) {
		deps.logger?.error("image proxy: media read threw", { error: serializeError(e) });
		return fail(502, "drive unavailable", "30");
	}
	if (!result.ok) {
		if (result.error === "bad_id") return fail(400, "bad file id");
		if (result.error === "not_found") return fail(404, "not found");
		if (result.error === "not_an_image") return fail(415, "not an image");
		return fail(502, "drive unavailable", "30");
	}
	const headers = new Headers({
		"content-type": result.contentType,
		"cache-control": IMAGE_CACHE_CONTROL,
		"x-content-type-options": "nosniff"
	});
	if (result.contentLength) headers.set("content-length", result.contentLength);
	return new Response(result.body, {
		status: 200,
		headers
	});
}
/** Anything but GET on the image route, in the shape the JSON APIs use (src/lib/admin/http.ts). */
function imageMethodNotAllowed() {
	return new Response(JSON.stringify({
		ok: false,
		error: "method not allowed"
	}), {
		status: 405,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			allow: "GET"
		}
	});
}
//#endregion
//#region src/lib/drive/index.ts
function createDriveClient(options) {
	const http = createDriveHttp({
		getAccessToken: options.getAccessToken,
		fetchImpl: options.fetchImpl,
		logger: options.logger,
		sleep: options.sleep,
		maxAttempts: options.maxAttempts
	});
	const ensureFolder = createFolderResolver(http, { folderId: options.folderId });
	const uploadFromUrl = createUploader(http, {
		download: options.download ?? ((url) => defaultDownload(url, http.fetchImpl)),
		ensureFolder
	});
	const scopeStatus = createScopeChecker({
		getAccessToken: options.getAccessToken,
		http,
		now: options.now
	});
	const getMedia = createMediaReader({
		getAccessToken: options.getAccessToken,
		http
	});
	return {
		ensureFolder,
		ensureProductFolders: createProductFolderResolver(http, ensureFolder),
		uploadFromUrl,
		copyFile: createCopier(http),
		listFolder: createFolderLister(http),
		scopeStatus,
		getMedia
	};
}
//#endregion
//#region src/lib/google/oauth.ts
var AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
var TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
var REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
var TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
/** Read the sheet, and touch only the Drive files this app created. Nothing wider is ever asked for. */
var REQUIRED_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"];
/** Where Google sends the owner back. Derived from SITE_URL so it moves with the deployment. */
function redirectUriFor(siteUrl) {
	return `${new URL(siteUrl).origin}/api/admin/google/callback`;
}
function createPkce() {
	const verifier = randomBytes(32).toString("base64url");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url")
	};
}
function createState() {
	return randomBytes(16).toString("base64url");
}
/** Constant-time compare so a returned `state` cannot be probed a character at a time. */
function sameState(a, b) {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
}
/**
* `access_type=offline` plus `prompt=consent` is what makes Google issue a refresh token. Without
* the prompt, a second authorisation by the same account returns an access token only, and the
* connection silently stops surviving restarts.
*/
function buildAuthUrl(input) {
	const url = new URL(AUTH_ENDPOINT);
	const params = {
		client_id: input.clientId,
		redirect_uri: input.redirectUri,
		response_type: "code",
		scope: (input.scopes ?? REQUIRED_SCOPES).join(" "),
		access_type: "offline",
		include_granted_scopes: "true",
		state: input.state,
		code_challenge: input.challenge,
		code_challenge_method: "S256"
	};
	if (input.forceConsent !== false) params.prompt = "consent";
	if (input.loginHint) params.login_hint = input.loginHint;
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return url.toString();
}
var GoogleAuthError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "GoogleAuthError";
		this.code = code;
	}
};
function parseTokenResponse(body) {
	const raw = body ?? {};
	if (typeof raw.error === "string") throw new GoogleAuthError(raw.error, typeof raw.error_description === "string" ? raw.error_description : raw.error);
	if (typeof raw.access_token !== "string" || !raw.access_token) throw new GoogleAuthError("no_access_token", "Google did not return an access token.");
	return {
		accessToken: raw.access_token,
		refreshToken: typeof raw.refresh_token === "string" && raw.refresh_token ? raw.refresh_token : void 0,
		expiresInSec: typeof raw.expires_in === "number" && raw.expires_in > 0 ? raw.expires_in : 3600,
		scopes: typeof raw.scope === "string" ? raw.scope.split(/\s+/).filter(Boolean) : []
	};
}
async function postForm(url, form, { fetchImpl = fetch, timeoutMs = 2e4 } = {}) {
	const res = await fetchImpl(url, {
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json"
		},
		body: new URLSearchParams(form).toString(),
		signal: AbortSignal.timeout(timeoutMs)
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		const raw = body ?? {};
		throw new GoogleAuthError(typeof raw.error === "string" ? raw.error : `http_${res.status}`, typeof raw.error_description === "string" ? raw.error_description : `Google answered ${res.status}.`);
	}
	return body;
}
/** Trades the one-time code for tokens. The refresh token here is the only one we will ever get. */
async function exchangeCode(input) {
	const tokens = parseTokenResponse(await postForm(TOKEN_ENDPOINT, {
		client_id: input.clientId,
		client_secret: input.clientSecret,
		redirect_uri: input.redirectUri,
		grant_type: "authorization_code",
		code: input.code,
		code_verifier: input.verifier
	}, input));
	if (!tokens.refreshToken) throw new GoogleAuthError("no_refresh_token", "Google returned an access token but no refresh token, so the connection would not survive a restart. Re-authorise; the consent screen must be shown.");
	return tokens;
}
/** Trades the long-lived refresh token for a fresh access token. Called on demand, not on a timer. */
async function refreshAccessToken(input) {
	return parseTokenResponse(await postForm(TOKEN_ENDPOINT, {
		client_id: input.clientId,
		client_secret: input.clientSecret,
		grant_type: "refresh_token",
		refresh_token: input.refreshToken
	}, input));
}
/** Best-effort revoke on disconnect: a token we stop using should stop existing. Never throws. */
async function revokeToken(token, http = {}) {
	try {
		await postForm(REVOKE_ENDPOINT, { token }, http);
		return true;
	} catch {
		return false;
	}
}
/** Who the token belongs to and what it may do; used to show the connected account in the admin. */
async function describeToken(accessToken, { fetchImpl = fetch, timeoutMs = 1e4 } = {}) {
	const res = await fetchImpl(`${TOKENINFO_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) return { scopes: [] };
	const body = await res.json().catch(() => ({}));
	return {
		scopes: typeof body.scope === "string" ? body.scope.split(/\s+/).filter(Boolean) : [],
		email: typeof body.email === "string" ? body.email : void 0,
		expiresInSec: typeof body.expires_in === "number" ? body.expires_in : void 0
	};
}
function missingScopes(granted) {
	return REQUIRED_SCOPES.filter((s) => !granted.includes(s));
}
/**
* What to tell the owner about staying connected. The seven-day case is the one that actually bites,
* and it is a console setting rather than anything the code can fix.
*/
function googleAuthAdvice(granted, options = {}) {
	const notes = [];
	const missing = options.scopesKnown === false ? [] : missingScopes(granted);
	if (missing.includes("https://www.googleapis.com/auth/spreadsheets")) notes.push("The spreadsheets permission was not granted: the site cannot read the catalogue.");
	if (missing.includes("https://www.googleapis.com/auth/drive.file")) notes.push("The Drive permission was not granted: photo import stays disabled.");
	notes.push("If the OAuth consent screen is still in Testing, Google expires this connection after seven days. Publish the app in the Google Cloud console to keep it indefinitely.");
	notes.push("The connection also ends if you revoke access or leave it unused for six months.");
	return notes;
}
//#endregion
//#region src/lib/google/connection.ts
/** Renew this long before the access token actually expires. */
var RENEW_MARGIN_MS = 6e4;
var GoogleConnection = class {
	options;
	now;
	accessToken;
	expiresAt = 0;
	/** The refresh token the cached access token was minted from, so a swap invalidates the cache. */
	mintedFrom;
	inflight;
	lastError = null;
	constructor(options) {
		this.options = options;
		this.now = options.now ?? Date.now;
	}
	/** The stored authorisation, or the environment's token dressed as one. Stored wins. */
	current() {
		const stored = this.options.store.read();
		if (stored?.refreshToken) return {
			refreshToken: stored.refreshToken,
			source: "stored",
			stored
		};
		const env = this.options.fallbackRefreshToken;
		if (env) return {
			refreshToken: env,
			source: "environment"
		};
	}
	health() {
		const current = this.current();
		return {
			connected: Boolean(current),
			durable: this.options.store.durable,
			account: current?.stored?.account,
			scopes: current?.stored?.scopes ?? [],
			connectedAt: current?.stored?.connectedAt,
			lastRefreshAt: current?.stored?.lastRefreshAt,
			source: current?.source ?? "none",
			lastError: this.lastError
		};
	}
	/** Drops the cached access token; the next call mints a fresh one. */
	invalidate() {
		this.accessToken = void 0;
		this.expiresAt = 0;
		this.mintedFrom = void 0;
	}
	async getAccessToken() {
		const current = this.current();
		if (!current) throw new GoogleAuthError("not_connected", "No Google account is connected. Open /admin/google and connect one.");
		if (this.accessToken && this.mintedFrom === current.refreshToken && this.now() < this.expiresAt) return this.accessToken;
		if (this.inflight) return this.inflight;
		this.inflight = (async () => {
			try {
				const tokens = await refreshAccessToken({
					clientId: this.options.clientId,
					clientSecret: this.options.clientSecret,
					refreshToken: current.refreshToken,
					fetchImpl: this.options.fetchImpl
				});
				this.accessToken = tokens.accessToken;
				this.mintedFrom = current.refreshToken;
				this.expiresAt = this.now() + Math.max(0, tokens.expiresInSec * 1e3 - RENEW_MARGIN_MS);
				this.lastError = null;
				if (current.source === "stored" && current.stored) this.options.store.write({
					...current.stored,
					scopes: tokens.scopes.length ? tokens.scopes : current.stored.scopes,
					lastRefreshAt: new Date(this.now()).toISOString()
				});
				return tokens.accessToken;
			} catch (e) {
				this.invalidate();
				const safe = serializeError(e);
				this.lastError = e instanceof GoogleAuthError ? `${e.code}: ${e.message}` : `${safe.name}: ${safe.message}`;
				if (e instanceof GoogleAuthError && e.code === "invalid_grant") {
					this.options.logger?.error("google connection rejected; re-authorisation needed", { error: safe });
					throw new GoogleAuthError("invalid_grant", "Google rejected the stored authorisation. This happens when access is revoked, after six months unused, or after seven days if the consent screen is still in Testing. Connect the account again at /admin/google.");
				}
				throw e;
			} finally {
				this.inflight = void 0;
			}
		})();
		return this.inflight;
	}
};
//#endregion
//#region src/lib/google/store.ts
var STORE_FILENAME = "google-oauth.json";
function isStored$1(v) {
	const o = v;
	return Boolean(o && typeof o.refreshToken === "string" && o.refreshToken.length > 0);
}
/** Survives a restart. The file holds a credential, so it is written 0600 and never logged. */
function fileStore$1(dataDir) {
	const path = join(dataDir, STORE_FILENAME);
	let cache;
	let cachedAt = 0;
	const TTL_MS = 2e3;
	return {
		path,
		durable: true,
		read() {
			const now = Date.now();
			if (cache && now - cachedAt < TTL_MS) return cache;
			try {
				if (!existsSync(path)) {
					cache = void 0;
					cachedAt = now;
					return;
				}
				const parsed = JSON.parse(readFileSync(path, "utf8"));
				cache = isStored$1(parsed) ? parsed : void 0;
			} catch {
				cache = void 0;
			}
			cachedAt = now;
			return cache;
		},
		write(value) {
			mkdirSync(dirname(path), { recursive: true });
			const tmp = `${path}.tmp`;
			writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 384 });
			renameSync(tmp, path);
			try {
				chmodSync(path, 384);
			} catch {}
			cache = value;
			cachedAt = Date.now();
		},
		clear() {
			try {
				if (existsSync(path)) writeFileSync(path, "{}", { mode: 384 });
			} catch {}
			cache = void 0;
			cachedAt = Date.now();
		}
	};
}
/** No DATA_DIR: the connection works now and is lost on restart. The admin warns about it. */
function memoryStore$1() {
	let value;
	return {
		durable: false,
		read: () => value,
		write: (v) => {
			value = v;
		},
		clear: () => {
			value = void 0;
		}
	};
}
function createTokenStore(dataDir) {
	return dataDir ? fileStore$1(dataDir) : memoryStore$1();
}
//#endregion
//#region src/lib/photos-health.ts
async function sweepPhotos(rugs, opts = {}) {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const concurrency = opts.concurrency ?? 4;
	const timeoutMs = opts.timeoutMs ?? 1e4;
	const targets = rugs.filter((r) => r.status === "active" && r.photos[0]).map((r) => ({
		id: r.id,
		name: r.name,
		photo: r.photos[0]
	}));
	const failing = [];
	let i = 0;
	const worker = async () => {
		while (i < targets.length) {
			const t = targets[i++];
			let status = 0;
			try {
				const res = await fetchImpl(lh3Url(t.photo, 800), {
					method: "HEAD",
					redirect: "manual",
					signal: AbortSignal.timeout(timeoutMs)
				});
				status = res.status;
				const type = res.headers.get("content-type") ?? "";
				if (res.status === 200 && type.startsWith("image/")) continue;
			} catch {}
			failing.push({
				...t,
				status
			});
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
	return {
		checkedAt: Date.now(),
		checked: targets.length,
		failing
	};
}
/** Runs sweeps in the background, at most once per `intervalMs`; the latest result is readable any time. */
var PhotoMonitor = class {
	latest = {
		checkedAt: null,
		checked: 0,
		failing: []
	};
	running;
	intervalMs;
	opts;
	constructor(intervalMs = 6e5, opts = {}) {
		this.intervalMs = intervalMs;
		this.opts = opts;
	}
	/** Fire-and-forget; never throws. */
	schedule(rugs) {
		if (this.running) return;
		const last = this.latest.checkedAt ?? 0;
		if (Date.now() - last < this.intervalMs) return;
		this.running = sweepPhotos(rugs, this.opts).then((r) => {
			this.latest = r;
		}).catch(() => void 0).finally(() => {
			this.running = void 0;
		});
	}
	get result() {
		return this.latest;
	}
};
//#endregion
//#region src/lib/currency.ts
/**
* `SYM[cur] + Math.round(v).toLocaleString()` as in the reference. `locale` is undefined in the
* browser (visitor locale, like the reference) and 'en-US' on the server for a stable first paint.
*/
function money(usd, cur, table, locale) {
	if (!usd) return "";
	const rate = table.rates[cur];
	const sym = table.symbols[cur];
	if (rate === void 0 || sym === void 0) return "";
	const v = usd * rate;
	return sym + Math.round(v).toLocaleString(locale);
}
var SUPPORTED_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"CAD",
	"MXN",
	"AED",
	"SAR"
];
//#endregion
//#region src/lib/rates.ts
/**
* Units of each currency per 1 USD. AED (3.6725) and SAR (3.75) are pegged to the dollar, so their
* static values are correct rather than merely stale; the ECB-derived APIs do not quote them.
*/
var FALLBACK_RATES = {
	USD: 1,
	EUR: .92,
	GBP: .79,
	CAD: 1.37,
	MXN: 17.5,
	AED: 3.6725,
	SAR: 3.75
};
var SYMBOLS = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	CAD: "$",
	MXN: "$",
	AED: "AED ",
	SAR: "SAR "
};
function baseTable(base) {
	const rates = {};
	const symbols = {};
	const perUsd = FALLBACK_RATES[base] ?? 1;
	for (const c of SUPPORTED_CURRENCIES) {
		const v = FALLBACK_RATES[c];
		if (v === void 0) continue;
		rates[c] = v / perUsd;
		symbols[c] = SYMBOLS[c] ?? "";
	}
	rates[base] = 1;
	return {
		rates,
		symbols
	};
}
/** Overlays the sheet's Rates tab (symbols always, numbers when the tab supplies them). */
function withSheetRates(table, sheet) {
	const rates = { ...table.rates };
	const symbols = { ...table.symbols };
	for (const r of sheet) {
		if (r.rateToBase > 0) rates[r.currency] = r.rateToBase;
		if (r.symbol) symbols[r.currency] = r.symbol;
	}
	return {
		rates,
		symbols
	};
}
/** One GET; returns only the currencies the API quotes (pegged ones keep their static value). */
async function fetchRates(opts) {
	const f = opts.fetchImpl ?? fetch;
	const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== opts.base).join(",");
	const res = await f(`${opts.url}?base=${encodeURIComponent(opts.base)}&symbols=${encodeURIComponent(symbols)}`, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(opts.timeoutMs ?? 8e3)
	});
	if (!res.ok) throw new Error(`rates API answered ${res.status}`);
	const body = await res.json();
	const out = {};
	for (const [k, v] of Object.entries(body.rates ?? {})) if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k.toUpperCase()] = v;
	if (Object.keys(out).length === 0) throw new Error("rates API returned no usable rates");
	return out;
}
/** Long-TTL, single-flight, never-throws rate table. */
var RatesCache = class {
	state;
	inflight;
	now;
	options;
	constructor(options) {
		this.options = options;
		this.now = options.now ?? Date.now;
		this.state = {
			table: baseTable(options.base),
			fetchedAt: 0,
			source: "fallback",
			lastError: null
		};
	}
	/** The current table; refreshes in the background when the window has passed. */
	get(sheet = []) {
		if (this.now() - this.state.fetchedAt >= this.options.refreshMs && !this.inflight) this.refresh();
		return withSheetRates(this.state.table, sheet);
	}
	health() {
		return {
			fetchedAt: this.state.fetchedAt,
			source: this.state.source,
			lastError: this.state.lastError,
			currencies: Object.keys(this.state.table.rates)
		};
	}
	async refresh() {
		if (this.inflight) return this.inflight;
		this.inflight = (async () => {
			try {
				const live = await fetchRates({
					url: this.options.url,
					base: this.options.base,
					fetchImpl: this.options.fetchImpl
				});
				const table = baseTable(this.options.base);
				this.state = {
					table: {
						rates: {
							...table.rates,
							...live
						},
						symbols: table.symbols
					},
					fetchedAt: this.now(),
					source: "api",
					lastError: null
				};
			} catch (e) {
				this.state = {
					...this.state,
					lastError: e instanceof Error ? e.message : String(e)
				};
			} finally {
				this.inflight = void 0;
			}
		})();
		return this.inflight;
	}
};
//#endregion
//#region src/lib/scrape/types.ts
/** Every field the form shows and therefore has to be able to flag. */
var SCRAPED_FIELDS = [
	"supplierRef",
	"supplierTitle",
	"description",
	"widthCm",
	"lengthCm",
	"sizeRaw",
	"sizeLabel",
	"sizeBand",
	"material",
	"method",
	"age",
	"origin",
	"seenPrice",
	"seenCurrency",
	"priceUsd",
	"suggestedRetailUsd",
	"retailEstimate",
	"tagsSuggested",
	"photos",
	"primaryImage"
];
var ScrapeError = class extends Error {
	code;
	status;
	constructor(code, message, status) {
		super(message);
		this.name = "ScrapeError";
		this.code = code;
		this.status = status;
	}
};
//#endregion
//#region src/lib/scrape/guard.ts
var SUPPLIER_HOSTS = [
	"ecarpetgallery.com",
	"www.ecarpetgallery.com",
	"karavanrug.com",
	"www.karavanrug.com"
];
/** Hosts a scraped photo URL may point at (ECG's image CDN, Shopify's CDN, KV's /cdn/ proxy). */
var IMAGE_HOSTS = [
	"images.ecarpetwholesale.com",
	"cdn.shopify.com",
	"karavanrug.com"
];
var JINA_HOST = "r.jina.ai";
/** Private, loopback, link-local, CGNAT, "this" network and their IPv6 counterparts (§4.3). */
var blockList = new BlockList();
var BLOCKED_V4 = [
	["10.0.0.0", 8],
	["172.16.0.0", 12],
	["192.168.0.0", 16],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["0.0.0.0", 8],
	["100.64.0.0", 10]
];
var BLOCKED_V6 = [
	["::1", 128],
	["::", 128],
	["fc00::", 7],
	["fe80::", 10]
];
for (const [net, prefix] of BLOCKED_V4) blockList.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of BLOCKED_V6) blockList.addSubnet(net, prefix, "ipv6");
/** `::ffff:a.b.c.d` / `::ffff:7f00:1` → `a.b.c.d`; anything else unchanged. */
function unmapIpv4(address) {
	const a = address.trim();
	const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(a);
	if (dotted?.[1]) return dotted[1];
	const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(a);
	if (hex?.[1] && hex[2]) {
		const hi = Number.parseInt(hex[1], 16);
		const lo = Number.parseInt(hex[2], 16);
		return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
	}
	return a;
}
/** True for any address we must never connect to (invalid strings count as blocked). */
function isBlockedAddress(address) {
	const a = unmapIpv4(address);
	const family = isIP(a);
	if (family === 0) return true;
	return blockList.check(a, family === 6 ? "ipv6" : "ipv4");
}
/**
* Rejects hostnames that must not reach DNS at all: IP literals in any spelling (`127.1`,
* `2130706433`, `0x7f000001`, bracketed IPv6), localhost, `.local` / `.internal` / `.home.arpa`,
* and single-label names. Returns the reason, or undefined when the name looks like a public host.
*/
function hostnameProblem(hostname) {
	const h = hostname.trim().toLowerCase().replace(/\.$/, "");
	if (!h) return "empty host";
	if (h.startsWith("[") || isIP(h) !== 0) return "IP-literal host";
	if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/.test(h)) return "numeric host";
	if (h === "localhost" || h.endsWith(".localhost")) return "localhost";
	if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return "internal domain";
	if (!h.includes(".")) return "single-label host";
}
/**
* Parses and validates an outbound URL: https only, no userinfo, no explicit port, a public-looking
* hostname that is on `allowHosts`. Throws `ScrapeError` (`invalid_url` / `unsupported_host`).
*/
function validateOutboundUrl(input, allowHosts, what = "URL") {
	let url;
	try {
		url = input instanceof URL ? new URL(input.toString()) : new URL(input);
	} catch {
		throw new ScrapeError("invalid_url", `${what} is not a valid URL`);
	}
	if (url.protocol !== "https:") throw new ScrapeError("invalid_url", `${what} must use https`);
	if (url.username || url.password) throw new ScrapeError("invalid_url", `${what} must not carry userinfo`);
	if (url.port) throw new ScrapeError("invalid_url", `${what} must not name a port`);
	const problem = hostnameProblem(url.hostname);
	if (problem) throw new ScrapeError("invalid_url", `${what} host rejected: ${problem}`);
	if (!allowHosts.includes(url.hostname.toLowerCase())) throw new ScrapeError("unsupported_host", `${what} host "${url.hostname}" is not allow-listed`);
	return url;
}
/** Photo URLs: https + IMAGE_HOSTS; karavanrug.com only under its /cdn/ proxy path. */
function isAllowedImageUrl(input) {
	try {
		const url = validateOutboundUrl(input, IMAGE_HOSTS, "image URL");
		if (url.hostname === "karavanrug.com") return url.pathname.startsWith("/cdn/");
		return true;
	} catch {
		return false;
	}
}
var defaultResolver = (hostname) => promises.lookup(hostname, { all: true });
function blockedError(hostname, reason) {
	const err = /* @__PURE__ */ new Error(`refusing to connect to ${hostname}: ${reason}`);
	err.code = "EBLOCKED";
	err.syscall = "getaddrinfo";
	return err;
}
/**
* `dns.lookup` replacement for undici's connector: resolves every address, unmaps `::ffff:` literals,
* drops anything in the BlockList and hands back only vetted addresses (`EBLOCKED` when none survive).
*/
function createVettedLookup(resolve = defaultResolver) {
	return (hostname, options, callback) => {
		const problem = hostnameProblem(hostname);
		if (problem) {
			queueMicrotask(() => callback(blockedError(hostname, problem), []));
			return;
		}
		const fam = options.family;
		const want = fam === 4 || fam === "IPv4" ? 4 : fam === 6 || fam === "IPv6" ? 6 : 0;
		resolve(hostname).then((addresses) => {
			const vetted = [];
			for (const entry of addresses) {
				const address = unmapIpv4(entry.address);
				const family = isIP(address);
				if (family === 0 || isBlockedAddress(address)) continue;
				if (want !== 0 && family !== want) continue;
				vetted.push({
					address,
					family
				});
			}
			const first = vetted[0];
			if (!first) throw blockedError(hostname, "every resolved address is blocked");
			if (options.all) callback(null, vetted);
			else callback(null, first.address, first.family);
		}).catch((err) => {
			callback(err instanceof Error ? err : new Error(String(err)), []);
		});
	};
}
var vettedLookup = createVettedLookup();
function createGuardedAgent(lookup = vettedLookup) {
	return new Agent({
		connect: {
			lookup,
			timeout: 5e3
		},
		headersTimeout: 1e4,
		bodyTimeout: 1e4
	});
}
var agent;
/** Process-wide guarded Agent for undici (images, Jina, the impit-unavailable fallback). */
function guardedAgent() {
	agent ??= createGuardedAgent();
	return agent;
}
//#endregion
//#region src/lib/sheets/contract.ts
var TABS = {
	products: "Products",
	collections: "Collections",
	customers: "Customers",
	reactions: "Reactions",
	reactionsArchive: "ReactionsArchive",
	visits: "Visits",
	tags: "Tags",
	rates: "Rates",
	auditLog: "AuditLog",
	settings: "Settings"
};
/** Shopify's product-CSV headers, in the casing the sheet and the CSV export use (brief §9). */
var PRODUCT_HEADER_LABELS = [
	"Product ID",
	"Handle",
	"Title",
	"Body (HTML)",
	"Vendor",
	"Product Category",
	"Type",
	"Tags",
	"Published",
	"Option1 Name",
	"Option1 Value",
	"Variant SKU",
	"Variant Grams",
	"Variant Inventory Qty",
	"Variant Inventory Policy",
	"Variant Price",
	"Variant Compare At Price",
	"Variant Requires Shipping",
	"Variant Taxable",
	"Image Src",
	"Image Alt Text",
	"SEO Title",
	"SEO Description",
	"Status",
	"Width CM",
	"Length CM",
	"Size Label",
	"Size Band",
	"Material",
	"Method",
	"Origin",
	"Age",
	"Pile",
	"Shape",
	"Collection",
	"Source URL",
	"Source Site",
	"Drive Folder ID",
	"Drive Folder URL",
	"Scraped At",
	"Commit Status",
	"Internal Notes"
];
/** Zero-based column index of every Products field (A..AP). */
var PRODUCT_COLS = {
	productId: 0,
	handle: 1,
	title: 2,
	bodyHtml: 3,
	vendor: 4,
	productCategory: 5,
	type: 6,
	tags: 7,
	published: 8,
	option1Name: 9,
	option1Value: 10,
	variantSku: 11,
	variantGrams: 12,
	variantInventoryQty: 13,
	variantInventoryPolicy: 14,
	variantPrice: 15,
	variantCompareAtPrice: 16,
	variantRequiresShipping: 17,
	variantTaxable: 18,
	imageSrc: 19,
	imageAltText: 20,
	seoTitle: 21,
	seoDescription: 22,
	status: 23,
	widthCm: 24,
	lengthCm: 25,
	sizeLabel: 26,
	sizeBand: 27,
	material: 28,
	method: 29,
	origin: 30,
	age: 31,
	pile: 32,
	shape: 33,
	collection: 34,
	sourceUrl: 35,
	sourceSite: 36,
	driveFolderId: 37,
	driveFolderUrl: 38,
	scrapedAt: 39,
	commitStatus: 40,
	internalNotes: 41
};
/** Number of columns a Products row occupies (A..AP). */
var PRODUCT_WIDTH = PRODUCT_HEADER_LABELS.length;
var HEADERS = {
	Products: PRODUCT_HEADER_LABELS.map((h) => h.toLowerCase()),
	Collections: [
		"id",
		"name",
		"slug",
		"description",
		"created_at",
		"cover_image_url",
		"sort_order"
	],
	Customers: [
		"slug",
		"display_name",
		"password_hash",
		"note",
		"created_at",
		"active"
	],
	Reactions: [
		"event_id",
		"customer_slug",
		"product_id",
		"reaction",
		"source",
		"created_at"
	],
	ReactionsArchive: [
		"event_id",
		"customer_slug",
		"product_id",
		"reaction",
		"source",
		"created_at"
	],
	Visits: [
		"event_id",
		"customer_slug",
		"occurred_at",
		"user_agent",
		"referrer"
	],
	Tags: [
		"id",
		"slug",
		"name",
		"color"
	],
	Rates: [
		"currency",
		"rate_to_base",
		"symbol",
		"updated_at"
	],
	AuditLog: [
		"timestamp",
		"actor",
		"action",
		"target_tab",
		"target_id",
		"before",
		"after",
		"ip_hash",
		"request_id",
		"note"
	],
	Settings: [
		"key",
		"value",
		"updated_at",
		"updated_by"
	]
};
/** Settings rows seeded by scripts/init-sheet.ts when the tab has no data rows. */
var SETTINGS_SEED = [
	["retail_markup", ""],
	["retail_markup.ecarpetgallery", ""],
	["retail_markup.karavanrug", ""],
	["price_round_step", "5"],
	["default_status", "draft"]
];
/** How many newest Reactions rows are read to rebuild the customer→product state map (brief §3). */
var REACTIONS_WINDOW_ROWS = 5e3;
/** One batchGet per refresh; order matters (parsed positionally by parseSnapshot). */
var READ_RANGES = [
	`${TABS.products}!A1:AP`,
	`${TABS.collections}!A1:G`,
	`${TABS.tags}!A1:D`,
	`${TABS.rates}!A1:D`,
	`${TABS.reactions}!A1:F5001`,
	`${TABS.customers}!A1:F`
];
/** Reference ORDER list; used only when the Collections tab is empty (ADR D10.5). */
var REFERENCE_COLLECTION_ORDER = [
	"Classics",
	"Gabbeh",
	"Modern",
	"Kilims",
	"Tulu",
	"Wabi Sabi",
	"Signed",
	"More"
];
/**
* Seed values for the Rates tab. `rate_to_base` is "how many units of this currency per 1 base unit"
* and doubles as the hardcoded fallback table when the FX API is unreachable (brief §8).
*/
var RATES_SEED = [
	[
		"USD",
		1,
		"$"
	],
	[
		"EUR",
		.92,
		"€"
	],
	[
		"GBP",
		.79,
		"£"
	],
	[
		"CAD",
		1.37,
		"$"
	],
	[
		"MXN",
		17.5,
		"$"
	],
	[
		"AED",
		3.67,
		"AED "
	],
	[
		"SAR",
		3.75,
		"SAR "
	]
];
/**
* The pre-brief Collections header. The brief reordered it (name before slug) and added
* `created_at`, so an existing spreadsheet keeps the old shape until `sheet:init` upgrades it.
*/
var LEGACY_COLLECTIONS_HEADERS = [
	"id",
	"slug",
	"name",
	"description",
	"cover_image_url",
	"sort_order"
];
//#endregion
//#region src/lib/sheets/cache.ts
/** Products, Collections, Tags, Rates — the tabs that are safe to keep on disk. */
var CONTENT_RANGE_COUNT = 4;
var HEALTH_ROWS = 10;
var CatalogueCache = class {
	load;
	parse;
	loadMeta;
	ttlMs;
	now;
	logger;
	persistPath;
	failureCooldownMs;
	windowRows;
	snapshot;
	meta = {};
	inflight;
	lastRefreshOk = true;
	lastError = null;
	lastFailureAt = -Infinity;
	deltas = [];
	constructor(options) {
		this.load = options.load;
		this.parse = options.parse;
		this.loadMeta = options.loadMeta;
		this.ttlMs = options.ttlMs;
		this.now = options.now ?? Date.now;
		this.logger = options.logger ?? silentLogger;
		this.persistPath = options.persistPath;
		this.failureCooldownMs = options.failureCooldownMs ?? Math.min(options.ttlMs, 15e3);
		this.windowRows = options.windowRows ?? 5e3;
		if (this.persistPath) this.snapshot = this.restore(this.persistPath);
	}
	/** Current snapshot; refreshes when stale (single-flight). Serves the last good one on failure. */
	async get() {
		const s = this.snapshot;
		const t = this.now();
		if (s && t - s.fetchedAt < this.ttlMs) return s;
		if (t - this.lastFailureAt < this.failureCooldownMs) {
			if (s) return s;
			throw new Error(this.lastError ?? "catalogue refresh failed recently");
		}
		return this.refresh();
	}
	/** Forces a refresh that starts after this call; awaiting it yields the refreshed (or stale-if-error) snapshot. */
	async bust() {
		const prior = this.inflight;
		if (prior) await prior.catch(() => void 0);
		this.lastFailureAt = -Infinity;
		if (this.snapshot) this.snapshot = {
			...this.snapshot,
			fetchedAt: 0
		};
		return this.refresh();
	}
	peek() {
		return this.snapshot;
	}
	async refresh() {
		if (this.inflight) return this.inflight;
		this.inflight = (async () => {
			const startedAt = this.now();
			try {
				const [ranges, meta] = await Promise.all([this.load(), this.loadMeta ? this.loadMeta().catch((e) => {
					this.logger.warn("metadata read failed; keeping the last known Votes row count", { error: serializeError(e) });
				}) : Promise.resolve(void 0)]);
				const fresh = {
					...this.parse(ranges),
					fetchedAt: this.now()
				};
				for (const d of this.deltas) if (d.at >= startedAt) applyDelta(fresh, d);
				this.snapshot = fresh;
				if (meta) this.meta = meta;
				this.lastRefreshOk = true;
				this.lastError = null;
				this.pruneDeltas();
				if (this.persistPath) this.persist(this.persistPath, ranges, fresh.fetchedAt);
				if (fresh.report.dropped.length || fresh.report.warnings.length) this.logger.warn(`refresh dropped ${fresh.report.dropped.length} row(s), ${fresh.report.warnings.length} warning(s)`, {
					dropped: fresh.report.dropped.slice(0, 20),
					warnings: fresh.report.warnings.slice(0, 20)
				});
				return fresh;
			} catch (e) {
				this.lastRefreshOk = false;
				this.lastFailureAt = this.now();
				const safe = serializeError(e);
				this.lastError = `${safe.name}: ${safe.message}`;
				this.logger.error("refresh failed; serving the last good snapshot", { error: safe });
				if (this.snapshot) return this.snapshot;
				throw e;
			} finally {
				this.inflight = void 0;
			}
		})();
		return this.inflight;
	}
	/**
	* Applies a vote delta to the in-memory snapshot (counts + visitor state). The next refresh
	* reconciles with the sheet's COUNTIFS. Returns the delta (for discardVote) and the updated rug.
	*/
	applyVote(rugId, visitorHash, previous, next) {
		if (!this.snapshot) return void 0;
		const delta = {
			at: this.now(),
			rugId,
			visitorHash,
			previous,
			next
		};
		const rug = applyDelta(this.snapshot, delta);
		if (!rug) return void 0;
		this.deltas.push(delta);
		return {
			delta,
			rug
		};
	}
	/** Undoes an optimistic delta whose sheet write failed: it is removed from the replay log too. */
	discardVote(delta) {
		this.deltas = this.deltas.filter((d) => d !== delta);
		if (!this.snapshot) return;
		applyDelta(this.snapshot, {
			...delta,
			previous: delta.next,
			next: delta.previous
		});
	}
	currentVote(visitorHash, rugId) {
		return this.snapshot?.voteState.get(visitorHash)?.get(rugId) ?? "none";
	}
	health() {
		const s = this.snapshot;
		const report = s?.report;
		const votesRowsRead = report?.votesRowsRead ?? 0;
		return {
			ok: this.lastRefreshOk && s !== void 0,
			lastRefreshOk: this.lastRefreshOk,
			snapshotAgeSec: s ? Math.max(0, Math.round((this.now() - s.fetchedAt) / 1e3)) : null,
			lastError: this.lastError,
			rowsDropped: report?.dropped?.length ?? 0,
			rowsWarned: report?.warnings?.length ?? 0,
			dropped: (report?.dropped ?? []).slice(0, HEALTH_ROWS),
			warnings: (report?.warnings ?? []).slice(0, HEALTH_ROWS),
			votesRowsRead,
			votesRowsTotal: this.meta.votesRowsTotal ?? null,
			voteStateTruncated: votesRowsRead >= this.windowRows,
			rugs: s?.catalogue.rugs.length ?? 0
		};
	}
	get votesRowsTotal() {
		return this.meta.votesRowsTotal;
	}
	pruneDeltas() {
		const cutoff = this.now() - 2 * this.ttlMs;
		this.deltas = this.deltas.filter((d) => d.at >= cutoff);
	}
	persist(path, ranges, fetchedAt) {
		try {
			const data = {
				version: 1,
				fetchedAt,
				ranges: ranges.slice(0, CONTENT_RANGE_COUNT)
			};
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify(data));
		} catch (e) {
			this.logger.warn("could not persist snapshot", { error: serializeError(e) });
		}
	}
	/** Re-runs the parser (same Zod schemas, same rejection rule) over the persisted content ranges. */
	restore(path) {
		try {
			if (!existsSync(path)) return void 0;
			const data = JSON.parse(readFileSync(path, "utf8"));
			if (data?.version !== 1 || !Array.isArray(data.ranges) || data.ranges.length !== CONTENT_RANGE_COUNT) return void 0;
			const reactionsRange = {
				range: READ_RANGES[4],
				values: [[...HEADERS.Reactions]]
			};
			const customersRange = {
				range: READ_RANGES[5],
				values: [[...HEADERS.Customers]]
			};
			return {
				...this.parse([
					...data.ranges,
					reactionsRange,
					customersRange
				]),
				fetchedAt: 0
			};
		} catch (e) {
			this.logger.warn("ignoring invalid persisted snapshot", { error: serializeError(e) });
			return;
		}
	}
};
function applyDelta(snap, d) {
	const rug = snap.catalogue.rugs.find((r) => r.id === d.rugId);
	if (!rug) return void 0;
	if (d.previous === "like") rug.likes = Math.max(0, rug.likes - 1);
	if (d.previous === "dislike") rug.dislikes = Math.max(0, rug.dislikes - 1);
	if (d.next === "like") rug.likes += 1;
	if (d.next === "dislike") rug.dislikes += 1;
	const total = rug.likes + rug.dislikes;
	rug.rating = total === 0 ? 0 : Math.round(rug.likes / total * 5 * 100) / 100;
	const state = snap.voteState;
	let byRug = state.get(d.visitorHash);
	if (!byRug) {
		byRug = /* @__PURE__ */ new Map();
		state.set(d.visitorHash, byRug);
	}
	if (d.next === "none") byRug.delete(d.rugId);
	else byRug.set(d.rugId, d.next);
	return rug;
}
//#endregion
//#region src/lib/sheets/client.ts
var BASE = "https://sheets.googleapis.com/v4/spreadsheets";
var SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
var REQUEST_TIMEOUT_MS = 3e4;
var TOKEN_TIMEOUT_MS = 2e4;
async function withTimeout(p, ms, what) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`${what} timed out after ${ms} ms`)), ms);
		if (typeof timer === "object" && "unref" in timer) timer.unref();
	});
	try {
		return await Promise.race([p, timeout]);
	} finally {
		clearTimeout(timer);
	}
}
function normalisePrivateKey(key) {
	return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}
function createTokenSource(auth) {
	if (auth.mode === "service_account") {
		const client = new JWT({
			email: auth.email,
			key: normalisePrivateKey(auth.privateKey),
			scopes: SCOPES
		});
		return { async getAccessToken() {
			const { token } = await client.getAccessToken();
			if (!token) throw new SheetsApiError(401, "service account token request returned no token");
			return token;
		} };
	}
	const client = new UserRefreshClient({
		clientId: auth.clientId,
		clientSecret: auth.clientSecret,
		refreshToken: auth.refreshToken
	});
	return { async getAccessToken() {
		const { token } = await client.getAccessToken();
		if (!token) throw new SheetsApiError(401, "refresh token exchange returned no token");
		return token;
	} };
}
function defaultSleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
var SheetsClient = class SheetsClient {
	spreadsheetId;
	tokens;
	fetchImpl;
	logger;
	sleep;
	maxAttempts;
	sheetIds;
	constructor(options, tokens) {
		this.spreadsheetId = options.spreadsheetId;
		this.tokens = tokens ?? createTokenSource(options.auth);
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.logger = options.logger ?? consoleLogger;
		this.sleep = options.sleep ?? defaultSleep;
		this.maxAttempts = options.maxAttempts ?? 3;
	}
	/** Reads several ranges in one request (UNFORMATTED_VALUE + FORMATTED_STRING, ADR D3). */
	async batchGet(ranges) {
		const query = ranges.map((r) => ["ranges", r]);
		query.push(["majorDimension", "ROWS"]);
		query.push(["valueRenderOption", "UNFORMATTED_VALUE"]);
		query.push(["dateTimeRenderOption", "FORMATTED_STRING"]);
		const got = (await this.request({
			method: "GET",
			path: "/values:batchGet",
			query,
			policy: "read"
		})).valueRanges ?? [];
		if (got.length !== ranges.length) throw new SheetsApiError(502, `batchGet returned ${got.length} ranges for ${ranges.length} requested`);
		return got;
	}
	/** Atomic per call: either every request applies or none does. */
	async batchUpdate(requests, extra) {
		return this.request({
			method: "POST",
			path: ":batchUpdate",
			body: {
				requests,
				...extra
			},
			policy: "write"
		});
	}
	async valuesUpdate(range, values, valueInputOption) {
		await this.request({
			method: "PUT",
			path: `/values/${encodeURIComponent(range)}`,
			query: [["valueInputOption", valueInputOption]],
			body: {
				range,
				majorDimension: "ROWS",
				values
			},
			policy: "write"
		});
	}
	/** Kept for the Phase-5 concurrency test only; production votes use batchUpdate (ADR D4). */
	async valuesAppend(range, values, insertDataOption) {
		return this.request({
			method: "POST",
			path: `/values/${encodeURIComponent(range)}:append`,
			query: [["valueInputOption", "RAW"], ["insertDataOption", insertDataOption]],
			body: {
				range,
				majorDimension: "ROWS",
				values
			},
			policy: "write"
		});
	}
	async getSpreadsheet(fields = "properties.title,properties.locale,sheets.properties") {
		return this.request({
			method: "GET",
			path: "",
			query: [["fields", fields]],
			policy: "read"
		});
	}
	/** Numeric sheetId for a tab title (cached; call `forgetSheetIds()` after a `sheetId` error). */
	async sheetIdByTitle(title) {
		if (!this.sheetIds) {
			const info = await this.getSpreadsheet("sheets.properties");
			this.sheetIds = new Map((info.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]));
		}
		const id = this.sheetIds.get(title);
		if (id === void 0) throw new SheetsApiError(404, `tab "${title}" not found in spreadsheet`);
		return id;
	}
	forgetSheetIds() {
		this.sheetIds = void 0;
	}
	/**
	* Creates a brand-new spreadsheet (development sheets, scripts/init-sheet.ts). Not idempotent:
	* a network error is never replayed (it could create a duplicate whose id is lost).
	*/
	static async createSpreadsheet(auth, title, sheetTitles, options) {
		return (await new SheetsClient({
			spreadsheetId: "",
			auth,
			fetchImpl: options?.fetchImpl,
			logger: options?.logger
		}, options?.tokens).request({
			method: "POST",
			path: BASE,
			body: {
				properties: {
					title,
					locale: options?.locale ?? "en_US"
				},
				sheets: sheetTitles.map((t) => ({ properties: { title: t } }))
			},
			policy: "write"
		})).spreadsheetId;
	}
	async request(opts) {
		const url = new URL(opts.path.startsWith("http") ? opts.path : `${BASE}/${encodeURIComponent(this.spreadsheetId)}${opts.path}`);
		if (opts.query?.length) url.search = opts.query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
		let token;
		try {
			token = await withTimeout(this.tokens.getAccessToken(), TOKEN_TIMEOUT_MS, "access token request");
		} catch (e) {
			throw new SheetsApiError(401, `could not obtain an access token: ${serializeError(e).message}`, "UNAUTHENTICATED");
		}
		let lastError;
		for (let attempt = 1; attempt <= this.maxAttempts; attempt++) try {
			return await this.once(url, opts, token);
		} catch (e) {
			lastError = e;
			const apiError = e instanceof SheetsApiError ? e : void 0;
			const isNetwork = !apiError;
			if (!(apiError ? apiError.retryable : opts.policy === "read" && isNetwork) || attempt === this.maxAttempts) throw e;
			const delay = 1e3 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
			this.logger.warn(`retrying ${opts.method} ${opts.path} after ${delay}ms`, {
				attempt,
				error: serializeError(e)
			});
			await this.sleep(delay);
		}
		throw lastError;
	}
	async once(url, opts, token) {
		const headers = { authorization: `Bearer ${token}` };
		if (opts.body !== void 0) headers["content-type"] = "application/json";
		const res = await this.fetchImpl(url, {
			method: opts.method,
			headers,
			body: opts.body === void 0 ? void 0 : JSON.stringify(opts.body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		const text = await res.text();
		let json = {};
		if (text) try {
			json = JSON.parse(text);
		} catch {
			if (res.ok) throw new SheetsApiError(502, "non-JSON response from the Sheets API");
		}
		if (!res.ok) {
			const err = json.error;
			throw new SheetsApiError(res.status, err?.message ?? `HTTP ${res.status}`, err?.status);
		}
		return json;
	}
};
//#endregion
//#region src/lib/sheets/config.ts
function str(env, key) {
	const v = env[key];
	if (v === void 0 || v === null) return void 0;
	const s = String(v).trim();
	return s === "" ? void 0 : s;
}
function authFromEnv(env) {
	const mode = str(env, "GOOGLE_AUTH_MODE") ?? "service_account";
	if (mode === "oauth_refresh") {
		const clientId = str(env, "GOOGLE_OAUTH_CLIENT_ID");
		const clientSecret = str(env, "GOOGLE_OAUTH_CLIENT_SECRET");
		const refreshToken = str(env, "GOOGLE_OAUTH_REFRESH_TOKEN");
		if (!clientId || !clientSecret || !refreshToken) throw new Error("GOOGLE_AUTH_MODE=oauth_refresh needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN (run `npm run google:auth`)");
		return {
			mode: "oauth_refresh",
			clientId,
			clientSecret,
			refreshToken
		};
	}
	if (mode !== "service_account") throw new Error(`unknown GOOGLE_AUTH_MODE "${mode}"`);
	const email = str(env, "GOOGLE_SERVICE_ACCOUNT_EMAIL");
	const privateKey = str(env, "GOOGLE_PRIVATE_KEY");
	if (!email || !privateKey) throw new Error("GOOGLE_AUTH_MODE=service_account needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY");
	return {
		mode: "service_account",
		email,
		privateKey
	};
}
//#endregion
//#region src/lib/sheets/id-store.ts
/** A spreadsheet id as Google issues them: 40-odd URL-safe characters. */
var ID_RE$1 = /^[A-Za-z0-9_-]{20,120}$/;
function isStored(v) {
	if (typeof v !== "object" || v === null) return false;
	const o = v;
	return typeof o.id === "string" && ID_RE$1.test(o.id) && typeof o.createdAt === "string";
}
var TTL_MS = 5e3;
function fileStore(dataDir) {
	const path = join(dataDir, "sheet.json");
	let cache;
	let cachedAt = 0;
	return {
		durable: true,
		read() {
			const now = Date.now();
			if (cache && now - cachedAt < TTL_MS) return cache;
			try {
				if (!existsSync(path)) {
					cache = void 0;
					cachedAt = now;
					return;
				}
				const parsed = JSON.parse(readFileSync(path, "utf8"));
				cache = isStored(parsed) ? parsed : void 0;
			} catch {
				cache = void 0;
			}
			cachedAt = now;
			return cache;
		},
		write(value) {
			if (!ID_RE$1.test(value.id)) throw new Error("sheet id store: refusing to write a malformed id");
			mkdirSync(dirname(path), { recursive: true });
			const tmp = `${path}.tmp`;
			writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 384 });
			renameSync(tmp, path);
			try {
				chmodSync(path, 384);
			} catch {}
			cache = value;
			cachedAt = Date.now();
		},
		clear() {
			try {
				if (existsSync(path)) writeFileSync(path, "{}", { mode: 384 });
			} catch {}
			cache = void 0;
			cachedAt = Date.now();
		}
	};
}
/**
* No DATA_DIR. The id is remembered for this process only — so a restart would show the studio an
* empty "no sheet yet" screen and invite them to create ANOTHER spreadsheet, leaving the first one
* orphaned with their data in it. The provisioning endpoint refuses to run against this store for
* exactly that reason; it exists so the rest of the code has something to talk to.
*/
function memoryStore() {
	let value;
	return {
		durable: false,
		read: () => value,
		write: (v) => {
			value = v;
		},
		clear: () => {
			value = void 0;
		}
	};
}
function createSheetIdStore(dataDir) {
	return dataDir ? fileStore(dataDir) : memoryStore();
}
//#endregion
//#region src/lib/text.ts
function slugify(input, max = 80) {
	return input.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
/** Splits a pipe-separated cell into trimmed, de-duplicated (case-insensitive) parts. */
function splitPipe(cell) {
	if (!cell) return [];
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const raw of cell.split("|")) {
		const v = raw.trim();
		if (!v) continue;
		const key = v.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(v);
	}
	return out;
}
/** Import-time canonicalisation of the legacy collection spellings (ADR D10.5). */
var CANONICAL_COLLECTIONS = {
	"wabi-sabi": "Wabi Sabi",
	wabisabi: "Wabi Sabi",
	"wabi sabi": "Wabi Sabi",
	kilim: "Kilims",
	kilims: "Kilims",
	tulu: "Tulu",
	tülü: "Tulu"
};
function canonicalCollection(name) {
	const trimmed = name.trim();
	return CANONICAL_COLLECTIONS[trimmed.toLowerCase()] ?? trimmed;
}
function normaliseKey(s) {
	return s.trim().toLowerCase();
}
function displayCollection(name) {
	return name.trim() || "More";
}
/**
* Collection slug: the Collections row's slug when the name matches (case-insensitively), else the
* slugified name, never empty. Tabs, card filtering, counts and ordering all key on this one value,
* so an owner-typed spelling variant ("Wabi-sabi") lands in the same tab as "Wabi Sabi".
*/
function collectionSlug(name, collections) {
	const display = displayCollection(name);
	return collections.find((c) => normaliseKey(c.name) === normaliseKey(display))?.slug || slugify(display) || "other";
}
/**
* Splits the `Collection` cell into the names a product belongs to (owner requirement 2026-09-13).
*
* Pipe-only, deliberately unlike `splitTags`, which also accepts commas: a collection name is prose
* the owner types, and "Wabi Sabi, Vol. 2" must stay one collection. A cell with no pipe is one
* name — which is what every row written before this change already is, so no migration is needed.
*/
function splitCollections(cell) {
	return splitPipe(cell);
}
/** The inverse: the cell to write back. Trimmed, de-duplicated, pipe-joined. */
function joinCollections(names) {
	return splitPipe(names.join("|")).join(" | ");
}
/**
* Every slug a product should be reachable under, in the order the owner listed them.
*
* De-duplicated on the SLUG, not the name, because two spellings the owner typed ("Wabi-sabi" and
* "Wabi Sabi") collapse to one tab and must not make the rug appear in it twice.
*/
function collectionSlugs(names, collections) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const name of names.length ? names : [""]) {
		const slug = collectionSlug(name, collections);
		if (seen.has(slug)) continue;
		seen.add(slug);
		out.push(slug);
	}
	return out;
}
//#endregion
//#region src/lib/size.ts
/** "240 × 170 cm" (width × length), empty when a side is unknown — the brief's rendering. */
function sizeLabelOf(widthCm, lengthCm) {
	if (!widthCm || !lengthCm) return "";
	return `${round(widthCm)} × ${round(lengthCm)} cm`;
}
function round(cm) {
	return Math.round(cm * 10) / 10;
}
/** Band from the area in m²: <0.75 XS · ≤2.5 S · ≤5 M · ≤10 L · >10 XL (brief §11, boundaries inclusive). */
function sizeBandOf(widthCm, lengthCm) {
	if (!widthCm || !lengthCm) return "";
	const m2 = widthCm / 100 * (lengthCm / 100);
	if (m2 < .75) return "XS";
	if (m2 <= 2.5) return "S";
	if (m2 <= 5) return "M";
	if (m2 <= 10) return "L";
	return "XL";
}
//#endregion
//#region src/lib/sheets/parse.ts
/** Blank = null/undefined or a whitespace-only string (ADR §5: blanks → undefined). */
var blank = (v) => v === null || v === void 0 || typeof v === "string" && v.trim() === "" ? void 0 : v;
var asTrimmed = (v) => {
	const b = blank(v);
	return b === void 0 ? void 0 : String(b).trim();
};
var trimmed = z.preprocess(asTrimmed, z.string().optional());
var required = z.preprocess(asTrimmed, z.string().min(1));
var untrimmed = z.preprocess((v) => {
	const b = blank(v);
	return b === void 0 ? void 0 : String(b);
}, z.string().optional());
/** Numbers arrive as JSON numbers under UNFORMATTED_VALUE; a text cell must be a plain decimal. */
function toNumber(v) {
	const b = blank(v);
	if (b === void 0) return void 0;
	if (typeof b === "number") return b;
	if (typeof b === "boolean") return b;
	const s = String(b).trim();
	return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
}
var num = z.preprocess(toNumber, z.number().optional());
/** Checkbox booleans, "true"/"false" and 1/0; blank → false. */
var bool = z.preprocess((v) => {
	const b = blank(v);
	if (b === void 0) return false;
	if (typeof b === "boolean") return b;
	const t = String(b).trim().toLowerCase();
	if (t === "true" || t === "1" || t === "yes") return true;
	if (t === "false" || t === "0" || t === "no") return false;
	return b;
}, z.boolean());
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var SLUG_RE = /^[a-z0-9-]{1,80}$/;
var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** A customer slug (Reactions/Visits) uses the same alphabet as the retired client code. */
var CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
var id = z.preprocess(asTrimmed, z.string().regex(ID_RE, "id must be 1-64 letters, digits, \"-\" or \"_\""));
var status = z.preprocess((v) => {
	const b = blank(v);
	return b === void 0 ? "active" : String(b).trim().toLowerCase();
}, z.enum([
	"active",
	"draft",
	"archived"
]));
/** Products is index-mapped (Shopify headers contain spaces and parentheses), so the schema is flat. */
var ProductRow = z.object({
	id,
	handle: trimmed,
	title: required,
	body_html: trimmed,
	vendor: trimmed,
	product_category: trimmed,
	type: trimmed,
	tags: trimmed,
	published: bool,
	variant_sku: trimmed,
	variant_grams: num,
	variant_inventory_qty: num,
	variant_inventory_policy: trimmed,
	variant_price: num,
	variant_compare_at_price: num,
	variant_requires_shipping: bool,
	variant_taxable: bool,
	image_src: trimmed,
	image_alt_text: trimmed,
	seo_title: trimmed,
	seo_description: trimmed,
	status,
	width_cm: num,
	length_cm: num,
	size_label: trimmed,
	size_band: trimmed,
	material: trimmed,
	method: trimmed,
	origin: trimmed,
	age: trimmed,
	pile: trimmed,
	shape: trimmed,
	collection: trimmed,
	source_url: trimmed,
	source_site: trimmed,
	drive_folder_id: trimmed,
	drive_folder_url: trimmed,
	scraped_at: trimmed,
	commit_status: z.preprocess((v) => asTrimmed(v)?.toLowerCase() ?? "", z.enum([
		"pending",
		"complete",
		""
	])),
	internal_notes: trimmed
});
var CollectionRow = z.object({
	id: trimmed,
	name: required,
	slug: trimmed,
	description: trimmed,
	created_at: trimmed,
	cover_image_url: trimmed,
	sort_order: num
});
var CustomerRow = z.object({
	slug: z.preprocess(asTrimmed, z.string().regex(SLUG_RE, "slug must be lowercase url-safe")),
	display_name: required,
	password_hash: trimmed,
	note: trimmed,
	created_at: trimmed,
	active: z.preprocess((v) => blank(v) === void 0 ? true : v, bool)
});
var ReactionRowSchema = z.object({
	event_id: trimmed,
	customer_slug: z.preprocess(asTrimmed, z.string().regex(CLIENT_RE, "customer_slug is not url-safe")),
	product_id: id,
	reaction: z.preprocess((v) => asTrimmed(v)?.toLowerCase(), z.enum([
		"like",
		"dislike",
		"none"
	])),
	source: z.preprocess((v) => asTrimmed(v)?.toLowerCase() ?? "card", z.enum(["card", "detail"])),
	created_at: trimmed
});
var TagRow = z.object({
	id: trimmed,
	slug: trimmed,
	name: required,
	color: trimmed
});
var RateRow = z.object({
	currency: z.preprocess((v) => asTrimmed(v)?.toUpperCase(), z.string().regex(/^[A-Z]{3}$/)),
	rate_to_base: z.preprocess(toNumber, z.number().positive()),
	symbol: untrimmed,
	updated_at: trimmed
});
function assertHeaders(tab, headerRow) {
	const expected = HEADERS[tab];
	const actual = (headerRow ?? []).map((c) => String(c ?? "").trim().toLowerCase());
	const mismatches = [];
	expected.forEach((name, i) => {
		if (actual[i] !== name) mismatches.push(`column ${columnLetter(i)} should be "${name}" but is "${actual[i] ?? ""}"`);
	});
	if (mismatches.length) throw new SheetContractError(tab, mismatches);
}
function columnLetter(index) {
	let n = index + 1;
	let s = "";
	while (n > 0) {
		const r = (n - 1) % 26;
		s = String.fromCharCode(65 + r) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}
/** Validates the header row (always, even for an empty tab) and maps data rows to header-keyed objects. */
function rowsToObjects(tab, values) {
	assertHeaders(tab, values?.[0]);
	if (!values || values.length < 2) return [];
	const headers = HEADERS[tab];
	const out = [];
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		if (cells.every((c) => blank(c) === void 0)) continue;
		const raw = {};
		headers.forEach((h, j) => {
			raw[h] = cells[j];
		});
		out.push({
			row: i + 1,
			raw
		});
	}
	return out;
}
function issuesOf(error) {
	return error.issues.map((i) => `${i.path.join(".") || "(row)"}: ${i.message}`);
}
/** Maps a Products row (index-based) onto the flat keys of ProductRow. */
function productRaw(cells) {
	const at = (i) => cells[i];
	return {
		id: at(PRODUCT_COLS.productId),
		handle: at(PRODUCT_COLS.handle),
		title: at(PRODUCT_COLS.title),
		body_html: at(PRODUCT_COLS.bodyHtml),
		vendor: at(PRODUCT_COLS.vendor),
		product_category: at(PRODUCT_COLS.productCategory),
		type: at(PRODUCT_COLS.type),
		tags: at(PRODUCT_COLS.tags),
		published: at(PRODUCT_COLS.published),
		variant_sku: at(PRODUCT_COLS.variantSku),
		variant_grams: at(PRODUCT_COLS.variantGrams),
		variant_inventory_qty: at(PRODUCT_COLS.variantInventoryQty),
		variant_inventory_policy: at(PRODUCT_COLS.variantInventoryPolicy),
		variant_price: at(PRODUCT_COLS.variantPrice),
		variant_compare_at_price: at(PRODUCT_COLS.variantCompareAtPrice),
		variant_requires_shipping: at(PRODUCT_COLS.variantRequiresShipping),
		variant_taxable: at(PRODUCT_COLS.variantTaxable),
		image_src: at(PRODUCT_COLS.imageSrc),
		image_alt_text: at(PRODUCT_COLS.imageAltText),
		seo_title: at(PRODUCT_COLS.seoTitle),
		seo_description: at(PRODUCT_COLS.seoDescription),
		status: at(PRODUCT_COLS.status),
		width_cm: at(PRODUCT_COLS.widthCm),
		length_cm: at(PRODUCT_COLS.lengthCm),
		size_label: at(PRODUCT_COLS.sizeLabel),
		size_band: at(PRODUCT_COLS.sizeBand),
		material: at(PRODUCT_COLS.material),
		method: at(PRODUCT_COLS.method),
		origin: at(PRODUCT_COLS.origin),
		age: at(PRODUCT_COLS.age),
		pile: at(PRODUCT_COLS.pile),
		shape: at(PRODUCT_COLS.shape),
		collection: at(PRODUCT_COLS.collection),
		source_url: at(PRODUCT_COLS.sourceUrl),
		source_site: at(PRODUCT_COLS.sourceSite),
		drive_folder_id: at(PRODUCT_COLS.driveFolderId),
		drive_folder_url: at(PRODUCT_COLS.driveFolderUrl),
		scraped_at: at(PRODUCT_COLS.scrapedAt),
		commit_status: at(PRODUCT_COLS.commitStatus),
		internal_notes: at(PRODUCT_COLS.internalNotes)
	};
}
/** Shopify CSV tags are comma-separated; the pre-brief sheet used "|". Accept both. */
function splitTags(value) {
	if (!value) return [];
	return (value.includes("|") ? splitPipe(value) : value.split(",")).map((t) => t.trim()).filter(Boolean);
}
/** No column exists for these in the Shopify set, so they ride on tags (documented in ADR D15). */
function flagsFromTags(tags) {
	let featured = false;
	let rotate = "false";
	const rest = [];
	for (const t of tags) {
		const k = t.trim().toLowerCase();
		if (k === "featured") featured = true;
		else if (k === "rotate-force") rotate = "force";
		else if (k === "rotate") rotate = rotate === "force" ? "force" : "true";
		else rest.push(t);
	}
	return {
		featured,
		rotate,
		rest
	};
}
function parseProducts(values) {
	const items = [];
	const dropped = [];
	const warnings = [];
	const seenSlugs = /* @__PURE__ */ new Map();
	const seenIds = /* @__PURE__ */ new Set();
	assertHeaders(TABS.products, values?.[0]);
	const rows = values ?? [];
	for (let i = 1; i < rows.length; i++) {
		const cells = rows[i] ?? [];
		if (cells.every((c) => blank(c) === void 0)) continue;
		const row = i + 1;
		const raw = productRaw(cells);
		if (blank(raw.id) === void 0) continue;
		const parsed = ProductRow.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.products,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const p = parsed.data;
		if (seenIds.has(p.id)) {
			dropped.push({
				tab: TABS.products,
				row,
				issues: [`id: "${p.id}" duplicates an earlier row`]
			});
			continue;
		}
		seenIds.add(p.id);
		const warn = [];
		const photos = [];
		if (p.image_src) {
			const fid = extractDriveId(p.image_src);
			if (fid) photos.push(fid);
			else if (!/^https:\/\//i.test(p.image_src)) warn.push(`image src: "${p.image_src.slice(0, 40)}" is not a Drive id/URL or https URL`);
		}
		let slug;
		if (p.handle !== void 0 && !SLUG_RE.test(p.handle)) {
			warn.push(`handle: "${p.handle.slice(0, 40)}" is not a valid handle and was replaced`);
			slug = slugify(p.title);
		} else slug = p.handle ?? slugify(p.title);
		if (!slug) slug = slugify(p.id) || p.id.toLowerCase();
		const n = seenSlugs.get(slug) ?? 0;
		seenSlugs.set(slug, n + 1);
		if (n > 0) slug = `${slug}-${n + 1}`;
		if (warn.length) warnings.push({
			tab: TABS.products,
			row,
			issues: warn
		});
		const widthCm = p.width_cm && p.width_cm > 0 ? p.width_cm : void 0;
		const lengthCm = p.length_cm && p.length_cm > 0 ? p.length_cm : void 0;
		const { featured, rotate, rest } = flagsFromTags(splitTags(p.tags));
		const collections = splitCollections(p.collection);
		items.push({
			id: p.id,
			slug,
			name: p.title,
			description: p.body_html ?? "",
			collections,
			collection: collections[0] ?? "",
			tags: rest,
			photos,
			imageSrc: p.image_src ?? "",
			imageAltText: p.image_alt_text ?? "",
			widthCm,
			lengthCm,
			sizeLabel: p.size_label ?? sizeLabelOf(widthCm, lengthCm),
			sizeBand: (p.size_band ?? sizeBandOf(widthCm, lengthCm)).toUpperCase(),
			material: p.material ?? "",
			method: p.method ?? "",
			origin: p.origin ?? "",
			age: p.age ?? "",
			pile: p.pile ?? "",
			shape: p.shape ?? "",
			priceUsd: p.variant_price && p.variant_price > 0 ? p.variant_price : void 0,
			compareAtPrice: p.variant_compare_at_price && p.variant_compare_at_price > 0 ? p.variant_compare_at_price : void 0,
			vendor: p.vendor ?? "",
			productCategory: p.product_category ?? "",
			productType: p.type ?? "",
			published: p.published,
			variantSku: p.variant_sku ?? "",
			variantGrams: p.variant_grams,
			variantInventoryQty: p.variant_inventory_qty,
			variantInventoryPolicy: p.variant_inventory_policy ?? "",
			variantRequiresShipping: p.variant_requires_shipping,
			variantTaxable: p.variant_taxable,
			seoTitle: p.seo_title ?? "",
			seoDescription: p.seo_description ?? "",
			status: p.status,
			sourceUrl: p.source_url ?? "",
			sourceSite: p.source_site ?? "",
			driveFolderId: p.drive_folder_id ?? "",
			driveFolderUrl: p.drive_folder_url ?? "",
			scrapedAt: p.scraped_at ?? "",
			commitStatus: p.commit_status,
			internalNotes: p.internal_notes ?? "",
			featured,
			rotate,
			likes: 0,
			dislikes: 0,
			rating: 0
		});
	}
	return {
		items,
		dropped,
		warnings
	};
}
function parseCollections(values) {
	const items = [];
	const dropped = [];
	const warnings = [];
	for (const { row, raw } of rowsToObjects(TABS.collections, values)) {
		const parsed = CollectionRow.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.collections,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const c = parsed.data;
		const warn = [];
		let cover;
		if (c.cover_image_url) {
			const res = normaliseImageUrl(c.cover_image_url);
			if (res.url) cover = res.url;
			else warn.push(`cover_image_url: ${res.reason}; ignored`);
		}
		let slug = c.slug ?? slugify(c.name);
		if (c.slug !== void 0 && !SLUG_RE.test(c.slug)) {
			warn.push(`slug: "${c.slug.slice(0, 40)}" is not a valid slug and was replaced`);
			slug = slugify(c.name);
		}
		if (!slug) {
			slug = c.id && slugify(c.id) || `collection-${row}`;
			warn.push(`slug: derived "${slug}" because the name has no ASCII letters or digits`);
		}
		if (warn.length) warnings.push({
			tab: TABS.collections,
			row,
			issues: warn
		});
		items.push({
			id: c.id ?? slug,
			slug,
			name: c.name,
			description: c.description ?? "",
			createdAt: c.created_at,
			coverImageUrl: cover,
			sortOrder: c.sort_order
		});
	}
	return {
		items,
		dropped,
		warnings
	};
}
function parseTags(values) {
	const items = [];
	const dropped = [];
	const warnings = [];
	for (const { row, raw } of rowsToObjects(TABS.tags, values)) {
		const parsed = TagRow.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.tags,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const t = parsed.data;
		const warn = [];
		let slug = t.slug ?? slugify(t.name);
		if (t.slug !== void 0 && !SLUG_RE.test(t.slug)) {
			warn.push(`slug: "${t.slug.slice(0, 40)}" is not a valid slug and was replaced`);
			slug = slugify(t.name);
		}
		let color;
		if (t.color !== void 0) {
			if (COLOR_RE.test(t.color)) color = t.color;
			else warn.push(`color: "${t.color.slice(0, 20)}" is not #RRGGBB; ignored`);
		}
		if (warn.length) warnings.push({
			tab: TABS.tags,
			row,
			issues: warn
		});
		items.push({
			id: t.id ?? slugify(t.name),
			slug,
			name: t.name,
			color
		});
	}
	return {
		items,
		dropped,
		warnings
	};
}
function parseRates(values) {
	const items = [];
	const dropped = [];
	for (const { row, raw } of rowsToObjects(TABS.rates, values)) {
		const parsed = RateRow.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.rates,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const r = parsed.data;
		items.push({
			currency: r.currency,
			rateToBase: r.rate_to_base,
			symbol: r.symbol ?? "",
			updatedAt: r.updated_at
		});
	}
	return {
		items,
		dropped,
		warnings: []
	};
}
function parseCustomers(values) {
	const items = [];
	const dropped = [];
	const seen = /* @__PURE__ */ new Set();
	for (const { row, raw } of rowsToObjects(TABS.customers, values)) {
		if (blank(raw.slug) === void 0) continue;
		const parsed = CustomerRow.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.customers,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const c = parsed.data;
		if (seen.has(c.slug)) {
			dropped.push({
				tab: TABS.customers,
				row,
				issues: [`slug: "${c.slug}" duplicates an earlier row`]
			});
			continue;
		}
		seen.add(c.slug);
		items.push({
			slug: c.slug,
			displayName: c.display_name,
			passwordHash: c.password_hash ?? "",
			note: c.note ?? "",
			createdAt: c.created_at,
			active: c.active
		});
	}
	return {
		items,
		dropped,
		warnings: []
	};
}
/**
* Newest-first window (brief §3 rule 1): the latest event per (customer, product) wins, and a
* `none` event clears the pair. Counts are the number of distinct customers currently liking or
* disliking each product — the site never reads a stored count.
*/
function parseReactions(values) {
	const state = /* @__PURE__ */ new Map();
	const counts = /* @__PURE__ */ new Map();
	const dropped = [];
	const decided = /* @__PURE__ */ new Set();
	let rowsRead = 0;
	for (const { row, raw } of rowsToObjects(TABS.reactions, values)) {
		rowsRead++;
		const parsed = ReactionRowSchema.safeParse(raw);
		if (!parsed.success) {
			dropped.push({
				tab: TABS.reactions,
				row,
				issues: issuesOf(parsed.error)
			});
			continue;
		}
		const e = parsed.data;
		const pair = `${e.customer_slug} ${e.product_id}`;
		if (decided.has(pair)) continue;
		decided.add(pair);
		if (e.reaction === "none") continue;
		const vote = e.reaction;
		let byProduct = state.get(e.customer_slug);
		if (!byProduct) {
			byProduct = /* @__PURE__ */ new Map();
			state.set(e.customer_slug, byProduct);
		}
		byProduct.set(e.product_id, vote);
		const c = counts.get(e.product_id) ?? {
			likes: 0,
			dislikes: 0
		};
		if (vote === "like") c.likes++;
		else c.dislikes++;
		counts.set(e.product_id, c);
	}
	return {
		state,
		counts,
		rowsRead,
		dropped
	};
}
/** likes / (likes + dislikes) × 5, two decimals — the rule the retired sheet formula encoded. */
function ratingOf(likes, dislikes) {
	const n = likes + dislikes;
	return n === 0 ? 0 : Math.round(likes / n * 5 * 100) / 100;
}
/** Orders collections by sort_order then A→Z; falls back to the reference ORDER list when the tab is empty. */
function orderedCollectionNames(products, collections) {
	const present = [...new Set(products.flatMap((r) => r.collections?.length ? r.collections : [r.collection]).filter(Boolean))];
	const known = collections.slice().sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name)).map((c) => c.name);
	const order = known.length ? known : [...REFERENCE_COLLECTION_ORDER];
	const keyOf = (name) => collectionSlug(name, collections);
	const byKey = /* @__PURE__ */ new Map();
	for (const name of present) if (!byKey.has(keyOf(name))) byKey.set(keyOf(name), name);
	const out = [];
	for (const name of order) {
		const hit = byKey.get(keyOf(name));
		if (hit && !out.includes(hit)) out.push(hit);
	}
	const placed = new Set(out.map(keyOf));
	const rest = present.filter((n) => !placed.has(keyOf(n))).sort((a, b) => a.localeCompare(b));
	return out.concat(rest);
}
/** Parses the value ranges returned for READ_RANGES (positional). Throws SheetContractError on a bad header row. */
function parseSnapshot(ranges) {
	const [productsVR, collectionsVR, tagsVR, ratesVR, reactionsVR, customersVR] = ranges;
	const products = parseProducts(productsVR?.values);
	const collections = parseCollections(collectionsVR?.values);
	const tags = parseTags(tagsVR?.values);
	const rates = parseRates(ratesVR?.values);
	const reactions = parseReactions(reactionsVR?.values);
	const customers = parseCustomers(customersVR?.values);
	for (const p of products.items) {
		const c = reactions.counts.get(p.id);
		if (!c) continue;
		p.likes = c.likes;
		p.dislikes = c.dislikes;
		p.rating = ratingOf(c.likes, c.dislikes);
	}
	const stats = {
		[TABS.products]: {
			kept: products.items.length,
			dropped: products.dropped.length
		},
		[TABS.collections]: {
			kept: collections.items.length,
			dropped: collections.dropped.length
		},
		[TABS.tags]: {
			kept: tags.items.length,
			dropped: tags.dropped.length
		},
		[TABS.rates]: {
			kept: rates.items.length,
			dropped: rates.dropped.length
		},
		[TABS.reactions]: {
			kept: reactions.rowsRead - reactions.dropped.length,
			dropped: reactions.dropped.length
		},
		[TABS.customers]: {
			kept: customers.items.length,
			dropped: customers.dropped.length
		}
	};
	return {
		catalogue: {
			rugs: products.items,
			collections: collections.items,
			tags: tags.items,
			rates: rates.items,
			customers: customers.items
		},
		voteState: reactions.state,
		report: {
			dropped: [
				...products.dropped,
				...collections.dropped,
				...tags.dropped,
				...rates.dropped,
				...reactions.dropped,
				...customers.dropped
			],
			warnings: [
				...products.warnings,
				...collections.warnings,
				...tags.warnings
			],
			votesRowsRead: reactions.rowsRead,
			stats
		}
	};
}
//#endregion
//#region src/lib/sheets/read.ts
/** Content tabs subject to the "more than 10 % of rows failing rejects the refresh" rule. */
var GUARDED_TABS = [
	TABS.products,
	TABS.collections,
	TABS.tags,
	TABS.rates,
	TABS.customers
];
async function fetchRanges(client) {
	return client.batchGet(READ_RANGES);
}
/** Reactions grid row count (grows with every append) for the growth breaker; one small read per refresh. */
async function fetchMeta(client) {
	const rowCount = ((await client.getSpreadsheet("sheets.properties")).sheets ?? []).find((s) => s.properties.title === TABS.reactions)?.properties.gridProperties?.rowCount;
	return { votesRowsTotal: typeof rowCount === "number" ? rowCount : void 0 };
}
/** Parses and applies the per-tab rejection rule; throws to reject the whole refresh. */
function snapshotFromRanges(ranges, now = Date.now) {
	const parsed = parseSnapshot(ranges);
	for (const tab of GUARDED_TABS) {
		const s = parsed.report.stats[tab];
		if (!s) continue;
		const rows = s.kept + s.dropped;
		if (rows > 0 && s.dropped / rows > .1) throw new Error(`refresh rejected: ${s.dropped} of ${rows} ${tab} rows failed validation`);
	}
	return {
		...parsed,
		fetchedAt: now()
	};
}
//#endregion
//#region src/lib/runtime.ts
var env = {
	GOOGLE_SHEET_ID,
	GOOGLE_AUTH_MODE,
	GOOGLE_SERVICE_ACCOUNT_EMAIL,
	GOOGLE_PRIVATE_KEY,
	GOOGLE_OAUTH_CLIENT_ID,
	GOOGLE_OAUTH_CLIENT_SECRET,
	GOOGLE_OAUTH_REFRESH_TOKEN
};
var tokens;
var googleStore;
var sheetIdStore;
var googleConnection;
var client;
var cache;
var adminDeps;
var rates;
var photoMonitor = new PhotoMonitor();
/**
* The store's base currency (brief §8): prices are stored once in this currency and every other one
* is derived.
*
* This runs at module scope, and this module is what every page and endpoint imports, so it must not
* be able to throw. It reads defensively even though the schema gives BASE_CURRENCY a default:
* `astro:env/server` is generated from astro.config.mjs when the server starts, so a dev process
* that was already running when the variable was added exports `undefined` for it, and a build with
* placeholder environment values can do the same. Either way the answer is USD and a warning, never
* a stack trace that takes down every route.
*/
function resolveBaseCurrency(raw) {
	const wanted = typeof raw === "string" ? raw.trim().toUpperCase() : "";
	if (SUPPORTED_CURRENCIES.includes(wanted)) return wanted;
	if (wanted) console.warn(`[rates] BASE_CURRENCY "${wanted}" is not one of ${SUPPORTED_CURRENCIES.join(", ")}: using USD.`);
	return "USD";
}
var baseCurrency = resolveBaseCurrency(BASE_CURRENCY);
/** The FX table: hardcoded fallback → daily API → the sheet's Rates tab, in that order of authority. */
function getRates() {
	if (!rates) rates = new RatesCache({
		base: baseCurrency,
		url: FX_API_URL || "https://api.frankfurter.dev/v1/latest",
		refreshMs: (typeof FX_REFRESH_HOURS === "number" && FX_REFRESH_HOURS > 0 ? FX_REFRESH_HOURS : 24) * 36e5
	});
	return rates;
}
/**
* The rate table a page renders with. The sheet wins where it has a value (the owner can pin a
* rate), the API fills the rest, and the hardcoded table covers both being unavailable — so a
* price is always printable.
*/
function ratesFor(catalogue) {
	return getRates().get(catalogue.rates);
}
/** Where the refresh token the admin stores lives; memory-only when DATA_DIR is unset. */
function getGoogleStore() {
	if (!googleStore) googleStore = createTokenStore(DATA_DIR || void 0);
	return googleStore;
}
/** Where a STUDIO-created spreadsheet's id lives; memory-only when DATA_DIR is unset. */
function getSheetIdStore() {
	if (!sheetIdStore) sheetIdStore = createSheetIdStore(DATA_DIR || void 0);
	return sheetIdStore;
}
/**
* The live spreadsheet id: the environment first, then whatever the studio provisioned.
*
* Env wins deliberately. A deployment that pins `GOOGLE_SHEET_ID` is stating which sheet is live,
* and a button in the admin must not quietly move the site onto a different one. The store is for
* the case the env cannot serve — the client connects Google on the deployed site and presses
* "Create the catalogue sheet", and the id has to be remembered by a server that cannot write .env.
*/
function activeSheetId() {
	const fromEnv = (GOOGLE_SHEET_ID ?? "").trim();
	if (fromEnv) return fromEnv;
	const stored = getSheetIdStore().read();
	if (stored) return stored.id;
	throw new Error("No catalogue sheet yet — connect Google in /admin/google and create one, or set GOOGLE_SHEET_ID (developers: `npm run sheet:init`).");
}
/**
* The live connection for oauth_refresh mode. Undefined in service_account mode, where there is
* nothing for an owner to connect: the deployment already carries its own key.
*/
function getGoogleConnection() {
	if (GOOGLE_AUTH_MODE !== "oauth_refresh") return void 0;
	if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) return void 0;
	if (!googleConnection) googleConnection = new GoogleConnection({
		clientId: GOOGLE_OAUTH_CLIENT_ID,
		clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
		store: getGoogleStore(),
		fallbackRefreshToken: GOOGLE_OAUTH_REFRESH_TOKEN || void 0,
		logger: consoleLogger
	});
	return googleConnection;
}
/**
* The one bearer-token source both APIs share.
*
* In oauth_refresh mode it reads the current refresh token on every renewal, so an authorisation
* made in the browser takes effect on the next request rather than on the next deploy. The
* service-account path is unchanged.
*/
/** Exported for the provisioning endpoint, which creates a spreadsheet before any client exists. */
function getTokens() {
	const connection = getGoogleConnection();
	if (connection) return { getAccessToken: () => connection.getAccessToken() };
	if (!tokens) tokens = createTokenSource(authFromEnv(env));
	return tokens;
}
/** The live sheet id, or undefined — the question `activeSheetId()` answers by throwing. */
function sheetIdIfAny() {
	const fromEnv = (GOOGLE_SHEET_ID ?? "").trim();
	if (fromEnv) return fromEnv;
	return getSheetIdStore().read()?.id;
}
/**
* Drops the Sheets client and the snapshot cache.
*
* Both are built once, around the sheet id that existed at the time — so after the studio provisions
* a catalogue from /admin/google the singletons still point at "no sheet" and every request would
* keep failing until a restart. Called immediately after the id is stored.
*/
function resetSheetClient() {
	client = void 0;
	cache = void 0;
}
function getClient() {
	if (!client) {
		const connection = getGoogleConnection();
		client = new SheetsClient({
			spreadsheetId: activeSheetId(),
			auth: connection ? {
				mode: "oauth_refresh",
				clientId: GOOGLE_OAUTH_CLIENT_ID ?? "",
				clientSecret: GOOGLE_OAUTH_CLIENT_SECRET ?? "",
				refreshToken: ""
			} : authFromEnv(env),
			logger: consoleLogger
		}, getTokens());
	}
	return client;
}
function getCache() {
	if (!cache) {
		const c = getClient();
		cache = new CatalogueCache({
			load: () => fetchRanges(c),
			loadMeta: () => fetchMeta(c),
			parse: (ranges) => snapshotFromRanges(ranges),
			ttlMs: Math.max(5, SHEETS_CACHE_TTL) * 1e3,
			logger: consoleLogger,
			persistPath: DATA_DIR ? join(DATA_DIR, "catalogue.json") : void 0,
			windowRows: REACTIONS_WINDOW_ROWS
		});
	}
	return cache;
}
/** The snapshot for a page render, or the reference's error text when nothing can be served. */
async function loadCatalogue() {
	try {
		const snapshot = await getCache().get();
		photoMonitor.schedule(snapshot.catalogue.rugs);
		return { snapshot };
	} catch (e) {
		consoleLogger.error("no catalogue available", { error: serializeError(e) });
		return { error: "could not load the catalogue" };
	}
}
/** Global-fetch-shaped wrapper over undici with the DNS-time BlockList agent (§4.3): image downloads only. */
var guardedFetch = (input, init) => fetch$1(input, {
	...init,
	dispatcher: guardedAgent()
});
/**
* Rates come from the catalogue snapshot, read with `peek()` — the IN-MEMORY snapshot, which this
* deliberately does not load: the conversion is synchronous and a scrape must not block on a sheet
* read. On a cold process that snapshot is empty, so a non-USD supplier price got no conversion and
* therefore no retail suggestion, silently, until some public page happened to warm the cache. The
* admin has no page that warms it, so on a freshly deployed server it could stay cold indefinitely.
*
* `warmRates()` below is what the scrape endpoint calls first; this stays synchronous and simply
* reports "no rate" if it is still cold, which the caller already surfaces as a warning.
*/
function convertToUsd(amount, currency) {
	const code = currency.trim().toUpperCase();
	if (code === "USD") return amount;
	let rates;
	try {
		rates = getCache().peek()?.catalogue.rates;
	} catch {
		return;
	}
	const rate = rates?.find((r) => r.currency === code);
	if (!rate || !(rate.rateToBase > 0)) return void 0;
	return amount / rate.rateToBase;
}
/**
* Loads the catalogue snapshot if it is not already in memory, so the synchronous `convertToUsd`
* above has rates to read. Awaited by the admin scrape endpoint, which is the only place a non-USD
* price is converted and the one admin path that must not depend on a visitor having been here first.
*
* Never fatal: a failure just leaves the conversion cold, which degrades to "no retail suggestion"
* exactly as it did before.
*/
async function warmRates() {
	try {
		if (getCache().peek()) return;
		await getCache().get();
	} catch {}
}
function getAdminDeps() {
	if (!adminDeps) {
		const mode = GOOGLE_AUTH_MODE === "oauth_refresh" ? "oauth_refresh" : "service_account";
		adminDeps = {
			authMode: mode,
			drive: mode === "oauth_refresh" ? createDriveClient({
				getAccessToken: () => getTokens().getAccessToken(),
				download: (url) => defaultDownload(url, guardedFetch),
				folderId: GOOGLE_DRIVE_FOLDER_ID || void 0,
				logger: consoleLogger
			}) : void 0,
			publicImages: createPublicMediaReader({}),
			scrape: {
				jinaFallback: SCRAPE_JINA_FALLBACK ?? true,
				respectRobots: SCRAPE_RESPECT_ROBOTS ?? true
			},
			convertToUsd
		};
	}
	return adminDeps;
}
//#endregion
export { buildAuthUrl as $, slugify as A, RETAIL_MARKUP as At, SETTINGS_SEED as B, sizeLabelOf as C, ADMIN_USER as Ct, displayCollection as D, GOOGLE_OAUTH_CLIENT_ID as Dt, collectionSlugs as E, GOOGLE_AUTH_MODE as Et, PRODUCT_COLS as F, hostnameProblem as G, JINA_HOST as H, PRODUCT_HEADER_LABELS as I, SCRAPED_FIELDS as J, isAllowedImageUrl as K, PRODUCT_WIDTH as L, SheetsClient as M, SITE_URL as Mt, HEADERS as N, TRUSTED_PROXY_HOPS as Nt, joinCollections as O, GOOGLE_OAUTH_CLIENT_SECRET as Ot, LEGACY_COLLECTIONS_HEADERS as P, VOTE_SALT as Pt, GoogleAuthError as Q, RATES_SEED as R, sizeBandOf as S, ADMIN_SESSION_SECRET as St, collectionSlug as T, CLIENT_IP_HEADER as Tt, SUPPLIER_HOSTS as U, TABS as V, guardedAgent as W, SUPPORTED_CURRENCIES as X, ScrapeError as Y, money as Z, columnLetter as _, SheetsApiError as _t, getGoogleConnection as a, missingScopes as at, parseProducts as b, silentLogger as bt, getSheetIdStore as c, sameState as ct, photoMonitor as d, coerceWidth as dt, createPkce as et, ratesFor as f, DRIVE_ID_RE as ft, assertHeaders as g, SheetContractError as gt, warmRates as h, normaliseImageUrl as ht, getClient as i, googleAuthAdvice as it, splitCollections as j, REVALIDATE_SECRET as jt, normaliseKey as k, PUBLIC_CATALOGUE as kt, getTokens as l, driveImageResponse as lt, sheetIdIfAny as m, extractDriveId as mt, getAdminDeps as n, describeToken as nt, getGoogleStore as o, redirectUriFor as ot, resetSheetClient as p, driveImageUrl as pt, validateOutboundUrl as q, getCache as r, exchangeCode as rt, getRates as s, revokeToken as st, baseCurrency as t, createState as tt, loadCatalogue as u, imageMethodNotAllowed as ut, orderedCollectionNames as v, consoleLogger as vt, canonicalCollection as w, AUTH_SECRET as wt, parseTags as x, ADMIN_PASSWORD_HASH as xt, parseCollections as y, serializeError as yt, REFERENCE_COLLECTION_ORDER as z };
