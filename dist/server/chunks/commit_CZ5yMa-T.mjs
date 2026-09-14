import { yt as serializeError } from "./runtime_r-OJmEZZ.mjs";
//#region src/lib/drive/commit.ts
/** `01-primary`, `02`, `03`… so the folder sorts in the order the studio chose. */
function photoName(prefix, index, primary) {
	const n = String(index + 1).padStart(2, "0");
	return primary ? `${n}-primary` : `${prefix}-${n}`;
}
/**
* Creates the rug's folders, uploads each photo into `All Images` in order, and copies the first one
* up into the rug folder as `01-primary`.
*
* Sequential on purpose: Drive rate-limits bursts, the studio cares about the order, and a failure
* half way should leave a partial set the retry can finish rather than a scattered one.
*/
async function commitPhotos(input, deps) {
	const photos = [];
	let folders;
	try {
		folders = await deps.drive.ensureProductFolders(input.productId, input.productName);
	} catch (e) {
		const safe = serializeError(e);
		deps.logger?.error("photo commit: folders unavailable", { error: safe });
		return {
			photos: input.urls.map((url) => ({
				url,
				error: "folder_failed",
				detail: safe.message
			})),
			ids: [],
			complete: false,
			folderError: safe.message
		};
	}
	let existing = /* @__PURE__ */ new Map();
	if (input.reuseExisting) try {
		existing = await deps.drive.listFolder(folders.allImagesId);
	} catch (e) {
		deps.logger?.warn("photo commit: could not list All Images", { error: serializeError(e) });
	}
	for (const [i, url] of input.urls.entries()) {
		const name = photoName(input.namePrefix, i, i === 0);
		const already = existing.get(name);
		if (already) {
			photos.push({
				url,
				id: already,
				name,
				reused: true
			});
			continue;
		}
		const result = await deps.drive.uploadFromUrl(url, name, folders.allImagesId, {
			supplier: input.supplier ?? "",
			index: i
		});
		if ("error" in result) {
			photos.push({
				url,
				error: result.error,
				detail: result.detail
			});
			continue;
		}
		photos.push({
			url,
			id: result.id,
			name: result.name
		});
		if (i === 0) {
			const copy = await deps.drive.copyFile(result.id, `01-primary`, folders.productId);
			if ("error" in copy) deps.logger?.warn("photo commit: primary not duplicated", { detail: copy.detail });
		}
	}
	const ids = photos.filter((p) => p.id && !p.error).map((p) => p.id);
	return {
		photos,
		ids,
		folders,
		complete: ids.length === input.urls.length && input.urls.length > 0
	};
}
//#endregion
export { commitPhotos as t };
