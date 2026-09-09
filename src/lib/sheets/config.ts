// Builds the auth configuration from environment values. Used by Astro (astro:env) and by scripts
// (process.env). Never logs anything.
import type { AuthConfig } from './client.ts';

export type EnvLike = Record<string, string | number | boolean | undefined>;

function str(env: EnvLike, key: string): string | undefined {
  const v = env[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

export function authFromEnv(env: EnvLike): AuthConfig {
  const mode = str(env, 'GOOGLE_AUTH_MODE') ?? 'service_account';
  if (mode === 'oauth_refresh') {
    const clientId = str(env, 'GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = str(env, 'GOOGLE_OAUTH_CLIENT_SECRET');
    const refreshToken = str(env, 'GOOGLE_OAUTH_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'GOOGLE_AUTH_MODE=oauth_refresh needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN (run `npm run google:auth`)',
      );
    }
    return { mode: 'oauth_refresh', clientId, clientSecret, refreshToken };
  }
  if (mode !== 'service_account') throw new Error(`unknown GOOGLE_AUTH_MODE "${mode}"`);
  const email = str(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = str(env, 'GOOGLE_PRIVATE_KEY');
  if (!email || !privateKey) {
    throw new Error(
      'GOOGLE_AUTH_MODE=service_account needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY',
    );
  }
  return { mode: 'service_account', email, privateKey };
}

export function sheetIdFromEnv(env: EnvLike): string {
  const id = str(env, 'GOOGLE_SHEET_ID');
  if (!id)
    throw new Error('GOOGLE_SHEET_ID is not set (run `npm run sheet:init` to create a development sheet)');
  return id;
}
