import { describe, expect, it, vi } from 'vitest';
import { SheetsClient, createTokenSource, type TokenSource } from '../../src/lib/sheets/client.ts';
import { SheetsApiError, silentLogger } from '../../src/lib/sheets/errors.ts';

const tokens: TokenSource = { getAccessToken: async () => 'test-token' };
const auth = { mode: 'service_account' as const, email: 'x@y', privateKey: 'k' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeClient(
  fetchImpl: typeof fetch,
  opts: { sleep?: (ms: number) => Promise<void>; tokens?: TokenSource } = {},
): SheetsClient {
  return new SheetsClient(
    {
      spreadsheetId: 'sheet-1',
      auth,
      fetchImpl,
      logger: silentLogger,
      sleep: opts.sleep ?? (async () => {}),
      maxAttempts: 3,
    },
    opts.tokens ?? tokens,
  );
}

describe('SheetsClient', () => {
  it('builds batchGet with repeated ranges and the ADR render options', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(String(input));
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer test-token');
      return jsonResponse(200, { valueRanges: [{ range: 'Rugs!A1:V' }, { range: 'Rates!A1:D' }] });
    }) as unknown as typeof fetch;
    const out = await makeClient(fetchImpl).batchGet(['Rugs!A1:V', 'Rates!A1:D']);
    expect(out).toHaveLength(2);
    expect(seen[0]).toContain('/v4/spreadsheets/sheet-1/values:batchGet?');
    expect(seen[0]).toContain('ranges=Rugs!A1%3AV&ranges=Rates!A1%3AD');
    expect(seen[0]).toContain('valueRenderOption=UNFORMATTED_VALUE');
    expect(seen[0]).toContain('dateTimeRenderOption=FORMATTED_STRING');
  });

  it('rejects when Google returns fewer ranges than requested', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { valueRanges: [{ range: 'A' }] })) as unknown as typeof fetch;
    await expect(makeClient(fetchImpl).batchGet(['A', 'B'])).rejects.toMatchObject({ status: 502 });
  });

  it('retries reads on 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1)
        return jsonResponse(429, { error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
      return jsonResponse(200, { valueRanges: [{ range: 'A' }] });
    }) as unknown as typeof fetch;
    await makeClient(fetchImpl).batchGet(['A']);
    expect(calls).toBe(2);
  });

  it('backs off 1 s then 2 s (+ jitter) and gives up after 3 attempts', async () => {
    let calls = 0;
    const delays: number[] = [];
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse(429, { error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
    }) as unknown as typeof fetch;
    await expect(
      makeClient(fetchImpl, {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }).batchGet(['A']),
    ).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[0]).toBeLessThan(1300);
    expect(delays[1]).toBeGreaterThanOrEqual(2000);
    expect(delays[1]).toBeLessThan(2300);
  });

  it('does not retry reads on 400 and surfaces the Google message', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse(400, { error: { message: 'Unable to parse range', status: 'INVALID_ARGUMENT' } });
    }) as unknown as typeof fetch;
    await expect(makeClient(fetchImpl).batchGet(['A'])).rejects.toMatchObject({
      status: 400,
      googleStatus: 'INVALID_ARGUMENT',
    });
    expect(calls).toBe(1);
  });

  it('retries writes on 503 but never after a network error', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls === 1) return jsonResponse(503, { error: { message: 'backend', status: 'UNAVAILABLE' } });
      return jsonResponse(200, { replies: [] });
    }) as unknown as typeof fetch;
    await makeClient(flaky).batchUpdate([{ x: 1 }]);
    expect(calls).toBe(2);

    let netCalls = 0;
    const network = (async () => {
      netCalls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(makeClient(network).batchUpdate([{ x: 1 }])).rejects.toThrow('fetch failed');
    expect(netCalls).toBe(1);
  });

  it('retries reads after a network error', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls < 3) throw new TypeError('fetch failed');
      return jsonResponse(200, { valueRanges: [{ range: 'A' }] });
    }) as unknown as typeof fetch;
    await makeClient(fetchImpl).batchGet(['A']);
    expect(calls).toBe(3);
  });

  it('fails fast (401, no retry) when the access token cannot be minted', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;
    const dead: TokenSource = {
      getAccessToken: async () => {
        throw new Error('invalid_grant: Token has been expired or revoked. refresh_token=1//abc');
      },
    };
    const err = await makeClient(fetchImpl, { tokens: dead })
      .batchGet(['A'])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SheetsApiError);
    expect((err as SheetsApiError).status).toBe(401);
    expect((err as SheetsApiError).message).toContain('invalid_grant');
    expect((err as SheetsApiError).message).not.toContain('1//abc');
    expect(calls).toBe(0);
  });

  it('createSpreadsheet retries 503 but is never replayed after a network error', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls === 1) return jsonResponse(503, { error: { message: 'backend', status: 'UNAVAILABLE' } });
      return jsonResponse(200, { spreadsheetId: 'new-id' });
    }) as unknown as typeof fetch;
    expect(
      await SheetsClient.createSpreadsheet(auth, 'T', ['Rugs'], {
        fetchImpl: flaky,
        logger: silentLogger,
        tokens,
      }),
    ).toBe('new-id');
    expect(calls).toBe(2);

    let netCalls = 0;
    const network = (async () => {
      netCalls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(
      SheetsClient.createSpreadsheet(auth, 'T', ['Rugs'], {
        fetchImpl: network,
        logger: silentLogger,
        tokens,
      }),
    ).rejects.toThrow('fetch failed');
    expect(netCalls).toBe(1);
  });

  it('caches sheet ids by title and can forget them', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse(200, { sheets: [{ properties: { sheetId: 42, title: 'Votes' } }] });
    }) as unknown as typeof fetch;
    const c = makeClient(fetchImpl);
    expect(await c.sheetIdByTitle('Votes')).toBe(42);
    expect(await c.sheetIdByTitle('Votes')).toBe(42);
    expect(calls).toBe(1);
    await expect(c.sheetIdByTitle('Nope')).rejects.toBeInstanceOf(SheetsApiError);
    c.forgetSheetIds();
    await c.sheetIdByTitle('Votes');
    expect(calls).toBe(2);
  });

  it('treats a non-JSON 200 body as an API error', async () => {
    const fetchImpl = (async () =>
      new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch;
    await expect(makeClient(fetchImpl).batchGet(['A'])).rejects.toMatchObject({ status: 502 });
  });
});

describe('createTokenSource', () => {
  it('builds a JWT source for service accounts and a refresh source for OAuth (no network until used)', () => {
    expect(
      createTokenSource({
        mode: 'service_account',
        email: 'sa@p.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
      }),
    ).toBeTruthy();
    expect(
      createTokenSource({
        mode: 'oauth_refresh',
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: '1//token',
      }),
    ).toBeTruthy();
  });
});
