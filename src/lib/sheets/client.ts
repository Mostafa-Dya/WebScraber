// Thin, typed Google Sheets API v4 client (docs/ADR.md D3).
// google-auth-library mints the access token (service-account JWT or the owner's refresh token);
// everything else is native fetch against the REST endpoints with a hand-built query string
// (repeated `ranges=` parameters) and an explicit retry policy: 429/503 only, exponential backoff,
// and writes are never replayed after a network error (a duplicated insert would double-count a vote).

import { JWT, UserRefreshClient } from 'google-auth-library';
import { SheetsApiError, consoleLogger, serializeError, type Logger } from './errors.ts';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_TIMEOUT_MS = 20_000;

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

export type AuthConfig =
  | { mode: 'service_account'; email: string; privateKey: string }
  | { mode: 'oauth_refresh'; clientId: string; clientSecret: string; refreshToken: string };

export interface SheetsClientOptions {
  spreadsheetId: string;
  auth: AuthConfig;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  /** Test hook: replaces the backoff sleep. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

export type CellValue = string | number | boolean;

export interface ValueRange {
  range: string;
  majorDimension?: 'ROWS' | 'COLUMNS';
  values?: CellValue[][];
}

export interface SheetProperties {
  sheetId: number;
  title: string;
  index?: number;
  gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  properties?: { title?: string; locale?: string; timeZone?: string };
  sheets?: Array<{ properties: SheetProperties }>;
}

export type RetryPolicy = 'read' | 'write';

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT';
  /** Path relative to the spreadsheet (e.g. "/values:batchGet") or an absolute URL. */
  path: string;
  query?: Array<[string, string]>;
  body?: unknown;
  policy: RetryPolicy;
}

export interface TokenSource {
  getAccessToken(): Promise<string>;
}

function normalisePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

export function createTokenSource(auth: AuthConfig): TokenSource {
  if (auth.mode === 'service_account') {
    // `scopes` is mandatory: without it the JWT client silently sends a self-signed JWT (ADR D3).
    const client = new JWT({ email: auth.email, key: normalisePrivateKey(auth.privateKey), scopes: SCOPES });
    return {
      async getAccessToken() {
        const { token } = await client.getAccessToken();
        if (!token) throw new SheetsApiError(401, 'service account token request returned no token');
        return token;
      },
    };
  }
  const client = new UserRefreshClient({
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    refreshToken: auth.refreshToken,
  });
  return {
    async getAccessToken() {
      const { token } = await client.getAccessToken();
      if (!token) throw new SheetsApiError(401, 'refresh token exchange returned no token');
      return token;
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SheetsClient {
  readonly spreadsheetId: string;
  private readonly tokens: TokenSource;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;
  private sheetIds: Map<string, number> | undefined;

  constructor(options: SheetsClientOptions, tokens?: TokenSource) {
    this.spreadsheetId = options.spreadsheetId;
    this.tokens = tokens ?? createTokenSource(options.auth);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? consoleLogger;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  /** Reads several ranges in one request (UNFORMATTED_VALUE + FORMATTED_STRING, ADR D3). */
  async batchGet(ranges: readonly string[]): Promise<ValueRange[]> {
    const query: Array<[string, string]> = ranges.map((r) => ['ranges', r] as [string, string]);
    query.push(['majorDimension', 'ROWS']);
    query.push(['valueRenderOption', 'UNFORMATTED_VALUE']);
    query.push(['dateTimeRenderOption', 'FORMATTED_STRING']);
    const res = await this.request<{ valueRanges?: ValueRange[] }>({
      method: 'GET',
      path: '/values:batchGet',
      query,
      policy: 'read',
    });
    const got = res.valueRanges ?? [];
    if (got.length !== ranges.length) {
      throw new SheetsApiError(502, `batchGet returned ${got.length} ranges for ${ranges.length} requested`);
    }
    return got;
  }

  /** Atomic per call: either every request applies or none does. */
  async batchUpdate(
    requests: unknown[],
    extra?: { includeSpreadsheetInResponse?: boolean; responseRanges?: string[] },
  ): Promise<{ replies?: unknown[]; updatedSpreadsheet?: unknown }> {
    return this.request({
      method: 'POST',
      path: ':batchUpdate',
      body: { requests, ...extra },
      policy: 'write',
    });
  }

  async valuesUpdate(
    range: string,
    values: CellValue[][],
    valueInputOption: 'RAW' | 'USER_ENTERED',
  ): Promise<void> {
    await this.request({
      method: 'PUT',
      path: `/values/${encodeURIComponent(range)}`,
      query: [['valueInputOption', valueInputOption]],
      body: { range, majorDimension: 'ROWS', values },
      policy: 'write',
    });
  }

  /** Kept for the Phase-5 concurrency test only; production votes use batchUpdate (ADR D4). */
  async valuesAppend(
    range: string,
    values: CellValue[][],
    insertDataOption: 'INSERT_ROWS' | 'OVERWRITE',
  ): Promise<{ updates?: { updatedRange?: string } }> {
    return this.request({
      method: 'POST',
      path: `/values/${encodeURIComponent(range)}:append`,
      query: [
        ['valueInputOption', 'RAW'],
        ['insertDataOption', insertDataOption],
      ],
      body: { range, majorDimension: 'ROWS', values },
      policy: 'write',
    });
  }

  async getSpreadsheet(
    fields = 'properties.title,properties.locale,sheets.properties',
  ): Promise<SpreadsheetInfo> {
    return this.request<SpreadsheetInfo>({
      method: 'GET',
      path: '',
      query: [['fields', fields]],
      policy: 'read',
    });
  }

  /** Numeric sheetId for a tab title (cached; call `forgetSheetIds()` after a `sheetId` error). */
  async sheetIdByTitle(title: string): Promise<number> {
    if (!this.sheetIds) {
      const info = await this.getSpreadsheet('sheets.properties');
      this.sheetIds = new Map((info.sheets ?? []).map((s) => [s.properties.title, s.properties.sheetId]));
    }
    const id = this.sheetIds.get(title);
    if (id === undefined) throw new SheetsApiError(404, `tab "${title}" not found in spreadsheet`);
    return id;
  }

  forgetSheetIds(): void {
    this.sheetIds = undefined;
  }

  /**
   * Creates a brand-new spreadsheet (development sheets, scripts/init-sheet.ts). Not idempotent:
   * a network error is never replayed (it could create a duplicate whose id is lost).
   */
  static async createSpreadsheet(
    auth: AuthConfig,
    title: string,
    sheetTitles: readonly string[],
    options?: { fetchImpl?: typeof fetch; logger?: Logger; locale?: string; tokens?: TokenSource },
  ): Promise<string> {
    const temp = new SheetsClient(
      { spreadsheetId: '', auth, fetchImpl: options?.fetchImpl, logger: options?.logger },
      options?.tokens,
    );
    const res = await temp.request<{ spreadsheetId: string }>({
      method: 'POST',
      path: BASE,
      body: {
        properties: { title, locale: options?.locale ?? 'en_US' },
        sheets: sheetTitles.map((t) => ({ properties: { title: t } })),
      },
      policy: 'write',
    });
    return res.spreadsheetId;
  }

  private async request<T>(opts: RequestOptions): Promise<T> {
    const url = new URL(
      opts.path.startsWith('http')
        ? opts.path
        : `${BASE}/${encodeURIComponent(this.spreadsheetId)}${opts.path}`,
    );
    if (opts.query?.length) {
      url.search = opts.query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }
    // The token is minted once per request, outside the retry loop: google-auth-library retries the
    // token endpoint itself, and a dead credential (invalid_grant, bad PEM) must fail fast, not 3×.
    let token: string;
    try {
      token = await withTimeout(this.tokens.getAccessToken(), TOKEN_TIMEOUT_MS, 'access token request');
    } catch (e) {
      const safe = serializeError(e);
      throw new SheetsApiError(401, `could not obtain an access token: ${safe.message}`, 'UNAUTHENTICATED');
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.once<T>(url, opts, token);
      } catch (e) {
        lastError = e;
        const apiError = e instanceof SheetsApiError ? e : undefined;
        const isNetwork = !apiError;
        const retryable = apiError ? apiError.retryable : opts.policy === 'read' && isNetwork;
        if (!retryable || attempt === this.maxAttempts) throw e;
        const delay = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        this.logger.warn(`retrying ${opts.method} ${opts.path} after ${delay}ms`, {
          attempt,
          error: serializeError(e),
        });
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  private async once<T>(url: URL, opts: RequestOptions, token: string): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetchImpl(url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let json: unknown = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        if (res.ok) throw new SheetsApiError(502, 'non-JSON response from the Sheets API');
      }
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; status?: string } }).error;
      throw new SheetsApiError(res.status, err?.message ?? `HTTP ${res.status}`, err?.status);
    }
    return json as T;
  }
}
