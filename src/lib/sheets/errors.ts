// Error types and the log-safe serializer (ADR D9): raw errors are never logged because a Google
// auth error can carry the request that produced it. gaxios already redacts its own errors; this is
// defence in depth for everything else (our fetch errors, messages that embed a URL or a body).

export class SheetsApiError extends Error {
  readonly status: number;
  readonly googleStatus: string | undefined;
  readonly retryable: boolean;

  constructor(status: number, message: string, googleStatus?: string) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
    this.googleStatus = googleStatus;
    this.retryable = status === 429 || status === 503;
  }
}

export class SheetContractError extends Error {
  readonly tab: string;
  readonly mismatches: string[];

  constructor(tab: string, mismatches: string[]) {
    super(`Sheet contract violated in tab "${tab}": ${mismatches.join('; ')}`);
    this.name = 'SheetContractError';
    this.tab = tab;
    this.mismatches = mismatches;
  }
}

export interface SafeError {
  name: string;
  message: string;
  status?: number;
  googleStatus?: string;
  tab?: string;
  /** Scrubbed summary of `error.cause` (undici network errors carry the real reason there). */
  cause?: string;
}

const SCRUB_PATTERNS: RegExp[] = [
  // PEM blocks
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END[A-Z ]*PRIVATE KEY-----|$)/g,
  // key/value in any syntax: refresh_token=…, "client_secret": "…", authorization: Bearer …
  /\b(refresh_token|client_secret|assertion|private_key|access_token|id_token|authorization|code_verifier)\b["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s"'&,;}]*/gi,
  /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // Google token / secret shapes
  /\bya29\.[A-Za-z0-9._-]+/g,
  /\b1\/\/[A-Za-z0-9._-]+/g,
  /\bGOCSPX-[A-Za-z0-9_-]+/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g,
];

export function scrub(s: string): string {
  let out = s;
  for (const re of SCRUB_PATTERNS) out = out.replace(re, '[redacted]');
  return out.slice(0, 500);
}

function summariseCause(e: unknown): string | undefined {
  const cause = (e as { cause?: unknown })?.cause;
  if (!cause || typeof cause !== 'object') return undefined;
  const c = cause as { name?: unknown; code?: unknown; message?: unknown };
  const parts = [c.name, c.code, c.message]
    .filter((p) => typeof p === 'string' || typeof p === 'number')
    .map(String);
  return parts.length ? scrub(parts.join(' ')) : undefined;
}

/** Allow-listed view of an error for logging; strips anything that looks like a credential. */
export function serializeError(e: unknown): SafeError {
  const cause = summariseCause(e);
  if (e instanceof SheetsApiError) {
    return {
      name: e.name,
      message: scrub(e.message),
      status: e.status,
      googleStatus: e.googleStatus,
      ...(cause ? { cause } : {}),
    };
  }
  if (e instanceof SheetContractError) {
    return { name: e.name, message: scrub(e.message), tab: e.tab };
  }
  if (e instanceof Error) {
    return { name: e.name, message: scrub(e.message), ...(cause ? { cause } : {}) };
  }
  return { name: 'UnknownError', message: scrub(String(e)) };
}

export interface Logger {
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}

export const consoleLogger: Logger = {
  info: (msg, data) => console.info(`[sheets] ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[sheets] ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[sheets] ${msg}`, data ?? ''),
};

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
