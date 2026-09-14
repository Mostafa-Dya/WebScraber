import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { a as getGoogleConnection, o as getGoogleStore, st as revokeToken } from "./runtime_r-OJmEZZ.mjs";
import { i as adminPost, l as methodNotAllowed, o as auditBase, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import * as z from "zod";
//#region src/pages/api/admin/google/disconnect.ts
var disconnect_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(z.object({}).passthrough(), async ({ context }) => {
	const store = getGoogleStore();
	const stored = store.read();
	const revoked = stored?.refreshToken ? await revokeToken(stored.refreshToken) : false;
	store.clear();
	getGoogleConnection()?.invalidate();
	await recordAuditEvent({
		...auditBase(context),
		action: "auth.google",
		targetTab: "-",
		targetId: "google",
		after: {
			disconnected: true,
			revokedAtGoogle: revoked
		}
	});
	return noStore({
		ok: true,
		revoked
	});
});
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/google/disconnect@_@ts
var page = () => disconnect_exports;
//#endregion
export { page };
