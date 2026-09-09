// The sheet contract the admin and the site share (brief §2, §9).
import { describe, expect, it } from 'vitest';
import {
  HEADERS,
  PRODUCT_COLS,
  PRODUCT_HEADER_LABELS,
  PRODUCT_WIDTH,
  READ_RANGES,
  SETTINGS_SEED,
  TABS,
} from '../../../src/lib/sheets/contract.ts';
import { assertHeaders, parseProducts } from '../../../src/lib/sheets/parse.ts';
import { assertAdminHeaders } from '../../../src/lib/admin/read.ts';
import { SheetContractError } from '../../../src/lib/sheets/errors.ts';
import { rugRow } from '../../helpers/ranges.ts';

describe('the Products contract', () => {
  it("is Shopify's product-CSV column set plus the rug fields, keyed by Product ID", () => {
    expect(PRODUCT_HEADER_LABELS[0]).toBe('Product ID');
    expect(PRODUCT_HEADER_LABELS.slice(1, 9)).toEqual([
      'Handle',
      'Title',
      'Body (HTML)',
      'Vendor',
      'Product Category',
      'Type',
      'Tags',
      'Published',
    ]);
    for (const required of [
      'Variant Price',
      'Image Src',
      'Status',
      'Width CM',
      'Length CM',
      'Size Label',
      'Size Band',
      'Pile',
      'Shape',
      'Collection',
      'Source URL',
      'Drive Folder ID',
      'Commit Status',
      'Internal Notes',
    ]) {
      expect(PRODUCT_HEADER_LABELS).toContain(required);
    }
    expect(PRODUCT_WIDTH).toBe(PRODUCT_HEADER_LABELS.length);
    // The contract validates case-insensitively, so HEADERS holds the lowercase form.
    expect(HEADERS.Products).toEqual(PRODUCT_HEADER_LABELS.map((h) => h.toLowerCase()));
  });

  it('PRODUCT_COLS matches the header positions', () => {
    for (const [key, index] of Object.entries(PRODUCT_COLS)) {
      const label = PRODUCT_HEADER_LABELS[index];
      expect(label, `${key} → column ${index}`).toBeDefined();
    }
    expect(PRODUCT_COLS.productId).toBe(0);
    expect(PRODUCT_COLS.internalNotes).toBe(PRODUCT_WIDTH - 1);
    expect(new Set(Object.values(PRODUCT_COLS)).size).toBe(Object.values(PRODUCT_COLS).length);
  });

  it('reads every tab the brief names, in one batch', () => {
    expect(READ_RANGES).toEqual([
      'Products!A1:AP',
      'Collections!A1:G',
      'Tags!A1:D',
      'Rates!A1:D',
      'Reactions!A1:F5001',
      'Customers!A1:F',
    ]);
  });

  it("declares the append-only logs and the customer tab with the brief's columns", () => {
    expect(HEADERS.Reactions).toEqual([
      'event_id',
      'customer_slug',
      'product_id',
      'reaction',
      'source',
      'created_at',
    ]);
    expect(HEADERS.ReactionsArchive).toEqual(HEADERS.Reactions);
    expect(HEADERS.Visits).toEqual(['event_id', 'customer_slug', 'occurred_at', 'user_agent', 'referrer']);
    expect(HEADERS.Customers).toEqual([
      'slug',
      'display_name',
      'password_hash',
      'note',
      'created_at',
      'active',
    ]);
    // The brief's five Collections columns come first; ours trail.
    expect(HEADERS.Collections.slice(0, 5)).toEqual(['id', 'name', 'slug', 'description', 'created_at']);
    expect(SETTINGS_SEED.map(([k]) => k)).toContain('price_round_step');
    expect(TABS.products).toBe('Products');
  });

  it('assertHeaders tolerates trailing columns the reader does not use', () => {
    expect(() => assertHeaders(TABS.products, [...HEADERS.Products, 'extra'])).not.toThrow();
    expect(() => assertHeaders(TABS.products, HEADERS.Products.slice(0, 5))).toThrow(SheetContractError);
  });

  it('parses a full row and derives the counts from the Reactions log, never from a column', () => {
    const parsed = parseProducts([[...HEADERS.Products], rugRow({ id: 'SL-021', likes: 5, dislikes: 1 })]);
    expect(parsed.dropped).toEqual([]);
    const p = parsed.items[0]!;
    expect(p.id).toBe('SL-021');
    // parseProducts alone knows nothing about reactions: the snapshot merges them in.
    expect(p.likes).toBe(0);
    expect(p.dislikes).toBe(0);
    expect(p.rating).toBe(0);
  });

  it('assertAdminHeaders: ok for the contract row, "missing" when blank, contract error otherwise', () => {
    expect(assertAdminHeaders([...HEADERS.Products])).toBe('ok');
    expect(assertAdminHeaders(undefined)).toBe('missing');
    expect(assertAdminHeaders([])).toBe('missing');
    expect(() => assertAdminHeaders(['nope', ...HEADERS.Products.slice(1)])).toThrow(SheetContractError);
  });
});
