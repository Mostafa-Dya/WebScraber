import type { Collection } from './sheets/types.ts';

// Small text helpers shared by the parser, the seed importer and the pages.

export function slugify(input: string, max = 80): string {
  const s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/g, '');
}

/** Splits a pipe-separated cell into trimmed, de-duplicated (case-insensitive) parts. */
export function splitPipe(cell: string | undefined): string[] {
  if (!cell) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cell.split('|')) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** Import-time canonicalisation of the legacy collection spellings (ADR D10.5). */
const CANONICAL_COLLECTIONS: Record<string, string> = {
  'wabi-sabi': 'Wabi Sabi',
  wabisabi: 'Wabi Sabi',
  'wabi sabi': 'Wabi Sabi',
  kilim: 'Kilims',
  kilims: 'Kilims',
  tulu: 'Tulu',
  tülü: 'Tulu',
};

export function canonicalCollection(name: string): string {
  const trimmed = name.trim();
  return CANONICAL_COLLECTIONS[trimmed.toLowerCase()] ?? trimmed;
}

export function normaliseKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Rugs without a collection are shown under the reference's catch-all tab (ADR D12). */
export const FALLBACK_COLLECTION = 'More';

export function displayCollection(name: string): string {
  return name.trim() || FALLBACK_COLLECTION;
}

/**
 * Collection slug: the Collections row's slug when the name matches (case-insensitively), else the
 * slugified name, never empty. Tabs, card filtering, counts and ordering all key on this one value,
 * so an owner-typed spelling variant ("Wabi-sabi") lands in the same tab as "Wabi Sabi".
 */
export function collectionSlug(name: string, collections: readonly Collection[]): string {
  const display = displayCollection(name);
  const hit = collections.find((c) => normaliseKey(c.name) === normaliseKey(display));
  return hit?.slug || slugify(display) || 'other';
}

/**
 * Splits the `Collection` cell into the names a product belongs to (owner requirement 2026-09-13).
 *
 * Pipe-only, deliberately unlike `splitTags`, which also accepts commas: a collection name is prose
 * the owner types, and "Wabi Sabi, Vol. 2" must stay one collection. A cell with no pipe is one
 * name — which is what every row written before this change already is, so no migration is needed.
 */
export function splitCollections(cell: string | undefined): string[] {
  return splitPipe(cell);
}

/** The inverse: the cell to write back. Trimmed, de-duplicated, pipe-joined. */
export function joinCollections(names: readonly string[]): string {
  return splitPipe(names.join('|')).join(' | ');
}

/**
 * Every slug a product should be reachable under, in the order the owner listed them.
 *
 * De-duplicated on the SLUG, not the name, because two spellings the owner typed ("Wabi-sabi" and
 * "Wabi Sabi") collapse to one tab and must not make the rug appear in it twice.
 */
export function collectionSlugs(names: readonly string[], collections: readonly Collection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names.length ? names : ['']) {
    const slug = collectionSlug(name, collections);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
