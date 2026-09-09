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
