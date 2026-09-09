// GET /api/admin/export/shopify-csv — the Products tab as a Shopify-importable CSV (brief §9, §14).
//
// The brief lists this route as `GET /api/export/shopify-csv`. It is served from `/api/admin/`
// instead because the admin gate is **path-based**: `src/lib/admin/gate.ts` gates `/admin*` and
// `/api/admin*` and nothing else (docs/ADMIN_SPEC.md §2.2), and this endpoint hands out the entire
// catalogue including supplier URLs, `Internal Notes` and every draft and archived row. Under the
// brief's own path it would have been public. Same handler, admin-only prefix.
//
// Thin by design: the column order, the header casing and the RFC 4180 quoting all live in
// src/lib/admin/export.ts and src/lib/csv.ts.
export const prerender = false;

import {
  SHOPIFY_CONTENT_DISPOSITION,
  SHOPIFY_CSV_CONTENT_TYPE,
  shopifyProductsCsv,
} from '../../../../lib/admin/export.ts';
import { adminGet, methodNotAllowed } from '../../../../lib/admin/http.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { TABS } from '../../../../lib/sheets/contract.ts';

export const GET = adminGet(async () => {
  // A fresh read, never the 60 s route cache: an export the owner takes right after an edit must
  // contain that edit (docs/ADMIN_SPEC.md §2.3, every admin read is fresh).
  const [products] = await getClient().batchGet([`${TABS.products}!A1:AP`]);
  return new Response(shopifyProductsCsv(products?.values), {
    status: 200,
    headers: {
      'content-type': SHOPIFY_CSV_CONTENT_TYPE,
      'content-disposition': SHOPIFY_CONTENT_DISPOSITION,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

export const ALL = methodNotAllowed('GET');
