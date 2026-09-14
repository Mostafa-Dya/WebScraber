// Public JSON for GET /api/catalogue (docs/ADR.md D1): active rugs with public fields only.
// Never vote state, visitor hashes, user agents or client ids.
import { driveImageUrl } from '../images.ts';
import type { Snapshot } from '../sheets/types.ts';
import { activeRugs, visibleLikes } from '../view.ts';

export interface CatalogueDto {
  ok: true;
  fetchedAt: string;
  count: number;
  rugs: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    collection: string;
    tags: string[];
    photos: string[];
    widthCm: number | null;
    lengthCm: number | null;
    material: string;
    age: string;
    origin: string;
    method: string;
    priceUsd: number | null;
    rotate: 'force' | 'true' | 'false';
    featured: boolean;
    likes: number | null;
    dislikes: number | null;
    rating: number | null;
  }>;
  collections: Array<{ slug: string; name: string; description: string; sortOrder: number | null }>;
  tags: Array<{ slug: string; name: string; color: string | null }>;
  rates: Array<{ currency: string; rateToBase: number; symbol: string }>;
}

export function catalogueDto(snapshot: Snapshot): CatalogueDto {
  const c = snapshot.catalogue;
  return {
    ok: true,
    fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
    count: activeRugs(c).length,
    rugs: activeRugs(c).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      collection: r.collection,
      tags: r.tags,
      photos: r.photos.map((id) => driveImageUrl(id, 1600)),
      widthCm: r.widthCm ?? null,
      lengthCm: r.lengthCm ?? null,
      material: r.material,
      age: r.age,
      origin: r.origin,
      method: r.method,
      priceUsd: r.priceUsd ?? null,
      rotate: r.rotate,
      featured: r.featured,
      /*
       * Thresholded, like every other surface. `/api/catalogue` is on the PUBLIC allowlist
       * (customer/gate.ts) whenever PUBLIC_CATALOGUE is on, which it is by default — so this
       * endpoint published every rug's exact like count to anyone who asked, while the card that
       * shows the number was carefully hiding it below five. Hiding a count in the UI and serving
       * it raw from an unauthenticated JSON endpoint is not hiding it.
       */
      likes: visibleLikes(r.likes) ?? null,
      dislikes: visibleLikes(r.likes) === undefined ? null : r.dislikes,
      rating: visibleLikes(r.likes) === undefined ? null : r.rating,
    })),
    collections: c.collections.map((x) => ({
      slug: x.slug,
      name: x.name,
      description: x.description,
      sortOrder: x.sortOrder ?? null,
    })),
    tags: c.tags.map((t) => ({ slug: t.slug, name: t.name, color: t.color ?? null })),
    rates: c.rates.map((r) => ({ currency: r.currency, rateToBase: r.rateToBase, symbol: r.symbol })),
  };
}
