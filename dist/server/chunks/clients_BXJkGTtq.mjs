import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, H as unescapeHTML, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { n as templateEnter, r as templateExit, t as $$Modal } from "./Modal_BPowp8-c.mjs";
import { i as getClient, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime } from "./http_BC0ewnLg.mjs";
import { _ as clientLink, d as syncLabel, i as fetchAdminSnapshot, x as withoutSecrets } from "./read_BGHurOvf.mjs";
import { o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { n as $$Icon, t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
import { t as $$CopyButton } from "./CopyButton_CYCU1ILJ.mjs";
import { t as $$Button } from "./Button_B8W6yTa7.mjs";
import { t as $$EmptyState } from "./EmptyState_Ngnao7-F.mjs";
//#region src/components/ui/CredentialPanel.astro
createAstro("https://astro.build");
var $$CredentialPanel = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$CredentialPanel;
	const { url, password, title = "Link created", class: className } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<section${addAttribute(["credential", className], "class:list")}${addAttribute(title, "aria-label")}> <div class="credential__head"> <h2 class="credential__title">${title}</h2> <p class="credential__note">This is the only time the password is shown.</p> </div> <div class="credential__field"> <span class="credential__label" id="cred-url-label">Preview URL</span> <div class="credential__value"> <span data-credential-url>${url}</span> <button type="button" class="credential__copy"${addAttribute(url, "data-copy")} data-copy-what="url" aria-describedby="cred-url-label"> ${renderComponent($$result, "Icon", $$Icon, { "name": "copy" })} <span class="sr-only">Copy preview URL</span> </button> </div> </div> <div class="credential__field"> <span class="credential__label" id="cred-pw-label">Password</span> <div class="credential__value"> <span data-credential-password>${password}</span> <button type="button" class="credential__copy"${addAttribute(password, "data-copy")} data-copy-what="password" aria-describedby="cred-pw-label"> ${renderComponent($$result, "Icon", $$Icon, { "name": "copy" })} <span class="sr-only">Copy password</span> </button> </div> </div> <p class="credential__warning"> ${renderComponent($$result, "Icon", $$Icon, { "name": "alert" })} <span>
Once you close this, the password can only be regenerated — which stops the old one working.
</span> </p> ${renderComponent($$result, "Button", $$Button, {
		"style": "primary",
		"data-copy": `${url}\n${password}`,
		"class": "credential__both"
	}, { "default": ($$result) => renderTemplate`
Copy link and password
` })} </section>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/ui/CredentialPanel.astro", void 0);
//#endregion
//#region src/pages/admin/clients.astro
var clients_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Clients,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
var $$Clients = createComponent(async ($$result, $$props, $$slots) => {
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin clients read failed", { error: safe });
		error = safe.message;
	}
	const clients = (snapshot?.clients ?? []).map((c) => ({
		...withoutSecrets(c),
		link: clientLink(adminRuntime.siteUrl, c.code)
	}));
	const data = {
		clients,
		siteOrigin: new URL(adminRuntime.siteUrl).origin
	};
	const syncLabel_ = snapshot ? syncLabel(snapshot.fetchedAt) : void 0;
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Customers",
		"active": "clients",
		"meta": syncLabel_
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}${renderComponent($$result, "Modal", $$Modal, {
		"id": "new-client",
		"title": "New customer link"
	}, { "default": ($$result) => renderTemplate` <p>
One name. The link is generated for you — a scrambled address that cannot be guessed from the name — and
      the password is shown once, immediately after.
</p> <div class="modal__fields"> <div class="row"> <div class="grow"> <input id="cl_name" placeholder="Client name — e.g. Nadia" autocomplete="off" aria-label="Client name"> </div> <div class="grow"> <input id="cl_note" placeholder="Note (optional)" autocomplete="off" aria-label="Note"> </div> <div class="grow"> <input id="cl_pw" placeholder="Password (optional)" autocomplete="off" aria-label="Password" maxlength="200"> </div> <button class="go" id="btnGenerate" type="button">Generate link</button> </div> <p class="hint">
Generated on create, in a readable four-part format so it survives WhatsApp and can be read aloud.
        Shown once, immediately after. Type your own instead if you would rather; eight characters or more.
</p> <div id="m8" class="msg"></div>  <div id="linkOut" class="stack" hidden> ${renderComponent($$result, "CredentialPanel", $$CredentialPanel, {
		"url": "",
		"password": ""
	})} <p class="hint">
Code <span class="mono" id="linkCode"></span> — <span id="linkNote"></span> </p> </div> </div> ` })} <section class="stack" aria-labelledby="h-clients"> <div class="page-head"> <div class="page-head__titles"> <h1 class="page-head__title">Customers</h1> <p class="page-head__count"> ${clients.length} ${clients.length === 1 ? "link" : "links"} </p> </div> <span class="page-head__rule"></span> ${renderComponent($$result, "Button", $$Button, {
		"icon": "plus",
		"data-open": "new-client"
	}, { "default": ($$result) => renderTemplate`New customer link` })} </div> <div id="m9" class="msg"></div> ${clients.length === 0 && renderTemplate`${renderComponent($$result, "EmptyState", $$EmptyState, {
		"type": "first-run",
		"title": "No customer links yet",
		"message": "A customer link is a private preview of the catalogue, opened with a password you give them."
	})}`} <div class="table-wrap"${addAttribute(clients.length === 0, "hidden")}> <table id="clientTable"> <thead> <tr> <th>Customer</th> <th>Link</th> <th>Created</th> <th>Visited</th> <th>Last seen</th> <th>Active</th> <th></th> </tr> </thead> <tbody> ${clients.map((c) => renderTemplate`<tr${addAttribute(c.code, "data-code")}${addAttribute(c.version, "data-version")}${addAttribute(c.status, "data-status")}>  <td> <a${addAttribute(`/admin/clients/${encodeURIComponent(c.code)}`, "href")}>${c.name}</a> </td> <td class="mono"> <a${addAttribute(c.link, "href")} target="_blank" rel="noopener"> ${c.link} </a> </td> <td>${c.createdAt}</td> <td> <span class="badge" data-visits>
Not visited
</span> </td> <td data-last-seen>—</td> <td> <label class="toggle"> <input type="checkbox" role="switch" class="toggle__track" data-act="toggle"${addAttribute(c.status === "active", "checked")}${addAttribute(`Link active for ${c.name}`, "aria-label")}> </label> </td> <td class="acts"> ${renderComponent($$result, "CopyButton", $$CopyButton, {
		"value": c.link,
		"label": "Copy link"
	})} <button type="button" class="btn btn--ghost" data-act="password">
Reset password
</button> </td> </tr>`)} </tbody> </table> </div>  ${clients.length > 0 && renderTemplate`<p class="hint">
Copy-link is the most-used action here — the control changes icon, label and colour for 2 seconds. A
        toast alone is missable when copying several in a row.
</p>`} </section> <section class="stack" aria-labelledby="h-access"> <h3 id="h-access">Access log</h3> <p class="hint">
Who has opened their link, and when. One entry per visit; repeat views inside half an hour count once.
      The table above fills in from the same read.
</p> <div class="actions"> <button class="go alt" id="btnVisits" type="button">Refresh</button> </div> <div id="m11" class="msg"></div> <div id="visitsOut"></div> </section> <section class="stack" aria-labelledby="h-report"> <h3 id="h-report">Client saves</h3> <div class="actions"> <button class="go alt" id="btnReport" type="button">Refresh</button> </div> <div id="m10" class="msg"></div> <div id="reportOut"></div> </section> <dialog id="pwDialog"> <form method="dialog" class="stack"> <h3 id="pwDialogTitle">Reset password</h3> <p class="hint">
Leave it blank to generate one. The new password is shown once and replaces the old one immediately;
        the buyer stays signed in until their session expires.
</p> <input id="pwDialogInput" placeholder="New password (optional)" autocomplete="off" aria-label="New password" maxlength="200"> <p class="msg err" id="pwDialogErr" hidden></p> <div class="actions"> <button class="go" id="pwDialogOk" type="button">Set password</button> <button class="go alt" id="pwDialogCancel" type="button">Cancel</button> </div> </form> </dialog> <template id="copyTpl">${templateEnter($$result)}${renderComponent($$result, "CopyButton", $$CopyButton, {
		"value": "",
		"label": "Copy link"
	})}${templateExit($$result)}</template> <script type="application/json" id="admin-data">${unescapeHTML(jsonForScript(data))}<\/script>${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/clients.astro?astro&type=script&index=0&lang.ts")}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/clients.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/clients.astro";
var $$url = "/admin/clients";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/clients@_@astro
var page = () => clients_exports;
//#endregion
export { page };
