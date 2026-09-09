// Drive v3 REST transport (docs/ADMIN_SPEC.md §5.2), mirroring the Sheets client's conventions:
// native fetch, the token minted once per request, 30 s timeout, retries on 429/503 only with the
// same 1 s / 2 s (+ jitter) backoff, and writes never replayed after a network error (a replayed
// upload would create a duplicate file whose id is lost).

import { serializeError, type Logger } from '../sheets/errors.ts';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_TIMEOUT_MS = 20_000;

export class DriveApiError extends Error {
  readonly status: number;
  readonly googleStatus: string | undefined;
  readonly retryable: boolean;

  constructor(status: number, message: string, googleStatus?: string) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
    this.googleStatus = googleStatus;
    this.retryable = status === 429 || status === 503;
  }
}

export const driveConsoleLogger: Logger = {
  info: (msg, data) => console.info(`[drive] ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[drive] ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[drive] ${msg}`, data ?? ''),
};

export type RetryPolicy = 'read' | 'write';

export interface DriveRequest {
  method: 'GET' | 'POST';
  /** Absolute URL without a query string (`DRIVE_API`/`DRIVE_UPLOAD_API` + path). */
  url: string;
  query?: Array<[string, string]>;
  body?: { json: unknown } | { raw: Uint8Array<ArrayBuffer>; contentType: string };
  policy: RetryPolicy;
}

export interface DriveHttp {
  request<T>(opts: DriveRequest): Promise<T>;
  readonly fetchImpl: typeof fetch;
  readonly logger: Logger;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface DriveHttpOptions {
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Log-safe summary of an error (scrubbed message plus the HTTP status for Drive errors). */
export function describeDriveError(e: unknown): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...serializeError(e) };
  if (e instanceof DriveApiError) {
    safe.status = e.status;
    if (e.googleStatus) safe.googleStatus = e.googleStatus;
  }
  return safe;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; errors?: Array<{ reason?: string }> };
}

async function once<T>(fetchImpl: typeof fetch, url: URL, opts: DriveRequest, token: string): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  let body: string | Uint8Array<ArrayBuffer> | undefined;
  if (opts.body && 'raw' in opts.body) {
    headers['content-type'] = opts.body.contentType;
    body = opts.body.raw;
  } else if (opts.body) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body.json);
  }
  const res = await fetchImpl(url, {
    method: opts.method,
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      if (res.ok) throw new DriveApiError(502, 'non-JSON response from the Drive API');
    }
  }
  if (!res.ok) {
    const err = (json as GoogleErrorBody).error;
    throw new DriveApiError(
      res.status,
      err?.message ?? `HTTP ${res.status}`,
      err?.status ?? err?.errors?.[0]?.reason,
    );
  }
  return json as T;
}

export function createDriveHttp(options: DriveHttpOptions): DriveHttp {
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? driveConsoleLogger;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? 3;

  async function request<T>(opts: DriveRequest): Promise<T> {
    const url = new URL(opts.url);
    if (opts.query?.length) {
      url.search = opts.query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    // Token minted once per request, outside the retry loop (a dead credential fails fast, not 3×).
    let token: string;
    try {
      token = await withTimeout(options.getAccessToken(), TOKEN_TIMEOUT_MS, 'access token request');
    } catch (e) {
      const safe = serializeError(e);
      throw new DriveApiError(401, `could not obtain an access token: ${safe.message}`, 'UNAUTHENTICATED');
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await once<T>(fetchImpl, url, opts, token);
      } catch (e) {
        lastError = e;
        const apiError = e instanceof DriveApiError ? e : undefined;
        const retryable = apiError ? apiError.retryable : opts.policy === 'read';
        if (!retryable || attempt === maxAttempts) throw e;
        const delay = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        logger.warn(`retrying ${opts.method} ${url.pathname} after ${delay}ms`, {
          attempt,
          error: describeDriveError(e),
        });
        await sleep(delay);
      }
    }
    throw lastError;
  }

  return { request, fetchImpl, logger, sleep };
}
