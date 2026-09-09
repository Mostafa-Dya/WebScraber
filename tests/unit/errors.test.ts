import { describe, expect, it } from 'vitest';
import { SheetsApiError, scrub, serializeError } from '../../src/lib/sheets/errors.ts';

describe('serializeError / scrub (ADR D9)', () => {
  it('redacts every credential shape that Google errors can carry', () => {
    const shapes = [
      'token exchange failed: refresh_token=1//abcDEF client_secret=GOCSPX-xyz assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ4In0.sig',
      'request failed; Authorization: Bearer ya29.a0AfH6SMC-secret',
      '{"refresh_token": "1//zzz", "client_secret": "GOCSPX-qqq", "access_token": "ya29.abc"}',
      'private_key: -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\n',
      'code_verifier=abc123 id_token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig',
    ];
    for (const s of shapes) {
      const out = scrub(s);
      for (const secret of ['1//abcDEF', 'GOCSPX', 'eyJhbGci', 'ya29.', '1//zzz', 'MIIEvQIBADANBg', 'abc123'])
        expect(out).not.toContain(secret);
      expect(out).toContain('[redacted]');
    }
  });
  it('keeps the useful parts and summarises a network cause', () => {
    const e = new TypeError('fetch failed');
    (e as { cause?: unknown }).cause = {
      name: 'Error',
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND sheets.googleapis.com',
    };
    const safe = serializeError(e);
    expect(safe).toMatchObject({ name: 'TypeError', message: 'fetch failed' });
    expect(safe.cause).toContain('ENOTFOUND');
    expect(serializeError(new SheetsApiError(429, 'Quota exceeded', 'RESOURCE_EXHAUSTED'))).toMatchObject({
      status: 429,
      googleStatus: 'RESOURCE_EXHAUSTED',
    });
    expect(serializeError('plain string')).toEqual({ name: 'UnknownError', message: 'plain string' });
  });
});
