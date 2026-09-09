import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  ABSOLUTE_MS,
  IDLE_MS,
  Revocations,
  makeToken,
  newSession,
  type AdminSession,
} from '../../../src/lib/admin/auth.ts';
import {
  adminConfigured,
  adminGate,
  isAdminPath,
  type GateConfig,
  type GateContext,
} from '../../../src/lib/admin/gate.ts';

const SECRET = 's'.repeat(40);
const NOW = 1_700_000_000_000;

function config(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    secret: SECRET,
    passwordHash: 'scrypt.4096.8.1.' + 'a'.repeat(22) + '.' + 'b'.repeat(86),
    revoked: new Revocations(),
    isSecureSite: true,
    now: () => NOW,
    ...overrides,
  };
}

interface Fake {
  context: GateContext;
  setCalls: unknown[][];
  cacheSet: unknown[];
  next: Mock<() => Promise<Response>>;
}

function fake(path: string, cookie?: string): Fake {
  const setCalls: unknown[][] = [];
  const cacheSet: unknown[] = [];
  const next = vi.fn<() => Promise<Response>>(
    async () => new Response('page', { status: 200, headers: { 'content-type': 'text/html' } }),
  );
  const context: GateContext = {
    url: new URL(`https://example.test${path}`),
    cookies: {
      get: (name: string) => (cookie && name === '__Host-sl_admin' ? { value: cookie } : undefined),
      set: (...a: unknown[]) => {
        setCalls.push(a);
      },
      delete: () => {},
    },
    locals: {} as GateContext['locals'],
    cache: { set: (v) => cacheSet.push(v) },
    redirect: (location, status = 302) => new Response(null, { status, headers: { location } }),
  };
  return { context, setCalls, cacheSet, next };
}

describe('adminGate (ADMIN_SPEC §2.2)', () => {
  it('leaves non-admin paths untouched', async () => {
    const f = fake('/rugs/winks');
    const res = await adminGate(f.context, f.next, config());
    expect(res.status).toBe(200);
    expect(f.next).toHaveBeenCalledTimes(1);
    expect(f.cacheSet).toEqual([]);
    expect(f.context.locals.requestId).toBeUndefined();
    expect(res.headers.get('cache-control')).toBeNull();
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/api/administer')).toBe(false);
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/api/admin/rugs')).toBe(true);
  });
  it('answers 404 for every admin route when the secrets are not configured', async () => {
    for (const cfg of [
      config({ secret: undefined }),
      config({ passwordHash: undefined }),
      config({ secret: 'short' }),
    ]) {
      expect(adminConfigured(cfg)).toBe(false);
      const page = fake('/admin/login');
      const res = await adminGate(page.context, page.next, cfg);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(page.next).not.toHaveBeenCalled();
      const api = fake('/api/admin/rugs');
      const apiRes = await adminGate(api.context, api.next, cfg);
      expect(apiRes.status).toBe(404);
      expect(await apiRes.json()).toEqual({ ok: false, error: 'not found' });
    }
  });
  it('redirects pages to the login form with a sanitised next, and answers 401 JSON for the API', async () => {
    const page = fake('/admin/rugs/SL-030');
    const res = await adminGate(page.context, page.next, config());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/login?next=%2Fadmin%2Frugs%2FSL-030');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(page.next).not.toHaveBeenCalled();
    expect(page.cacheSet).toEqual([false]);
    expect(page.context.locals.requestId).toMatch(/^[a-f0-9]{16}$/);
    expect(page.context.locals.admin).toBeUndefined();

    const api = fake('/api/admin/rugs');
    const apiRes = await adminGate(api.context, api.next, config());
    expect(apiRes.status).toBe(401);
    expect(await apiRes.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(apiRes.headers.get('cache-control')).toBe('no-store');
    expect(api.next).not.toHaveBeenCalled();
  });
  it('lets the public login/logout paths through without a session (trailing slash tolerated)', async () => {
    for (const path of ['/admin/login', '/admin/login/', '/admin/logout']) {
      const f = fake(path);
      const res = await adminGate(f.context, f.next, config());
      expect(res.status).toBe(200);
      expect(f.next).toHaveBeenCalledTimes(1);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(f.cacheSet).toEqual([false]);
    }
  });
  it('accepts a valid cookie, exposes the session in locals and never sets cache headers that allow a HIT', async () => {
    const session = newSession('owner', NOW);
    const f = fake('/admin', makeToken(session, SECRET));
    const res = await adminGate(f.context, f.next, config());
    expect(res.status).toBe(200);
    expect(f.context.locals.admin).toEqual(session);
    expect(f.cacheSet).toEqual([false]);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-astro-cache')).toBeNull();
    expect(f.setCalls).toEqual([]); // fresh token: no re-issue
  });
  it('re-issues the cookie once the token is older than an hour (sliding window, same sid/abs)', async () => {
    const old: AdminSession = {
      sid: 'c'.repeat(32),
      user: 'owner',
      iat: NOW - 2 * 3600_000,
      exp: NOW - 2 * 3600_000 + IDLE_MS,
      abs: NOW + ABSOLUTE_MS,
    };
    const f = fake('/admin', makeToken(old, SECRET));
    await adminGate(f.context, f.next, config());
    expect(f.setCalls).toHaveLength(1);
    const [name, value, opts] = f.setCalls[0]!;
    expect(name).toBe('__Host-sl_admin');
    expect(opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    const payload = JSON.parse(
      Buffer.from(String(value).split('.')[0]!, 'base64url').toString(),
    ) as AdminSession;
    expect(payload.sid).toBe(old.sid);
    expect(payload.abs).toBe(old.abs);
    expect(payload.iat).toBe(NOW);
    expect(payload.exp).toBe(NOW + IDLE_MS);
  });
  it('treats expired, tampered and revoked cookies as anonymous', async () => {
    const session = newSession('owner', NOW - IDLE_MS - 1);
    const expired = fake('/admin', makeToken(session, SECRET));
    expect((await adminGate(expired.context, expired.next, config())).status).toBe(303);
    const tampered = fake('/admin', `${makeToken(newSession('owner', NOW), SECRET)}x`);
    expect((await adminGate(tampered.context, tampered.next, config())).status).toBe(303);
    const revoked = new Revocations();
    const live = newSession('owner', NOW);
    revoked.revoke(live.sid, live.abs);
    const f = fake('/api/admin/rugs', makeToken(live, SECRET));
    expect((await adminGate(f.context, f.next, config({ revoked }))).status).toBe(401);
  });
});
