// FX (brief §8): a hardcoded fallback that always renders, a daily API on top of it, and the
// sheet's Rates tab on top of that. The invariant under test is that a price is ALWAYS printable —
// no network, a broken API, an empty sheet, all of them at once.
import { describe, expect, it, vi } from 'vitest';
import { money, SUPPORTED_CURRENCIES } from '../../src/lib/currency.ts';
import { FALLBACK_RATES, RatesCache, SYMBOLS, fetchRates, withSheetRates } from '../../src/lib/rates.ts';
import type { Rate } from '../../src/lib/sheets/types.ts';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('the hardcoded fallback table', () => {
  it('covers every currency the picker offers, GBP included', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(FALLBACK_RATES[c], c).toBeGreaterThan(0);
      expect(SYMBOLS[c], c).toBeTypeOf('string');
    }
    expect(FALLBACK_RATES.GBP).toBeGreaterThan(0);
    // Pegged to the dollar, so these are correct rather than merely stale.
    expect(FALLBACK_RATES.AED).toBeCloseTo(3.6725, 4);
    expect(FALLBACK_RATES.SAR).toBe(3.75);
    // "AED " and "SAR " keep their trailing space by design (reference line 105).
    expect(SYMBOLS.AED).toBe('AED ');
  });
});

describe('withSheetRates', () => {
  const base = { rates: { USD: 1, EUR: 0.92 }, symbols: { USD: '$', EUR: '€' } };
  it('lets the sheet pin a rate and a symbol, and ignores a blank or non-positive one', () => {
    const sheet: Rate[] = [
      { currency: 'EUR', rateToBase: 0.9, symbol: 'EUR ' },
      { currency: 'GBP', rateToBase: 0.8, symbol: '£' },
      { currency: 'CAD', rateToBase: 0, symbol: '' }, // a half-filled row must not blank a price
    ];
    const out = withSheetRates(base, sheet);
    expect(out.rates).toMatchObject({ USD: 1, EUR: 0.9, GBP: 0.8 });
    expect(out.rates.CAD).toBeUndefined();
    expect(out.symbols.EUR).toBe('EUR ');
    // The input is not mutated: the cached table stays clean for the next request.
    expect(base.rates.EUR).toBe(0.92);
  });
});

describe('fetchRates', () => {
  it('asks for every currency but the base and keeps only usable numbers', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return ok({ base: 'USD', rates: { eur: 0.93, GBP: 0.8, CAD: 0, MXN: 'nonsense' } });
    }) as unknown as typeof fetch;
    const out = await fetchRates({ url: 'https://fx.test/latest', base: 'USD', fetchImpl });
    expect(urls[0]).toContain('base=USD');
    expect(urls[0]).not.toContain('USD%2C'); // the base is not in the symbols list
    expect(urls[0]).toContain('GBP');
    expect(out).toEqual({ EUR: 0.93, GBP: 0.8 }); // zero and non-numeric dropped, keys upper-cased
  });

  it('throws on a non-200 and on a body with nothing usable', async () => {
    const bad = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchRates({ url: 'https://fx.test', base: 'USD', fetchImpl: bad })).rejects.toThrow(/503/);
    const empty = (async () => ok({ rates: {} })) as unknown as typeof fetch;
    await expect(fetchRates({ url: 'https://fx.test', base: 'USD', fetchImpl: empty })).rejects.toThrow(
      /no usable rates/,
    );
  });
});

describe('RatesCache', () => {
  const cache = (fetchImpl: typeof fetch, now = () => 0) =>
    new RatesCache({ base: 'USD', url: 'https://fx.test', refreshMs: 3600_000, fetchImpl, now });

  it('serves the fallback immediately, before any request has finished', () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const table = cache(never).get();
    expect(money(100, 'GBP', table, 'en-US')).toBe('£79');
    expect(money(100, 'AED', table, 'en-US')).toBe('AED 367');
  });

  it('serves live rates after a refresh and reports the source', async () => {
    const c = cache((async () => ok({ rates: { EUR: 0.5 } })) as unknown as typeof fetch, () => 1000);
    await c.refresh();
    expect(c.get().rates.EUR).toBe(0.5);
    // A currency the API does not quote keeps its pegged fallback rather than disappearing.
    expect(c.get().rates.SAR).toBe(3.75);
    expect(c.health()).toMatchObject({ source: 'api', lastError: null, fetchedAt: 1000 });
  });

  it('never throws when the API is down: the last good table stands and the error is recorded', async () => {
    let mode: 'ok' | 'down' = 'ok';
    const c = cache((async () => {
      if (mode === 'down') throw new Error('ECONNREFUSED');
      return ok({ rates: { EUR: 0.5 } });
    }) as unknown as typeof fetch);
    await c.refresh();
    mode = 'down';
    await expect(c.refresh()).resolves.toBeUndefined();
    expect(c.get().rates.EUR).toBe(0.5); // still the last good number
    expect(c.health().lastError).toMatch(/ECONNREFUSED/);
    expect(c.health().source).toBe('api');
  });

  it('is single-flight: concurrent refreshes make one request', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const fetchImpl = (async () => {
      calls++;
      await new Promise<void>((r) => (release = r));
      return ok({ rates: { EUR: 0.5 } });
    }) as unknown as typeof fetch;
    const c = cache(fetchImpl);
    const a = c.refresh();
    const b = c.refresh();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release!();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it('re-bases the fallback when the store does not sell in dollars', () => {
    const c = new RatesCache({
      base: 'EUR',
      url: 'https://fx.test',
      refreshMs: 3600_000,
      fetchImpl: (() => new Promise<Response>(() => {})) as unknown as typeof fetch,
      now: () => 0,
    });
    const table = c.get();
    expect(table.rates.EUR).toBe(1);
    // 1 EUR buys 1/0.92 USD ≈ 1.087.
    expect(table.rates.USD).toBeCloseTo(1 / FALLBACK_RATES.EUR!, 6);
  });
});
