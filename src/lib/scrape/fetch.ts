// Fetch layer (docs/ADMIN_SPEC.md §4.3): impit for the two constant supplier hosts, the guarded
// undici client for everything else. Redirects are manual (max 3 hops, every Location re-validated
// against the allow-list), bodies are streamed under a byte cap, content types are checked, and
// every failure surfaces as a `ScrapeError` with a code the endpoint can map to a status. A caller
// may hand in a `HostThrottle` (brief §11: at least 2 s between requests to the same host); it is an
// option rather than a default so tests and one-off callers stay in control of the clock.
import { fetch as undiciFetch } from 'undici';
import type { Impit as ImpitClient } from 'impit';
import { serializeError, silentLogger, type Logger } from '../sheets/errors.ts';
import { SUPPLIER_HOSTS, guardedAgent, validateOutboundUrl } from './guard.ts';
import type { HostThrottle } from './throttle.ts';
import {
  ScrapeError,
  type FetchedText,
  type ScrapeVia,
  type Transport,
  type TransportClient,
  type TransportResponse,
} from './types.ts';

export const HTML_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 10_000;
export const SCRAPE_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 3;

/** Content types a supplier page / Shopify endpoint may answer with. */
export const TEXT_TYPES: readonly string[] = [
  'text/html',
  'application/xhtml+xml',
  'application/json',
  'application/javascript',
  'text/javascript',
];

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const ACCEPT: Record<'html' | 'json', string> = {
  html: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  json: 'application/json,text/javascript;q=0.9,*/*;q=0.5',
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface FetchTextOptions {
  kind: 'html' | 'json';
  /** Test hook: replaces impit / undici. */
  transport?: Transport;
  /** Outer (whole-scrape) deadline. */
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  maxBytes?: number;
  /** Hosts the URL and every redirect may point at; default SUPPLIER_HOSTS. */
  allowHosts?: readonly string[];
  /** Accepted content-type prefixes for 2xx/3xx answers; default TEXT_TYPES. */
  accept?: readonly string[];
  headers?: Record<string, string>;
  maxHops?: number;
  /** Per-host politeness gap, applied before every request including each redirect hop. */
  throttle?: HostThrottle;
  logger?: Logger;
}

let impitPromise: Promise<ImpitClient | null> | undefined;

/** Loads impit once; null when the native binding is missing (KV still works through undici). */
function loadImpit(logger: Logger): Promise<ImpitClient | null> {
  impitPromise ??= import('impit').then(
    (mod) =>
      new mod.Impit({ browser: 'chrome', timeout: 15_000, followRedirects: false, vanillaFallback: true }),
    (e: unknown) => {
      logger.warn('impit failed to load; supplier fetches fall back to the guarded undici client', {
        error: serializeError(e),
      });
      return null;
    },
  );
  return impitPromise;
}

/** Test hook. */
export function resetImpitForTests(): void {
  impitPromise = undefined;
}

/** The real transport: impit for `client: 'impit'` (when it loads), guarded undici otherwise. */
export const defaultTransport: Transport = async (url, init) => {
  if (init.client === 'impit') {
    const impit = await loadImpit(init.logger ?? silentLogger);
    if (impit) {
      const r = await impit.fetch(url, { headers: init.headers, signal: init.signal, redirect: 'manual' });
      return { status: r.status, headers: r.headers, body: r.body, via: 'impit', abort: () => r.abort() };
    }
  }
  const r = await undiciFetch(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT, ...init.headers },
    signal: init.signal,
    redirect: 'manual',
    dispatcher: guardedAgent(),
  });
  return {
    status: r.status,
    headers: r.headers,
    body: r.body,
    via: 'undici',
    abort: () => {
      r.body?.cancel().catch(() => {});
    },
  };
};

/** Maps transport / stream errors onto ScrapeError codes (timeouts and aborts → `timeout`). */
export function toScrapeError(e: unknown, context?: string): ScrapeError {
  if (e instanceof ScrapeError) return e;
  const name = e instanceof Error ? e.name : '';
  const ctor = typeof e === 'object' && e !== null ? e.constructor.name : '';
  const message = e instanceof Error ? e.message : String(e);
  if (/timeout|timed out|abort/i.test(`${name} ${ctor} ${message}`)) {
    return new ScrapeError('timeout', `request timed out${context ? ` (${context})` : ''}`);
  }
  const safe = serializeError(e);
  return new ScrapeError(
    'fetch_failed',
    `network error${context ? ` (${context})` : ''}: ${safe.message}${safe.cause ? ` — ${safe.cause}` : ''}`,
  );
}

function requestSignal(outer: AbortSignal | undefined, ms: number): AbortSignal {
  const timer = AbortSignal.timeout(ms);
  return outer ? AbortSignal.any([outer, timer]) : timer;
}

async function readCapped(res: TransportResponse, maxBytes: number, context: string): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        res.abort?.();
        throw new ScrapeError(
          'fetch_failed',
          `response body exceeds ${maxBytes} bytes (${context})`,
          res.status,
        );
      }
      chunks.push(value);
    }
  } catch (e) {
    throw toScrapeError(e, context);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      // Unknown label: fall through to UTF-8.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * GET `url` as text through `client`, following at most `maxHops` re-validated redirects. HTTP error
 * statuses are returned (the caller decides: 403 → blocked, 404 → not_found); transport failures,
 * refused redirects, over-cap bodies and unexpected content types throw `ScrapeError`.
 */
export async function fetchText(
  url: string,
  client: TransportClient,
  opts: FetchTextOptions,
): Promise<FetchedText> {
  const transport = opts.transport ?? defaultTransport;
  const logger = opts.logger ?? silentLogger;
  const maxBytes = opts.maxBytes ?? HTML_MAX_BYTES;
  const maxHops = opts.maxHops ?? MAX_REDIRECTS;
  const allowHosts = opts.allowHosts ?? SUPPLIER_HOSTS;
  const accept = opts.accept ?? TEXT_TYPES;
  let current = validateOutboundUrl(url, allowHosts, 'fetch URL').toString();
  const headers: Record<string, string> = {
    Accept: ACCEPT[opts.kind],
    'Accept-Language': 'en-US,en;q=0.9',
    ...opts.headers,
  };
  for (let hop = 0; ; hop++) {
    const signal = requestSignal(opts.signal, opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
    if (signal.aborted) throw toScrapeError(signal.reason, current);
    if (opts.throttle) {
      // Waits its turn for this host; the outer deadline can still cut the wait short.
      try {
        const waited = await opts.throttle.take(new URL(current).hostname, opts.signal);
        if (waited > 0) logger.info('host throttle', { url: current, waitedMs: waited });
      } catch (e) {
        throw toScrapeError(e, current);
      }
    }
    let res: TransportResponse;
    try {
      res = await transport(current, { headers, signal, client, logger });
    } catch (e) {
      throw toScrapeError(e, current);
    }
    const via: ScrapeVia = res.via ?? client;
    if (REDIRECT_STATUSES.has(res.status)) {
      res.abort?.();
      const location = res.headers.get('location');
      if (!location)
        throw new ScrapeError('fetch_failed', `redirect without a Location header (${current})`, res.status);
      if (hop >= maxHops)
        throw new ScrapeError('fetch_failed', `too many redirects (more than ${maxHops})`, res.status);
      let next: URL;
      try {
        next = validateOutboundUrl(new URL(location, current), allowHosts, 'redirect target');
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new ScrapeError('fetch_failed', `redirect refused: ${reason}`, res.status);
      }
      logger.info('following redirect', { from: current, to: next.toString(), status: res.status });
      current = next.toString();
      continue;
    }
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (res.status < 400 && !accept.some((t) => contentType.startsWith(t))) {
      res.abort?.();
      throw new ScrapeError(
        'fetch_failed',
        `unexpected content-type "${contentType || 'none'}" (${current})`,
        res.status,
      );
    }
    const bytes = await readCapped(res, maxBytes, current);
    const body = decode(bytes, contentType);
    if (res.status === 403)
      logger.warn('supplier answered 403', { url: current, via, bytes: bytes.byteLength });
    return { status: res.status, url: current, contentType, body, hops: hop, via, headers: res.headers };
  }
}
