// Admin authentication primitives (docs/ADMIN_SPEC.md §1.3, §9.2): scrypt password hash string,
// stateless HMAC-SHA256 session token, cookie helpers and the in-process revocation list.
// Pure node:crypto; nothing here touches Astro, the network or the environment.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* ---------- password hash: scrypt.<N>.<r>.<p>.<salt b64url>.<key b64url> ---------- */

export const HASH_RE =
  /^scrypt\.(\d{1,9})\.(\d{1,3})\.(\d{1,3})\.([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{80,})$/;
export const KEY_LENGTH = 64;
/** OWASP parameters; the default `maxmem` throws at N = 2^17, so it is always passed explicitly. */
export const SCRYPT_DEFAULTS = { N: 2 ** 17, r: 8, p: 1 } as const;
export const MIN_PASSWORD_LENGTH = 12;
/** Upper bounds so a corrupt or hostile hash string can never make verification allocate gigabytes. */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

export interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function maxmem(N: number, r: number): number {
  // scrypt needs roughly 128 * N * r bytes; double it and never go below 32 MiB.
  return Math.max(32 * 1024 * 1024, 128 * N * r * 2);
}

export function parseHash(str: string | undefined): ParsedHash | undefined {
  if (!str) return undefined;
  const m = HASH_RE.exec(str.trim());
  if (!m) return undefined;
  const N = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return undefined; // power of two
  if (r < 1 || r > MAX_R || p < 1 || p > MAX_P) return undefined;
  const salt = Buffer.from(m[4]!, 'base64url');
  const key = Buffer.from(m[5]!, 'base64url');
  if (salt.length < 8 || key.length !== KEY_LENGTH) return undefined;
  return { N, r, p, salt, key };
}

/**
 * Derives a new hash string for `password` (scripts/admin-password.ts). Small `N` only for tests.
 * `minLength` lets the customer realm apply its own, shorter floor without a second implementation.
 */
export function hashPassword(
  password: string,
  params: Partial<typeof SCRYPT_DEFAULTS> & { minLength?: number } = {},
): string {
  const min = params.minLength ?? MIN_PASSWORD_LENGTH;
  if (typeof password !== 'string' || password.length < min) {
    throw new Error(`password must be at least ${min} characters`);
  }
  const N = params.N ?? SCRYPT_DEFAULTS.N;
  const r = params.r ?? SCRYPT_DEFAULTS.r;
  const p = params.p ?? SCRYPT_DEFAULTS.p;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, { N, r, p, maxmem: maxmem(N, r) });
  return `scrypt.${N}.${r}.${p}.${salt.toString('base64url')}.${key.toString('base64url')}`;
}

/** Re-derives with the parameters carried by the hash and compares the 64-byte keys in constant time. */
export function verifyPassword(hash: string | undefined, password: string): boolean {
  const parsed = parseHash(hash);
  if (!parsed || typeof password !== 'string' || password.length === 0) return false;
  const derived = scryptSync(password, parsed.salt, KEY_LENGTH, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: maxmem(parsed.N, parsed.r),
  });
  return derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key);
}

/* ---------- session token: base64url(JSON) . base64url(HMAC-SHA256) ---------- */

export interface AdminSession {
  sid: string;
  user: string;
  /** Issued at (ms). */
  iat: number;
  /** Idle expiry (ms); slides on use. */
  exp: number;
  /** Absolute expiry (ms); never extended. */
  abs: number;
}

export const IDLE_MS = 12 * 3600_000;
export const ABSOLUTE_MS = 7 * 24 * 3600_000;
/** A token older than this is re-issued on the next request (sliding idle window). */
export const REISSUE_AFTER_MS = 3600_000;
const SID_RE = /^[a-f0-9]{32}$/;
const MAX_TOKEN_LENGTH = 1024;
const MAX_USER_LENGTH = 64;
/** Tolerated clock skew for `iat` in the future (ms). */
const SKEW_MS = 60_000;

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function makeToken(session: AdminSession, secret: string): string {
  if (!secret) throw new Error('makeToken: empty secret');
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

export interface RevocationCheck {
  isRevoked(sid: string, now: number): boolean;
}

/**
 * Verifies the signature (constant time, on the two 32-byte digests), the shape, the idle and
 * absolute expiries and the revocation list. Returns the session or undefined; never throws.
 */
export function verifyToken(
  token: string | undefined,
  secret: string | undefined,
  now: number,
  revoked?: RevocationCheck,
): AdminSession | undefined {
  if (!token || !secret || token.length > MAX_TOKEN_LENGTH) return undefined;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return undefined;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = sign(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const s = parsed as Record<string, unknown>;
  if (typeof s.sid !== 'string' || !SID_RE.test(s.sid)) return undefined;
  if (typeof s.user !== 'string' || s.user.length === 0 || s.user.length > MAX_USER_LENGTH) return undefined;
  if (![s.iat, s.exp, s.abs].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  const session: AdminSession = {
    sid: s.sid,
    user: s.user,
    iat: s.iat as number,
    exp: s.exp as number,
    abs: s.abs as number,
  };
  if (session.iat > now + SKEW_MS) return undefined;
  if (now >= session.exp || now >= session.abs) return undefined;
  if (revoked?.isRevoked(session.sid, now)) return undefined;
  return session;
}

export function newSession(user: string, now: number): AdminSession {
  const abs = now + ABSOLUTE_MS;
  return { sid: randomBytes(16).toString('hex'), user, iat: now, exp: Math.min(now + IDLE_MS, abs), abs };
}

/** Sliding window: fresh `iat`/`exp`, same `sid` and `abs`. */
export function refreshSession(session: AdminSession, now: number): AdminSession {
  return { ...session, iat: now, exp: Math.min(now + IDLE_MS, session.abs) };
}

export function needsReissue(session: AdminSession, now: number): boolean {
  return now - session.iat >= REISSUE_AFTER_MS;
}

/** In-process revocation list: a logged-out `sid` stays refused until its absolute expiry. */
export class Revocations implements RevocationCheck {
  private readonly until = new Map<string, number>();
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  revoke(sid: string, absMs: number): void {
    this.until.set(sid, absMs);
    if (this.until.size > this.maxSize) this.prune(Date.now());
  }

  isRevoked(sid: string, now: number): boolean {
    const t = this.until.get(sid);
    if (t === undefined) return false;
    if (now >= t) {
      this.until.delete(sid);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.until.size;
  }

  prune(now: number): void {
    for (const [sid, t] of this.until) if (now >= t) this.until.delete(sid);
  }
}

/* ---------- cookie helpers (same __Host- rule as the visitor cookie) ---------- */

export function adminCookieName(isSecureSite: boolean): string {
  return isSecureSite ? '__Host-sl_admin' : 'sl_admin';
}

/** The subset of Astro's cookie jar the helpers need (so tests can pass a plain object). */
export interface CookieJar {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax';
      path: string;
      maxAge?: number;
    },
  ): void;
  delete(
    name: string,
    options: { path: string; secure?: boolean; httpOnly?: boolean; sameSite?: 'lax' },
  ): void;
}

export function setSessionCookie(
  cookies: CookieJar,
  session: AdminSession,
  secret: string,
  isSecureSite: boolean,
  now: number,
): void {
  cookies.set(adminCookieName(isSecureSite), makeToken(session, secret), {
    httpOnly: true,
    secure: isSecureSite,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(1, Math.floor((session.exp - now) / 1000)),
  });
}

export function clearSessionCookie(cookies: CookieJar, isSecureSite: boolean): void {
  // __Host- cookies can only be cleared with the same Path=/ and Secure attributes.
  cookies.delete(adminCookieName(isSecureSite), {
    path: '/',
    secure: isSecureSite,
    httpOnly: true,
    sameSite: 'lax',
  });
}
