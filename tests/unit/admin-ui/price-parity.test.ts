// The client copy of roundUpToStep (src/scripts/admin/price.ts) must agree with the server rule
// (src/lib/price.ts) on every input, including the §7 examples and binary-noise cases.
import { describe, expect, it } from 'vitest';
import { roundUpToStep as server } from '../../../src/lib/price.ts';
import { DEFAULT_ROUND_STEP, parsePrice, roundUpToStep as client } from '../../../src/scripts/admin/price.ts';

describe('roundUpToStep parity (ADMIN_SPEC §7)', () => {
  const cases: Array<[number | undefined | null, number | undefined]> = [
    [700, undefined],
    [701, undefined],
    [1126, undefined],
    [1329.5, undefined],
    [1332, undefined],
    [1335, undefined],
    [1332.4, undefined],
    [12.5, undefined],
    [1335.0000000000002, undefined],
    [0.1 + 0.2 + 4.7, undefined],
    [1126, 50],
    [999.99, 50],
    [0, undefined],
    [-5, undefined],
    [Number.NaN, undefined],
    [undefined, undefined],
    [null, undefined],
    [5, 0],
    [5, 2.5],
    [1000000, 1000],
  ];
  it.each(cases)('price %s step %s', (price, step) => {
    expect(client(price, step)).toBe(server(price, step));
  });
  it('sweeps a range of cents at several steps', () => {
    for (const step of [1, 5, 10, 50]) {
      for (let cents = 0; cents < 250_000; cents += 137) {
        const price = cents / 100;
        expect(client(price, step)).toBe(server(price, step));
      }
    }
  });
  it('pins the documented examples', () => {
    expect(client(1332)).toBe(1335);
    expect(client(1332.4)).toBe(1335);
    expect(client(12.5)).toBe(15);
    expect(client(1126, 50)).toBe(1150);
    expect(DEFAULT_ROUND_STEP).toBe(5);
  });
  it('parsePrice accepts what the owner types and refuses the rest', () => {
    expect(parsePrice(' $1,335.50 ')).toBe(1335.5);
    expect(parsePrice('700')).toBe(700);
    expect(parsePrice('')).toBeUndefined();
    expect(parsePrice('12.345')).toBeUndefined();
    expect(parsePrice('abc')).toBeUndefined();
  });
});
