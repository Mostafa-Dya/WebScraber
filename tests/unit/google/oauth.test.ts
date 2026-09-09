// The Google OAuth handshake (src/lib/google/oauth.ts). No network: every request is a stub.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleAuthError } from '../../../src/lib/google/oauth.ts';
import {
  DRIVE_FILE_SCOPE,
  REQUIRED_SCOPES,
  SHEETS_SCOPE,
  buildAuthUrl,
  createPkce,
  createState,
  describeToken,
  exchangeCode,
  googleAuthAdvice,
  missingScopes,
  parseTokenResponse,
  redirectUriFor,
  refreshAccessToken,
  revokeToken,
  sameState,
} from '../../../src/lib/google/oauth.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('redirect URI', () => {
  it('hangs off the site origin, so it moves with the deployment', () => {
    expect(redirectUriFor('https://preview.serioludere.com')).toBe(
      'https://preview.serioludere.com/api/admin/google/callback',
    );
    // A path or a trailing slash on SITE_URL must not leak into it.
    expect(redirectUriFor('http://localhost:4321/')).toBe('http://localhost:4321/api/admin/google/callback');
  });
});

describe('PKCE and state', () => {
  it('derives the challenge as the base64url SHA-256 of the verifier', () => {
    const { verifier, challenge } = createPkce();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(verifier).not.toBe(challenge);
    // Both are URL-safe, so neither needs escaping in a query string.
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('mints a distinct verifier and state every time', () => {
    const verifiers = new Set(Array.from({ length: 20 }, () => createPkce().verifier));
    const states = new Set(Array.from({ length: 20 }, () => createState()));
    expect(verifiers.size).toBe(20);
    expect(states.size).toBe(20);
  });

  it('compares state without leaking length or position', () => {
    expect(sameState('abc', 'abc')).toBe(true);
    expect(sameState('abc', 'abd')).toBe(false);
    expect(sameState('abc', 'abcd')).toBe(false);
    expect(sameState('', '')).toBe(true);
  });
});

describe('buildAuthUrl', () => {
  const base = {
    clientId: 'cid.apps.googleusercontent.com',
    redirectUri: 'https://preview.test/api/admin/google/callback',
    state: 'st4te',
    challenge: 'chall',
  };

  it('asks for offline access and forces consent, which is what yields a refresh token', () => {
    const url = new URL(buildAuthUrl(base));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const q = url.searchParams;
    expect(q.get('access_type')).toBe('offline');
    // Without prompt=consent a repeat authorisation returns no refresh token at all.
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toBe('chall');
    expect(q.get('state')).toBe('st4te');
    expect(q.get('redirect_uri')).toBe(base.redirectUri);
    expect(q.get('scope')).toBe(`${SHEETS_SCOPE} ${DRIVE_FILE_SCOPE}`);
  });

  it('asks for nothing beyond the sheet and the app’s own Drive files', () => {
    expect([...REQUIRED_SCOPES]).toEqual([SHEETS_SCOPE, DRIVE_FILE_SCOPE]);
    expect(new URL(buildAuthUrl(base)).searchParams.get('scope')).not.toContain('drive.readonly');
  });
});

describe('parseTokenResponse', () => {
  it('reads a normal grant', () => {
    expect(
      parseTokenResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3599, scope: 'a b' }),
    ).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresInSec: 3599, scopes: ['a', 'b'] });
  });

  it('turns an error body into a typed failure', () => {
    expect(() => parseTokenResponse({ error: 'invalid_grant', error_description: 'Token expired' })).toThrow(
      /Token expired/,
    );
    try {
      parseTokenResponse({ error: 'invalid_grant' });
    } catch (e) {
      expect((e as GoogleAuthError).code).toBe('invalid_grant');
    }
  });

  it('defaults a missing lifetime rather than treating it as already expired', () => {
    expect(parseTokenResponse({ access_token: 'at' }).expiresInSec).toBe(3600);
  });
});

describe('exchangeCode', () => {
  it('sends the verifier and the same redirect URI, and returns the refresh token', async () => {
    let sent: URLSearchParams | undefined;
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      sent = new URLSearchParams(String(init?.body));
      return json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: SHEETS_SCOPE });
    }) as unknown as typeof fetch;
    const out = await exchangeCode({
      clientId: 'cid',
      clientSecret: 'secret',
      redirectUri: 'https://preview.test/api/admin/google/callback',
      code: 'the-code',
      verifier: 'the-verifier',
      fetchImpl,
    });
    expect(out.refreshToken).toBe('rt');
    expect(sent?.get('grant_type')).toBe('authorization_code');
    expect(sent?.get('code_verifier')).toBe('the-verifier');
    expect(sent?.get('redirect_uri')).toBe('https://preview.test/api/admin/google/callback');
  });

  it('refuses a grant with no refresh token, which would not survive a restart', async () => {
    const fetchImpl = (async () => json({ access_token: 'at', expires_in: 3600 })) as unknown as typeof fetch;
    await expect(
      exchangeCode({
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://x/cb',
        code: 'c',
        verifier: 'v',
        fetchImpl,
      }),
    ).rejects.toThrow(/would not survive a restart/);
  });

  it('surfaces Google’s own error text on a non-200', async () => {
    const fetchImpl = (async () =>
      json(
        { error: 'redirect_uri_mismatch', error_description: 'Bad redirect' },
        400,
      )) as unknown as typeof fetch;
    await expect(
      exchangeCode({
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'x',
        code: 'c',
        verifier: 'v',
        fetchImpl,
      }),
    ).rejects.toThrow(/Bad redirect/);
  });
});

describe('refreshAccessToken', () => {
  it('exchanges the refresh token for a new access token', async () => {
    let sent: URLSearchParams | undefined;
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      sent = new URLSearchParams(String(init?.body));
      return json({ access_token: 'fresh', expires_in: 3599, scope: SHEETS_SCOPE });
    }) as unknown as typeof fetch;
    const out = await refreshAccessToken({
      clientId: 'cid',
      clientSecret: 'secret',
      refreshToken: 'rt',
      fetchImpl,
    });
    expect(out.accessToken).toBe('fresh');
    expect(sent?.get('grant_type')).toBe('refresh_token');
    expect(sent?.get('refresh_token')).toBe('rt');
    // A refresh does not return a new refresh token, and nothing here pretends it does.
    expect(out.refreshToken).toBeUndefined();
  });
});

describe('revokeToken', () => {
  it('reports success, and never throws when Google is unreachable', async () => {
    const ok = (async () => json({})) as unknown as typeof fetch;
    await expect(revokeToken('rt', { fetchImpl: ok })).resolves.toBe(true);
    const dead = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(revokeToken('rt', { fetchImpl: dead })).resolves.toBe(false);
  });
});

describe('describeToken', () => {
  it('reads the account and scopes, and degrades quietly', async () => {
    const ok = (async () =>
      json({
        email: 'studio@example.com',
        scope: `${SHEETS_SCOPE} ${DRIVE_FILE_SCOPE}`,
      })) as unknown as typeof fetch;
    await expect(describeToken('at', { fetchImpl: ok })).resolves.toMatchObject({
      email: 'studio@example.com',
      scopes: [SHEETS_SCOPE, DRIVE_FILE_SCOPE],
    });
    const bad = (async () => json({}, 400)) as unknown as typeof fetch;
    await expect(describeToken('at', { fetchImpl: bad })).resolves.toEqual({ scopes: [] });
  });
});

describe('scope checks and advice', () => {
  it('names what is missing', () => {
    expect(missingScopes([SHEETS_SCOPE, DRIVE_FILE_SCOPE])).toEqual([]);
    expect(missingScopes([SHEETS_SCOPE])).toEqual([DRIVE_FILE_SCOPE]);
    expect(missingScopes([])).toEqual([SHEETS_SCOPE, DRIVE_FILE_SCOPE]);
  });

  it('always warns about the Testing-mode seven-day expiry, which is the usual cause', () => {
    const advice = googleAuthAdvice([SHEETS_SCOPE, DRIVE_FILE_SCOPE]);
    expect(advice.join(' ')).toMatch(/seven days/);
    expect(advice.join(' ')).toMatch(/six months/);
    // With everything granted there is no missing-permission line to add noise.
    expect(advice.some((l) => l.includes('not granted'))).toBe(false);
    expect(googleAuthAdvice([]).some((l) => l.includes('photo import'))).toBe(true);
    // With the scopes unknown — a token inherited from the environment — nothing is claimed about
    // them, but the durability notes still apply.
    const unknown = googleAuthAdvice([], { scopesKnown: false });
    expect(unknown.some((l) => l.includes('not granted'))).toBe(false);
    expect(unknown.join(' ')).toMatch(/seven days/);
  });
});
