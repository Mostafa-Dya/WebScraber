// POST /api/revalidate logic (docs/ADR.md D5.4): low-trust shared secret, constant-time compare,
// per-IP cap on failed attempts (checked BEFORE anything else), server-side coalescing (a bust
// within 4 s of the previous one is acknowledged with 202 — short enough that the Apps Script's
// trailing notification, sent ≥ 5 s after a throttled direct one, always goes through), and a
// 503 when the refresh itself failed so the caller's log shows it.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { CatalogueCache } from '../sheets/cache.ts';
import type { RateLimiter } from './ratelimit.ts';

export const COALESCE_MS = 4_000;
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 10 * 60_000;

export interface RevalidateDeps {
  secret: string;
  /** Resolved only after authentication; may throw when the site is not configured. */
  getCache: () => CatalogueCache;
  /** Purges the route cache (tag "sheet"); must not throw. */
  invalidateRoutes: () => Promise<void>;
  /** Dedicated small limiter for failed attempts (keys are attacker-driven). */
  failLimiter: RateLimiter;
  now?: () => number;
  coalesceMs?: number;
  state: { lastBustAt: number };
}

export interface RevalidateResult {
  status: number;
  body: Record<string, unknown>;
}

export function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(authorization: string | null): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  return m?.[1];
}

/**
 * Step 1 (no body read, no cache): the constant 401 for any JSON request that fails authentication.
 * (Requests without a JSON content type never get here: Astro's origin check answers 403 first.)
 */
export function authorize(
  input: { token: string | undefined; ipHash: string },
  deps: Pick<RevalidateDeps, 'secret' | 'failLimiter'>,
): boolean {
  const failKey = `reval-fail:${input.ipHash}`;
  if (!deps.failLimiter.wouldAllow(failKey, FAIL_LIMIT, FAIL_WINDOW_MS).ok) return false;
  if (!secretsMatch(input.token, deps.secret)) {
    deps.failLimiter.allow(failKey, FAIL_LIMIT, FAIL_WINDOW_MS);
    return false;
  }
  return true;
}

export async function handleRevalidate(
  input: { token: string | undefined; ipHash: string; source?: unknown },
  deps: RevalidateDeps,
): Promise<RevalidateResult> {
  if (!authorize(input, deps)) return { status: 401, body: { ok: false } };
  const now = deps.now ?? Date.now;
  const coalesceMs = deps.coalesceMs ?? COALESCE_MS;
  const source = typeof input.source === 'string' ? input.source.slice(0, 32) : 'unknown';
  let cache: CatalogueCache;
  try {
    cache = deps.getCache();
  } catch {
    return { status: 503, body: { ok: false, error: 'catalogue unavailable', source } };
  }
  const t = now();
  if (t - deps.state.lastBustAt < coalesceMs) {
    return { status: 202, body: { ok: true, coalesced: true, source } };
  }
  deps.state.lastBustAt = t;
  const snapshot = await cache.bust().catch(() => undefined);
  await deps.invalidateRoutes();
  const health = cache.health();
  return {
    status: health.lastRefreshOk ? 200 : 503,
    body: {
      ok: health.lastRefreshOk,
      refreshed: health.lastRefreshOk,
      source,
      snapshotAgeSec: health.snapshotAgeSec,
      rugs: snapshot?.catalogue.rugs.length ?? health.rugs,
      lastError: health.lastError,
    },
  };
}
