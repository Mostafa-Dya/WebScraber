// GET /api/image/[fileId] — the caching proxy in front of Google Drive (brief §12, §14). Thin by
// design: every rule lives in src/lib/drive/proxy.ts.
//
// Two upstreams, in this order:
//   1. **lh3, anonymously.** The photo folder is shared with anyone holding the link, so this needs
//      no token — which means the proxy works whether or not a Google account is connected, and
//      keeps working if the Drive grant lapses. lh3 also downscales on demand, so a card asks for
//      800px and gets 800px rather than the original four megabytes.
//   2. **The authenticated Drive API**, only when the first says the file is not public and a Drive
//      client exists. That covers a photo that was never shared.
//
// `?w=` chooses the width from a closed set (400 / 800 / 1600); anything else falls back to 800, so
// the parameter can never widen the surface.
//
// The route never calls `context.cache.set`: Astro's in-process route cache would hold whole images
// in memory. Caching is delegated to the browser and any CDN through the immutable year-long header.
export const prerender = false;

import type { APIRoute } from 'astro';
import { coerceWidth } from '../../../lib/drive/media.ts';
import { driveImageResponse, imageMethodNotAllowed } from '../../../lib/drive/proxy.ts';
import { getAdminDeps } from '../../../lib/runtime.ts';
import { consoleLogger } from '../../../lib/sheets/errors.ts';

export const GET: APIRoute = async ({ params, url }) => {
  // `service_account` mode builds no Drive client (docs/ADMIN_SPEC.md §5.1); the public reader still
  // serves every shared photo, so the proxy is useful there too.
  let drive;
  let readPublic;
  try {
    const deps = getAdminDeps();
    drive = deps.drive;
    readPublic = deps.publicImages;
  } catch {
    drive = undefined;
    readPublic = undefined;
  }
  return driveImageResponse(
    params.fileId,
    {
      ...(readPublic ? { readPublic } : {}),
      ...(drive ? { readMedia: (fileId: string) => drive.getMedia(fileId) } : {}),
      logger: consoleLogger,
    },
    coerceWidth(url.searchParams.get('w')),
  );
};

export const ALL: APIRoute = () => imageMethodNotAllowed();
