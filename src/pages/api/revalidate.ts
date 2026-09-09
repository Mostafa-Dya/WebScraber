// POST /api/revalidate — called by the Apps Script onEdit notifier (docs/ADR.md D5.4).
// Authorization: Bearer <REVALIDATE_SECRET>; body { source }. Authentication runs before the body
// is read or the catalogue is touched; bursts within 4 s are acknowledged with 202. The route-cache
// purge is the shared `invalidateRoutes` helper the admin panel uses after its own writes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { REVALIDATE_SECRET } from 'astro:env/server';
import { invalidateRoutes } from '../../lib/admin/invalidate.ts';
import { failLimiter, noStore, requestIpHash, revalidateState } from '../../lib/api.ts';
import { getCache } from '../../lib/runtime.ts';
import { consoleLogger } from '../../lib/sheets/errors.ts';
import { authorize, bearerToken, handleRevalidate } from '../../lib/votes/revalidate.ts';

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const token = bearerToken(request.headers.get('authorization'));
  const ipHash = requestIpHash(request);
  if (!authorize({ token, ipHash }, { secret: REVALIDATE_SECRET, failLimiter }))
    return noStore({ ok: false }, 401);

  let source: unknown;
  try {
    const ct = (request.headers.get('content-type') ?? '').toLowerCase();
    if (ct.startsWith('application/json') && Number(request.headers.get('content-length') ?? 0) <= 4096) {
      source = ((await request.json()) as { source?: unknown })?.source;
    }
  } catch {
    /* body is optional */
  }
  const result = await handleRevalidate(
    { token, ipHash, source },
    {
      secret: REVALIDATE_SECRET,
      getCache,
      // No provider (astro dev) or a provider error: the data cache is already busted; logged, never thrown.
      invalidateRoutes: () => invalidateRoutes(context, consoleLogger),
      failLimiter,
      state: revalidateState,
    },
  );
  return noStore(result.body, result.status);
};

export const ALL: APIRoute = () =>
  noStore({ ok: false, error: 'method not allowed' }, 405, { allow: 'POST' });
