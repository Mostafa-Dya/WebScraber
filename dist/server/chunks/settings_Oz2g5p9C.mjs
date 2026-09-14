import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { _ as updateRow, c as invalidateAfterWrite, f as insertRowAtBottom, i as adminPost, l as methodNotAllowed, n as adminGet, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, R as SettingsUpdate, m as parseSettingValue } from "./read_BGHurOvf.mjs";
import { d as loadSnapshot, f as nowIso, v as settingsRowVersion } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/settings.ts
var settings_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	POST: () => POST,
	prerender: () => false
});
var GET = adminGet(async () => {
	const snapshot = await loadSnapshot();
	return noStore({
		ok: true,
		settings: snapshot.settings
	});
});
var POST = adminPost(SettingsUpdate, async ({ context, body, actor }) => {
	const parsed = parseSettingValue(body.key, body.value);
	if (!parsed.ok) throw new AdminError(400, "bad value", parsed.error, { key: body.key });
	const client = getClient();
	const existing = (await loadSnapshot(client)).settings.rows.find((r) => r.key === body.key);
	const value = body.value.trim();
	const cells = [
		body.key,
		value,
		nowIso(),
		actor
	];
	const audit = buildAuditRow({
		...auditBase(context),
		action: "settings.update",
		targetTab: "Settings",
		targetId: body.key,
		before: existing ? { value: existing.value } : void 0,
		after: { value }
	});
	let result;
	if (existing) {
		const raw = await settingsRowVersion(client, existing.row);
		if (raw.key !== body.key) throw new AdminError(409, "row conflict", `Settings row ${existing.row} moved; reload and retry`);
		result = await updateRow(client, {
			tab: TABS.settings,
			row: existing.row,
			version: raw.version,
			cells,
			audit,
			expectFirstCell: body.key
		});
	} else result = await insertRowAtBottom(client, {
		tab: TABS.settings,
		cells,
		audit
	});
	await invalidateAfterWrite(context);
	const fresh = await loadSnapshot(client);
	return noStore({
		ok: true,
		settings: fresh.settings,
		audit: result.audit
	});
});
var ALL = methodNotAllowed("GET, POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/settings@_@ts
var page = () => settings_exports;
//#endregion
export { page };
