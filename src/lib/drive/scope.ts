// `driveScopeOk` (docs/ADMIN_SPEC.md §5.2): the current access token's scopes from Google's
// tokeninfo endpoint (posted in the body, never in a URL) plus one cheap `files.list` probe so a
// project with the Drive API disabled (403 accessNotConfigured) also reports false. Cached 10 min on
// success and 1 min on failure (so a re-consent shows up quickly without hammering tokeninfo).

import { serializeError } from '../sheets/errors.ts';
import { DRIVE_API, DriveApiError, describeDriveError, type DriveHttp } from './client.ts';
import { DRIVE_FILE_SCOPE, DRIVE_FULL_SCOPE, type ScopeStatus } from './types.ts';

export const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const TOKENINFO_TIMEOUT_MS = 30_000;
export const SCOPE_OK_TTL_MS = 10 * 60_000;
export const SCOPE_FAIL_TTL_MS = 60_000;

export interface ScopeCheckerOptions {
  getAccessToken: () => Promise<string>;
  http: DriveHttp;
  now?: () => number;
  ttlMs?: number;
  failTtlMs?: number;
  /** Skip the `files.list` probe (tests / offline). */
  probe?: boolean;
}

export function parseScopes(scope: unknown): string[] {
  if (typeof scope !== 'string') return [];
  return scope.split(/\s+/).filter(Boolean);
}

export function hasDriveScope(scopes: readonly string[]): boolean {
  return scopes.includes(DRIVE_FILE_SCOPE) || scopes.includes(DRIVE_FULL_SCOPE);
}

async function tokenScopes(
  http: DriveHttp,
  token: string,
): Promise<{ scopes: string[] } | { failed: true; status: number }> {
  const res = await http.fetchImpl(TOKENINFO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }),
    signal: AbortSignal.timeout(TOKENINFO_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) return { failed: true, status: res.status };
  try {
    const json = JSON.parse(text) as { scope?: unknown };
    return { scopes: parseScopes(json.scope) };
  } catch {
    return { failed: true, status: 502 };
  }
}

async function check(opts: ScopeCheckerOptions, now: number): Promise<ScopeStatus> {
  const { http } = opts;
  let token: string;
  try {
    token = await opts.getAccessToken();
  } catch (e) {
    http.logger.warn('scope check: could not obtain an access token', { error: serializeError(e) });
    return { driveScopeOk: false, scopes: [], reason: 'token_error', checkedAt: now };
  }
  let scopes: string[];
  try {
    const info = await tokenScopes(http, token);
    if ('failed' in info) {
      http.logger.warn(`scope check: tokeninfo answered ${info.status}`);
      return { driveScopeOk: false, scopes: [], reason: 'tokeninfo_failed', checkedAt: now };
    }
    scopes = info.scopes;
  } catch (e) {
    http.logger.warn('scope check: tokeninfo request failed', { error: serializeError(e) });
    return { driveScopeOk: false, scopes: [], reason: 'tokeninfo_failed', checkedAt: now };
  }
  if (!hasDriveScope(scopes)) {
    return { driveScopeOk: false, scopes, reason: 'scope_missing', checkedAt: now };
  }
  if (opts.probe === false) return { driveScopeOk: true, scopes, checkedAt: now };
  try {
    await http.request<{ files?: unknown[] }>({
      method: 'GET',
      url: `${DRIVE_API}/files`,
      query: [
        ['pageSize', '1'],
        ['fields', 'files(id)'],
        ['spaces', 'drive'],
      ],
      policy: 'read',
    });
    return { driveScopeOk: true, scopes, checkedAt: now };
  } catch (e) {
    const status = e instanceof DriveApiError ? e.status : 0;
    const reason = status === 403 ? 'api_disabled' : status === 401 ? 'token_error' : 'probe_failed';
    http.logger.warn(`scope check: Drive probe failed (${reason})`, { error: describeDriveError(e) });
    return { driveScopeOk: false, scopes, reason, checkedAt: now };
  }
}

export function createScopeChecker(opts: ScopeCheckerOptions): () => Promise<ScopeStatus> {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? SCOPE_OK_TTL_MS;
  const failTtl = opts.failTtlMs ?? SCOPE_FAIL_TTL_MS;
  let cached: ScopeStatus | undefined;
  let pending: Promise<ScopeStatus> | undefined;
  return async () => {
    const t = now();
    if (cached && t - cached.checkedAt < (cached.driveScopeOk ? ttl : failTtl)) return cached;
    if (!pending) {
      pending = check(opts, t)
        .then((status) => {
          cached = status;
          return status;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
}
