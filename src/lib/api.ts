// Shared state and helpers for the /api/* endpoints (docs/ADR.md D5, D8, D9). Astro-specific glue
// only; the logic lives in src/lib/votes/*.
import { CLIENT_IP_HEADER, SITE_URL, TRUSTED_PROXY_HOPS, VOTE_SALT } from 'astro:env/server';
import { clientIp } from './ip.ts';
import { ipHash } from './votes/identity.ts';
import { RateLimiter } from './votes/ratelimit.ts';

export const limiter = new RateLimiter();
/** Failed revalidate attempts get their own small limiter: those keys are attacker-driven. */
export const failLimiter = new RateLimiter({ maxKeys: 2000 });
export const inflight = new Set<string>();
export const revalidateState = { lastBustAt: 0 };
export const startedAt = Date.now();

export const siteOrigin = new URL(SITE_URL).origin;
export const isSecureSite = siteOrigin.startsWith('https://');
if (!isSecureSite && process.env.NODE_ENV === 'production') {
  console.warn(
    '[site] SITE_URL is not https: the vote cookie is minted as "sl_v" without Secure/__Host-. Use an https SITE_URL in production (ADR D8).',
  );
}

/**
 * Astro's `context.clientAddress`, or undefined. The getter THROWS when the adapter cannot supply a
 * peer address (a prerendered route, or an adapter without the capability), so it is never read bare.
 */
export function socketAddressOf(ctx: { clientAddress?: string } | undefined): string | undefined {
  try {
    return ctx?.clientAddress;
  } catch {
    return undefined;
  }
}

/**
 * @param socketAddress Astro's `context.clientAddress`. Pass it wherever a context is in scope: it is
 * the last-resort identity that keeps every visitor out of one shared rate-limit bucket when no
 * proxy header is configured. See `IpOptions.socketAddress`.
 */
export function requestIpHash(request: Request, socketAddress?: string): string {
  const ip = clientIp(request.headers, {
    header: CLIENT_IP_HEADER,
    trustedHops: TRUSTED_PROXY_HOPS,
    socketAddress,
  });
  return ipHash(VOTE_SALT, ip);
}

/** JSON response that must never be cached (votes, revalidate, health). */
export function noStore(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

const MAX_JSON_BODY = 4096;
/** Admin JSON bodies (a rug with a 4 000-char description and 12 photo ids): docs/ADMIN_SPEC.md §2.3. */
export const ADMIN_MAX_JSON_BODY = 64 * 1024;

/**
 * Cross-site posture for JSON POSTs (ADR D8): JSON only, small (`maxBytes`, default 4 KiB for the
 * public endpoints), same-origin fetch metadata when present.
 */
export function rejectCrossSite(request: Request, maxBytes: number = MAX_JSON_BODY): Response | undefined {
  const ct = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.startsWith('application/json')) return noStore({ ok: false, error: 'unsupported media type' }, 415);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) return noStore({ ok: false, error: 'payload too large' }, 413);
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none')
    return noStore({ ok: false, error: 'forbidden' }, 403);
  if (!site) {
    const origin = request.headers.get('origin');
    if (origin && origin !== siteOrigin) return noStore({ ok: false, error: 'forbidden' }, 403);
  }
  return undefined;
}
