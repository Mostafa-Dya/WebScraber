import { describe, expect, it } from 'vitest';
import {
  CLIENT_CODE_RE,
  clientCode,
  clientLink,
  clientToCells,
  newClientCode,
  parseClients,
  rand6,
  scrambleName,
} from '../../../src/lib/admin/clients.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';
import { isReservedSlug } from '../../../src/lib/customer/auth.ts';

/** The site's Votes `client` column rule (src/lib/sheets/parse.ts CLIENT_RE, handler.ts Body.client). */
const SITE_CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The CUSTOMERS tab's own `slug` rule (src/lib/sheets/parse.ts SLUG_RE, CustomerRow.slug).
 *
 * This is the constraint that actually governs, and checking only SITE_CLIENT_RE above is what let
 * the underscore bug ship: the two columns do NOT share an alphabet. A code this rejects is written
 * to the sheet happily and then dropped on every read, and because `Customers` is a GUARDED_TAB at a
 * 0.1 drop ratio, a couple of such customers reject the whole refresh and 503 the entire site.
 */
const CUSTOMERS_SLUG_RE = /^[a-z0-9-]{1,80}$/;

describe('client codes (ADMIN_SPEC §6.1, owner 2026-09-13)', () => {
  /**
   * A deterministic stand-in for the crypto source: always returns 0, so Fisher-Yates is the
   * identity, the first gaps are chosen and every filler is the first digit. That makes the scramble
   * fully predictable without pretending the real generator is.
   */
  const zero = (): number => 0;
  /** Cycles 0,1,2,… modulo the bound, which exercises the shuffle without being random. */
  const cycle = (): ((max: number) => number) => {
    let n = 0;
    return (max: number) => n++ % max;
  };

  it('rand6 still draws six [a-z0-9] characters (kept for callers that want a plain suffix)', () => {
    for (let i = 0; i < 50; i++) expect(rand6()).toMatch(/^[a-z0-9]{6}$/);
  });

  it('takes about half the name, scrambled, with fillers woven inside', () => {
    // "Gida Hussami" slugifies to "gidahussami" (11), so 6 characters survive, plus 3-4 fillers.
    const code = scrambleName('Gida Hussami', cycle());
    const letters = [...code].filter((c) => /[a-z]/.test(c));
    expect(letters).toHaveLength(6);
    expect(code.length).toBeGreaterThanOrEqual(9);
    expect(code.length).toBeLessThanOrEqual(10);
    // Every character came from the name or from the filler alphabet — nothing invented.
    for (const c of letters) expect('gidahussami').toContain(c);
  });

  it('never starts or ends with a filler, however the randomness falls', () => {
    for (const name of ['Gida Hussami', 'Nadia', 'Ana Lee', 'A B C D E F G H', 'xy']) {
      for (let i = 0; i < 40; i++) {
        const code = clientCode(name);
        expect(code).toMatch(/^[a-z0-9]/);
        expect(code).toMatch(/[a-z0-9]$/);
      }
    }
  });

  it('only ever uses characters the SHEET can store, not just ones a URL can carry', () => {
    // `~` and `.` are legal in a path but NOT in the Customers customer_slug / Reactions client
    // column (/^[A-Za-z0-9_-]{1,64}$/). A code containing one would make the buyer's own row
    // unparseable, so the generator must never produce one.
    for (const name of ['Gida Hussami', 'نادية', 'Ana Lee', 'Zoë Mårtensson']) {
      for (let i = 0; i < 40; i++) {
        const code = clientCode(name);
        expect(code).toMatch(CLIENT_CODE_RE);
        expect(code).toMatch(SITE_CLIENT_RE);
        expect(code).not.toMatch(/[~.%]/);
        expect(code.length).toBeLessThanOrEqual(28);
      }
    }
  });

  it('still produces a usable code for a name with no Latin letters at all', () => {
    // slugify('نادية') is empty, so the code falls back to random characters of the same shape
    // rather than throwing and blocking the owner from adding the customer.
    for (let i = 0; i < 20; i++) {
      const code = clientCode('نادية');
      expect(code).toMatch(CLIENT_CODE_RE);
      expect(code.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps a very short name long enough to be a route', () => {
    // "xy" is 2 characters; half would be 1, which is both ugly and trivially enumerable.
    const letters = [...clientCode('xy', zero)].filter((c) => /[a-z0-9]/.test(c));
    expect(letters.length).toBeGreaterThanOrEqual(2);
  });

  it('retries on a collision and gives up loudly rather than reusing a taken route', () => {
    // `zero` is deterministic, so every attempt produces the same code: eight tries, then a throw.
    const code = clientCode('Nadia', zero);
    expect(() => newClientCode('Nadia', [code], zero)).toThrow(/collision/);
    // Case-insensitive: a row stored upper-case still counts as taken.
    expect(() => newClientCode('Nadia', [code.toUpperCase()], zero)).toThrow(/collision/);
    // With nothing taken, the same deterministic code comes back.
    expect(newClientCode('Nadia', [], zero)).toBe(code);
  });

  it('never hands out a route that would shadow a real one', () => {
    // Structural, not accidental: every code carries an interior digit or symbol and never starts
    // with one, while every reserved slug is pure letters, starts with "_", or contains ".". The
    // property is asserted over the names most likely to collide.
    for (const name of ['Admin', 'API', 'Login', 'Assets', 'Rugs', 'Tags', 'Robots']) {
      for (let i = 0; i < 40; i++) {
        expect(isReservedSlug(clientCode(name))).toBe(false);
      }
    }
  });

  it('keeps a one-character name usable instead of refusing the customer', () => {
    // "X" alone would scramble to a single character, which CLIENT_CODE_RE rejects; the pool is
    // padded so the owner can still add a customer whose name is one letter.
    for (let i = 0; i < 20; i++) expect(clientCode('X')).toMatch(CLIENT_CODE_RE);
  });

  it('never mints a code the Customers tab would reject — the site-down guard', () => {
    // The regression this exists for: `_` was a filler until 2026-09-14, 38.9 % of codes carried
    // one, every such row was dropped on read, and the guarded-tab ratio turned that into a
    // catalogue-wide 503. Both alphabets must hold, and the Customers one is the strict one.
    const names = ['Gida Hussami', 'Ana Lee', 'X', 'Hala Nasser', 'نادية', '中村 花子', 'a'.repeat(60)];
    for (const name of names) {
      for (let i = 0; i < 300; i++) {
        const code = clientCode(name);
        expect(code, `${name} -> ${code}`).toMatch(CUSTOMERS_SLUG_RE);
        expect(code, `${name} -> ${code}`).toMatch(SITE_CLIENT_RE);
        expect(code, `${name} -> ${code}`).toMatch(CLIENT_CODE_RE);
      }
    }
  });

  it('refuses an underscore outright, so the old filler cannot come back', () => {
    // CLIENT_CODE_RE is the one guard `clientCode` checks before returning, so tightening it is what
    // makes a re-widened FILLER_SYMBOLS fail loudly instead of silently taking the site down.
    expect('hi6g2a3a_s').not.toMatch(CLIENT_CODE_RE);
    expect(() => clientLink('https://x.test', 'hi6g2a3a_s')).toThrow();
  });

  it('keeps the longest name ClientInput allows addable, rather than throwing a 500', () => {
    // ClientInput caps the name at 60 characters and the field has no maxlength, so "half of it"
    // plus fillers used to overflow CLIENT_CODE_RE's 28 and `clientCode` threw — the owner simply
    // could not add that customer.
    for (const name of ['a'.repeat(60), 'Mohammed Bin Abdulaziz Al-Rashid Interior Design Studio LLC']) {
      for (let i = 0; i < 50; i++) {
        const code = clientCode(name);
        expect(code.length, code).toBeLessThanOrEqual(28);
        expect(code).toMatch(CLIENT_CODE_RE);
      }
    }
  });

  it('builds the link from the runtime origin only', () => {
    expect(clientLink('https://catalogue.serioludere.com/some/path', 'hi6g2a3a-s')).toBe(
      'https://catalogue.serioludere.com/hi6g2a3a-s',
    );
    expect(clientLink('http://localhost:4321', 'x-1')).toBe('http://localhost:4321/x-1');
    expect(() => clientLink('https://x.test', 'Bad Code')).toThrow();
  });
});

describe('parseClients', () => {
  it('maps rows newest-first with row numbers, drops malformed slugs, keeps inactive ones', () => {
    const { items, dropped } = parseClients([
      [...HEADERS.Customers],
      ['nadia-k7m2pq', 'Nadia', 'scrypt.131072.8.1.aa.bb', 'VIP', '2026-09-07T00:00:00Z', true],
      ['omar-aaaaaa', 'Omar', 'scrypt.131072.8.1.cc.dd', '', '', false],
      ['Bad Code', 'x', '', '', '', true],
      [],
    ]);
    expect(dropped).toBe(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      row: 2,
      code: 'nadia-k7m2pq',
      name: 'Nadia',
      note: 'VIP',
      status: 'active',
    });
    // An inactive customer keeps their history; they simply cannot sign in.
    expect(items[1]).toMatchObject({ row: 3, code: 'omar-aaaaaa', status: 'revoked' });
    // The hash round-trips through the row builder and is never part of the public view.
    expect(clientToCells(items[0]!)).toEqual([
      'nadia-k7m2pq',
      'Nadia',
      'scrypt.131072.8.1.aa.bb',
      'VIP',
      '2026-09-07T00:00:00Z',
      true,
    ]);
  });
});
