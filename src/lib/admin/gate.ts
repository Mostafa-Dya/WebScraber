// The admin gate (docs/ADMIN_SPEC.md §2.2), pure: src/middleware.ts wires it into Astro's
// `sequence()`. Every /admin* and /api/admin* request: never cached, a request id, a verified
// session in `locals.admin` (401 for the API, 303 to the login page for pages), a sliding cookie
// re-issue, `cache-control: no-store` and `x-robots-tag: noindex`. When the admin secrets are not
// configured every admin route answers 404 (§9.1) so the panel is invisible.
import { randomBytes } from 'node:crypto';
import {
  needsReissue,
  refreshSession,
  setSessionCookie,
  verifyToken,
  adminCookieName,
  type AdminSession,
  type CookieJar,
  type RevocationCheck,
} from './auth.ts';

export const ADMIN_PAGE = /^\/admin(\/|$)/;
export const ADMIN_API = /^\/api\/admin(\/|$)/;
export const PUBLIC_ADMIN: ReadonlySet<string> = new Set(['/admin/login', '/admin/logout']);

export interface GateConfig {
  /** `ADMIN_SESSION_SECRET`; undefined = admin disabled. */
  secret: string | undefined;
  /** `ADMIN_PASSWORD_HASH`; undefined = admin disabled. */
  passwordHash: string | undefined;
  revoked: RevocationCheck;
  isSecureSite: boolean;
  now?: () => number;
}

/** The slice of Astro's APIContext the gate touches (structural, so tests pass a plain object). */
export interface GateContext {
  url: URL;
  cookies: CookieJar & { get(name: string): { value: string } | undefined };
  locals: { admin?: AdminSession; requestId?: string };
  cache: { set(input: false): void };
  redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response;
}

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PAGE.test(pathname) || ADMIN_API.test(pathname);
}

export function adminConfigured(config: Pick<GateConfig, 'secret' | 'passwordHash'>): boolean {
  return Boolean(config.secret && config.secret.length >= 32 && config.passwordHash);
}

function noStoreHeaders(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' },
  });
}

export function notFound(api: boolean): Response {
  return api
    ? json({ ok: false, error: 'not found' }, 404)
    : new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** `/admin/login/` and `/admin/login` are the same public path. */
function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export async function adminGate(
  context: GateContext,
  next: () => Promise<Response>,
  config: GateConfig,
): Promise<Response> {
  const pathname = normalisePath(context.url.pathname);
  const api = ADMIN_API.test(pathname);
  if (!ADMIN_PAGE.test(pathname) && !api) return next();

  context.cache.set(false); // belt and braces: never cached
  context.locals.requestId = randomBytes(8).toString('hex');
  if (!adminConfigured(config)) return noStoreHeaders(notFound(api));

  const now = (config.now ?? Date.now)();
  const cookieName = adminCookieName(config.isSecureSite);
  const session = verifyToken(context.cookies.get(cookieName)?.value, config.secret, now, config.revoked);
  if (session) context.locals.admin = session;

  let response: Response;
  if (!session && !PUBLIC_ADMIN.has(pathname)) {
    response = api
      ? json({ ok: false, error: 'unauthorized' }, 401)
      : context.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`, 303);
  } else {
    response = await next();
    if (session && needsReissue(session, now)) {
      // Sliding idle window: a fresh token with the same sid and absolute expiry.
      setSessionCookie(
        context.cookies,
        refreshSession(session, now),
        config.secret!,
        config.isSecureSite,
        now,
      );
    }
  }
  return noStoreHeaders(response);
}
