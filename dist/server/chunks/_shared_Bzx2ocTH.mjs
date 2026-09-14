import { L as PRODUCT_WIDTH, N as HEADERS, V as TABS, ht as normaliseImageUrl, i as getClient, n as getAdminDeps, vt as consoleLogger, x as parseTags, y as parseCollections } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime, t as AdminError } from "./http_BC0ewnLg.mjs";
import { _ as clientLink, a as findCollectionByName, b as parseClients, i as fetchAdminSnapshot, l as rowVersion, r as adminRugFromCells, s as findTagByName, x as withoutSecrets } from "./read_BGHurOvf.mjs";
//#region src/pages/api/admin/_shared.ts
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
/** One fresh admin read (never the public route cache). */
async function loadSnapshot(client = getClient()) {
	return fetchAdminSnapshot(client, { logger: consoleLogger });
}
/** Writes to Rugs W:Z need the admin headers in place (§3.1): refuse with a clear 503 otherwise. */
function requireAdminHeaders(snapshot) {
	if (snapshot.report.adminHeaders === "missing") throw new AdminError(503, "sheet not initialised", "Rugs W1:Z1 are blank — run `npm run sheet:init` to add the admin columns before editing rugs.");
}
/** The canonical Collections.name for a typed/selected name (case-insensitive), else 422. */
function resolveCollection(snapshot, name) {
	const hit = findCollectionByName(snapshot, name);
	if (!hit) throw new AdminError(422, "unknown collection", `Collection "${name}" is not in the Collections tab.`, { collection: name });
	return hit.name;
}
/**
* Canonical Collections.name for every requested collection, in the order given, else 422.
*
* De-duplicated case-insensitively on the CANONICAL name, so a body listing both "kilims" and
* "Kilims" resolves to one membership rather than writing the same collection into the cell twice.
* The first unknown name is the one reported: naming all of them would be kinder, but the 422 shape
* in §2.3 carries a single `collection`, and widening it is a spec change, not a bug fix.
*/
function resolveCollections(snapshot, names) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const name of names) {
		const canonical = resolveCollection(snapshot, name);
		const key = canonical.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(canonical);
	}
	return out;
}
/** Canonical Tags.name for every requested tag (case-insensitive, de-duplicated), else 422. */
function resolveTags(snapshot, tags) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const t of tags) {
		const hit = findTagByName(snapshot, t);
		if (!hit) throw new AdminError(422, "unknown tag", `Tag "${t}" is not in the Tags tab — add it first.`, { tag: t });
		const key = hit.name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(hit.name);
	}
	return out;
}
/** RugFields from a validated body plus the resolved slug / collection / tags and the price to store. */
function rugFieldsFrom(body, resolved) {
	return {
		slug: resolved.slug,
		name: body.name,
		description: body.description,
		collections: resolved.collections,
		tags: resolved.tags,
		photos: body.photos,
		widthCm: body.widthCm,
		lengthCm: body.lengthCm,
		material: body.material,
		age: body.age,
		origin: body.origin,
		priceUsd: resolved.priceUsd,
		rotate: body.rotate,
		featured: body.featured,
		status: body.status,
		method: body.method,
		sourceUrl: body.sourceUrl ?? "",
		supplier: body.supplier,
		supplierRef: body.supplierRef,
		notes: body.notes,
		commitStatus: body.commitStatus,
		driveFolderId: body.driveFolderId,
		driveFolderUrl: body.driveFolderUrl,
		scrapedAt: resolved.scrapedAt
	};
}
/** The writable fields of a rug as read (what an unchanged save would write back). */
function fieldsOfRug(rug) {
	return {
		slug: rug.slug,
		name: rug.name,
		description: rug.description,
		collections: [...rug.collections],
		tags: [...rug.tags],
		photos: [...rug.photos],
		widthCm: rug.widthCm,
		lengthCm: rug.lengthCm,
		material: rug.material,
		age: rug.age,
		origin: rug.origin,
		priceUsd: rug.priceUsd,
		rotate: rug.rotate,
		featured: rug.featured,
		status: rug.status,
		method: rug.method,
		sourceUrl: rug.sourceUrl,
		supplier: rug.supplier,
		supplierRef: rug.supplierRef,
		notes: rug.notes,
		commitStatus: rug.commitStatus,
		driveFolderId: rug.driveFolderId,
		driveFolderUrl: rug.driveFolderUrl,
		/**
		* Server-owned provenance, carried through rather than re-derived.
		*
		* `productFieldsToCells` writes a FULL-WIDTH row and sets `cells[scrapedAt] = f.scrapedAt ?? ''`,
		* so anything that rebuilds the row from a `RugFields` without this field silently erases the
		* column. The create and retry paths both remembered to stamp it inline; `fieldsOfRug` did not,
		* so a status change blanked it — and `rugFieldsFrom` did not either, so did every ordinary edit.
		*/
		scrapedAt: rug.scrapedAt
	};
}
var STATUSES = /* @__PURE__ */ new Set([
	"active",
	"draft",
	"archived",
	"all"
]);
/** Client-side filtering is the norm; the server filter exists for scripts and the `?q=` deep link. */
function filterRugs(rugs, status, q) {
	const wanted = status && STATUSES.has(status) ? status : "all";
	const needle = (q ?? "").trim().toLowerCase();
	return rugs.filter((r) => {
		if (wanted !== "all" && r.status !== wanted) return false;
		if (!needle) return true;
		return [
			r.name,
			r.id,
			r.supplierRef,
			r.slug
		].some((s) => s.toLowerCase().includes(needle));
	});
}
/** Ids reserved by `rug.create` audit rows (a create whose verify failed still burnt its number). */
function reservedIds(snapshot) {
	return snapshot.audit.filter((a) => a.action === "rug.create").map((a) => a.targetId);
}
/** '' clears; anything else must be a Drive id/URL or an allow-listed https URL (stored as typed). */
function checkCover(input) {
	const s = input.trim();
	if (!s) return "";
	const res = normaliseImageUrl(s);
	if (!res.url) throw new AdminError(400, "bad cover", `Cover image: ${res.reason ?? "not usable"}`);
	return s;
}
/** Plain object (undefined → null) so `diffFields` and the audit JSON see every key. */
function auditable(fields) {
	const out = {};
	for (const [k, v] of Object.entries(fields)) out[k] = v === void 0 ? null : v;
	return out;
}
var text = (v) => v === void 0 || v === null ? "" : String(v);
async function freshRug(client, row, id) {
	const [vr] = await client.batchGet([`${TABS.products}!A${row}:AP${row}`]);
	const cells = (vr?.values?.[0] ?? []).slice(0, PRODUCT_WIDTH);
	const rug = adminRugFromCells(cells, row);
	if (!rug || rug.id !== id) throw new AdminError(500, "verify failed", `Products row ${row} does not read back as ${id}`);
	return rug;
}
async function freshCollection(client, row) {
	const [vr] = await client.batchGet([`${TABS.collections}!A${row}:G${row}`]);
	const cells = vr?.values?.[0] ?? [];
	const c = parseCollections([[...HEADERS.Collections], cells]).items[0];
	if (!c) throw new AdminError(500, "verify failed", `Collections row ${row} does not parse after the write`);
	return {
		...c,
		row,
		version: rowVersion(cells, HEADERS.Collections.length)
	};
}
async function freshTag(client, row) {
	const [vr] = await client.batchGet([`${TABS.tags}!A${row}:D${row}`]);
	const cells = vr?.values?.[0] ?? [];
	const t = parseTags([[...HEADERS.Tags], cells]).items[0];
	if (!t) throw new AdminError(500, "verify failed", `Tags row ${row} does not parse after the write`);
	return {
		...t,
		row,
		version: rowVersion(cells, HEADERS.Tags.length)
	};
}
async function freshClient(client, row) {
	const [vr] = await client.batchGet([`${TABS.customers}!A${row}:F${row}`]);
	const cells = vr?.values?.[0] ?? [];
	const c = parseClients([[...HEADERS.Customers], cells]).items[0];
	if (!c) throw new AdminError(500, "verify failed", `Customers row ${row} does not parse after the write`);
	return {
		...c,
		row,
		version: rowVersion(cells, HEADERS.Customers.length)
	};
}
/**
* Clients as the UI shows them: the link always regenerated from the runtime SITE_URL (§3.2), and
* the stored password hash stripped.
*
* This used to spread `c` wholesale, which carried `passwordHash` into every clients API response
* and into the admin page's embedded JSON. A scrypt hash is not a password, but publishing one for
* every buyer turns a single admin-session leak into an offline cracking target for the whole list.
*/
function clientView(c) {
	return {
		...withoutSecrets(c),
		link: clientLink(adminRuntime.siteUrl, c.code)
	};
}
/** Raw `A{row}:D{row}` of a Settings row → its whole-row version token (the parsed rows carry none). */
async function settingsRowVersion(client, row) {
	const [vr] = await client.batchGet([`${TABS.settings}!A${row}:D${row}`]);
	const cells = vr?.values?.[0] ?? [];
	return {
		version: rowVersion(cells, HEADERS.Settings.length),
		key: text(cells[0]).trim(),
		cells
	};
}
/**
* Refreshes `adminRuntime.driveScopeOk` from the Drive client (cached inside it, 10 min). Never
* throws; undefined when no client can be built (service-account mode reports false).
*/
async function driveScope() {
	let deps;
	try {
		deps = getAdminDeps();
	} catch {
		return;
	}
	if (!deps.drive) {
		adminRuntime.driveScopeOk = false;
		return;
	}
	try {
		const status = await deps.drive.scopeStatus();
		adminRuntime.driveScopeOk = status.driveScopeOk;
		return status;
	} catch {
		adminRuntime.driveScopeOk = false;
		return;
	}
}
//#endregion
export { rugFieldsFrom as _, fieldsOfRug as a, freshCollection as c, loadSnapshot as d, nowIso as f, resolveTags as g, resolveCollections as h, driveScope as i, freshRug as l, reservedIds as m, checkCover as n, filterRugs as o, requireAdminHeaders as p, clientView as r, freshClient as s, auditable as t, freshTag as u, settingsRowVersion as v };
