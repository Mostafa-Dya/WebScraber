// The customer realm gate (brief §10), pure: src/middleware.ts wires it into Astro's `sequence()`.
//
// Two rules live here.
//
// 1. **Default-deny.** Every request is matched against an explicit allowlist of public prefixes.
//    Anything that is not on it, and is not a syntactically valid customer slug, is a 404 before it
//    reaches a page. The public catalogue (`/`, `/rugs/*`, `/tags/*`) is on the allowlist only while
//    `PUBLIC_CATALOGUE` is true; setting it to false gives exactly the brief's posture, where the
//    site serves nothing but `/{slug}` and `/admin`.
//
// 2. **Per-realm sessions.** A verified cookie for `/{slug}` puts that slug in `locals.customer`.
//    Cookies are named per slug (`sl_c_<slug>`), signed with the slug mixed into the HMAC key, and
//    carry the slug in the payload, so a cookie minted for one buyer can never unlock another's
//    preview or /admin — the gate re-derives the expected name from the path, not from the cookie.
//
// The gate deliberately does NOT read the sheet: an unknown-but-well-formed slug reaches the page,
// which resolves it against the cached snapshot and answers 404 itself. Middleware stays free of
// I/O so a 404 costs nothing.
import { isReservedSlug, verifyCustomerToken, customerCookieName, SLUG_RE } from './auth.ts';

/** Prefixes served without a customer session. `/api/customers` is the login endpoint itself. */
const ALWAYS_PUBLIC: readonly string[] = [
  '/admin',
  '/api/admin',
  '/api/customers',
  '/api/health',
  '/api/revalidate',
  '/api/reactions',
  '/api/rates',
  '/api/image',
  '/_astro',
  '/_image',
  '/_server-islands',
  '/_actions',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/assets',
];

/** Additional prefixes served only while the public catalogue is switched on. */
const PUBLIC_CATALOGUE_PATHS: readonly string[] = ['/rugs', '/tags', '/api/catalogue'];

export interface CustomerGateConfig {
  /** `AUTH_SECRET`; undefined disables the customer realm entirely (every `/{slug}` is a 404). */
  secret: string | undefined;
  /** `PUBLIC_CATALOGUE`: keeps `/`, `/rugs/*` and `/tags/*` reachable without a session. */
  publicCatalogue: boolean;
  isSecureSite: boolean;
  now?: () => number;
}

/** The slice of Astro's APIContext this gate touches (structural, so tests pass a plain object). */
export interface CustomerGateContext {
  url: URL;
  cookies: { get(name: string): { value: string } | undefined };
  locals: { customer?: string };
}

export function customerRealmEnabled(config: Pick<CustomerGateConfig, 'secret'>): boolean {
  return Boolean(config.secret && config.secret.length >= 32);
}

/** `/hala/` and `/hala` are the same path. */
export function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type Route =
  | { kind: 'public' }
  /** A customer realm path: `/{slug}` or `/{slug}/{productId}`. */
  | { kind: 'customer'; slug: string; productId?: string }
  | { kind: 'deny' };

/**
 * Classifies a path without touching the sheet. `productId` is left unvalidated beyond a coarse
 * shape check; the page looks it up and answers 404 when it is not a product.
 */
export function classify(pathname: string, config: CustomerGateConfig): Route {
  const path = normalisePath(pathname);
  if (hasPrefix(path, ALWAYS_PUBLIC)) return { kind: 'public' };
  if (config.publicCatalogue) {
    if (path === '' || path === '/') return { kind: 'public' };
    if (hasPrefix(path, PUBLIC_CATALOGUE_PATHS)) return { kind: 'public' };
  }
  if (!customerRealmEnabled(config)) return { kind: 'deny' };

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return { kind: 'deny' };
  const slug = segments[0]!;
  if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return { kind: 'deny' };
  const productId = segments[1];
  if (productId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(productId)) {
    return { kind: 'deny' };
  }
  return productId === undefined ? { kind: 'customer', slug } : { kind: 'customer', slug, productId };
}

/**
 * The signed-in slug for this request, or undefined. Only the cookie whose name matches the slug in
 * the path is even looked at, so a stale cookie for another buyer is invisible here.
 */
export function sessionSlug(
  context: CustomerGateContext,
  slug: string,
  config: CustomerGateConfig,
): string | undefined {
  if (!config.secret) return undefined;
  const token = context.cookies.get(customerCookieName(slug, config.isSecureSite))?.value;
  const session = verifyCustomerToken(token, slug, config.secret, (config.now ?? Date.now)());
  return session?.slug;
}

export interface GateOutcome {
  route: Route;
  /** Set when the request is inside a customer realm the visitor has unlocked. */
  customer?: string;
}

/** One call for the middleware: classify, then attach the session when there is one. */
export function customerGate(context: CustomerGateContext, config: CustomerGateConfig): GateOutcome {
  const route = classify(context.url.pathname, config);
  if (route.kind !== 'customer') return { route };
  const customer = sessionSlug(context, route.slug, config);
  if (customer) context.locals.customer = customer;
  return customer === undefined ? { route } : { route, customer };
}
