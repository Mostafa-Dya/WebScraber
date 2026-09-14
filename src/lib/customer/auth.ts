// Customer realm authentication (brief §10). Entirely separate from the admin: a different cookie
// name per slug, a different secret input, and no shared session type — a customer cookie can never
// unlock another slug or /admin.
//
// Passwords are generated server-side (never typed by the owner), shown once, and stored only as a
// hash. The brief asks for argon2 or bcrypt; this uses Node's built-in scrypt with OWASP parameters
// — the same memory-hard family, no native dependency, and the same primitive the admin already
// uses (recorded as a deliberate deviation in docs/ADR.md D16).
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from '../admin/auth.ts';

export { hashPassword, verifyPassword };

/** Slugs the customer realm may never occupy: they are real routes or asset prefixes (brief §10). */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'login',
  'logout',
  '_astro',
  '_image',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  // Routes this project also serves outside the customer realm.
  'rugs',
  'tags',
];

// Mirrors CLIENT_CODE_RE: `-` and `_` may appear inside a scrambled customer route, never at either
// end. Kept within the sheet's customer_slug alphabet so a route that resolves is also a row that parses.
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9\-_]{0,38}[a-z0-9])?$/;

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

export function slugIsUsable(slug: string): boolean {
  return SLUG_RE.test(slug) && !isReservedSlug(slug);
}

/**
 * Readable over the phone, pasteable into WhatsApp, no ambiguous characters: three lowercase words
 * plus two digits, e.g. `amber-loom-serai-47` (brief §10).
 */
const WORDS: readonly string[] = [
  'amber',
  'anchor',
  'arbor',
  'aspen',
  'basalt',
  'bazaar',
  'cedar',
  'cinnabar',
  'cobalt',
  'copper',
  'cotton',
  'damask',
  'dune',
  'ember',
  'fennel',
  'flint',
  'garnet',
  'harvest',
  'heather',
  'indigo',
  'ivory',
  'jasper',
  'juniper',
  'kilim',
  'lantern',
  'linen',
  'loom',
  'madder',
  'marble',
  'meadow',
  'mulberry',
  'nomad',
  'ochre',
  'olive',
  'orchard',
  'papyrus',
  'pebble',
  'pergola',
  'pomegranate',
  'quarry',
  'quince',
  'reed',
  'saffron',
  'sandal',
  'serai',
  'sienna',
  'silk',
  'sorrel',
  'sumac',
  'tallow',
  'terrace',
  'thistle',
  'tulip',
  'umber',
  'vellum',
  'walnut',
  'willow',
  'yarrow',
];

/**
 * The floor for a password the owner types in themselves. Shorter than the admin's twelve because
 * this one is read down a phone and typed on a handset, and the login is already throttled to five
 * attempts per address per fifteen minutes. Anything the studio picks should still be more than a
 * first name.
 */
export const CUSTOMER_MIN_PASSWORD = 8;

/** The message the admin shows for a password that is too short; also the API's 400 text. */
export function customerPasswordProblem(password: string): string | undefined {
  const value = password.trim();
  if (value.length < CUSTOMER_MIN_PASSWORD) {
    return `A password needs at least ${CUSTOMER_MIN_PASSWORD} characters.`;
  }
  if (value.length > 200) return 'That password is too long.';
  return undefined;
}

/** Hashes a buyer's password under the customer realm's own minimum. */
export function hashCustomerPassword(password: string): string {
  return hashPassword(password.trim(), { minLength: CUSTOMER_MIN_PASSWORD });
}

export function generatePassword(): string {
  const pick = (): string => WORDS[randomInt(WORDS.length)]!;
  const a = pick();
  let b = pick();
  while (b === a) b = pick();
  let c = pick();
  while (c === a || c === b) c = pick();
  return `${a}-${b}-${c}-${String(randomInt(10, 100))}`;
}

/* ---------- session cookie ---------- */

/** 7 days, matching the admin's absolute window (brief §10). */
export const CUSTOMER_SESSION_MS = 7 * 24 * 3600_000;
const MAX_TOKEN_LENGTH = 512;

export interface CustomerSession {
  slug: string;
  /** Epoch ms when the cookie stops being accepted. */
  exp: number;
}

/**
 * One cookie per slug, so a cookie for `hala` is never even sent to `/nadia`. `__Host-` requires
 * Secure, so plain names are used on http (local development).
 */
export function customerCookieName(slug: string, secure: boolean): string {
  return `${secure ? '__Host-' : ''}sl_c_${slug}`;
}

function sign(payload: string, secret: string, slug: string): Buffer {
  // The slug is inside the signed payload *and* the key derivation: a token minted for one customer
  // cannot be replayed against another even if the cookie is copied across names.
  return createHmac('sha256', `${secret}:customer:${slug}`).update(payload).digest();
}

export function makeCustomerToken(session: CustomerSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret, session.slug).toString('base64url')}`;
}

export function verifyCustomerToken(
  token: string | undefined,
  slug: string,
  secret: string,
  now: number,
): CustomerSession | undefined {
  if (!token || token.length > MAX_TOKEN_LENGTH) return undefined;
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  const payload = token.slice(0, dot);
  let given: Buffer;
  try {
    given = Buffer.from(token.slice(dot + 1), 'base64url');
  } catch {
    return undefined;
  }
  const expected = sign(payload, secret, slug);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  let session: CustomerSession;
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as CustomerSession;
  } catch {
    return undefined;
  }
  if (typeof session?.slug !== 'string' || typeof session?.exp !== 'number') return undefined;
  if (session.slug !== slug) return undefined; // belt and braces: the payload must name this realm
  if (session.exp <= now) return undefined;
  return session;
}

export function newCustomerSession(slug: string, now: number): CustomerSession {
  return { slug, exp: now + CUSTOMER_SESSION_MS };
}
