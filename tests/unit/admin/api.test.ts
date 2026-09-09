import { describe, expect, it, vi } from 'vitest';

vi.mock('astro:env/server', () => ({
  SITE_URL: 'https://catalogue.example.test',
  VOTE_SALT: 'v'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  // Customer realm + FX (brief §8, §10).
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

import { ADMIN_MAX_JSON_BODY, rejectCrossSite, siteOrigin } from '../../../src/lib/api.ts';

function req(headers: Record<string, string>): Request {
  return new Request('https://catalogue.example.test/api/admin/rugs', { method: 'POST', headers });
}

describe('rejectCrossSite with a configurable cap (ADMIN_SPEC §2.3)', () => {
  it('keeps the 4 KiB default for the public endpoints and allows 64 KiB for the admin', () => {
    expect(siteOrigin).toBe('https://catalogue.example.test');
    expect(ADMIN_MAX_JSON_BODY).toBe(64 * 1024);
    const big = req({
      'content-type': 'application/json',
      'content-length': String(20_000),
      'sec-fetch-site': 'same-origin',
    });
    expect(rejectCrossSite(big)?.status).toBe(413);
    expect(rejectCrossSite(big, ADMIN_MAX_JSON_BODY)).toBeUndefined();
    const tooBig = req({
      'content-type': 'application/json',
      'content-length': String(64 * 1024 + 1),
      'sec-fetch-site': 'same-origin',
    });
    expect(rejectCrossSite(tooBig, ADMIN_MAX_JSON_BODY)?.status).toBe(413);
    const exact = req({
      'content-type': 'application/json',
      'content-length': String(64 * 1024),
      'sec-fetch-site': 'same-origin',
    });
    expect(rejectCrossSite(exact, ADMIN_MAX_JSON_BODY)).toBeUndefined();
  });
  it('still enforces the content type and the same-origin posture', async () => {
    expect(rejectCrossSite(req({ 'content-type': 'text/plain' }), ADMIN_MAX_JSON_BODY)?.status).toBe(415);
    expect(
      rejectCrossSite(
        req({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }),
        ADMIN_MAX_JSON_BODY,
      )?.status,
    ).toBe(403);
    expect(
      rejectCrossSite(
        req({ 'content-type': 'application/json', origin: 'https://evil.test' }),
        ADMIN_MAX_JSON_BODY,
      )?.status,
    ).toBe(403);
    expect(
      rejectCrossSite(
        req({ 'content-type': 'application/json', origin: 'https://catalogue.example.test' }),
        ADMIN_MAX_JSON_BODY,
      ),
    ).toBeUndefined();
    expect(
      rejectCrossSite(
        req({ 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'none' }),
        ADMIN_MAX_JSON_BODY,
      ),
    ).toBeUndefined();
    const r = rejectCrossSite(req({ 'content-type': 'text/plain' }))!;
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ ok: false, error: 'unsupported media type' });
  });
});
