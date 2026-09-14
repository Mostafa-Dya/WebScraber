// A product in several collections (owner requirement 2026-09-13).
//
// The whole feature rests on one cell holding a pipe-separated list, so the tests that matter are
// the ones about the seam between "one cell" and "several memberships": that a cell written before
// this change still means exactly what it meant, that a name containing a comma survives, and that
// a rug filed twice is COUNTED once per tab but never twice within one tab.
import { describe, expect, it } from 'vitest';
import { collectionSlug, collectionSlugs, joinCollections, splitCollections } from '../../src/lib/text.ts';
import { parseProducts, orderedCollectionNames } from '../../src/lib/sheets/parse.ts';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { navTabs, cardView, relatedCards, siblings } from '../../src/lib/view.ts';
import type { Catalogue, Collection, Product } from '../../src/lib/sheets/types.ts';
import { rugRow } from '../helpers/ranges.ts';

const COLLECTIONS: Collection[] = [
  { id: 'kilims', slug: 'kilims', name: 'Kilims', description: '', sortOrder: 1 },
  { id: 'tulu', slug: 'tulu', name: 'Tulu', description: '', sortOrder: 2 },
  { id: 'antique', slug: 'antique', name: 'Antique', description: '', sortOrder: 3 },
];

describe('splitCollections', () => {
  it('reads a pre-change cell as exactly one collection', () => {
    // This is the migration guarantee: no sheet edit is needed for any row already written.
    expect(splitCollections('Kilims')).toEqual(['Kilims']);
  });

  it('keeps a comma inside a name, unlike splitTags', () => {
    // "Wabi Sabi, Vol. 2" is one collection the owner typed, not two.
    expect(splitCollections('Wabi Sabi, Vol. 2')).toEqual(['Wabi Sabi, Vol. 2']);
  });

  it('splits on the pipe, trims, and drops blanks left by a trailing separator', () => {
    expect(splitCollections('Kilims | Tulu |')).toEqual(['Kilims', 'Tulu']);
  });

  it('de-duplicates case-insensitively, so a typo cannot file a rug twice', () => {
    expect(splitCollections('Kilims|kilims|KILIMS')).toEqual(['Kilims']);
  });

  it('treats an empty or missing cell as no collections at all', () => {
    expect(splitCollections('')).toEqual([]);
    expect(splitCollections(undefined)).toEqual([]);
  });
});

describe('joinCollections', () => {
  it('round-trips through the cell', () => {
    const names = ['Kilims', 'Antique'];
    expect(splitCollections(joinCollections(names))).toEqual(names);
  });

  it('de-duplicates on the way in, so a double-ticked form cannot write a duplicate', () => {
    expect(joinCollections(['Kilims', 'kilims'])).toBe('Kilims');
  });
});

describe('collectionSlugs', () => {
  it('maps every name to its Collections-tab slug, in the order given', () => {
    expect(collectionSlugs(['Antique', 'Kilims'], COLLECTIONS)).toEqual(['antique', 'kilims']);
  });

  it('collapses two spellings that resolve to one tab', () => {
    // Both spell the same tab, so the rug must appear in it once, not twice.
    const spellings = ['Kilims', 'kilims'];
    expect(spellings.map((n) => collectionSlug(n, COLLECTIONS))).toEqual(['kilims', 'kilims']);
    expect(collectionSlugs(spellings, COLLECTIONS)).toEqual(['kilims']);
  });

  it('sends a rug with no collection to the catch-all rather than nowhere', () => {
    expect(collectionSlugs([], COLLECTIONS)).toEqual(['more']);
  });
});

describe('parseProducts', () => {
  const parse = (cell: string): Product =>
    parseProducts([[...HEADERS.Products], rugRow({ id: 'SL-001', collection: cell })]).items[0]!;

  it('reads several collections from one cell and keeps the first as the primary', () => {
    const p = parse('Kilims | Antique');
    expect(p.collections).toEqual(['Kilims', 'Antique']);
    expect(p.collection).toBe('Kilims');
  });

  it('leaves a single-collection row indistinguishable from before', () => {
    const p = parse('Kilims');
    expect(p.collections).toEqual(['Kilims']);
    expect(p.collection).toBe('Kilims');
  });

  it('reports no collections and an empty primary for a blank cell', () => {
    const p = parse('');
    expect(p.collections).toEqual([]);
    expect(p.collection).toBe('');
  });
});

describe('orderedCollectionNames', () => {
  it('offers a tab for a collection that only ever appears as a SECOND membership', () => {
    // Antique is nobody's primary. Reading only `collection` would silently hide the tab.
    const products = [
      { collection: 'Kilims', collections: ['Kilims', 'Antique'] },
      { collection: 'Tulu', collections: ['Tulu'] },
    ] as Product[];
    expect(orderedCollectionNames(products, COLLECTIONS)).toEqual(['Kilims', 'Tulu', 'Antique']);
  });
});

/** A catalogue whose rugs are built straight from `collections` lists. */
function catalogueOf(rows: Array<{ id: string; collections: string[] }>): Catalogue {
  const rugs = rows.map(
    (r, i) =>
      ({
        id: r.id,
        slug: r.id.toLowerCase(),
        name: r.id,
        collections: r.collections,
        collection: r.collections[0] ?? '',
        tags: [],
        photos: [],
        status: 'active',
        likes: 0,
        dislikes: 0,
        rating: 0,
        rotate: 'false',
        featured: false,
        description: '',
        material: '',
        age: '',
        origin: '',
        method: '',
        pile: '',
        widthCm: 100 + i,
        lengthCm: 200,
      }) as unknown as Product,
  );
  return { rugs, collections: COLLECTIONS, tags: [], rates: [], customers: [] } as unknown as Catalogue;
}

describe('navTabs', () => {
  it('counts a rug under every collection it belongs to', () => {
    const cat = catalogueOf([
      { id: 'A', collections: ['Kilims', 'Antique'] },
      { id: 'B', collections: ['Kilims'] },
      { id: 'C', collections: ['Tulu'] },
    ]);
    const counts = Object.fromEntries(navTabs(cat.rugs, cat).map((t) => [t.slug, t.count]));
    // A is in two tabs at once — that is the whole point of the feature.
    expect(counts).toMatchObject({ kilims: 2, antique: 1, tulu: 1 });
  });

  it('never counts one rug twice in the same tab when two spellings collapse', () => {
    const cat = catalogueOf([{ id: 'A', collections: ['Kilims', 'kilims'] }]);
    const counts = Object.fromEntries(navTabs(cat.rugs, cat).map((t) => [t.slug, t.count]));
    expect(counts.kilims).toBe(1);
  });
});

describe('cardView', () => {
  it('carries every slug so one filter can drive the grid', () => {
    const cat = catalogueOf([{ id: 'A', collections: ['Kilims', 'Antique'] }]);
    const card = cardView(cat.rugs[0]!, cat);
    expect(card.collectionSlugs).toEqual(['kilims', 'antique']);
    expect(card.collectionSlug).toBe('kilims'); // the primary is still the canonical route
  });
});

describe('siblings and relatedCards', () => {
  const cat = catalogueOf([
    { id: 'A', collections: ['Kilims'] },
    { id: 'B', collections: ['Kilims', 'Antique'] },
    { id: 'C', collections: ['Antique'] },
    { id: 'D', collections: ['Tulu'] },
  ]);
  const cards = cat.rugs.map((r) => cardView(r, cat));

  it('walks to a rug that shares ANY collection, not just the same primary', () => {
    // C's primary is Antique; B's is Kilims. They still sit in one run because both are Antique.
    expect(relatedCards(cards, 'c').map((x) => x.id)).toEqual(['B']);
  });

  it('excludes a rug that shares no collection at all', () => {
    expect(relatedCards(cards, 'a').map((x) => x.id)).not.toContain('D');
  });

  it('reports a position within the shared run', () => {
    const s = siblings(cards, 'a');
    expect(s?.total).toBe(2); // A and B share Kilims
    expect(s?.next?.id).toBe('B');
  });
});
