import { yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
//#region src/lib/admin/invalidate.ts
/** Purges the route cache entries tagged "sheet"; never throws (astro dev has no provider). */
async function invalidateRoutes(context, logger) {
	try {
		await context.cache.invalidate({ tags: ["sheet"] });
	} catch (e) {
		logger?.warn("route cache invalidate skipped", { error: serializeError(e) });
	}
}
async function invalidateCatalogue(getCache, context, opts = {}) {
	const now = opts.now ?? Date.now;
	if (opts.state) opts.state.lastBustAt = now();
	let cache;
	try {
		cache = getCache();
	} catch (e) {
		opts.logger?.warn("catalogue cache unavailable; route cache purged only", { error: serializeError(e) });
	}
	let snapshot;
	if (cache) snapshot = await cache.bust().catch((e) => {
		opts.logger?.warn("catalogue refresh after admin write failed", { error: serializeError(e) });
	});
	await invalidateRoutes(context, opts.logger);
	return {
		refreshed: Boolean(cache?.health().lastRefreshOk && snapshot),
		snapshot
	};
}
//#endregion
export { invalidateRoutes as n, invalidateCatalogue as t };
