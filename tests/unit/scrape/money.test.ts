import { describe, expect, it } from 'vitest';
import {
  detectCurrency,
  normaliseCurrency,
  parseAmount,
  parseMoney,
  priceToUsd,
  retailSuggestion,
  roundUpToStep,
} from '../../../src/lib/scrape/money.ts';

describe('parseAmount (ADMIN_SPEC §4.7)', () => {
  it('handles the separator rules', () => {
    expect(parseAmount('USD $700 ECARPETGALLERY')).toBe(700);
    expect(parseAmount('USD $1,290 Estimated Retail')).toBe(1290);
    expect(parseAmount('4,000.00')).toBe(4000);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('1,50')).toBe(1.5);
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('1,234,567.89')).toBe(1234567.89);
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('910.00')).toBe(910);
    expect(parseAmount('€ 1 290,00')).toBe(1290);
    expect(parseAmount('7')).toBe(7);
  });
  it('returns undefined without a number', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount(undefined)).toBeUndefined();
    expect(parseAmount('call for price')).toBeUndefined();
  });
});

describe('detectCurrency / parseMoney', () => {
  it('reads codes before symbols and knows the Canadian dollar', () => {
    expect(detectCurrency('USD $700')).toBe('USD');
    expect(detectCurrency('CA$980')).toBe('CAD');
    expect(detectCurrency('C$ 980')).toBe('CAD');
    expect(detectCurrency('$450')).toBe('USD');
    expect(detectCurrency('900 €')).toBe('EUR');
    expect(detectCurrency('£1,000')).toBe('GBP');
    expect(detectCurrency('₺ 12.000')).toBe('TRY');
    expect(detectCurrency('12.000 TL')).toBe('TRY');
    expect(detectCurrency('eur 900')).toBe('EUR');
    expect(detectCurrency('nothing')).toBeUndefined();
  });
  it('parseMoney combines both', () => {
    expect(parseMoney('USD $700 ECARPETGALLERY')).toEqual({ amount: 700, currency: 'USD' });
    expect(parseMoney('  4,000.00 ')).toEqual({ amount: 4000, currency: undefined });
    expect(parseMoney('sold')).toBeUndefined();
  });
  it('normaliseCurrency accepts only 3-letter codes', () => {
    expect(normaliseCurrency(' usd ')).toBe('USD');
    expect(normaliseCurrency('US')).toBeUndefined();
    expect(normaliseCurrency(42)).toBeUndefined();
  });
});

describe('priceToUsd', () => {
  it('keeps USD verbatim and treats a missing currency as USD', () => {
    expect(priceToUsd(700, 'USD')).toEqual({ priceUsd: 700 });
    expect(priceToUsd(700, undefined)).toEqual({ priceUsd: 700 });
    expect(priceToUsd(undefined, 'USD')).toEqual({});
  });
  it('converts through the Rates tab and flags it as an estimate', () => {
    const convert = (amount: number, currency: string) => (currency === 'EUR' ? amount / 0.9 : undefined);
    const eur = priceToUsd(900, 'EUR', convert);
    expect(eur.priceUsd).toBe(1000);
    expect(eur.warning).toMatch(/converted from EUR 900/);
    const cad = priceToUsd(980, 'CAD', convert);
    expect(cad.priceUsd).toBeUndefined();
    expect(cad.warning).toMatch(/CAD/);
    expect(priceToUsd(980, 'CAD').priceUsd).toBeUndefined();
  });
});

describe('retailSuggestion / roundUpToStep (ADMIN_SPEC §7)', () => {
  it('applies the markup then rounds up to the step', () => {
    expect(retailSuggestion(700, 1.6)).toBe(1120);
    expect(retailSuggestion(833, 1.6)).toBe(1335);
    expect(retailSuggestion(700.5, 1)).toBe(705);
    expect(retailSuggestion(1126, 1, 50)).toBe(1150);
    expect(retailSuggestion(1126, 1, 0)).toBe(1130);
  });
  it('is blank without a price or a positive markup', () => {
    expect(retailSuggestion(undefined, 1.6)).toBeUndefined();
    expect(retailSuggestion(700, undefined)).toBeUndefined();
    expect(retailSuggestion(700, 0)).toBeUndefined();
    expect(retailSuggestion(700, Number.NaN)).toBeUndefined();
  });
  it('re-exports the shared roundUpToStep', () => {
    expect(roundUpToStep(1332)).toBe(1335);
    expect(roundUpToStep(1126, 50)).toBe(1150);
    expect(roundUpToStep(1335.0000000000002)).toBe(1335);
  });
});
