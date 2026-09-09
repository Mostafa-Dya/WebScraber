// Photo-first image resolution (brief §11: "return the primary image URL in a first chunk").
// The primary photo is resolved from the cheapest source that already succeeded and is never lost
// when the rest of the gallery fails to resolve: a throw from the gallery builder degrades to the
// primary alone plus a warning, and never fails the scrape (docs/ADMIN_SPEC.md §4.4).
import { isAllowedImageUrl } from './guard.ts';
import type { ScrapedPhoto } from './types.ts';

/** ADMIN_SPEC §4.4 / §5: at most 12 full-size candidates per product. */
export const MAX_PHOTOS = 12;

export const SECONDARY_FAILED_WARNING = 'secondary images could not be resolved; the primary photo was kept';

export interface ResolvedPhotos {
  /** `photos[0].url`, available before the gallery is walked. */
  primaryImage?: string;
  photos: ScrapedPhoto[];
  /** Appended to `ScrapedRug.warnings` when the gallery failed. */
  warning?: string;
}

export interface ResolvePhotosOptions {
  /** Known primary (a Shopify `featured_image`) — kept first in the list. */
  primary?: ScrapedPhoto | string;
  /** Last resort (an `og:image`), used only when the gallery yielded nothing or threw. */
  fallback?: ScrapedPhoto | string;
  max?: number;
  onError?: (e: unknown) => void;
}

function asPhoto(p: ScrapedPhoto | string | undefined): ScrapedPhoto | undefined {
  if (!p) return undefined;
  const photo = typeof p === 'string' ? { url: p } : p;
  return photo.url && isAllowedImageUrl(photo.url) ? photo : undefined;
}

/**
 * Resolves the primary image first, then the rest of the gallery. `gallery` is a thunk so its cost
 * (and its failure) is contained: whatever it throws is reported through `onError` and the result
 * still carries the primary photo.
 */
export function resolvePhotos(
  gallery: () => ScrapedPhoto[],
  opts: ResolvePhotosOptions = {},
): ResolvedPhotos {
  const max = opts.max ?? MAX_PHOTOS;
  const primary = asPhoto(opts.primary);
  const photos: ScrapedPhoto[] = [];
  const seen = new Set<string>();
  const push = (p: ScrapedPhoto | undefined): void => {
    if (!p || photos.length >= max) return;
    const key = p.original ?? p.url;
    if (seen.has(key)) return;
    seen.add(key);
    photos.push(p);
  };
  push(primary);

  let warning: string | undefined;
  let rest: ScrapedPhoto[] = [];
  try {
    rest = gallery();
  } catch (e) {
    warning = SECONDARY_FAILED_WARNING;
    opts.onError?.(e);
  }
  for (const p of rest) push(asPhoto(p));
  if (!photos.length) push(asPhoto(opts.fallback));
  return { primaryImage: photos[0]?.url, photos, warning };
}

/** The primary image of an already-built list (used when re-deriving a cached scrape). */
export function primaryImageOf(photos: readonly ScrapedPhoto[] | undefined): string | undefined {
  return photos?.[0]?.url;
}
