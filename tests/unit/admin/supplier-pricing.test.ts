// Per-supplier retail formulas (owner, 2026-09-13).
//
// The interesting part is not the arithmetic, it is the BOUNDARIES. The owner's wording is
// "if X<500 then add 100 USD, if X=500 to 1000 then add 150 USD, if X>1000 then add 200 USD", which
// makes 500 and 1000 both belong to the middle band. Off-by-one here silently mis-prices every rug
// that lands on a round number — and supplier prices land on round numbers constantly.
import { describe, expect, it } from 'vitest';
import {
  ecarpetgalleryRetail,
  karavanBand,
  karavanRetail,
  pricingRuleName,
  supplierRetail,
} from '../../../src/lib/price.ts';

describe('karavanBand', () => {
  it('adds 100 below 500', () => {
    expect(karavanBand(1)).toBe(100);
    expect(karavanBand(499.99)).toBe(100);
  });

  it('adds 150 across the inclusive 500–1000 band, both ends included', () => {
    expect(karavanBand(500)).toBe(150); // "X=500 to 1000" — 500 is IN the middle band
    expect(karavanBand(750)).toBe(150);
    expect(karavanBand(1000)).toBe(150); // …and so is 1000
  });

  it('adds 200 above 1000', () => {
    expect(karavanBand(1000.01)).toBe(200);
    expect(karavanBand(5000)).toBe(200);
  });
});

describe('karavanRetail', () => {
  it('multiplies by 0.7 then 2, then adds the band for the BASE price', () => {
    // The band reads the scraped price, not the multiplied one: 400 × 1.4 = 560, which would sit in
    // the middle band, but 400 is below 500 so the flat amount is 100, not 150.
    expect(karavanRetail(400)).toBe(660);
  });

  it('works through the owner-supplied worked values', () => {
    expect(karavanRetail(500)).toBe(850); // 700 + 150
    expect(karavanRetail(1000)).toBe(1550); // 1400 + 150
    expect(karavanRetail(1001)).toBeCloseTo(1601.4, 6); // 1401.4 + 200
    expect(karavanRetail(4000)).toBe(5800); // 5600 + 200
  });
});

describe('ecarpetgalleryRetail', () => {
  it('multiplies by 1.5 then adds a flat 150', () => {
    expect(ecarpetgalleryRetail(700)).toBe(1200);
    expect(ecarpetgalleryRetail(0.01)).toBeCloseTo(150.015, 6);
    expect(ecarpetgalleryRetail(1000)).toBe(1650);
  });
});

describe('supplierRetail', () => {
  it('rounds the formula up to the step, leaving the setting that owners actually tune in charge', () => {
    // 833 × 1.5 + 150 = 1399.5 → next 5 is 1400; next 50 is 1400 as well.
    expect(supplierRetail('ecarpetgallery', 833, undefined, 5)).toBe(1400);
    expect(supplierRetail('ecarpetgallery', 810, undefined, 50)).toBe(1400); // 1365 → 1400
  });

  it('ignores the Settings markup for a supplier that has a formula', () => {
    // A stale retail_markup row must not quietly override the rule the owner wrote down.
    const withMarkup = supplierRetail('karavanrug', 4000, 99, 5);
    const without = supplierRetail('karavanrug', 4000, undefined, 5);
    expect(withMarkup).toBe(without);
    expect(withMarkup).toBe(5800);
  });

  it('prices a formula supplier even with no markup configured at all', () => {
    expect(supplierRetail('karavanrug', 600, undefined)).toBe(990); // 840 + 150, already a multiple of 5
  });

  it('falls back to the plain multiplier for owned stock and anything unrecognised', () => {
    expect(supplierRetail('', 700, 1.6, 5)).toBe(1120);
    expect(supplierRetail('somewhere-else', 700, 2, 5)).toBe(1400);
  });

  it('gives no suggestion for unowned stock without a markup', () => {
    expect(supplierRetail('', 700, undefined)).toBeUndefined();
    expect(supplierRetail('', 700, 0)).toBeUndefined();
  });

  it('gives no suggestion without a usable price, formula or not', () => {
    expect(supplierRetail('karavanrug', undefined, 1.6)).toBeUndefined();
    expect(supplierRetail('karavanrug', 0, 1.6)).toBeUndefined();
    expect(supplierRetail('karavanrug', -5, 1.6)).toBeUndefined();
    expect(supplierRetail('ecarpetgallery', Number.NaN, 1.6)).toBeUndefined();
  });
});

describe('pricingRuleName', () => {
  it('names the rule for each supplier that has one, so the form can show what was applied', () => {
    expect(pricingRuleName('karavanrug')).toContain('0.7');
    expect(pricingRuleName('ecarpetgallery')).toContain('1.5');
  });

  it('names nothing for a supplier priced by the plain multiplier', () => {
    expect(pricingRuleName('')).toBeUndefined();
  });
});
