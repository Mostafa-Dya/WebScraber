import { V as TABS, g as assertHeaders } from "./runtime_r-OJmEZZ.mjs";
//#region src/lib/admin/visits.ts
/** Bounded like the saves report: the same growth breaker governs both append-only logs. */
var VISITS_READ_RANGE = `${TABS.visits}!A1:E200001`;
var SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Anything that is not a plausible ISO timestamp is treated as unknown rather than sorted wrongly. */
var ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
var text = (v) => v === void 0 || v === null ? "" : String(v).trim();
/** Parses the tab into entries, newest first, dropping anything malformed. */
function parseVisits(values) {
	assertHeaders(TABS.visits, values?.[0]);
	const entries = [];
	let dropped = 0;
	if (!values) return {
		entries,
		dropped
	};
	for (let i = 1; i < values.length; i++) {
		const cells = values[i] ?? [];
		if (cells.every((c) => text(c) === "")) continue;
		const customerSlug = text(cells[1]);
		if (!SLUG_RE.test(customerSlug)) {
			dropped++;
			continue;
		}
		const occurredAt = text(cells[2]);
		entries.push({
			customerSlug,
			occurredAt: ISO_RE.test(occurredAt) ? occurredAt : "",
			userAgent: text(cells[3]),
			referrer: text(cells[4])
		});
	}
	return {
		entries,
		dropped
	};
}
function buildVisitsReport(values, clients, now = Date.now) {
	const { entries, dropped } = parseVisits(values);
	const known = new Map(clients.map((c) => [c.code.toLowerCase(), c]));
	const byCode = /* @__PURE__ */ new Map();
	for (const e of entries) {
		const key = e.customerSlug.toLowerCase();
		const client = known.get(key);
		let row = byCode.get(key);
		if (!row) {
			row = {
				code: e.customerSlug,
				name: client?.name || e.customerSlug,
				known: Boolean(client),
				...client ? { status: client.status } : {},
				visits: 0,
				firstSeen: "",
				lastSeen: "",
				devices: []
			};
			byCode.set(key, row);
		}
		row.visits += 1;
		if (e.occurredAt) {
			if (!row.lastSeen || e.occurredAt > row.lastSeen) row.lastSeen = e.occurredAt;
			if (!row.firstSeen || e.occurredAt < row.firstSeen) row.firstSeen = e.occurredAt;
		}
		if (e.userAgent && !row.devices.includes(e.userAgent)) row.devices.push(e.userAgent);
	}
	for (const c of clients) {
		if (byCode.has(c.code.toLowerCase())) continue;
		byCode.set(c.code.toLowerCase(), {
			code: c.code,
			name: c.name,
			known: true,
			status: c.status,
			visits: 0,
			firstSeen: "",
			lastSeen: "",
			devices: []
		});
	}
	const byClient = [...byCode.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name));
	const recent = entries.slice(0, 25).map((e) => {
		const client = known.get(e.customerSlug.toLowerCase());
		return {
			...e,
			name: client?.name || e.customerSlug,
			known: Boolean(client)
		};
	});
	return {
		generatedAt: new Date(now()).toISOString(),
		byClient,
		recent,
		rowsRead: entries.length,
		rowsDropped: dropped
	};
}
//#endregion
export { buildVisitsReport as n, VISITS_READ_RANGE as t };
