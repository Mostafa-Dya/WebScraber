import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { V as TABS, h as warmRates, i as getClient, n as getAdminDeps, vt as consoleLogger, yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime, i as adminPost, l as methodNotAllowed, o as auditBase, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { L as ScrapeRequest, g as roundStepOf, h as parseSettings, p as markupFor } from "./read_BGHurOvf.mjs";
import { n as detectSupplier, t as scrapeRug } from "./scrape_yz66TWq6.mjs";
//#region src/pages/api/admin/scrape.ts
var scrape_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	SCRAPE_STATUS: () => SCRAPE_STATUS,
	prerender: () => false
});
/** §2.3: 400 unsupported_host / invalid_url, 502 blocked / fetch_failed, 404, 422 parse_failed, 504 timeout. */
var SCRAPE_STATUS = {
	unsupported_host: 400,
	invalid_url: 400,
	blocked: 502,
	fetch_failed: 502,
	not_found: 404,
	parse_failed: 422,
	timeout: 504
};
var EMPTY_SETTINGS = { retailMarkupBySupplier: {} };
/** The Settings tab alone (one small read); a failure leaves the markup unset rather than blocking. */
async function readSettings() {
	try {
		const [vr] = await getClient().batchGet([`${TABS.settings}!A1:D`]);
		return parseSettings(vr?.values, consoleLogger);
	} catch (e) {
		consoleLogger.warn("scrape: Settings tab unavailable; no retail suggestion", { error: serializeError(e) });
		return EMPTY_SETTINGS;
	}
}
var POST = adminPost(ScrapeRequest, async ({ context, body }) => {
	const started = Date.now();
	const det = detectSupplier(body.url);
	const supplier = "error" in det ? void 0 : det.supplier;
	const [settings] = await Promise.all([supplier ? readSettings() : Promise.resolve(EMPTY_SETTINGS), warmRates()]);
	const deps = getAdminDeps();
	const result = await scrapeRug(body.url, {
		force: body.force,
		markup: markupFor(settings, supplier, adminRuntime.retailMarkup),
		roundStep: roundStepOf(settings),
		jinaFallback: deps.scrape.jinaFallback,
		respectRobots: deps.scrape.respectRobots,
		convertToUsd: deps.convertToUsd,
		logger: consoleLogger
	});
	const audit = await recordAuditEvent({
		...auditBase(context),
		action: "scrape.fetch",
		targetTab: "-",
		targetId: result.ok ? result.data.supplierRef : result.manual?.supplierRef ?? "",
		after: {
			url: result.ok ? result.data.sourceUrl : result.manual?.sourceUrl ?? body.url.slice(0, 500),
			supplier: supplier ?? null,
			via: result.ok ? result.via : null,
			ok: result.ok,
			code: result.ok ? null : result.code,
			status: result.ok ? 200 : result.status ?? null,
			ms: result.ok ? result.ms : Date.now() - started,
			cached: result.ok ? result.cached : false,
			seenPrice: result.ok ? result.data.seenPrice ?? null : result.data?.seenPrice ?? null,
			seenCurrency: result.ok ? result.data.seenCurrency ?? null : result.data?.seenCurrency ?? null
		}
	});
	if (result.ok) return noStore({
		ok: true,
		primaryImage: result.primaryImage ?? null,
		sizeLabel: result.data.sizeLabel,
		sizeBand: result.data.sizeBand,
		fieldStatus: result.data.fieldStatus,
		data: result.data,
		via: result.via,
		cached: result.cached,
		ms: result.ms,
		audit
	});
	return noStore({
		ok: false,
		error: result.code,
		message: result.message,
		status: result.status ?? null,
		manual: result.manual ?? null,
		data: result.data ?? null,
		audit
	}, SCRAPE_STATUS[result.code]);
}, "scrape");
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/scrape@_@ts
var page = () => scrape_exports;
//#endregion
export { page };
