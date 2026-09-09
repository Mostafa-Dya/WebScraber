// GET /api/catalogue — public JSON of the cached catalogue (replaces the legacy list_catalogue).
export const prerender = false;

import type { APIRoute } from 'astro';
import { loadCatalogue } from '../../lib/runtime.ts';
import { catalogueDto } from '../../lib/votes/dto.ts';

export const GET: APIRoute = async (context) => {
  context.cache.set({ maxAge: 60, swr: 60, tags: ['sheet'] });
  const { snapshot, error } = await loadCatalogue();
  if (!snapshot) {
    context.cache.set(false);
    return new Response(JSON.stringify({ ok: false, error: error ?? 'could not load the catalogue' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '60',
      },
    });
  }
  return new Response(JSON.stringify(catalogueDto(snapshot)), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' },
  });
};
