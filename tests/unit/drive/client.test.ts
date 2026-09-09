import { describe, expect, it } from 'vitest';
import {
  DRIVE_API,
  DriveApiError,
  createDriveHttp,
  describeDriveError,
} from '../../../src/lib/drive/client.ts';
import { silentLogger } from '../../../src/lib/sheets/errors.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {}, calls.length);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function http(fetchImpl: typeof fetch, extra: { token?: () => Promise<string>; sleeps?: number[] } = {}) {
  return createDriveHttp({
    getAccessToken: extra.token ?? (async () => 'tok'),
    fetchImpl,
    logger: silentLogger,
    sleep: async (ms) => {
      extra.sleeps?.push(ms);
    },
    maxAttempts: 3,
  });
}

describe('createDriveHttp', () => {
  it('sends the bearer token, builds the query string and parses JSON', async () => {
    const m = mockFetch((url, init) => {
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
      expect(url).toBe(`${DRIVE_API}/files?q=name%3D%27x%27&fields=files(id)`);
      return json(200, { files: [] });
    });
    const out = await http(m.fn).request<{ files: unknown[] }>({
      method: 'GET',
      url: `${DRIVE_API}/files`,
      query: [
        ['q', "name='x'"],
        ['fields', 'files(id)'],
      ],
      policy: 'read',
    });
    expect(out.files).toEqual([]);
  });

  it('sends JSON bodies and raw bodies with their own content type', async () => {
    const m = mockFetch((_url, init, n) => {
      const h = init.headers as Record<string, string>;
      if (n === 1) {
        expect(h['content-type']).toBe('application/json');
        expect(init.body).toBe('{"a":1}');
      } else {
        expect(h['content-type']).toBe('multipart/related; boundary=b');
        expect(init.body).toBeInstanceOf(Uint8Array);
      }
      return json(200, { id: 'x' });
    });
    const h = http(m.fn);
    await h.request({ method: 'POST', url: `${DRIVE_API}/files`, body: { json: { a: 1 } }, policy: 'write' });
    await h.request({
      method: 'POST',
      url: `${DRIVE_API}/files`,
      body: { raw: new Uint8Array([1, 2]), contentType: 'multipart/related; boundary=b' },
      policy: 'write',
    });
    expect(m.calls).toHaveLength(2);
  });

  it('retries 429 and 503 (reads and writes) with the 1 s / 2 s backoff, then gives up', async () => {
    const sleeps: number[] = [];
    const m = mockFetch((_u, _i, n) =>
      n === 1
        ? json(429, { error: { message: 'Rate limit', errors: [{ reason: 'rateLimitExceeded' }] } })
        : n === 2
          ? json(503, { error: { message: 'backend', status: 'UNAVAILABLE' } })
          : json(200, { id: 'ok' }),
    );
    const out = await http(m.fn, { sleeps }).request<{ id: string }>({
      method: 'POST',
      url: `${DRIVE_API}/files`,
      body: { json: {} },
      policy: 'write',
    });
    expect(out.id).toBe('ok');
    expect(m.calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
    expect(sleeps[0]).toBeLessThan(1300);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[1]).toBeLessThan(2300);

    const always = mockFetch(() => json(503, { error: { message: 'down' } }));
    await expect(
      http(always.fn).request({ method: 'GET', url: `${DRIVE_API}/files`, policy: 'read' }),
    ).rejects.toMatchObject({ status: 503, retryable: true });
    expect(always.calls).toHaveLength(3);
  });

  it('does not retry 400/403/404 and surfaces the Google reason', async () => {
    const m = mockFetch(() =>
      json(403, {
        error: {
          code: 403,
          message: 'Drive API has not been used',
          errors: [{ reason: 'accessNotConfigured' }],
        },
      }),
    );
    const err = await http(m.fn)
      .request({ method: 'GET', url: `${DRIVE_API}/files`, policy: 'read' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveApiError);
    expect(err).toMatchObject({ status: 403, googleStatus: 'accessNotConfigured', retryable: false });
    expect(m.calls).toHaveLength(1);
    expect(describeDriveError(err)).toMatchObject({
      name: 'DriveApiError',
      status: 403,
      googleStatus: 'accessNotConfigured',
    });
  });

  it('retries a network error for reads but never for writes', async () => {
    const flaky = mockFetch((_u, _i, n) => {
      if (n < 3) throw new TypeError('fetch failed');
      return json(200, { files: [] });
    });
    await http(flaky.fn).request({ method: 'GET', url: `${DRIVE_API}/files`, policy: 'read' });
    expect(flaky.calls).toHaveLength(3);

    const dead = mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(
      http(dead.fn).request({
        method: 'POST',
        url: `${DRIVE_API}/files`,
        body: { json: {} },
        policy: 'write',
      }),
    ).rejects.toThrow('fetch failed');
    expect(dead.calls).toHaveLength(1);
  });

  it('fails fast with a scrubbed 401 when the token cannot be minted', async () => {
    const m = mockFetch(() => json(200, {}));
    const err = await http(m.fn, {
      token: async () => {
        throw new Error('invalid_grant: refresh_token=1//abcdef expired');
      },
    })
      .request({ method: 'GET', url: `${DRIVE_API}/files`, policy: 'read' })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 401, googleStatus: 'UNAUTHENTICATED' });
    expect((err as Error).message).not.toContain('abcdef');
    expect(m.calls).toHaveLength(0);
  });

  it('rejects non-JSON success bodies and tolerates non-JSON error bodies', async () => {
    const bad = mockFetch(() => new Response('<html>', { status: 200 }));
    await expect(
      http(bad.fn).request({ method: 'GET', url: `${DRIVE_API}/files`, policy: 'read' }),
    ).rejects.toMatchObject({ status: 502 });
    const html404 = mockFetch(() => new Response('<html>not found</html>', { status: 404 }));
    await expect(
      http(html404.fn).request({ method: 'GET', url: `${DRIVE_API}/files/x`, policy: 'read' }),
    ).rejects.toMatchObject({ status: 404, message: 'HTTP 404' });
  });
});
