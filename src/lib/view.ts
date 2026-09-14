// Pure view helpers shared by pages and tested without Astro (docs/ADR.md D12).
import type { RateTable } from './currency.ts';
import { driveImageUrl } from './images.ts';
import { dataRot } from './rotate.ts';
import { orderedCollectionNames } from './sheets/parse.ts';
import type { Catalogue, Rug, Tag } from './sheets/types.ts';
import { STUDIO_EMAIL, STUDIO_WHATSAPP } from './studio.ts';
import { collectionSlug, collectionSlugs, displayCollection, normaliseKey, slugify } from './text.ts';

export interface CardView {
  id: string;
  slug: string;
  name: string;
  /** The primary collection's display name — the one label a card has room for. */
  collection: string;
  /** The primary collection's slug: the canonical tab, and the grouping key for lead-first order. */
  collectionSlug: string;
  /** Every collection this rug belongs to, primary first (owner requirement 2026-09-13). */
  collections: string[];
  /** The matching slugs, de-duplicated. Membership tests and tab filtering read THIS, not the primary. */
  collectionSlugs: string[];
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

/**
 * Tags that earn a corner badge on the card (owner, 2026-09-13): "whenever a product has the tag
 * Signed or/and Antique, this should be visible as a tag on the top left corner of the product card
 * for both admin and customer".
 *
 * Two names, not a general "badge any tag" mechanism: these two say something about provenance that
 * a buyer scanning a grid wants to see without opening anything. Badging every tag would turn the
 * corner into a second filter strip and bury exactly the signal this is for.
 */
export const BADGE_TAG_NAMES: readonly string[] = ['Signed', 'Antique'];

/**
 * The badges a rug's tags earn, in BADGE_TAG_NAMES order rather than the sheet's.
 *
 * Fixed order so a rug that is both Signed and Antique always reads the same way round, whichever
 * order the owner happened to type the tags in. Matching is case-insensitive: the Tags tab holds the
 * canonical spelling, but a rug row may carry whatever the owner typed.
 */
export function badgesFor(tagNames: readonly string[]): string[] {
  const have = new Set(tagNames.map(normaliseKey));
  return BADGE_TAG_NAMES.filter((name) => have.has(normaliseKey(name)));
}

/**
 * Like counts are shown only from five (owner, 2026-09-13): "the like count should be only visible
 * on the products that has 5 likes count or more".
 *
 * Below the threshold the number is hidden rather than shown as zero — "1 like" on a private preview
 * tells a buyer who else has been looking, and an empty heart says everything a lone like would.
 */
export const MIN_VISIBLE_LIKES = 5;

/** The like count to display, or undefined when it has not yet earned its place on the card. */
export function visibleLikes(likes: number | undefined): number | undefined {
  return likes !== undefined && likes >= MIN_VISIBLE_LIKES ? likes : undefined;
}

export function cardView(rug: Rug, catalogue: Catalogue): CardView {
  const photoUrls = rug.photos.map((id) => driveImageUrl(id, 1600));
  return {
    id: rug.id,
    slug: rug.slug,
    name: rug.name,
    collection: displayCollection(rug.collection),
    collectionSlug: collectionSlug(rug.collection, catalogue.collections),
    collections: (rug.collections?.length ? rug.collections : ['']).map(displayCollection),
    collectionSlugs: collectionSlugs(rug.collections ?? [], catalogue.collections),
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

/**
 * The cards that share at least one collection with `me`, in grid order.
 *
 * Overlap rather than equal primaries (owner requirement 2026-09-13): a rug filed under both Kilims
 * and Antique sits in two runs, and a buyer browsing either one should be able to walk to it. `me`
 * is always in the result, because a card always shares a collection with itself.
 */
function sameCollectionRun(cards: CardView[], me: CardView): CardView[] {
  const mine = new Set(me.collectionSlugs);
  return cards.filter((c) => c.collectionSlugs.some((s) => mine.has(s)));
}

/** Position of a rug within its collection, in grid order; no wrap-around. */
export function siblings(cards: CardView[], slug: string): Siblings | undefined {
  const me = cards.find((c) => c.slug === slug);
  if (!me) return undefined;
  const run = sameCollectionRun(cards, me);
  const i = run.indexOf(me);
  return { index: i, total: run.length, prev: run[i - 1], next: run[i + 1] };
}

/** Up to n rugs from the same collection, starting after the current one and wrapping around. */
export function relatedCards(cards: CardView[], slug: string, n = 4): CardView[] {
  const me = cards.find((c) => c.slug === slug);
  if (!me) return [];
  const run = sameCollectionRun(cards, me);
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
  // A rug with no collection at all still belongs somewhere: displayCollection() sends it to "More".
  const displayed = rugs.map((r) => ({
    ...r,
    collection: displayCollection(r.collection),
    collections: (r.collections?.length ? r.collections : ['']).map(displayCollection),
  }));
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
      // Membership, not primary: a rug in three collections is counted under all three, which is
      // what the client-side tab filter shows once a card carries every slug it belongs to.
      count: displayed.filter((r) => collectionSlugs(r.collections, catalogue.collections).includes(slug))
        .length,
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
