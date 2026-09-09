import { describe, expect, it } from 'vitest';
import { money, type RateTable } from '../../src/lib/currency.ts';

const table: RateTable = {
  rates: { USD: 1, MXN: 17.5, CAD: 1.37, EUR: 0.92, AED: 3.67, SAR: 3.75 },
  symbols: { USD: '$', MXN: '$', CAD: '$', EUR: '€', AED: 'AED ', SAR: 'SAR ' },
};

describe('money (ported from the reference)', () => {
  it('formats symbol + rounded, grouped amount', () => {
    expect(money(1332, 'USD', table, 'en-US')).toBe('$1,332');
    expect(money(1332, 'MXN', table, 'en-US')).toBe('$23,310');
    expect(money(1332, 'EUR', table, 'en-US')).toBe('€1,225');
  });
  it('keeps the trailing space of AED/SAR symbols', () => {
    expect(money(600, 'AED', table, 'en-US')).toBe('AED 2,202');
    expect(money(600, 'SAR', table, 'en-US')).toBe('SAR 2,250');
  });
  it('is empty for missing price or unknown currency', () => {
    expect(money(undefined, 'USD', table)).toBe('');
    expect(money(0, 'USD', table)).toBe('');
    expect(money(10, 'GBP', table)).toBe('');
  });
});
