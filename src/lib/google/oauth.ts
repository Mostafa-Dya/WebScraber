// The Google OAuth handshake, pure (brief §18; supersedes the CLI-only `npm run google:auth`).
//
// The owner connects their Google account from inside /admin instead of running a script on the
// machine that happens to hold `.env`. Everything here is free of Astro and of the filesystem so it
// can be tested without a browser and without a network.
//
// Two things are worth stating because they are the whole point of the feature:
//
//   * **An access token lasts an hour; a refresh token does not expire on a schedule.** Once the
//     owner has consented once, the site trades the refresh token for a fresh access token whenever
//     the old one is about to lapse, for as long as the grant stands. That is what "stays alive"
//     means, and it needs no cron and no keep-alive ping.
//   * **A refresh token DOES die in three cases**: the owner revokes it, the grant sits unused for
//     six months, or — the one that catches people — the OAuth consent screen is still in *Testing*
//     publishing status, where Google expires refresh tokens after seven days. No amount of code
//     fixes the third; publishing the app does. `googleAuthAdvice` says so in the admin.
//
// PKCE is used even though this is a confidential client with a secret: it costs one hash and it
// closes the authorization-code interception window if the redirect is ever mis-registered.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Read the sheet, and touch only the Drive files this app created. Nothing wider is ever asked for. */
export const REQUIRED_SCOPES = [SHEETS_SCOPE, DRIVE_FILE_SCOPE] as const;

/** Where Google sends the owner back. Derived from SITE_URL so it moves with the deployment. */
export function redirectUriFor(siteUrl: string): string {
  return `${new URL(siteUrl).origin}/api/admin/google/callback`;
}

export interface Pkce {
  verifier: string;
  challenge: string;
}

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function createState(): string {
  return randomBytes(16).toString('base64url');
}

/** Constant-time compare so a returned `state` cannot be probed a character at a time. */
export function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface AuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  scopes?: readonly string[];
  /** Force the consent screen so Google returns a refresh token even on a repeat authorisation. */
  forceConsent?: boolean;
  loginHint?: string;
}

/**
 * `access_type=offline` plus `prompt=consent` is what makes Google issue a refresh token. Without
 * the prompt, a second authorisation by the same account returns an access token only, and the
 * connection silently stops surviving restarts.
 */
export function buildAuthUrl(input: AuthUrlInput): string {
  const url = new URL(AUTH_ENDPOINT);
  const params: Record<string, string> = {
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: (input.scopes ?? REQUIRED_SCOPES).join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
  };
  if (input.forceConsent !== false) params.prompt = 'consent';
  if (input.loginHint) params.login_hint = input.loginHint;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  /** Absent when Google returns an access token only — which is a failure for this flow. */
  refreshToken?: string;
  expiresInSec: number;
  scopes: string[];
}

interface RawToken {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export class GoogleAuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

export function parseTokenResponse(body: unknown): TokenResponse {
  const raw = (body ?? {}) as RawToken;
  if (typeof raw.error === 'string') {
    throw new GoogleAuthError(
      raw.error,
      typeof raw.error_description === 'string' ? raw.error_description : raw.error,
    );
  }
  if (typeof raw.access_token !== 'string' || !raw.access_token) {
    throw new GoogleAuthError('no_access_token', 'Google did not return an access token.');
  }
  return {
    accessToken: raw.access_token,
    refreshToken: typeof raw.refresh_token === 'string' && raw.refresh_token ? raw.refresh_token : undefined,
    expiresInSec: typeof raw.expires_in === 'number' && raw.expires_in > 0 ? raw.expires_in : 3600,
    scopes: typeof raw.scope === 'string' ? raw.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export interface HttpInput {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function postForm(
  url: string,
  form: Record<string, string>,
  { fetchImpl = fetch, timeoutMs = 20_000 }: HttpInput = {},
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = (body ?? {}) as RawToken;
    const code = typeof raw.error === 'string' ? raw.error : `http_${res.status}`;
    const message =
      typeof raw.error_description === 'string' ? raw.error_description : `Google answered ${res.status}.`;
    throw new GoogleAuthError(code, message);
  }
  return body;
}

export interface ExchangeInput extends HttpInput {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  verifier: string;
}

/** Trades the one-time code for tokens. The refresh token here is the only one we will ever get. */
export async function exchangeCode(input: ExchangeInput): Promise<TokenResponse> {
  const body = await postForm(
    TOKEN_ENDPOINT,
    {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.verifier,
    },
    input,
  );
  const tokens = parseTokenResponse(body);
  if (!tokens.refreshToken) {
    throw new GoogleAuthError(
      'no_refresh_token',
      'Google returned an access token but no refresh token, so the connection would not survive a restart. Re-authorise; the consent screen must be shown.',
    );
  }
  return tokens;
}

export interface RefreshInput extends HttpInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Trades the long-lived refresh token for a fresh access token. Called on demand, not on a timer. */
export async function refreshAccessToken(input: RefreshInput): Promise<TokenResponse> {
  const body = await postForm(
    TOKEN_ENDPOINT,
    {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    },
    input,
  );
  return parseTokenResponse(body);
}

/** Best-effort revoke on disconnect: a token we stop using should stop existing. Never throws. */
export async function revokeToken(token: string, http: HttpInput = {}): Promise<boolean> {
  try {
    await postForm(REVOKE_ENDPOINT, { token }, http);
    return true;
  } catch {
    return false;
  }
}

export interface TokenInfo {
  scopes: string[];
  email?: string;
  expiresInSec?: number;
}

/** Who the token belongs to and what it may do; used to show the connected account in the admin. */
export async function describeToken(
  accessToken: string,
  { fetchImpl = fetch, timeoutMs = 10_000 }: HttpInput = {},
): Promise<TokenInfo> {
  const res = await fetchImpl(`${TOKENINFO_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return { scopes: [] };
  const body = (await res.json().catch(() => ({}))) as {
    scope?: unknown;
    email?: unknown;
    expires_in?: unknown;
  };
  return {
    scopes: typeof body.scope === 'string' ? body.scope.split(/\s+/).filter(Boolean) : [],
    email: typeof body.email === 'string' ? body.email : undefined,
    expiresInSec: typeof body.expires_in === 'number' ? body.expires_in : undefined,
  };
}

export function missingScopes(granted: readonly string[]): string[] {
  return REQUIRED_SCOPES.filter((s) => !granted.includes(s));
}

/**
 * What to tell the owner about staying connected. The seven-day case is the one that actually bites,
 * and it is a console setting rather than anything the code can fix.
 */
export function googleAuthAdvice(
  granted: readonly string[],
  options: { scopesKnown?: boolean } = {},
): string[] {
  const notes: string[] = [];
  // A token inherited from the environment was granted elsewhere, so nothing here knows its scopes.
  // Saying a permission is missing would be a guess, and the wrong one: the CLI grants both.
  const missing = options.scopesKnown === false ? [] : missingScopes(granted);
  if (missing.includes(SHEETS_SCOPE))
    notes.push('The spreadsheets permission was not granted: the site cannot read the catalogue.');
  if (missing.includes(DRIVE_FILE_SCOPE))
    notes.push('The Drive permission was not granted: photo import stays disabled.');
  notes.push(
    'If the OAuth consent screen is still in Testing, Google expires this connection after seven days. Publish the app in the Google Cloud console to keep it indefinitely.',
  );
  notes.push('The connection also ends if you revoke access or leave it unused for six months.');
  return notes;
}
