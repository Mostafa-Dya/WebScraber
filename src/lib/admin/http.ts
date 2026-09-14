// Astro glue for the admin panel (docs/ADMIN_SPEC.md §2.2, §2.3): the runtime singletons wired
// from astro:env, the gate configuration for src/middleware.ts, the common rules every
// /api/admin/* handler applies (cross-site posture with the 64 KiB cap → per-session rate limit →
// zod body → error mapping → no-store JSON), best-effort stand-alone audit events, and the
// post-write invalidation. Logic lives in the pure modules next to this file.
import type { APIContext, APIRoute } from 'astro';
import {
  ADMIN_PASSWORD_HASH,
  ADMIN_SESSION_SECRET,
  ADMIN_USER,
  RETAIL_MARKUP,
  SITE_URL,
  VOTE_SALT,
} from 'astro:env/server';
import type * as z from 'zod';
import {
  ADMIN_MAX_JSON_BODY,
  failLimiter,
  isSecureSite,
  noStore,
  rejectCrossSite,
  requestIpHash,
  socketAddressOf,
  revalidateState,
} from '../api.ts';
import { getCache, getClient } from '../runtime.ts';
import {
  SheetContractError,
  SheetsApiError,
  consoleLogger,
  serializeError,
  type Logger,
} from '../sheets/errors.ts';
import { ipHash } from '../votes/identity.ts';
import { RateLimiter } from '../votes/ratelimit.ts';
import { Revocations, type AdminSession } from './auth.ts';
import { UnauditableError, buildAuditRow, type AuditInput, type AuditRow } from './audit.ts';
import { issuesOf } from './dto.ts';
import { adminConfigured, type GateConfig } from './gate.ts';
import { invalidateCatalogue, type InvalidateResult } from './invalidate.ts';
import { LoginThrottle } from './login.ts';
import { adminRugFromCells } from './read.ts';
import { RowConflictError, VersionMismatchError, appendAudit } from './write.ts';

/* ---------- runtime singletons ---------- */

const secret = ADMIN_SESSION_SECRET && ADMIN_SESSION_SECRET.length >= 32 ? ADMIN_SESSION_SECRET : undefined;
const passwordHash = ADMIN_PASSWORD_HASH || undefined;

export const adminRuntime = {
  secret,
  passwordHash,
  user: ADMIN_USER || 'owner',
  isSecureSite,
  siteUrl: SITE_URL,
  /** Bootstrap markup from the environment; the Settings tab wins when set (§3.2). */
  retailMarkup: RETAIL_MARKUP,
  configured: adminConfigured({ secret, passwordHash }),
  revocations: new Revocations(),
  /** Login failures share the small attacker-driven limiter with /api/revalidate. */
  throttle: new LoginThrottle(failLimiter),
  /** Per-session API limits (§1.3). */
  limiter: new RateLimiter({ maxKeys: 1000 }),
  /** Filled by the Drive scope check (Phase 10); undefined = not checked yet. */
  driveScopeOk: undefined as boolean | undefined,
};

if (!adminRuntime.configured && (ADMIN_PASSWORD_HASH || ADMIN_SESSION_SECRET)) {
  console.warn(
    '[admin] only one of ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET is set (or the secret is shorter than 32 characters): /admin stays disabled (404).',
  );
}

export const adminStats = { writeFailures: 0 };

/** What /api/health reports (no secrets). */
export function adminHealth(): {
  adminConfigured: boolean;
  adminWriteFailures: number;
  driveScopeOk: boolean | null;
} {
  return {
    adminConfigured: adminRuntime.configured,
    adminWriteFailures: adminStats.writeFailures,
    driveScopeOk: adminRuntime.driveScopeOk ?? null,
  };
}

export function gateConfig(): GateConfig {
  return {
    secret: adminRuntime.secret,
    passwordHash: adminRuntime.passwordHash,
    revoked: adminRuntime.revocations,
    isSecureSite: adminRuntime.isSecureSite,
  };
}

/* ---------- errors and rate limits ---------- */

export class AdminError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown> | undefined;
  constructor(status: number, code: string, message?: string, extra?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'AdminError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const ADMIN_RATES = {
  read: { limit: 120, windowMs: 60_000 },
  mutation: { limit: 30, windowMs: 60_000 },
  scrape: { limit: 10, windowMs: 60_000 },
  scrapeGlobal: { limit: 30, windowMs: 10 * 60_000 },
  photos: { limit: 5, windowMs: 60_000 },
} as const;
export type AdminRateKind = Exclude<keyof typeof ADMIN_RATES, 'scrapeGlobal'>;

/** 429 + Retry-After when the session's window for `kind` is exhausted (the scrape kind also checks the global window). */
export function sessionRateLimit(kind: AdminRateKind, session: AdminSession): Response | undefined {
  const l = ADMIN_RATES[kind];
  const keys: Array<[string, { limit: number; windowMs: number }]> = [[`${kind}:${session.sid}`, l]];
  if (kind === 'scrape') keys.push(['scrape:global', ADMIN_RATES.scrapeGlobal]);
  for (const [key, lim] of keys) {
    const d = adminRuntime.limiter.wouldAllow(key, lim.limit, lim.windowMs);
    if (!d.ok)
      return noStore({ ok: false, error: 'too many requests' }, 429, {
        'retry-after': String(d.retryAfterSec),
      });
  }
  for (const [key, lim] of keys) adminRuntime.limiter.allow(key, lim.limit, lim.windowMs);
  return undefined;
}

/* ---------- per-request context ---------- */

export interface AdminCtx {
  context: APIContext;
  session: AdminSession;
  requestId: string;
  ipHash: string;
  actor: string;
}

/** The gate already required a session (401); this is the typed, defensive re-check. */
export function requireSession(context: APIContext): AdminSession {
  const session = context.locals.admin;
  if (!session) throw new AdminError(401, 'unauthorized');
  return session;
}

export function adminContext(context: APIContext): AdminCtx {
  return {
    context,
    session: requireSession(context),
    requestId: context.locals.requestId ?? 'none',
    ipHash: requestIpHash(context.request, socketAddressOf(context)),
    actor: adminRuntime.user,
  };
}

/** Everything an AuditInput needs from the request (actor, ip hash, request id). */
export function auditBase(context: APIContext): Pick<AuditInput, 'actor' | 'ipHash' | 'requestId'> {
  return {
    actor: adminRuntime.user,
    ipHash: requestIpHash(context.request, socketAddressOf(context)),
    requestId: context.locals.requestId ?? 'none',
  };
}

/** `ipHash(VOTE_SALT, ip)` for callers that only have the address. */
export function hashIp(ip: string | undefined): string {
  return ipHash(VOTE_SALT, ip);
}

/* ---------- body parsing ---------- */

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Cross-site posture (415/413/403), JSON parse (400), zod safeParse (400 with issues). */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes: number = ADMIN_MAX_JSON_BODY,
): Promise<ParsedBody<z.output<S>>> {
  const rejected = rejectCrossSite(request, maxBytes);
  if (rejected) return { ok: false, response: rejected };
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes)
      return { ok: false, response: noStore({ ok: false, error: 'payload too large' }, 413) };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: noStore({ ok: false, error: 'bad request' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: noStore({ ok: false, error: 'invalid body', issues: issuesOf(parsed.error) }, 400),
    };
  }
  return { ok: true, data: parsed.data as z.output<S> };
}

/* ---------- error mapping ---------- */

/** Maps every failure shape to the §2.3 response; counts 5xx in adminStats.writeFailures. */
export function errorToResponse(e: unknown, logger: Logger = consoleLogger): Response {
  let response: Response;
  if (e instanceof AdminError) {
    response = noStore(
      {
        ok: false,
        error: e.code,
        ...(e.message !== e.code ? { message: e.message } : {}),
        ...(e.extra ?? {}),
      },
      e.status,
    );
  } else if (e instanceof UnauditableError) {
    response = noStore({ ok: false, error: e.code, message: e.message }, 422);
  } else if (e instanceof VersionMismatchError) {
    const rug = e.tab === 'Products' ? adminRugFromCells(e.fresh, e.row) : undefined;
    response = noStore(
      { ok: false, error: e.code, tab: e.tab, row: e.row, ...(rug ? { rug } : { fresh: e.fresh }) },
      409,
    );
  } else if (e instanceof RowConflictError) {
    response = noStore({ ok: false, error: e.code, message: e.message }, 409);
  } else if (e instanceof SheetsApiError && (e.status === 429 || e.status === 503)) {
    response = noStore({ ok: false, error: 'sheet unavailable' }, 503, { 'retry-after': '30' });
  } else if (e instanceof SheetContractError) {
    response = noStore({ ok: false, error: 'sheet contract', message: serializeError(e).message }, 503);
  } else {
    logger.error('admin request failed', { error: serializeError(e) });
    response = noStore({ ok: false, error: 'internal error', message: serializeError(e).message }, 500);
  }
  if (response.status >= 500) adminStats.writeFailures += 1;
  return response;
}

/* ---------- route wrappers ---------- */

export function methodNotAllowed(allow: string): APIRoute {
  return () => noStore({ ok: false, error: 'method not allowed' }, 405, { allow });
}

/** GET endpoint: session, `read` rate limit, error mapping. */
export function adminGet(handler: (ctx: AdminCtx) => Promise<Response>): APIRoute {
  return async (context) => {
    try {
      const ctx = adminContext(context);
      const limited = sessionRateLimit('read', ctx.session);
      if (limited) return limited;
      return await handler(ctx);
    } catch (e) {
      return errorToResponse(e);
    }
  };
}

/** POST endpoint: cross-site posture, `kind` rate limit, zod body, error mapping. */
export function adminPost<S extends z.ZodType>(
  schema: S,
  handler: (ctx: AdminCtx & { body: z.output<S> }) => Promise<Response>,
  kind: Exclude<AdminRateKind, 'read'> = 'mutation',
): APIRoute {
  return async (context) => {
    try {
      const ctx = adminContext(context);
      const rejected = rejectCrossSite(context.request, ADMIN_MAX_JSON_BODY);
      if (rejected) return rejected;
      const limited = sessionRateLimit(kind, ctx.session);
      if (limited) return limited;
      const body = await parseBody(context.request, schema);
      if (!body.ok) return body.response;
      return await handler({ ...ctx, body: body.data });
    } catch (e) {
      return errorToResponse(e);
    }
  };
}

/* ---------- stand-alone audit events and invalidation ---------- */

/**
 * Best-effort audit row for events that are not part of a mutation batch (auth.*, scrape.fetch,
 * photo.import): never throws, logs failures. Returns the AuditLog row (2) or undefined.
 */
export async function recordAuditEvent(
  input: Omit<AuditInput, 'actor'> & { actor?: string },
  logger: Logger = consoleLogger,
): Promise<{ row: number; action: AuditRow['action'] } | undefined> {
  try {
    const row = buildAuditRow({ ...input, actor: input.actor ?? adminRuntime.user });
    return await appendAudit(getClient(), row);
  } catch (e) {
    logger.error('audit event not written', { action: input.action, error: serializeError(e) });
    return undefined;
  }
}

/** After a successful mutation: bust the data cache and purge the route cache (never throws). */
export function invalidateAfterWrite(context: Pick<APIContext, 'cache'>): Promise<InvalidateResult> {
  return invalidateCatalogue(getCache, context, { state: revalidateState, logger: consoleLogger });
}
