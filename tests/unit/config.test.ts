import { describe, expect, it } from 'vitest';
import { authFromEnv, sheetIdFromEnv } from '../../src/lib/sheets/config.ts';

describe('authFromEnv', () => {
  it('defaults to service_account and requires both of its variables', () => {
    expect(authFromEnv({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@x', GOOGLE_PRIVATE_KEY: 'k' })).toEqual({
      mode: 'service_account',
      email: 'sa@x',
      privateKey: 'k',
    });
    expect(() => authFromEnv({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@x' })).toThrow(/GOOGLE_PRIVATE_KEY/);
    expect(() => authFromEnv({ GOOGLE_AUTH_MODE: '  ', GOOGLE_PRIVATE_KEY: 'k' })).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_EMAIL/,
    );
  });
  it('oauth_refresh needs all three variables and names them all', () => {
    expect(() => authFromEnv({ GOOGLE_AUTH_MODE: 'oauth_refresh', GOOGLE_OAUTH_CLIENT_ID: 'x' })).toThrow(
      /GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN/,
    );
    expect(
      authFromEnv({
        GOOGLE_AUTH_MODE: 'oauth_refresh',
        GOOGLE_OAUTH_CLIENT_ID: 'a',
        GOOGLE_OAUTH_CLIENT_SECRET: 'b',
        GOOGLE_OAUTH_REFRESH_TOKEN: 'c',
      }),
    ).toEqual({
      mode: 'oauth_refresh',
      clientId: 'a',
      clientSecret: 'b',
      refreshToken: 'c',
    });
  });
  it('rejects unknown modes', () => {
    expect(() => authFromEnv({ GOOGLE_AUTH_MODE: 'basic' })).toThrow(/unknown GOOGLE_AUTH_MODE/);
  });
});

describe('sheetIdFromEnv', () => {
  it('trims and requires the id', () => {
    expect(sheetIdFromEnv({ GOOGLE_SHEET_ID: ' abc ' })).toBe('abc');
    expect(() => sheetIdFromEnv({ GOOGLE_SHEET_ID: '' })).toThrow(/sheet:init/);
  });
});
