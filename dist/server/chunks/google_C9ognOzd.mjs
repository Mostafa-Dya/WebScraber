import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { Dt as GOOGLE_OAUTH_CLIENT_ID, Et as GOOGLE_AUTH_MODE, a as getGoogleConnection, at as missingScopes, c as getSheetIdStore, it as googleAuthAdvice, m as sheetIdIfAny, o as getGoogleStore, ot as redirectUriFor } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime } from "./http_BC0ewnLg.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$Button } from "./Button_B8W6yTa7.mjs";
import { t as $$Input } from "./Input_DRZzK1XW.mjs";
//#region src/pages/admin/google.astro
var google_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Google,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Google = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Google;
	const mode = GOOGLE_AUTH_MODE;
	const health = getGoogleConnection()?.health();
	const store = getGoogleStore();
	const redirectUri = redirectUriFor(adminRuntime.siteUrl);
	const configured = Boolean(GOOGLE_OAUTH_CLIENT_ID);
	const scopesKnown = health?.source === "stored";
	const missing = scopesKnown ? missingScopes(health.scopes) : [];
	const advice = health?.connected ? googleAuthAdvice(health.scopes, { scopesKnown }) : [];
	const outcome = Astro.url.searchParams.get("google");
	const detail = (Astro.url.searchParams.get("detail") ?? "").slice(0, 200);
	const message = outcome ? {
		connected: "Connected. The site will keep itself signed in from here.",
		denied: "You cancelled, or Google refused the request.",
		expired: "That authorisation took too long or was already used.",
		bad_state: "The reply did not match the request, so it was rejected.",
		no_code: "Google sent no authorisation code.",
		not_configured: "The OAuth client id and secret are not set.",
		failed: "The exchange with Google failed."
	}[outcome] ?? "Something went wrong." : void 0;
	const sheetId = sheetIdIfAny();
	const sheetStore = getSheetIdStore();
	const storedSheet = sheetStore.read();
	const sheetFromEnv = Boolean(sheetId && !storedSheet);
	Boolean(health?.connected) && !sheetId && sheetStore.durable;
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Google",
		"active": "google"
	}, { "default": ($$result) => renderTemplate`${message && renderTemplate`${maybeRenderHead($$result)}<div${addAttribute([
		"msg",
		"on",
		outcome === "connected" ? "ok" : "err"
	], "class:list")}> ${message} ${detail} </div>`}<section class="stack" aria-labelledby="h-google"> <h3 id="h-google">Google account</h3> ${mode === "service_account" ? renderTemplate`<p class="hint">
This deployment authenticates with a service-account key, so there is no account to connect. Switch${" "} <span class="mono">GOOGLE_AUTH_MODE</span> to <span class="mono">oauth_refresh</span> to use a
          Google account instead.
</p>` : !configured ? renderTemplate`<p class="hint">
Set <span class="mono">GOOGLE_OAUTH_CLIENT_ID</span> and${" "} <span class="mono">GOOGLE_OAUTH_CLIENT_SECRET</span> before connecting.
</p>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <dl class="kv"> <div> <dt>Status</dt> <dd${addAttribute(["status", health?.connected ? "active" : "revoked"], "class:list")}> ${health?.connected ? "connected" : "not connected"} </dd> </div> ${health?.account && renderTemplate`<div> <dt>Account</dt> <dd class="mono">${health.account}</dd> </div>`} <div> <dt>Permissions</dt> <dd class="mono"> ${health?.scopes.length ? health.scopes.join(" ") : scopesKnown ? "—" : "not recorded for a token from the environment"} </dd> </div> <div> <dt>Connected</dt> <dd class="mono">${health?.connectedAt ?? "—"}</dd> </div> <div> <dt>Last used</dt> <dd class="mono">${health?.lastRefreshAt ?? "never"}</dd> </div> <div> <dt>Token from</dt> <dd class="mono">${health?.source}</dd> </div> </dl> ${health?.lastError && renderTemplate`<div class="msg err on">Last failure: ${health.lastError}</div>`} ${missing.length > 0 && renderTemplate`<div class="msg err on">
Missing permission${missing.length === 1 ? "" : "s"}: ${missing.join(" ")}. Connect again and
              approve both.
</div>`} ${health?.connected && !scopesKnown && renderTemplate`<p class="hint">
This connection comes from <span class="mono">GOOGLE_OAUTH_REFRESH_TOKEN</span>, so the site did
              not record which permissions it carries. Press Reconnect to authorise from here instead; the
              stored authorisation then takes precedence and this page can show its state.
</p>`} ${!store.durable && renderTemplate`<div class="msg busy on"> <span class="mono">DATA_DIR</span> is not set, so this connection is held in memory only and
              will be lost when the server restarts. Set it to a writable directory to keep it.
</div>`} <div class="actions"> <a class="go" href="/api/admin/google/start?next=/admin/google"> ${health?.connected ? "Reconnect" : "Connect Google account"} </a> ${health?.connected && renderTemplate`<button class="go alt" id="btnDisconnect" type="button">
Disconnect
</button>`} </div> <div id="m12" class="msg"></div> <h4>How long it lasts</h4> <ul class="hint"> ${(advice.length ? advice : googleAuthAdvice([], { scopesKnown: false })).map((line) => renderTemplate`<li>${line}</li>`)} </ul> <h4>Before the first connection</h4> <p class="hint">
This exact address has to be listed as an authorised redirect URI on the OAuth client in the
            Google Cloud console, or Google will refuse with <span class="mono">redirect_uri_mismatch</span>:
</p> <div class="row"> <div class="grow"> <input id="redirectUri" readonly${addAttribute(redirectUri, "value")} aria-label="Authorised redirect URI"> </div> <button class="go alt" id="btnCopyRedirect" type="button">
Copy
</button> </div> ` })}`} </section> <section class="stack" aria-labelledby="h-sheet"> <h3 id="h-sheet">Catalogue sheet</h3> ${sheetId ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <p class="hint"> ${sheetFromEnv ? "Set by GOOGLE_SHEET_ID on the server, which is where this site takes its catalogue from." : `Created ${storedSheet?.createdAt?.slice(0, 10) ?? ""}${storedSheet?.createdBy ? ` in ${storedSheet.createdBy}` : ""}.`} </p> <p class="hint"> <a${addAttribute(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, "href")} target="_blank" rel="noopener">
Open the sheet in Google Sheets
</a> </p> ` })}` : !health?.connected ? renderTemplate`<p class="hint">Connect a Google account first — the catalogue is created in that account’s Drive.</p>` : !sheetStore.durable ? renderTemplate`<div class="msg err on">
This server has no writable data directory, so a new sheet’s id would be forgotten when it
          restarts. Set <span class="mono">DATA_DIR</span> and reload this page.
</div>` : renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <p class="hint">
No catalogue yet. This creates a spreadsheet in your Google account, builds every tab and
            column, and installs the formulas. It imports no products — the catalogue starts empty.
</p> <div class="row"> <div class="grow"> ${renderComponent($$result, "Input", $$Input, {
		"type": "text",
		"id": "sheetTitle",
		"name": "title",
		"label": "Name it in your Drive",
		"value": "Serio Ludere — Catalogue"
	})} </div> </div> <div class="actions"> ${renderComponent($$result, "Button", $$Button, {
		"id": "btnCreateSheet",
		"style": "primary"
	}, { "default": ($$result) => renderTemplate`
Create the catalogue sheet
` })} </div> <div id="mSheet" class="msg"></div> ` })}`} </section> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/google.astro?astro&type=script&index=0&lang.ts")}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/google.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/google.astro";
var $$url = "/admin/google";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/google@_@astro
var page = () => google_exports;
//#endregion
export { page };
