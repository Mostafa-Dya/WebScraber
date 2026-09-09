// GET /api/rates (brief §8, §14) — the conversion table the pages are rendered with, so a client
// that wants to re-convert without a reload has the same numbers the server used.
//
// Public and cacheable: rates are not secret, and the table changes at most once a day. The cache
// window is deliberately short compared with FX_REFRESH_HOURS so a manual refresh is visible within
// a minute, and the response says where the numbers came from — a fallback table quietly serving
// week-old rates is exactly the failure this field is here to surface.
export const prerender = false;

import type { APIRoute } from 'astro';
import { noStore } from '../../lib/api.ts';
import { baseCurrency, getRates, loadCatalogue } from '../../lib/runtime.ts';

export const GET: APIRoute = async () => {
  const { snapshot } = await loadCatalogue();
  const table = getRates().get(snapshot?.catalogue.rates ?? []);
  const health = getRates().health();
  return new Response(
    JSON.stringify({
      ok: true,
      base: baseCurrency,
      rates: table.rates,
      symbols: table.symbols,
      source: health.source,
      fetchedAt: health.fetchedAt ? new Date(health.fetchedAt).toISOString() : null,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=60, stale-while-revalidate=600',
      },
    },
  );
};

export const ALL: APIRoute = () => noStore({ ok: false, error: 'method not allowed' }, 405, { allow: 'GET' });
