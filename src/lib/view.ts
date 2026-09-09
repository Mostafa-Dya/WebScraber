// Pure view helpers shared by pages and tested without Astro (docs/ADR.md D12).
import type { RateTable } from './currency.ts';
import { driveImageUrl } from './images.ts';
import { dataRot } from './rotate.ts';
import { orderedCollectionNames } from './sheets/parse.ts';
import type { Catalogue, Rug, Tag } from './sheets/types.ts';
import { STUDIO_EMAIL, STUDIO_WHATSAPP } from './studio.ts';
import { collectionSlug, displayCollection, normaliseKey, slugify } from './text.ts';

export interface CardView {
  id: string;
  slug: string;
  name: string;
  collection: string;
  collectionSlug: string;
  photoUrl?: string;
  photoUrls: string[];
  rot: 'force' | '1' | '0';
  widthCm?: number;
  lengthCm?: number;
  material: string;
  age: string;
  origin: string;
  method: string;
  /** Shown in the preview's specification block; `shape` is stored but deliberately never shown. */
  pile: string;
  description: string;
  priceUsd?: number;
  likes: number;
  dislikes: number;
  rating: number;
  tags: Array<{ name: string; slug: string }>;
  /** Plate ratio bucket predicted from the dims and the rotate flag (docs/DESIGN.md §5.2). */
  ar?: Bucket;
  featured?: boolean;
  /** Set by withLeads(): the card spans two columns at the front of its collection. */
  lead?: boolean;
  /** Drive ids of every photo (the gallery builds =w800/=w1600 URLs from them). */
  photoIds?: string[];
  /** =w800 of the second photo, for a hover quick view. */
  altPhotoUrl?: string;
}

export interface NavTab {
  name: string;
  slug: string;
  count: number;
  /** The Collections tab's description, shown as the standfirst; empty when none. */
  description: string;
}

/** Plate ratio buckets: width ÷ height of the displayed photo, snapped in log space. */
export type Bucket = '1-2' | '2-3' | '3-4' | '1-1' | '4-3' | '3-2' | '2-1';
const BUCKETS: ReadonlyArray<[Bucket, number]> = [
  ['1-2', 0.5],
  ['2-3', 2 / 3],
  ['3-4', 0.75],
  ['1-1', 1],
  ['4-3', 4 / 3],
  ['3-2', 1.5],
  ['2-1', 2],
];
const LANDSCAPE: readonly Bucket[] = ['1-1', '4-3', '3-2', '2-1'];

/**
 * The plate a photo is shown in, predicted before the first byte: portrait when the sheet says so
 * (rot '1') or when the rug is longer than wide; unknown dims → the reference's 3/4.
 */
export function plateRatio(
  widthCm: number | undefined,
  lengthCm: number | undefined,
  rot: 'force' | '1' | '0',
): Bucket {
  if (!widthCm || !lengthCm) return '3-4';
  const lo = Math.min(widthCm, lengthCm);
  const hi = Math.max(widthCm, lengthCm);
  const portrait = rot === '1' || lengthCm >= widthCm;
  const r = portrait ? lo / hi : hi / lo;
  let best: Bucket = '3-4';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [bucket, value] of BUCKETS) {
    const d = Math.abs(Math.log(r) - Math.log(value));
    if (d < bestDistance) {
      bestDistance = d;
      best = bucket;
    }
  }
  return best;
}

export function activeRugs(catalogue: Catalogue): Rug[] {
  return catalogue.rugs.filter((r) => r.status === 'active');
}

export { FALLBACK_COLLECTION, collectionSlug, displayCollection } from './text.ts';

export function tagSlug(name: string, tags: Tag[]): string {
  const hit = tags.find((t) => normaliseKey(t.name) === normaliseKey(name));
  return hit?.slug ?? slugify(name);
}

export function cardView(rug: Rug, catalogue: Catalogue): CardView {
  const photoUrls = rug.photos.map((id) => driveImageUrl(id, 1600));
  return {
    id: rug.id,
    slug: rug.slug,
    name: rug.name,
    collection: displayCollection(rug.collection),
    collectionSlug: collectionSlug(rug.collection, catalogue.collections),
    photoUrl: rug.photos[0] ? driveImageUrl(rug.photos[0], 800) : undefined,
    photoUrls,
    rot: dataRot(rug.rotate),
    widthCm: rug.widthCm,
    lengthCm: rug.lengthCm,
    material: rug.material,
    age: rug.age,
    origin: rug.origin,
    method: rug.method,
    pile: rug.pile,
    description: rug.description,
    priceUsd: rug.priceUsd,
    likes: rug.likes,
    dislikes: rug.dislikes,
    rating: rug.rating,
    tags: rug.tags.map((name) => ({ name, slug: tagSlug(name, catalogue.tags) })),
    ar: plateRatio(rug.widthCm, rug.lengthCm, dataRot(rug.rotate)),
    featured: rug.featured,
    photoIds: rug.photos,
    altPhotoUrl: rug.photos[1] ? driveImageUrl(rug.photos[1], 800) : undefined,
  };
}

/**
 * Lead-first ordering (docs/DESIGN.md §3.5): in every collection with at least three rugs, the first
 * featured rug whose plate is landscape or square moves to the front of the collection's run and
 * spans two columns. Idempotent; everything else keeps its relative order.
 */
export function withLeads(cards: CardView[]): CardView[] {
  const out: CardView[] = cards.map((c) => ({ ...c, lead: false }));
  const runs = new Map<string, CardView[]>();
  for (const c of out) {
    const run = runs.get(c.collectionSlug) ?? [];
    run.push(c);
    runs.set(c.collectionSlug, run);
  }
  for (const run of runs.values()) {
    if (run.length < 3) continue;
    const lead = run.find((c) => c.featured === true && LANDSCAPE.includes(c.ar ?? '3-4'));
    if (!lead) continue;
    lead.lead = true;
    const firstIdx = out.indexOf(run[0]!);
    const leadIdx = out.indexOf(lead);
    if (leadIdx !== firstIdx) {
      out.splice(leadIdx, 1);
      out.splice(firstIdx, 0, lead);
    }
  }
  return out;
}

export interface Siblings {
  index: number;
  total: number;
  prev?: CardView;
  next?: CardView;
}

/** Position of a rug within its collection, in grid order; no wrap-around. */
export function siblings(cards: CardView[], slug: string): Siblings | undefined {
  const me = cards.find((c) => c.slug === slug);
  if (!me) return undefined;
  const run = cards.filter((c) => c.collectionSlug === me.collectionSlug);
  const i = run.indexOf(me);
  return { index: i, total: run.length, prev: run[i - 1], next: run[i + 1] };
}

/** Up to n rugs from the same collection, starting after the current one and wrapping around. */
export function relatedCards(cards: CardView[], slug: string, n = 4): CardView[] {
  const me = cards.find((c) => c.slug === slug);
  if (!me) return [];
  const run = cards.filter((c) => c.collectionSlug === me.collectionSlug);
  const i = run.indexOf(me);
  return [...run.slice(i + 1), ...run.slice(0, i)].slice(0, n);
}

export interface EnquiryLinks {
  whatsapp: string;
  mailto: string;
  askPhotos: string;
}

/** Enquiry links with the rug's name and reference id pre-filled (docs/DESIGN.md §4.1). */
export function enquiryLinks(name: string, id: string): EnquiryLinks {
  const ref = `${name} (ref ${id})`;
  return {
    whatsapp: `https://wa.me/${STUDIO_WHATSAPP}?text=${encodeURIComponent(`Hi Serio Ludere, I am interested in ${ref}.`)}`,
    mailto: `mailto:${STUDIO_EMAIL}?subject=${encodeURIComponent(ref)}`,
    askPhotos: `mailto:${STUDIO_EMAIL}?subject=${encodeURIComponent(`Photos of ${ref}`)}`,
  };
}

/**
 * Tabs in the reference order (Collections.sort_order, else the ORDER list), with counts.
 * Every spelling that resolves to one slug ("Kilims" / "kilims" / "Wabi-sabi" / "Wabi Sabi") is one
 * tab whose count matches the cards the client filter shows; blank collections count under "More".
 */
export function navTabs(rugs: Rug[], catalogue: Catalogue): NavTab[] {
  const displayed = rugs.map((r) => ({ ...r, collection: displayCollection(r.collection) }));
  const names = orderedCollectionNames(displayed, catalogue.collections);
  const tabs: NavTab[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const slug = collectionSlug(name, catalogue.collections);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const canonical = catalogue.collections.find((c) => c.slug === slug)?.name ?? name;
    tabs.push({
      name: canonical,
      slug,
      count: displayed.filter((r) => collectionSlug(r.collection, catalogue.collections) === slug).length,
      description: catalogue.collections.find((c) => c.slug === slug)?.description.trim() ?? '',
    });
  }
  return tabs;
}

/** Rates and symbols for money(); USD is always present so a Rates tab without it cannot blank every price. */
export function ratesTable(catalogue: Catalogue): RateTable {
  const rates: Record<string, number> = { USD: 1 };
  const symbols: Record<string, string> = { USD: '$' };
  for (const r of catalogue.rates) {
    rates[r.currency] = r.rateToBase;
    symbols[r.currency] = r.symbol;
  }
  return { rates, symbols };
}

/** "4.6 · 23 votes" in the mono meta idiom; null when nobody has voted. */
export function ratingText(likes: number, dislikes: number, rating: number): string | null {
  const votes = likes + dislikes;
  if (votes === 0) return null;
  return `${rating.toFixed(1)} · ${votes} ${votes === 1 ? 'vote' : 'votes'}`;
}

export function findRugBySlug(rugs: Rug[], slug: string): Rug | undefined {
  return rugs.find((r) => r.slug === slug);
}

export function rugsWithTag(
  rugs: Rug[],
  slug: string,
  catalogue: Catalogue,
): { name: string; rugs: Rug[] } | undefined {
  const tag = catalogue.tags.find((t) => t.slug === slug);
  const matches = rugs.filter((r) => r.tags.some((name) => tagSlug(name, catalogue.tags) === slug));
  if (!tag && matches.length === 0) return undefined;
  const name = tag?.name ?? matches[0]?.tags.find((n) => tagSlug(n, catalogue.tags) === slug) ?? slug;
  return { name, rugs: matches };
}

/**
 * JSON safe for a <script type="application/json"> block (ADR D12): `<`, `>`, `&` and the two
 * Unicode line separators become JSON \uXXXX escapes so </script> can never appear.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const SLUG_PARAM_RE = /^[a-z0-9-]{1,80}$/;
