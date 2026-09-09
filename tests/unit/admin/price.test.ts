import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUND_STEP, roundUpTo5, roundUpToStep, suggestRetail } from '../../../src/lib/price.ts';

describe('roundUpToStep (ADMIN_SPEC §7)', () => {
  it('matches the spec examples for step 5', () => {
    const cases: Array<[number, number]> = [
      [700, 700],
      [701, 705],
      [1126, 1130],
      [1329.5, 1330],
      [1332, 1335],
      [1335, 1335],
      [1332.4, 1335],
      [12.5, 15],
      [1335.0000000000002, 1335],
      [0.1 + 0.2 + 4.7, 5],
    ];
    for (const [input, expected] of cases) expect(roundUpToStep(input, 5)).toBe(expected);
    expect(DEFAULT_ROUND_STEP).toBe(5);
    expect(roundUpToStep(1332)).toBe(1335); // default step
  });
  it('supports other steps (50, 1, 10)', () => {
    expect(roundUpToStep(1126, 50)).toBe(1150);
    expect(roundUpToStep(1150, 50)).toBe(1150);
    expect(roundUpToStep(1150.01, 50)).toBe(1200);
    expect(roundUpToStep(12.34, 1)).toBe(13);
    expect(roundUpToStep(12, 1)).toBe(12);
    expect(roundUpToStep(101, 10)).toBe(110);
  });
  it('falls back to 5 for a non-positive or fractional step', () => {
    expect(roundUpToStep(1332, 0)).toBe(1335);
    expect(roundUpToStep(1332, -5)).toBe(1335);
    expect(roundUpToStep(1332, 2.5)).toBe(1335);
    expect(roundUpToStep(1332, Number.NaN)).toBe(1335);
  });
  it('returns undefined for missing or invalid prices', () => {
    expect(roundUpToStep(undefined, 5)).toBeUndefined();
    expect(roundUpToStep(null, 5)).toBeUndefined();
    expect(roundUpToStep(0, 5)).toBeUndefined();
    expect(roundUpToStep(-1, 5)).toBeUndefined();
    expect(roundUpToStep(Number.POSITIVE_INFINITY, 5)).toBeUndefined();
  });
  it('keeps roundUpTo5 and suggestRetail as thin wrappers', () => {
    expect(roundUpTo5(1332)).toBe(1335);
    expect(roundUpTo5(1335.0000000000002)).toBe(1335);
    expect(suggestRetail(700, 1.6)).toBe(1120);
    expect(suggestRetail(833, 1.6)).toBe(1335);
    expect(suggestRetail(700, 1.6, 50)).toBe(1150);
    expect(suggestRetail(undefined, 1.6)).toBeUndefined();
    expect(suggestRetail(700, 0)).toBeUndefined();
  });
});
