import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { F as maybeRenderHead, L as addAttribute, O as renderComponent, P as renderTemplate } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { i as getClient, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { H as AUDIT_ACTIONS, i as fetchAdminSnapshot } from "./read_BGHurOvf.mjs";
import { t as $$AdminLayout } from "./AdminLayout_cxitWCxh.mjs";
//#region src/pages/admin/audit.astro
var audit_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Audit,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
var $$Audit = createComponent(async ($$result, $$props, $$slots) => {
	let snapshot;
	let error;
	try {
		snapshot = await fetchAdminSnapshot(getClient(), { logger: consoleLogger });
	} catch (e) {
		const safe = serializeError(e);
		consoleLogger.error("admin audit read failed", { error: safe });
		error = safe.message;
	}
	const rows = snapshot?.audit ?? [];
	const pretty = (s) => {
		if (!s) return "";
		try {
			return JSON.stringify(JSON.parse(s), null, 2);
		} catch {
			return s;
		}
	};
	return renderTemplate`${renderComponent($$result, "AdminLayout", $$AdminLayout, {
		"title": "Serio Ludere — Audit log",
		"active": "audit"
	}, { "default": ($$result) => renderTemplate`${error && renderTemplate`${maybeRenderHead($$result)}<div class="msg err on">Could not read the sheet: ${error}</div>`}<div class="row"> <div class="narrow"> <select id="f_action" aria-label="Filter by action"> <option value="">Any action</option> ${AUDIT_ACTIONS.map((a) => renderTemplate`<option${addAttribute(a, "value")}>${a}</option>`)} </select> </div> <div class="grow"> <input id="f_target" placeholder="Target id — e.g. SL-021" autocomplete="off" aria-label="Filter by target id"> </div> </div> <p class="hint" id="count" role="status" aria-live="polite"></p> <div class="table-wrap"> <table id="auditTable"> <thead> <tr> <th>Time</th> <th>Actor</th> <th>Action</th> <th>Target</th> <th>Change</th> <th>Note</th> </tr> </thead> <tbody> ${rows.map((a) => renderTemplate`<tr${addAttribute(a.action, "data-action")}${addAttribute(a.targetId.toLowerCase(), "data-target")}${addAttribute(a.row, "data-row")}> <td class="mono">${a.timestamp}</td> <td>${a.actor}</td> <td class="mono">${a.action}</td> <td class="mono"> ${a.targetTab} ${a.targetId} </td> <td> ${(a.before || a.after) && renderTemplate`<details> <summary>before → after</summary> ${a.before && renderTemplate`<pre>${pretty(a.before)}</pre>`} ${a.after && renderTemplate`<pre>${pretty(a.after)}</pre>`} </details>`} </td> <td class="mono">${a.note}</td> </tr>`)} </tbody> </table> </div> ${rows.length === 0 && renderTemplate`<div class="msg busy on">No audit rows yet.</div>`}<div class="actions"> <button class="go alt" id="btnMore" type="button"${addAttribute(rows.length, "data-offset")}>Load more</button> </div> <div id="m11" class="msg"></div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/audit.astro?astro&type=script&index=0&lang.ts")}` })}`;
}, "C:/Users/MD/Desktop/WebScraber/src/pages/admin/audit.astro", void 0);
var $$file = "C:/Users/MD/Desktop/WebScraber/src/pages/admin/audit.astro";
var $$url = "/admin/audit";
//#endregion
//#region \0virtual:astro:page:src/pages/admin/audit@_@astro
var page = () => audit_exports;
//#endregion
export { page };
