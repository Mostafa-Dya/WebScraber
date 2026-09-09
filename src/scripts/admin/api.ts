// Admin JSON client (docs/ADMIN_SPEC.md §8.2): same-origin credentials, JSON content type, a
// per-call timeout, 401 → back to the login page with `next`, 409 → the fresh row for the form to
// reload, `Retry-After` surfaced. Everything the DOM needs is injectable for the happy-dom tests.
export interface ApiOk<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiFail {
  ok: false;
  status: number;
  /** Short machine code from the server (`error`), or `network` / `timeout` / `unauthorized`. */
  error: string;
  message: string;
  retryAfterSec?: number;
  /** The server's whole body (409 carries `rug` / `fresh`, 422 `parse_failed` carries `data`, …). */
  body?: Record<string, unknown>;
}

export type ApiResult<T> = ApiOk<T> | ApiFail;

export interface ApiOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Called on 401 (default: navigate to the login page with `next`). */
  onUnauthorized?: () => void;
  location?: { pathname: string; assign(url: string): void };
}

export const DEFAULT_TIMEOUT_MS = 10_000;
/** A scrape may take the server's whole 20 s deadline plus the Jina fallback. */
export const SCRAPE_TIMEOUT_MS = 45_000;
/** Twelve sequential uploads with lh3 retries. */
export const PHOTOS_TIMEOUT_MS = 180_000;

function loginRedirect(loc: ApiOptions['location']): void {
  const l = loc ?? (typeof location === 'undefined' ? undefined : location);
  if (!l) return;
  l.assign(`/admin/login?next=${encodeURIComponent(l.pathname)}`);
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  opts: ApiOptions,
): Promise<ApiResult<T>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };
  if (method === 'POST') {
    init.headers = { ...init.headers, 'content-type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetchImpl(path, init);
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return {
      ok: false,
      status: 0,
      error: timedOut ? 'timeout' : 'network',
      message: timedOut ? 'The request timed out — try again.' : 'Could not reach the server.',
    };
  }
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (res.status === 401) {
    (opts.onUnauthorized ?? (() => loginRedirect(opts.location)))();
    return { ok: false, status: 401, error: 'unauthorized', message: 'Signed out — log in again.' };
  }
  if (res.ok && json.ok !== false) return { ok: true, status: res.status, data: json as T };
  const retry = Number(res.headers.get('retry-after') ?? '');
  const error = typeof json.error === 'string' ? json.error : `http ${res.status}`;
  const message =
    typeof json.message === 'string' && json.message
      ? json.message
      : describe(error, res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  return {
    ok: false,
    status: res.status,
    error,
    message,
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSec: retry } : {}),
    body: json,
  };
}

/** Human text for the codes the server sends without a message. */
export function describe(error: string, status: number, retryAfterSec?: number): string {
  if (status === 429) return `Too many requests — try again in ${retryAfterSec ?? 60} s.`;
  if (status === 413) return 'The request is too large.';
  if (status === 415 || status === 403) return 'The request was refused (wrong origin or content type).';
  if (status === 404) return 'Not found.';
  if (status === 409) return 'Someone changed this row — reloaded the latest values; re-apply your edit.';
  if (status === 503)
    return `The sheet is unavailable${retryAfterSec ? ` — retry in ${retryAfterSec} s` : ''}.`;
  if (status >= 500) return 'Server error — check the audit log and try again.';
  return error.replace(/_/g, ' ');
}

export function get<T = Record<string, unknown>>(path: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  return call<T>('GET', path, undefined, opts);
}

export function post<T = Record<string, unknown>>(
  path: string,
  body: unknown,
  opts: ApiOptions = {},
): Promise<ApiResult<T>> {
  return call<T>('POST', path, body, opts);
}

/** Issue list of a 400 `invalid body` answer as one line. */
export function issuesText(fail: ApiFail): string {
  const issues = fail.body?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return fail.message;
  return issues
    .map((i) => {
      const o = i as { path?: string; message?: string };
      return `${o.path || 'body'}: ${o.message ?? 'invalid'}`;
    })
    .join('; ');
}
