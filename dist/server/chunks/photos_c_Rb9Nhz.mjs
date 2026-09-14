import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { n as getAdminDeps, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
import { a as adminRuntime, i as adminPost, l as methodNotAllowed, o as auditBase, t as AdminError, u as recordAuditEvent } from "./http_BC0ewnLg.mjs";
import { o as noStore } from "./api_jzoAbQWC.mjs";
import { M as PhotoImportRequest } from "./read_BGHurOvf.mjs";
import { t as commitPhotos } from "./commit_CZ5yMa-T.mjs";
//#region src/pages/api/admin/photos.ts
var photos_exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	POST: () => POST,
	prerender: () => false
});
var POST = adminPost(PhotoImportRequest, async ({ context, body }) => {
	const deps = getAdminDeps();
	if (!deps.drive) {
		adminRuntime.driveScopeOk = false;
		throw new AdminError(409, "drive_not_authorised", "Photo import needs GOOGLE_AUTH_MODE=oauth_refresh with the drive.file scope — see SHEET_SETUP §6.", { reason: "service_account" });
	}
	const scope = await deps.drive.scopeStatus();
	adminRuntime.driveScopeOk = scope.driveScopeOk;
	if (!scope.driveScopeOk) throw new AdminError(409, "drive_not_authorised", `Drive is not authorised (${scope.reason ?? "unknown"}) — see SHEET_SETUP §6.`, { reason: scope.reason ?? null });
	const commit = body.productId ? await commitPhotos({
		productId: body.productId,
		productName: body.productName ?? body.productId,
		urls: body.urls,
		namePrefix: body.namePrefix,
		supplier: body.supplier
	}, {
		drive: deps.drive,
		logger: consoleLogger
	}) : void 0;
	const photos = commit ? commit.photos : [];
	if (!commit) for (const [i, url] of body.urls.entries()) {
		const r = await deps.drive.uploadFromUrl(url, `${body.namePrefix}-${i + 1}.jpg`);
		if ("error" in r) photos.push({
			url,
			error: r.error,
			...r.detail ? { detail: r.detail } : {},
			...r.id ? { id: r.id } : {}
		});
		else photos.push({
			url,
			id: r.id,
			name: r.name
		});
	}
	const ids = photos.filter((p) => p.id && !p.error).map((p) => p.id);
	const failed = photos.filter((p) => p.error).map((p) => ({
		url: p.url,
		error: p.error
	}));
	const audit = await recordAuditEvent({
		...auditBase(context),
		action: "photo.import",
		targetTab: "Drive",
		targetId: body.namePrefix,
		after: {
			ids,
			failed
		},
		note: `${ids.length}/${body.urls.length} imported`
	});
	if (ids.length === 0) return noStore({
		ok: false,
		error: "upload_failed",
		photos,
		imported: 0,
		audit
	}, 502);
	return noStore({
		ok: true,
		photos,
		imported: ids.length,
		...commit?.folders ? {
			driveFolderId: commit.folders.productId,
			driveFolderUrl: commit.folders.url
		} : {},
		complete: commit ? commit.complete : ids.length === body.urls.length,
		audit
	});
}, "photos");
var ALL = methodNotAllowed("POST");
//#endregion
//#region \0virtual:astro:page:src/pages/api/admin/photos@_@ts
var page = () => photos_exports;
//#endregion
export { page };
