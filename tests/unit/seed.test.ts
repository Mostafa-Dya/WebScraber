// The seed builder turns the legacy catalogue JSON into Products rows (brief §9).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_COLS, PRODUCT_WIDTH } from '../../src/lib/sheets/contract.ts';
import { buildSeed, type LegacyRug } from '../../scripts/lib/seed.ts';
import { BADGE_TAG_NAMES } from '../../src/lib/view.ts';

const NOW = '2026-09-05T00:00:00.000Z';
const live = JSON.parse(
  readFileSync(resolve(process.cwd(), 'reference/live_catalogue.2026-09-05.json'), 'utf8'),
) as { rugs?: LegacyRug[] };
const seed = buildSeed(live.rugs ?? [], NOW);
const col = (row: unknown[], key: keyof typeof PRODUCT_COLS): unknown => row[PRODUCT_COLS[key]];
const byId = (id: string): unknown[] | undefined => seed.products.find((r) => col(r, 'productId') === id);

describe('buildSeed → Products rows', () => {
  it('imports all 20 published rugs, every row the full width, with the test row as the only draft', () => {
    expect(seed.products).toHaveLength(20);
    expect(seed.products.every((r) => r.length === PRODUCT_WIDTH)).toBe(true);
    const drafts = seed.products.filter((r) => col(r, 'status') === 'draft');
    expect(drafts.map((r) => col(r, 'title'))).toEqual(['Test // testing']);
    expect(drafts[0] && col(drafts[0], 'published')).toBe(false);
  });

  it('fills the Shopify variant columns so the tab imports without remapping', () => {
    const row = seed.products[0]!;
    expect(col(row, 'option1Name')).toBe('Title');
    expect(col(row, 'option1Value')).toBe('Default Title');
    expect(col(row, 'variantInventoryPolicy')).toBe('deny');
    expect(col(row, 'variantRequiresShipping')).toBe(true);
    expect(col(row, 'variantTaxable')).toBe(true);
    expect(col(row, 'imageAltText')).toBe(col(row, 'title'));
  });

  it('canonicalises the collection, comma-joins tags and carries only the primary image', () => {
    const winks = byId('SL-021');
    expect(winks).toBeDefined();
    expect(col(winks!, 'collection')).toBe('Kilims');
    expect(String(col(winks!, 'tags'))).toContain(', ');
    expect(String(col(winks!, 'tags'))).not.toContain('|');
    // Image Src holds the primary only; any others are noted for the owner (brief §9).
    const withExtras = seed.products.find((r) => String(col(r, 'internalNotes')).includes('extra photos'));
    if (withExtras) expect(String(col(withExtras, 'imageSrc'))).not.toContain('|');
  });

  it('derives the size label and band from the dimensions', () => {
    const sized = seed.products.find((r) => typeof col(r, 'widthCm') === 'number');
    expect(sized).toBeDefined();
    expect(String(col(sized!, 'sizeLabel'))).toMatch(/^\d+(\.\d)? × \d+(\.\d)? cm$/);
    expect(['XS', 'S', 'M', 'L', 'XL']).toContain(col(sized!, 'sizeBand'));
  });

  it('leaves unknown dimensions blank, keeps ids as strings and fixes the age typo', () => {
    const blank = buildSeed(
      [{ id: '1389', name: 'Tulu', collection: 'Tulu', age: 'Anitque', rotate: true }],
      NOW,
    );
    const row = blank.products[0]!;
    expect(col(row, 'productId')).toBe('1389');
    expect(col(row, 'widthCm')).toBe('');
    expect(col(row, 'lengthCm')).toBe('');
    expect(col(row, 'sizeLabel')).toBe('');
    expect(col(row, 'age')).toBe('Antique');
    // rotate has no Shopify column: it rides on Tags.
    expect(String(col(row, 'tags')).split(', ')).toContain('rotate');
  });

  it('reports anomalies in notes (blank id, missing name, non-Drive photo)', () => {
    const odd = buildSeed(
      [
        { name: 'No Id', collection: 'Kilims' },
        { id: 'x', collection: 'Kilims' },
        { id: 'y', name: 'Bad Photo', photos: ['https://example.com/a.jpg'] },
      ],
      NOW,
    );
    expect(odd.notes.join('\n')).toMatch(/blank id/);
    expect(odd.notes.join('\n')).toMatch(/without a name/);
    expect(odd.notes.join('\n')).toMatch(/not a Drive URL/);
  });

  it('seeds the reference collections in order with the brief column order', () => {
    expect(seed.collections[0]?.[1]).toBe('Classics'); // id, name, slug, description, created_at, …
    expect(seed.collections[0]?.[2]).toBe('classics');
    expect(seed.collections[0]?.[4]).toBe(NOW);
    expect(seed.collections.map((c) => c[1]).slice(0, 4)).toEqual(['Classics', 'Gabbeh', 'Modern', 'Kilims']);
  });

  it('seeds distinct tags with slugs', () => {
    const slugs = seed.tags.map((t) => t[1]);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(seed.tags.every((t) => /^[a-z0-9-]+$/.test(String(t[1])))).toBe(true);
  });

  it('seeds the badge tags, so the Signed / Antique corner badge is reachable on a fresh sheet', () => {
    // `badgesFor()` keys the corner badge off a rug's TAGS (owner requirement, 2026-09-13). "Signed"
    // is seeded as a COLLECTION, and the Tags tab was built only from names the reference catalogue
    // happened to contain — which has Antique and not Signed. So on a fresh sheet there was no Tags
    // row, therefore no chip in the rug form, therefore no way to apply it, therefore a badge that
    // could never appear. Half the feature was inert the moment the sheet was created.
    const names = seed.tags.map((t) => String(t[2]).toLowerCase());
    for (const badge of BADGE_TAG_NAMES) {
      expect(names, `${badge} must be applicable from the admin`).toContain(badge.toLowerCase());
    }
  });

  it('does not duplicate a badge tag the reference catalogue already uses', () => {
    // The reference set contains "Antique"; seeding it again would put two rows in the Tags tab and
    // two identical chips in the rug form.
    const antique = seed.tags.filter((t) => String(t[2]).toLowerCase() === 'antique');
    expect(antique).toHaveLength(1);
  });
});
