import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { i as getClient, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { l as methodNotAllowed, n as adminGet } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { c as parseAdminSnapshot, t as ADMIN_READ_RANGES } from "./read_BGHurOvf.mjs";
import { n as buildSavesReport, t as SAVES_READ_RANGE } from "./saves_4QVCHrQI.mjs";
//#region src/pages/api/admin/clients/report.ts
var report_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
var GET = adminGet(async () => {
	const ranges = await getClient().batchGet([...ADMIN_READ_RANGES, SAVES_READ_RANGE]);
	const snapshot = parseAdminSnapshot(ranges.slice(0, ADMIN_READ_RANGES.length), { logger: consoleLogger });
	const votes = ranges[ADMIN_READ_RANGES.length]?.values;
	const report = buildSavesReport(votes, snapshot.rugs, snapshot.clients);
	return noStore({
		ok: true,
		...report
	});
});
var ALL = methodNotAllowed("GET");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/clients/report@_@ts
var page = () => report_exports;
//#endregion
export { page };
