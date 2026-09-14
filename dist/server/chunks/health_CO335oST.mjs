import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { Pt as VOTE_SALT, a as getGoogleConnection, d as photoMonitor, jt as REVALIDATE_SECRET, r as getCache, s as getRates } from "./runtime_r-OJmEZZ.mjs";
import { r as adminHealth } from "./http_BC0ewnLg.mjs";
import { d as startedAt, o as noStore } from "./api_jzoAbQWC.mjs";
import { n as customerHealth } from "./http_B6fRxdq_.mjs";
import { i as driveScope } from "./_shared_Bzx2ocTH.mjs";
//#region src/pages/api/health.ts
var health_exports = /* @__PURE__ */ __exportAll({
	GET: () => GET,
	prerender: () => false
});
var GET = async () => {
	const secretsOk = REVALIDATE_SECRET.length >= 32 && VOTE_SALT.length >= 32;
	if (adminHealth().adminConfigured) await driveScope();
	const fx = getRates().health();
	const google = getGoogleConnection()?.health();
	const base = {
		secretsOk,
		uptimeSec: Math.round((Date.now() - startedAt) / 1e3),
		...adminHealth(),
		...customerHealth(),
		ratesSource: fx.source,
		ratesFetchedAt: fx.fetchedAt ? new Date(fx.fetchedAt).toISOString() : null,
		ratesLastError: fx.lastError,
		googleConnected: google ? google.connected : null,
		googleAccount: google?.account ?? null,
		googleDurable: google ? google.durable : null,
		googleLastRefreshAt: google?.lastRefreshAt ?? null,
		googleLastError: google?.lastError ?? null
	};
	try {
		const cache = getCache();
		await cache.get().catch(() => void 0);
		const h = cache.health();
		const photos = photoMonitor.result;
		const ratesUpdatedAt = (cache.peek()?.catalogue.rates ?? []).map((r) => r.updatedAt).filter((v) => Boolean(v)).sort()[0] ?? null;
		const ok = h.ok && secretsOk;
		return noStore({
			...base,
			...h,
			ok,
			photosChecked: photos.checked,
			photosCheckedAt: photos.checkedAt ? new Date(photos.checkedAt).toISOString() : null,
			photosFailing: photos.failing.length,
			photosFailingRugs: photos.failing.slice(0, 10),
			ratesOldestUpdatedAt: ratesUpdatedAt
		}, ok ? 200 : 503);
	} catch {
		return noStore({
			...base,
			ok: false,
			lastRefreshOk: false,
			lastError: "not configured",
			rugs: 0
		}, 503);
	}
};
//#endregion
//#region \0virtual:astro:page:src/pages/api/health@_@ts
var page = () => health_exports;
//#endregion
export { page };
