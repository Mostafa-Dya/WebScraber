// After every successful admin mutation (docs/ADMIN_SPEC.md §3.4): bust the data cache and purge
// the route cache (tag "sheet"). API writes never fire the Apps Script onEdit notifier, so the
// admin must invalidate itself. Extracted from src/pages/api/revalidate.ts, which now uses it too.
// Tolerant of the dev provider (no route cache) and of a failing refresh (the bust still happened).
import type { CatalogueCache } from '../sheets/cache.ts';
import { serializeError, type Logger } from '../sheets/errors.ts';
import type { Snapshot } from '../sheets/types.ts';

/** The slice of Astro's `context.cache` that invalidation needs. */
export interface RouteCacheLike {
  invalidate(input: { tags: string[] }): Promise<void>;
}

export interface InvalidateOptions {
  /** Shared with /api/revalidate so its 4 s coalescing window sees admin busts too. */
  state?: { lastBustAt: number };
  now?: () => number;
  logger?: Logger;
}

export interface InvalidateResult {
  /** The refresh after the bust succeeded (false = the last good snapshot is still being served). */
  refreshed: boolean;
  snapshot?: Snapshot;
}

/** Purges the route cache entries tagged "sheet"; never throws (astro dev has no provider). */
export async function invalidateRoutes(context: { cache: RouteCacheLike }, logger?: Logger): Promise<void> {
  try {
    await context.cache.invalidate({ tags: ['sheet'] });
  } catch (e) {
    logger?.warn('route cache invalidate skipped', { error: serializeError(e) });
  }
}

export async function invalidateCatalogue(
  getCache: () => CatalogueCache,
  context: { cache: RouteCacheLike },
  opts: InvalidateOptions = {},
): Promise<InvalidateResult> {
  const now = opts.now ?? Date.now;
  if (opts.state) opts.state.lastBustAt = now();
  let cache: CatalogueCache | undefined;
  try {
    cache = getCache();
  } catch (e) {
    opts.logger?.warn('catalogue cache unavailable; route cache purged only', { error: serializeError(e) });
  }
  let snapshot: Snapshot | undefined;
  if (cache) {
    snapshot = await cache.bust().catch((e: unknown) => {
      opts.logger?.warn('catalogue refresh after admin write failed', { error: serializeError(e) });
      return undefined;
    });
  }
  await invalidateRoutes(context, opts.logger);
  return { refreshed: Boolean(cache?.health().lastRefreshOk && snapshot), snapshot };
}
