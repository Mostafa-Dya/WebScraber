// GET /api/image/[fileId] — the caching proxy in front of Google Drive (brief §12, §14). Thin by
// design: every rule lives in src/lib/drive/proxy.ts, and the bytes come from the shared Drive
// client's `getMedia` (src/lib/drive/media.ts).
//
// The route never calls `context.cache.set`, so Astro's in-process route cache stays out of it (it
// would hold whole images in memory). Caching is delegated to the browser and any CDN in front of
// us through `cache-control: public, max-age=31536000, immutable`.
export const prerender = false;

import type { APIRoute } from 'astro';
import { driveImageResponse, imageMethodNotAllowed } from '../../../lib/drive/proxy.ts';
import { getAdminDeps } from '../../../lib/runtime.ts';
import { consoleLogger } from '../../../lib/sheets/errors.ts';

export const GET: APIRoute = async ({ params }) => {
  // `service_account` mode builds no Drive client (docs/ADMIN_SPEC.md §5.1) → the proxy answers 503.
  let drive;
  try {
    drive = getAdminDeps().drive;
  } catch {
    drive = undefined;
  }
  return driveImageResponse(params.fileId, {
    ...(drive ? { readMedia: (fileId: string) => drive.getMedia(fileId) } : {}),
    logger: consoleLogger,
  });
};

export const ALL: APIRoute = () => imageMethodNotAllowed();
