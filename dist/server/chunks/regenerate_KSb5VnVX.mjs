import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { i as hashCustomerPassword, r as generatePassword } from "./auth_rJQKmKue.mjs";
import { _ as updateRow, i as adminPost, l as methodNotAllowed, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { C as CLIENT_CODE_RE, G as buildAuditRow, T as ClientPassword, v as clientToCells } from "./read_BGHurOvf.mjs";
import { d as loadSnapshot, r as clientView, s as freshClient } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/clients/[code]/regenerate.ts
var regenerate_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(ClientPassword, async ({ context, body }) => {
	const code = context.params.code;
	if (!code || !CLIENT_CODE_RE.test(code)) throw new AdminError(404, "not found", "no such client");
	const client = getClient();
	const current = (await loadSnapshot(client)).clients.find((c) => c.code.toLowerCase() === code.toLowerCase());
	if (!current) throw new AdminError(404, "not found", `client "${code}" is not in the sheet`);
	const password = body.password?.trim() || generatePassword();
	const audit = buildAuditRow({
		...auditBase(context),
		action: "client.password",
		targetTab: "Customers",
		targetId: current.code,
		after: { password: body.password ? "chosen" : "regenerated" },
		note: `row ${current.row}`
	});
	const result = await updateRow(client, {
		tab: TABS.customers,
		row: current.row,
		version: body.version,
		cells: clientToCells({
			...current,
			passwordHash: hashCustomerPassword(password)
		}),
		audit,
		expectFirstCell: current.code
	});
	const updated = clientView(await freshClient(client, current.row));
	return noStore({
		ok: true,
		client: updated,
		password,
		audit: result.audit
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/clients/[code]/regenerate@_@ts
var page = () => regenerate_exports;
//#endregion
export { page };
