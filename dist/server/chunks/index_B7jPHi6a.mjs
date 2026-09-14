import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { V as TABS, i as getClient } from "./runtime_r-OJmEZZ.mjs";
import { i as hashCustomerPassword, r as generatePassword } from "./auth_rJQKmKue.mjs";
import { a as adminRuntime, i as adminPost, l as methodNotAllowed, m as insertTopRow, n as adminGet, o as auditBase, t as AdminError } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { G as buildAuditRow, _ as clientLink, v as clientToCells, w as ClientInput, y as newClientCode } from "./read_BGHurOvf.mjs";
import { d as loadSnapshot, f as nowIso, r as clientView, s as freshClient } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/admin/clients/index.ts
var clients_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	POST: () => POST,
	prerender: () => false
});
var GET = adminGet(async () => {
	const snapshot = await loadSnapshot();
	return noStore({
		ok: true,
		clients: snapshot.clients.map(clientView)
	});
});
var POST = adminPost(ClientInput, async ({ context, body, actor }) => {
	const client = getClient();
	const snapshot = await loadSnapshot(client);
	const code = newClientCode(body.name, snapshot.clients.map((c) => c.code));
	const link = clientLink(adminRuntime.siteUrl, code);
	const password = body.password?.trim() || generatePassword();
	const passwordHash = hashCustomerPassword(password);
	const audit = buildAuditRow({
		...auditBase(context),
		action: "client.create",
		targetTab: "Customers",
		targetId: code,
		after: {
			code,
			name: body.name,
			note: body.note,
			password: body.password ? "chosen" : "generated"
		}
	});
	const result = await insertTopRow(client, {
		precheck: async () => {
			if ((await loadSnapshot(client)).clients.some((c) => c.code.trim().toLowerCase() === code.toLowerCase())) throw new AdminError(409, "code taken", "That preview link was just taken by another customer — press Add again to get a new one.", { code });
		},
		tab: TABS.customers,
		cells: clientToCells({
			code,
			name: body.name,
			note: body.note,
			status: "active",
			createdAt: nowIso(),
			createdBy: actor,
			link,
			passwordHash
		}),
		audit
	});
	const created = clientView(await freshClient(client, result.row));
	return noStore({
		ok: true,
		client: created,
		password,
		audit: result.audit
	}, 201);
});
var ALL = methodNotAllowed("GET, POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/clients/index@_@ts
var page = () => clients_exports;
//#endregion
export { page };
