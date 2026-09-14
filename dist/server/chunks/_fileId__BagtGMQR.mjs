import { t as __exportAll } from "./rolldown-runtime_BBjsoOtd.mjs";
import { dt as coerceWidth, lt as driveImageResponse, n as getAdminDeps, ut as imageMethodNotAllowed, vt as consoleLogger } from "./runtime_r-OJmEZZ.mjs";
//#region src/pages/api/image/[fileId].ts
var _fileId__exports = /* @__PURE__ */ __exportAll({
	ALL: () => ALL,
	GET: () => GET,
	prerender: () => false
});
var GET = async ({ params, url }) => {
	let drive;
	let readPublic;
	try {
		const deps = getAdminDeps();
		drive = deps.drive;
		readPublic = deps.publicImages;
	} catch {
		drive = void 0;
		readPublic = void 0;
	}
	return driveImageResponse(params.fileId, {
		...readPublic ? { readPublic } : {},
		...drive ? { readMedia: (fileId) => drive.getMedia(fileId) } : {},
		logger: consoleLogger
	}, coerceWidth(url.searchParams.get("w")));
};
var ALL = () => imageMethodNotAllowed();
//#endregion
//#region \0virtual:astro:page:src/pages/api/image/[fileId]@_@ts
var page = () => _fileId__exports;
//#endregion
export { page };
