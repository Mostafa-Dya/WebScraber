import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { Dt as GOOGLE_OAUTH_CLIENT_ID, Ot as GOOGLE_OAUTH_CLIENT_SECRET, Q as GoogleAuthError, a as getGoogleConnection, ct as sameState, nt as describeToken, o as getGoogleStore, rt as exchangeCode, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime, d as requireSession, l as methodNotAllowed, o as auditBase, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { n as HANDSHAKE_COOKIE, t as handshakes } from "./runtime_DN2CDJRW.mjs";
//#region src/pages/api/admin/google/callback.ts
var callback_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
/** Sends the owner back to the status page with a message rather than showing raw JSON. */
function back(context, next, params) {
	const url = new URL(next, adminRuntime.siteUrl);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return context.redirect(`${url.pathname}${url.search}`, 303);
}
var GET = async (context) => {
	requireSession(context);
	const handshake = handshakes.take(context.cookies.get(HANDSHAKE_COOKIE)?.value);
	context.cookies.delete(HANDSHAKE_COOKIE, {
		path: "/",
		httpOnly: true,
		sameSite: "lax"
	});
	const next = handshake?.next ?? "/admin/google";
	const denied = context.url.searchParams.get("error");
	if (denied) return back(context, next, {
		google: "denied",
		detail: denied.slice(0, 80)
	});
	if (!handshake) return back(context, next, {
		google: "expired",
		detail: "That authorisation was already used or took too long. Start it again."
	});
	const state = context.url.searchParams.get("state") ?? "";
	if (!sameState(state, handshake.state)) return back(context, next, {
		google: "bad_state",
		detail: "The reply did not match the request."
	});
	const code = context.url.searchParams.get("code");
	if (!code) return back(context, next, {
		google: "no_code",
		detail: "Google returned no code."
	});
	if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) return back(context, next, {
		google: "not_configured",
		detail: "The OAuth client is not set."
	});
	try {
		const tokens = await exchangeCode({
			clientId: GOOGLE_OAUTH_CLIENT_ID,
			clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
			redirectUri: handshake.redirectUri,
			code,
			verifier: handshake.verifier
		});
		const info = await describeToken(tokens.accessToken).catch(() => ({ scopes: tokens.scopes }));
		getGoogleStore().write({
			refreshToken: tokens.refreshToken,
			scopes: info.scopes.length ? info.scopes : tokens.scopes,
			account: "email" in info ? info.email : void 0,
			connectedAt: (/* @__PURE__ */ new Date()).toISOString(),
			lastRefreshAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		getGoogleConnection()?.invalidate();
		await recordAuditEvent({
			...auditBase(context),
			action: "auth.google",
			targetTab: "-",
			targetId: "google",
			after: {
				account: "email" in info && info.email || "unknown",
				scopes: info.scopes
			}
		});
		return back(context, next, { google: "connected" });
	} catch (e) {
		consoleLogger.error("google authorisation failed", { error: serializeError(e) });
		return back(context, next, {
			google: "failed",
			detail: (e instanceof GoogleAuthError ? e.message : "The exchange failed. Check the redirect URI and try again.").slice(0, 200)
		});
	}
};
var ALL = methodNotAllowed("GET");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/google/callback@_@ts
var page = () => callback_exports;
//#endregion
export { page };
