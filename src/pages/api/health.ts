// GET /api/health — unauthenticated, no secrets, no-store (docs/ADR.md D5.5). The standalone
// Apps Script monitor polls this and e-mails the owner when the catalogue is stale or failing.
// It never forces a Google round trip: it reports on the cache's own state (a refresh happens only
// when the TTL has passed, exactly as a page view would trigger it, and the failure cooldown applies).
// Admin additions (docs/ADMIN_SPEC.md §2.3): adminConfigured, adminWriteFailures, driveScopeOk;
// brief §8/§10 additions: customerRealm, publicCatalogue and where the FX table came from
// (the Drive client caches its scope check for 10 minutes, so this stays cheap).
export const prerender = false;

import type { APIRoute } from 'astro';
import { REVALIDATE_SECRET, VOTE_SALT } from 'astro:env/server';
import { adminHealth } from '../../lib/admin/http.ts';
import { customerHealth } from '../../lib/customer/http.ts';
import { noStore, startedAt } from '../../lib/api.ts';
import { getCache, getGoogleConnection, getRates, photoMonitor } from '../../lib/runtime.ts';
import { driveScope } from './admin/_shared.ts';

export const GET: APIRoute = async () => {
  const secretsOk = REVALIDATE_SECRET.length >= 32 && VOTE_SALT.length >= 32;
  if (adminHealth().adminConfigured) await driveScope();
  const fx = getRates().health();
  // The Google connection: whether one is stored, which account, and when it last actually worked.
  // The token itself is never reported, and neither is the store's path.
  const google = getGoogleConnection()?.health();
  const base = {
    secretsOk,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    ...adminHealth(),
    ...customerHealth(),
    // Which table prices are rendered from: "fallback" means the FX API has never answered, so the
    // numbers are the hardcoded ones in code and the monitor should say so before anyone quotes them.
    ratesSource: fx.source,
    ratesFetchedAt: fx.fetchedAt ? new Date(fx.fetchedAt).toISOString() : null,
    ratesLastError: fx.lastError,
    googleConnected: google ? google.connected : null,
    googleAccount: google?.account ?? null,
    googleDurable: google ? google.durable : null,
    googleLastRefreshAt: google?.lastRefreshAt ?? null,
    googleLastError: google?.lastError ?? null,
  };
  try {
    const cache = getCache();
    await cache.get().catch(() => undefined);
    const h = cache.health();
    const photos = photoMonitor.result;
    const rates = cache.peek()?.catalogue.rates ?? [];
    const ratesUpdatedAt =
      rates
        .map((r) => r.updatedAt)
        .filter((v): v is string => Boolean(v))
        .sort()[0] ?? null;
    const ok = h.ok && secretsOk;
    return noStore(
      {
        ...base,
        ...h,
        ok,
        photosChecked: photos.checked,
        photosCheckedAt: photos.checkedAt ? new Date(photos.checkedAt).toISOString() : null,
        photosFailing: photos.failing.length,
        photosFailingRugs: photos.failing.slice(0, 10),
        ratesOldestUpdatedAt: ratesUpdatedAt,
      },
      ok ? 200 : 503,
    );
  } catch {
    return noStore({ ...base, ok: false, lastRefreshOk: false, lastError: 'not configured', rugs: 0 }, 503);
  }
};
