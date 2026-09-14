import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { i as getClient, r as getCache, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { r as adminHealth } from "./http_BC0ewnLg.mjs";
import { i as fetchAdminSnapshot, n as adminCounts } from "./read_BGHurOvf.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
//#region src/pages/admin/index.astro
var admin_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin dashboard read failed", { error: safe });
		error = safe.message;
	}
	const counts = snapshot ? adminCounts(snapshot) : void 0;
	let snapshotAgeSec = null;
	let lastRefreshOk = null;
	try {
		const h = getCache().health();
		snapshotAgeSec = h.snapshotAgeSec;
		lastRefreshOk = h.lastRefreshOk;
	} catch {}
	const health = adminHealth();
	const audit = snapshot?.audit.slice(0, 10) ?? [];
	const droppedRows = snapshot?.report.dropped.length ?? 0;
	const settingsWarnings = snapshot?.settings.warnings ?? [];
	const drive = health.driveScopeOk === null ? "not checked" : health.driveScopeOk ? "ok" : "not authorised";
	const links = [
		["/admin/rugs/new", "Add a rug"],
		["/admin/rugs", "Catalogue"],
		["/admin/collections", "Collections & tags"],
		["/admin/clients", "Client links"],
		["/admin/audit", "Audit log"],
		["/api/health", "Site health (JSON)"]
	];
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Admin",
		"active": "dashboard"
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}${snapshot?.report.adminHeaders === "missing" && renderTemplate`<div class="msg err on">
Rugs W1:Z1 are blank (source_url, supplier, supplier_ref, notes). Run${" "} <span class="kbd">npm run sheet:init</span>
to add the admin columns and tabs before editing.
</div>`}${settingsWarnings.map((w) => renderTemplate`<div class="msg busy on">${w}</div>`)}<section class="stack" aria-labelledby="h-counts"> <h3 id="h-counts">Catalogue</h3> <div class="stats"> <div class="stat"> <div class="k">Active rugs</div> <div class="v">${counts ? counts.rugs.active : "—"}</div> </div> <div class="stat"> <div class="k">Drafts</div> <div class="v">${counts ? counts.rugs.draft : "—"}</div> </div> <div class="stat"> <div class="k">Archived</div> <div class="v">${counts ? counts.rugs.archived : "—"}</div> </div> <div class="stat"> <div class="k">Collections</div> <div class="v">${counts ? counts.collections : "—"}</div> </div> <div class="stat"> <div class="k">Tags</div> <div class="v">${counts ? counts.tags : "—"}</div> </div> <div class="stat"> <div class="k">Clients</div> <div class="v"> ${counts ? counts.clients.active : "—"} ${counts && counts.clients.revoked > 0 && renderTemplate`<small>+${counts.clients.revoked} revoked</small>`} </div> </div> </div> </section> <section class="stack" aria-labelledby="h-health"> <h3 id="h-health">Health</h3> <div class="stats"> <div class="stat"> <div class="k">Public snapshot age</div> <div class="v"> ${snapshotAgeSec === null ? "—" : `${snapshotAgeSec} s`} ${lastRefreshOk === false && renderTemplate`<small>last refresh failed</small>`} </div> </div> <div class="stat"> <div class="k">Drive scope</div> <div class="v">${drive}</div> </div> <div class="stat"> <div class="k">Admin write failures</div> <div class="v">${health.adminWriteFailures}</div> </div> <div class="stat"> <div class="k">Rows dropped by validation</div> <div class="v">${snapshot ? droppedRows : "—"}</div> </div> </div> ${snapshot && droppedRows > 0 && renderTemplate`<div class="table-wrap"> <table> <thead> <tr> <th>Tab</th> <th>Row</th> <th>Issues</th> </tr> </thead> <tbody> ${snapshot.report.dropped.slice(0, 10).map((d) => renderTemplate`<tr> <td>${d.tab}</td> <td class="mono">${d.row}</td> <td class="mono">${d.issues.join("; ")}</td> </tr>`)} </tbody> </table> </div>`} </section> <section class="stack" aria-labelledby="h-audit"> <h3 id="h-audit">Newest audit rows</h3> ${audit.length === 0 && renderTemplate`<div class="msg busy on">No audit rows yet.</div>`} ${audit.length > 0 && renderTemplate`<div class="table-wrap"> <table> <thead> <tr> <th>Time</th> <th>Actor</th> <th>Action</th> <th>Target</th> <th>Note</th> </tr> </thead> <tbody> ${audit.map((a) => renderTemplate`<tr> <td class="mono"${addAttribute(a.timestamp, "data-ts")}> ${a.timestamp} </td> <td>${a.actor}</td> <td class="mono">${a.action}</td> <td class="mono"> ${a.targetTab} ${a.targetId} </td> <td class="mono">${a.note}</td> </tr>`)} </tbody> </table> </div>`} <p class="hint"> <a href="/admin/audit">Open the full log</a> </p> </section> <section class="stack links" aria-labelledby="h-links"> <h3 id="h-links">Quick links</h3> <p>${links.map(([href, label]) => renderTemplate`<a${addAttribute(href, "href")}>${label}</a>`)}</p> </section> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/index.astro?astro&type=script&index=0&lang.ts")}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/index.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/index.astro";
var $$url = "/admin";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/index@_@astro
var page = () => admin_exports;
//#endregion
export { page };
