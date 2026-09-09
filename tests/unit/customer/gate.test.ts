import { describe, expect, it } from 'vitest';
import {
  customerGate,
  customerRealmEnabled,
  classify,
  normalisePath,
  sessionSlug,
  type CustomerGateConfig,
} from '../../../src/lib/customer/gate.ts';
import { customerCookieName, makeCustomerToken, newCustomerSession } from '../../../src/lib/customer/auth.ts';

const SECRET = 's'.repeat(32);
const config = (over: Partial<CustomerGateConfig> = {}): CustomerGateConfig => ({
  secret: SECRET,
  publicCatalogue: true,
  isSecureSite: false,
  ...over,
});

/** A context whose cookie jar holds exactly the pairs given. */
function ctx(pathname: string, cookies: Record<string, string> = {}) {
  return {
    url: new URL(`https://preview.test${pathname}`),
    cookies: { get: (n: string) => (n in cookies ? { value: cookies[n]! } : undefined) },
    locals: {} as { customer?: string },
  };
}

describe('customer gate: default-deny classification (brief §10)', () => {
  it('normalises a trailing slash', () => {
    expect(normalisePath('/hala/')).toBe('/hala');
    expect(normalisePath('/')).toBe('/');
  });

  it('always allows the admin, the API and the build assets, session or not', () => {
    for (const p of [
      '/admin',
      '/admin/rugs/SL-021',
      '/api/admin/rugs',
      '/api/customers/hala/login',
      '/api/health',
      '/api/reactions',
      '/_astro/index.abc.js',
      '/favicon.ico',
    ]) {
      expect(classify(p, config()), p).toEqual({ kind: 'public' });
    }
  });

  it('allows the public catalogue only while PUBLIC_CATALOGUE is on', () => {
    expect(classify('/', config())).toEqual({ kind: 'public' });
    expect(classify('/rugs/winks', config())).toEqual({ kind: 'public' });
    expect(classify('/tags/kilim', config())).toEqual({ kind: 'public' });
    const off = config({ publicCatalogue: false });
    // Switched off, the root is not a customer slug either: it is simply denied (the brief's posture).
    expect(classify('/', off)).toEqual({ kind: 'deny' });
    expect(classify('/rugs/winks', off)).toEqual({ kind: 'deny' });
    expect(classify('/admin', off)).toEqual({ kind: 'public' });
  });

  it('classifies a customer realm and its product page', () => {
    expect(classify('/hala', config())).toEqual({ kind: 'customer', slug: 'hala' });
    expect(classify('/hala/SL-021', config())).toEqual({
      kind: 'customer',
      slug: 'hala',
      productId: 'SL-021',
    });
  });

  it('denies reserved slugs, malformed slugs and anything deeper than two segments', () => {
    for (const p of [
      '/rugs', // reserved even with the public catalogue off
      '/Hala', // uppercase is not a slug
      '/-hala',
      '/hala-',
      '/a'.repeat(60),
      '/hala/SL-021/extra',
      '/hala/bad id',
    ]) {
      expect(classify(p, config({ publicCatalogue: false })).kind, p).toBe('deny');
    }
  });

  it('denies every realm path when AUTH_SECRET is missing or too short', () => {
    expect(customerRealmEnabled({ secret: undefined })).toBe(false);
    expect(customerRealmEnabled({ secret: 'short' })).toBe(false);
    expect(customerRealmEnabled({ secret: SECRET })).toBe(true);
    expect(classify('/hala', config({ secret: undefined }))).toEqual({ kind: 'deny' });
    // …but the public catalogue and the admin still work with the realm switched off.
    expect(classify('/', config({ secret: undefined }))).toEqual({ kind: 'public' });
    expect(classify('/admin', config({ secret: undefined }))).toEqual({ kind: 'public' });
  });
});

describe('customer gate: per-realm sessions (brief §10)', () => {
  const token = (slug: string) => makeCustomerToken(newCustomerSession(slug, Date.now()), SECRET);

  it('accepts the cookie minted for this slug', () => {
    const c = ctx('/hala', { [customerCookieName('hala', false)]: token('hala') });
    expect(sessionSlug(c, 'hala', config())).toBe('hala');
    const out = customerGate(c, config());
    expect(out).toEqual({ route: { kind: 'customer', slug: 'hala' }, customer: 'hala' });
    expect(c.locals.customer).toBe('hala');
  });

  it('ignores another buyer’s cookie, even copied under this slug’s name', () => {
    // Nadia's valid token, renamed to Hala's cookie: the slug is inside the payload AND the key.
    const c = ctx('/hala', { [customerCookieName('hala', false)]: token('nadia') });
    expect(sessionSlug(c, 'hala', config())).toBeUndefined();
    expect(customerGate(c, config()).customer).toBeUndefined();
    expect(c.locals.customer).toBeUndefined();
  });

  it('ignores a cookie for a different slug that happens to be present', () => {
    const c = ctx('/hala', { [customerCookieName('nadia', false)]: token('nadia') });
    expect(customerGate(c, config()).customer).toBeUndefined();
  });

  it('rejects an expired session and a token signed with another secret', () => {
    const expired = makeCustomerToken({ slug: 'hala', exp: Date.now() - 1 }, SECRET);
    expect(
      sessionSlug(ctx('/hala', { [customerCookieName('hala', false)]: expired }), 'hala', config()),
    ).toBeUndefined();
    const foreign = makeCustomerToken(newCustomerSession('hala', Date.now()), 'x'.repeat(32));
    expect(
      sessionSlug(ctx('/hala', { [customerCookieName('hala', false)]: foreign }), 'hala', config()),
    ).toBeUndefined();
  });

  it('never attaches a session to a public path', () => {
    const c = ctx('/admin', { [customerCookieName('hala', false)]: token('hala') });
    expect(customerGate(c, config())).toEqual({ route: { kind: 'public' } });
    expect(c.locals.customer).toBeUndefined();
  });
});
