import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  REISSUE_AFTER_MS,
  Revocations,
  adminCookieName,
  clearSessionCookie,
  hashPassword,
  makeToken,
  needsReissue,
  newSession,
  parseHash,
  refreshSession,
  setSessionCookie,
  verifyPassword,
  verifyToken,
  type AdminSession,
} from '../../../src/lib/admin/auth.ts';

// Small N keeps the suite fast; verifyPassword re-derives with whatever the hash string carries.
const FAST = { N: 2 ** 12 };
const PASSWORD = 'correct horse battery staple';
const HASH = hashPassword(PASSWORD, FAST);
const SECRET = 's'.repeat(40);

describe('password hash (ADMIN_SPEC §9.2)', () => {
  it('produces scrypt.<N>.<r>.<p>.<salt>.<key> and verifies only the right password', () => {
    expect(HASH).toMatch(/^scrypt\.4096\.8\.1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{86}$/);
    expect(HASH.length).toBeGreaterThanOrEqual(80);
    expect(verifyPassword(HASH, PASSWORD)).toBe(true);
    expect(verifyPassword(HASH, 'correct horse battery stapl')).toBe(false);
    expect(verifyPassword(HASH, `${PASSWORD} `)).toBe(false);
    expect(verifyPassword(HASH, '')).toBe(false);
    expect(hashPassword(PASSWORD, FAST)).not.toBe(HASH); // fresh salt every time
  });
  it('parses the parameters and refuses malformed, wrong-length or hostile strings', () => {
    const parsed = parseHash(HASH)!;
    expect(parsed.N).toBe(4096);
    expect(parsed.r).toBe(8);
    expect(parsed.p).toBe(1);
    expect(parsed.salt).toHaveLength(16);
    expect(parsed.key).toHaveLength(64);
    expect(parseHash(undefined)).toBeUndefined();
    expect(parseHash('')).toBeUndefined();
    expect(parseHash('bcrypt.abc')).toBeUndefined();
    const [, n, r, p, salt, key] = HASH.split('.');
    expect(parseHash(`scrypt.${n}.${r}.${p}.${salt}.${key!.slice(0, 40)}`)).toBeUndefined(); // wrong key length
    expect(parseHash(`scrypt.4097.${r}.${p}.${salt}.${key}`)).toBeUndefined(); // not a power of two
    expect(parseHash(`scrypt.${2 ** 24}.${r}.${p}.${salt}.${key}`)).toBeUndefined(); // memory bomb
    expect(parseHash(`scrypt.${n}.99.${p}.${salt}.${key}`)).toBeUndefined();
    expect(verifyPassword(`scrypt.${n}.${r}.${p}.${salt}.${key!.slice(0, 40)}`, PASSWORD)).toBe(false);
  });
  it('rejects short passwords when hashing', () => {
    expect(() => hashPassword('short', FAST)).toThrow(/12 characters/);
  });
});

describe('session token', () => {
  const now = 1_700_000_000_000;
  const session: AdminSession = {
    sid: 'a'.repeat(32),
    user: 'owner',
    iat: now,
    exp: now + IDLE_MS,
    abs: now + ABSOLUTE_MS,
  };

  it('round-trips with the right secret and rejects tampering, other secrets and junk', () => {
    const token = makeToken(session, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyToken(token, SECRET, now + 1000)).toEqual(session);
    expect(verifyToken(token, 'x'.repeat(40), now)).toBeUndefined();
    expect(verifyToken(token, undefined, now)).toBeUndefined();
    expect(verifyToken(undefined, SECRET, now)).toBeUndefined();
    expect(verifyToken('', SECRET, now)).toBeUndefined();
    expect(verifyToken('nodot', SECRET, now)).toBeUndefined();
    expect(verifyToken(`${token}x`, SECRET, now)).toBeUndefined();
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...session, user: 'root' })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`, SECRET, now)).toBeUndefined();
    expect(verifyToken(`${payload}.${sig!.slice(0, 20)}`, SECRET, now)).toBeUndefined(); // short digest
    expect(verifyToken('x'.repeat(2000), SECRET, now)).toBeUndefined();
  });
  it('honours the idle and absolute expiries and a future iat', () => {
    const token = makeToken(session, SECRET);
    expect(verifyToken(token, SECRET, session.exp - 1)).toBeDefined();
    expect(verifyToken(token, SECRET, session.exp)).toBeUndefined();
    const nearAbs: AdminSession = { ...session, iat: session.abs - 1000, exp: session.abs + IDLE_MS };
    expect(verifyToken(makeToken(nearAbs, SECRET), SECRET, session.abs)).toBeUndefined();
    expect(verifyToken(makeToken({ ...session, iat: now + 120_000 }, SECRET), SECRET, now)).toBeUndefined();
  });
  it('rejects a malformed payload even when correctly signed', () => {
    const bad = { ...session, sid: 'not-hex' } as AdminSession;
    expect(verifyToken(makeToken(bad, SECRET), SECRET, now)).toBeUndefined();
    const noUser = { ...session, user: '' };
    expect(verifyToken(makeToken(noUser, SECRET), SECRET, now)).toBeUndefined();
  });
  it('is refused once its sid is revoked, until the absolute expiry', () => {
    const revoked = new Revocations();
    const token = makeToken(session, SECRET);
    expect(verifyToken(token, SECRET, now, revoked)).toBeDefined();
    revoked.revoke(session.sid, session.abs);
    expect(verifyToken(token, SECRET, now, revoked)).toBeUndefined();
    expect(revoked.isRevoked(session.sid, session.abs)).toBe(false); // pruned lazily
    expect(revoked.size).toBe(0);
  });
  it('newSession / refreshSession / needsReissue implement the sliding window', () => {
    const s = newSession('owner', now);
    expect(s.sid).toMatch(/^[a-f0-9]{32}$/);
    expect(s.exp).toBe(now + IDLE_MS);
    expect(s.abs).toBe(now + ABSOLUTE_MS);
    expect(needsReissue(s, now + REISSUE_AFTER_MS - 1)).toBe(false);
    expect(needsReissue(s, now + REISSUE_AFTER_MS)).toBe(true);
    const later = now + 2 * 3600_000;
    const r = refreshSession(s, later);
    expect(r.sid).toBe(s.sid);
    expect(r.abs).toBe(s.abs);
    expect(r.exp).toBe(later + IDLE_MS);
    // never past the absolute expiry
    expect(refreshSession(s, s.abs - 1000).exp).toBe(s.abs);
  });
});

describe('cookie helpers', () => {
  it('uses the __Host- prefix on https only and sets/clears with the safe attributes', () => {
    expect(adminCookieName(true)).toBe('__Host-sl_admin');
    expect(adminCookieName(false)).toBe('sl_admin');
    const calls: unknown[] = [];
    const jar = {
      set: (...a: unknown[]) => calls.push(['set', ...a]),
      delete: (...a: unknown[]) => calls.push(['delete', ...a]),
    };
    const now = 1_700_000_000_000;
    const session = newSession('owner', now);
    setSessionCookie(jar, session, SECRET, true, now);
    expect(calls[0]).toMatchObject([
      'set',
      '__Host-sl_admin',
      expect.stringMatching(/\./),
      { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: IDLE_MS / 1000 },
    ]);
    clearSessionCookie(jar, true);
    expect(calls[1]).toEqual([
      'delete',
      '__Host-sl_admin',
      { path: '/', secure: true, httpOnly: true, sameSite: 'lax' },
    ]);
    clearSessionCookie(jar, false);
    expect(calls[2]).toEqual([
      'delete',
      'sl_admin',
      { path: '/', secure: false, httpOnly: true, sameSite: 'lax' },
    ]);
  });
});
