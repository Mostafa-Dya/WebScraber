// The live connection (src/lib/google/connection.ts) and the handshake store. This is the part that
// makes an authorisation "stay alive": an access token is renewed on demand from a refresh token
// that is re-read every time, so connecting in the browser takes effect without a restart.
import { describe, expect, it, vi } from 'vitest';
import { GoogleConnection, RENEW_MARGIN_MS } from '../../../src/lib/google/connection.ts';
import { HandshakeStore, sanitiseNext } from '../../../src/lib/google/handshake.ts';
import { memoryStore } from '../../../src/lib/google/store.ts';

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A clock the test moves by hand. */
function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('GoogleConnection', () => {
  it('refuses to mint a token when nothing is connected', async () => {
    const c = new GoogleConnection({
      clientId: 'cid',
      clientSecret: 'secret',
      store: memoryStore(),
      logger: silent,
    });
    expect(c.health()).toMatchObject({ connected: false, source: 'none' });
    await expect(c.getAccessToken()).rejects.toThrow(/No Google account is connected/);
  });

  it('caches the access token and renews it a minute early', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'rt', scopes: [], connectedAt: 'now' });
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return json({ access_token: `at-${calls}`, expires_in: 3600 });
    }) as unknown as typeof fetch;
    const t = clock();
    const c = new GoogleConnection({
      clientId: 'cid',
      clientSecret: 'secret',
      store,
      fetchImpl,
      now: t.now,
      logger: silent,
    });

    expect(await c.getAccessToken()).toBe('at-1');
    expect(await c.getAccessToken()).toBe('at-1'); // cached, no second request
    expect(calls).toBe(1);

    // Just inside the renewal margin: still the old one.
    t.advance(3600_000 - RENEW_MARGIN_MS - 1_000);
    expect(await c.getAccessToken()).toBe('at-1');
    // Past it: renewed without anyone asking.
    t.advance(2_000);
    expect(await c.getAccessToken()).toBe('at-2');
    expect(calls).toBe(2);
  });

  it('is single-flight, so a burst of parallel sheet calls costs one token request', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'rt', scopes: [], connectedAt: 'now' });
    let calls = 0;
    let release: (() => void) | undefined;
    const fetchImpl = (async () => {
      calls++;
      await new Promise<void>((r) => (release = r));
      return json({ access_token: 'at', expires_in: 3600 });
    }) as unknown as typeof fetch;
    const c = new GoogleConnection({ clientId: 'c', clientSecret: 's', store, fetchImpl, logger: silent });
    const all = Promise.all([c.getAccessToken(), c.getAccessToken(), c.getAccessToken()]);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release!();
    expect(await all).toEqual(['at', 'at', 'at']);
    expect(calls).toBe(1);
  });

  it('picks up a newly stored refresh token without a restart', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'old', scopes: [], connectedAt: 'now' });
    const seen: string[] = [];
    const fetchImpl = (async (_u: string | URL | Request, init?: RequestInit) => {
      seen.push(new URLSearchParams(String(init?.body)).get('refresh_token') ?? '');
      return json({ access_token: `at-for-${seen.length}`, expires_in: 3600 });
    }) as unknown as typeof fetch;
    const c = new GoogleConnection({ clientId: 'c', clientSecret: 's', store, fetchImpl, logger: silent });

    expect(await c.getAccessToken()).toBe('at-for-1');
    // The owner reconnects in the browser: a new refresh token lands in the store.
    store.write({ refreshToken: 'new', scopes: [], connectedAt: 'now' });
    // The cached access token was minted from the old grant, so it is not reused.
    expect(await c.getAccessToken()).toBe('at-for-2');
    expect(seen).toEqual(['old', 'new']);
  });

  it('prefers the stored token over the environment, because connecting is the newer intent', async () => {
    const store = memoryStore();
    const c = new GoogleConnection({
      clientId: 'c',
      clientSecret: 's',
      store,
      fallbackRefreshToken: 'from-env',
      logger: silent,
    });
    expect(c.health()).toMatchObject({ connected: true, source: 'environment' });
    store.write({ refreshToken: 'from-admin', scopes: [], connectedAt: 'now' });
    expect(c.health()).toMatchObject({ connected: true, source: 'stored' });
    expect(c.current()?.refreshToken).toBe('from-admin');
  });

  it('stamps when the connection last actually worked', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'rt', scopes: [], connectedAt: 'then' });
    const fetchImpl = (async () =>
      json({ access_token: 'at', expires_in: 3600, scope: 'a b' })) as unknown as typeof fetch;
    const t = clock();
    const c = new GoogleConnection({
      clientId: 'c',
      clientSecret: 's',
      store,
      fetchImpl,
      now: t.now,
      logger: silent,
    });
    await c.getAccessToken();
    expect(store.read()?.lastRefreshAt).toBe(new Date(t.now()).toISOString());
    expect(store.read()?.scopes).toEqual(['a', 'b']);
    expect(c.health().lastRefreshAt).toBeTruthy();
  });

  it('explains invalid_grant instead of repeating Google’s wording', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'dead', scopes: [], connectedAt: 'now' });
    const fetchImpl = (async () =>
      json(
        { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
        400,
      )) as unknown as typeof fetch;
    const c = new GoogleConnection({ clientId: 'c', clientSecret: 's', store, fetchImpl, logger: silent });
    await expect(c.getAccessToken()).rejects.toThrow(/Testing|revoked|six months/);
    // The failure is visible to the admin rather than only in a log.
    expect(c.health().lastError).toMatch(/invalid_grant/);
  });

  it('recovers once the network comes back', async () => {
    const store = memoryStore();
    store.write({ refreshToken: 'rt', scopes: [], connectedAt: 'now' });
    let down = true;
    const fetchImpl = (async () => {
      if (down) throw new Error('offline');
      return json({ access_token: 'at', expires_in: 3600 });
    }) as unknown as typeof fetch;
    const c = new GoogleConnection({ clientId: 'c', clientSecret: 's', store, fetchImpl, logger: silent });
    await expect(c.getAccessToken()).rejects.toThrow();
    down = false;
    expect(await c.getAccessToken()).toBe('at');
    expect(c.health().lastError).toBeNull();
  });
});

describe('HandshakeStore', () => {
  it('is single-use, so a replayed callback finds nothing', () => {
    const s = new HandshakeStore();
    const id = s.create({ state: 'st', verifier: 'v', redirectUri: 'https://x/cb', next: '/admin/google' });
    expect(s.take(id)?.verifier).toBe('v');
    expect(s.take(id)).toBeUndefined();
  });

  it('expires an abandoned attempt', () => {
    const t = clock();
    const s = new HandshakeStore({ now: t.now, ttlMs: 1000 });
    const id = s.create({ state: 'st', verifier: 'v', redirectUri: 'https://x/cb', next: '/admin' });
    t.advance(1500);
    expect(s.take(id)).toBeUndefined();
  });

  it('stays bounded when the start endpoint is hammered', () => {
    const s = new HandshakeStore();
    for (let i = 0; i < 50; i++) {
      s.create({ state: `s${i}`, verifier: `v${i}`, redirectUri: 'https://x/cb', next: '/admin' });
    }
    expect(s.size).toBeLessThanOrEqual(8);
  });

  it('only lets an /admin path be the destination', () => {
    expect(sanitiseNext('/admin/clients')).toBe('/admin/clients');
    expect(sanitiseNext('/admin')).toBe('/admin');
    expect(sanitiseNext('https://evil.example/admin')).toBe('/admin/google');
    expect(sanitiseNext('//evil.example')).toBe('/admin/google');
    expect(sanitiseNext('/rugs/winks')).toBe('/admin/google');
    expect(sanitiseNext(undefined)).toBe('/admin/google');
  });
});
