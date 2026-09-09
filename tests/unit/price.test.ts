import { describe, expect, it } from 'vitest';
import { roundUpTo5, suggestRetail } from '../../src/lib/price.ts';

describe('roundUpTo5 (admin price rule)', () => {
  it('rounds up to the nearest multiple of five', () => {
    expect(roundUpTo5(1332)).toBe(1335);
    expect(roundUpTo5(1335)).toBe(1335);
    expect(roundUpTo5(1332.4)).toBe(1335);
    expect(roundUpTo5(1336)).toBe(1340);
    expect(roundUpTo5(12.5)).toBe(15);
    expect(roundUpTo5(1)).toBe(5);
    expect(roundUpTo5(5)).toBe(5);
    expect(roundUpTo5(10_200)).toBe(10_200);
  });
  it('is stable against floating-point noise', () => {
    expect(roundUpTo5(1335.0000000000002)).toBe(1335);
    expect(roundUpTo5(0.1 + 0.2 + 4.7)).toBe(5);
  });
  it('returns undefined for missing or invalid prices', () => {
    expect(roundUpTo5(undefined)).toBeUndefined();
    expect(roundUpTo5(null)).toBeUndefined();
    expect(roundUpTo5(0)).toBeUndefined();
    expect(roundUpTo5(-40)).toBeUndefined();
    expect(roundUpTo5(Number.NaN)).toBeUndefined();
    expect(roundUpTo5(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('suggestRetail', () => {
  it('applies the markup and then rounds up', () => {
    expect(suggestRetail(800, 1.6)).toBe(1280);
    expect(suggestRetail(833, 1.6)).toBe(1335); // 1332.8 → 1335
    expect(suggestRetail(833, 1)).toBe(835);
  });
  it('rejects a missing price or a non-positive markup', () => {
    expect(suggestRetail(undefined, 1.6)).toBeUndefined();
    expect(suggestRetail(800, 0)).toBeUndefined();
    expect(suggestRetail(800, Number.NaN)).toBeUndefined();
  });
});
