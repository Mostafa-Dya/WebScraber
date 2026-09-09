import { describe, expect, it } from 'vitest';
import { DRIVE_API, createDriveHttp } from '../../../src/lib/drive/client.ts';
import {
  SCOPE_FAIL_TTL_MS,
  SCOPE_OK_TTL_MS,
  TOKENINFO_URL,
  createScopeChecker,
  hasDriveScope,
  parseScopes,
} from '../../../src/lib/drive/scope.ts';
import { DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE } from '../../../src/lib/drive/types.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';

interface Call {
  method: string;
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (c: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: Call = { method: init?.method ?? 'GET', url, init: init ?? {} };
    calls.push(call);
    return handler(call, calls.length);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function checker(
  fetchImpl: typeof fetch,
  opts: { token?: () => Promise<string>; clock?: { t: number }; probe?: boolean } = {},
) {
  const clock = opts.clock ?? { t: 1_000_000 };
  const http = createDriveHttp({
    getAccessToken: opts.token ?? (async () => 'ya29.token'),
    fetchImpl,
    logger: silentLogger,
    sleep: async () => {},
  });
  return createScopeChecker({
    getAccessToken: opts.token ?? (async () => 'ya29.token'),
    http,
    now: () => clock.t,
    probe: opts.probe,
  });
}

const tokeninfo = (scope: string) => json(200, { scope, expires_in: 3599, aud: 'x' });
const probeOk = () => json(200, { files: [] });

describe('parseScopes / hasDriveScope', () => {
  it('splits the space-separated scope string and accepts drive.file or drive', () => {
    expect(parseScopes(`${SHEETS}  ${DRIVE_FILE_SCOPE}`)).toEqual([SHEETS, DRIVE_FILE_SCOPE]);
    expect(parseScopes(undefined)).toEqual([]);
    expect(hasDriveScope([SHEETS])).toBe(false);
    expect(hasDriveScope([SHEETS, DRIVE_FILE_SCOPE])).toBe(true);
    expect(hasDriveScope([DRIVE_FULL_SCOPE])).toBe(true);
  });
});

describe('scopeStatus', () => {
  it('posts the token to tokeninfo (never in the URL), probes files.list once and reports ok', async () => {
    const m = mockFetch((c) => {
      if (c.url === TOKENINFO_URL) {
        expect(c.method).toBe('POST');
        expect(String(c.init.body)).toBe('access_token=ya29.token');
        return tokeninfo(`${SHEETS} ${DRIVE_FILE_SCOPE}`);
      }
      expect(c.url).toBe(`${DRIVE_API}/files?pageSize=1&fields=files(id)&spaces=drive`);
      return probeOk();
    });
    const status = await checker(m.fn)();
    expect(status).toEqual({
      driveScopeOk: true,
      scopes: [SHEETS, DRIVE_FILE_SCOPE],
      checkedAt: 1_000_000,
    });
    expect(m.calls).toHaveLength(2);
    expect(m.calls.every((c) => !c.url.includes('ya29'))).toBe(true);
  });

  it('reports scope_missing without probing when drive.file is absent (the sheets-only token)', async () => {
    const m = mockFetch(() => tokeninfo(SHEETS));
    expect(await checker(m.fn)()).toMatchObject({
      driveScopeOk: false,
      scopes: [SHEETS],
      reason: 'scope_missing',
    });
    expect(m.calls).toHaveLength(1);
  });

  it('reports api_disabled when the probe answers 403, token_error on 401, probe_failed otherwise', async () => {
    const disabled = mockFetch((c) =>
      c.url === TOKENINFO_URL
        ? tokeninfo(DRIVE_FILE_SCOPE)
        : json(403, {
            error: { message: 'Drive API has not been used', errors: [{ reason: 'accessNotConfigured' }] },
          }),
    );
    expect(await checker(disabled.fn)()).toMatchObject({ driveScopeOk: false, reason: 'api_disabled' });

    const unauth = mockFetch((c) => (c.url === TOKENINFO_URL ? tokeninfo(DRIVE_FILE_SCOPE) : json(401, {})));
    expect(await checker(unauth.fn)()).toMatchObject({ driveScopeOk: false, reason: 'token_error' });

    const down = mockFetch((c) => (c.url === TOKENINFO_URL ? tokeninfo(DRIVE_FILE_SCOPE) : json(500, {})));
    expect(await checker(down.fn)()).toMatchObject({ driveScopeOk: false, reason: 'probe_failed' });
  });

  it('reports token_error when no token can be minted and tokeninfo_failed on a bad tokeninfo answer', async () => {
    const m = mockFetch(() => tokeninfo(DRIVE_FILE_SCOPE));
    const dead = async () => {
      throw new Error('invalid_grant');
    };
    expect(await checker(m.fn, { token: dead })()).toMatchObject({
      driveScopeOk: false,
      reason: 'token_error',
    });
    expect(m.calls).toHaveLength(0);

    const invalid = mockFetch(() =>
      json(400, { error: 'invalid_token', error_description: 'Invalid Value' }),
    );
    expect(await checker(invalid.fn)()).toMatchObject({ driveScopeOk: false, reason: 'tokeninfo_failed' });

    const html = mockFetch(() => new Response('<html>', { status: 200 }));
    expect(await checker(html.fn)()).toMatchObject({ driveScopeOk: false, reason: 'tokeninfo_failed' });

    const network = mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await checker(network.fn)()).toMatchObject({ driveScopeOk: false, reason: 'tokeninfo_failed' });
  });

  it('caches a positive answer for 10 minutes and a negative one for 1 minute', async () => {
    const clock = { t: 0 };
    let scope = SHEETS;
    const m = mockFetch((c) => (c.url === TOKENINFO_URL ? tokeninfo(scope) : probeOk()));
    const status = checker(m.fn, { clock });

    expect((await status()).driveScopeOk).toBe(false);
    clock.t += SCOPE_FAIL_TTL_MS - 1;
    expect((await status()).driveScopeOk).toBe(false);
    expect(m.calls).toHaveLength(1); // cached

    scope = `${SHEETS} ${DRIVE_FILE_SCOPE}`; // the owner re-consented
    clock.t += 1;
    expect((await status()).driveScopeOk).toBe(true);
    expect(m.calls).toHaveLength(3); // tokeninfo + probe
    clock.t += SCOPE_OK_TTL_MS - 1;
    expect(await status()).toMatchObject({ driveScopeOk: true, checkedAt: SCOPE_FAIL_TTL_MS });
    expect(m.calls).toHaveLength(3);
    clock.t += 1;
    expect(await status()).toMatchObject({
      driveScopeOk: true,
      checkedAt: SCOPE_FAIL_TTL_MS + SCOPE_OK_TTL_MS,
    });
    expect(m.calls).toHaveLength(5);
  });

  it('shares one in-flight check between concurrent callers and can skip the probe', async () => {
    const m = mockFetch(() => tokeninfo(DRIVE_FILE_SCOPE));
    const status = checker(m.fn, { probe: false });
    const [a, b, c] = await Promise.all([status(), status(), status()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.driveScopeOk).toBe(true);
    expect(m.calls).toHaveLength(1);
  });
});
