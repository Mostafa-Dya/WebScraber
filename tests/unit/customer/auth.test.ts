import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SESSION_MS,
  RESERVED_SLUGS,
  customerCookieName,
  generatePassword,
  hashPassword,
  isReservedSlug,
  makeCustomerToken,
  newCustomerSession,
  slugIsUsable,
  verifyCustomerToken,
  verifyPassword,
} from '../../../src/lib/customer/auth.ts';

const SECRET = 's'.repeat(32);

describe('generated customer passwords (brief §10)', () => {
  it('is three distinct lowercase words and two digits', () => {
    for (let i = 0; i < 40; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
      const words = p.split('-').slice(0, 3);
      expect(new Set(words).size).toBe(3); // never "amber-amber-amber-12"
    }
  });

  it('is not guessable from a small sample: 40 draws are 40 different passwords', () => {
    const seen = new Set(Array.from({ length: 40 }, () => generatePassword()));
    expect(seen.size).toBe(40);
  });

  it('round-trips through the scrypt hash and rejects a near miss', () => {
    const password = generatePassword();
    // Test parameters: the production N would make this suite take minutes.
    const hash = hashPassword(password, { N: 2 ** 12 });
    expect(hash).toContain('scrypt.');
    expect(hash).not.toContain(password);
    expect(verifyPassword(hash, password)).toBe(true);
    expect(verifyPassword(hash, `${password} `)).toBe(false);
    expect(verifyPassword(hash, password.toUpperCase())).toBe(false);
    expect(verifyPassword(undefined, password)).toBe(false);
  });
});

describe('reserved slugs (brief §10)', () => {
  it('refuses every real route prefix, case-insensitively', () => {
    for (const s of RESERVED_SLUGS) {
      expect(isReservedSlug(s), s).toBe(true);
      expect(isReservedSlug(s.toUpperCase()), s).toBe(true);
      expect(slugIsUsable(s), s).toBe(false);
    }
    expect(RESERVED_SLUGS).toContain('admin');
    expect(RESERVED_SLUGS).toContain('api');
  });

  it('accepts an ordinary buyer slug and refuses a malformed one', () => {
    expect(slugIsUsable('nadia-k7m2pq')).toBe(true);
    expect(slugIsUsable('a')).toBe(true);
    expect(slugIsUsable('-nadia')).toBe(false);
    expect(slugIsUsable('nadia-')).toBe(false);
    expect(slugIsUsable('Nadia')).toBe(false);
    expect(slugIsUsable('a'.repeat(41))).toBe(false);
  });
});

describe('customer session cookies (brief §10)', () => {
  it('names the cookie per slug and only asks for __Host- on https', () => {
    expect(customerCookieName('hala', false)).toBe('sl_c_hala');
    expect(customerCookieName('hala', true)).toBe('__Host-sl_c_hala');
    expect(customerCookieName('nadia', true)).not.toBe(customerCookieName('hala', true));
  });

  it('round-trips a session and expires it after seven days', () => {
    const now = 1_800_000_000_000;
    const session = newCustomerSession('hala', now);
    expect(session.exp - now).toBe(CUSTOMER_SESSION_MS);
    const token = makeCustomerToken(session, SECRET);
    expect(verifyCustomerToken(token, 'hala', SECRET, now)).toEqual(session);
    expect(verifyCustomerToken(token, 'hala', SECRET, session.exp)).toBeUndefined();
    expect(verifyCustomerToken(token, 'hala', SECRET, session.exp - 1)).toEqual(session);
  });

  it('refuses a token replayed against another slug, a tampered payload or another secret', () => {
    const now = Date.now();
    const token = makeCustomerToken(newCustomerSession('hala', now), SECRET);
    expect(verifyCustomerToken(token, 'nadia', SECRET, now)).toBeUndefined();
    expect(verifyCustomerToken(token, 'hala', 'x'.repeat(32), now)).toBeUndefined();
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ slug: 'nadia', exp: now + 1000 }), 'utf8').toString(
      'base64url',
    );
    expect(verifyCustomerToken(`${forged}.${sig}`, 'nadia', SECRET, now)).toBeUndefined();
    expect(verifyCustomerToken(`${payload}.`, 'hala', SECRET, now)).toBeUndefined();
    expect(verifyCustomerToken(undefined, 'hala', SECRET, now)).toBeUndefined();
    expect(verifyCustomerToken('no-dot', 'hala', SECRET, now)).toBeUndefined();
    expect(verifyCustomerToken(`${'x'.repeat(600)}.y`, 'hala', SECRET, now)).toBeUndefined();
  });
});
