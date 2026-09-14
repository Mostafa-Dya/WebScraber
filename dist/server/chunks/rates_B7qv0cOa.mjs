import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { s as getRates, t as baseCurrency, u as loadCatalogue } from "./runtime_r-OJmEZZ.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
//#region src/pages/api/rates.ts
var rates_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
var GET = async () => {
	const { snapshot } = await loadCatalogue();
	const table = getRates().get(snapshot?.catalogue.rates ?? []);
	const health = getRates().health();
	return new Response(JSON.stringify({
		ok: true,
		base: baseCurrency,
		rates: table.rates,
		symbols: table.symbols,
		source: health.source,
		fetchedAt: health.fetchedAt ? new Date(health.fetchedAt).toISOString() : null
	}), {
		status: 200,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"x-content-type-options": "nosniff",
			"cache-control": "public, max-age=60, stale-while-revalidate=600"
		}
	});
};
var ALL = () => noStore({
	ok: false,
	error: "method not allowed"
}, 405, { allow: "GET" });
//#endregion
//#region \0virtual:astro:page:src/pages/api/rates@_@ts
var page = () => rates_exports;
//#endregion
export { page };
