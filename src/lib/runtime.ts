// Server-side singletons wired from astro:env (docs/ADR.md D3, D5, D9; docs/ADMIN_SPEC.md §4–5).
// Never imported by tests: everything with logic lives in pure modules that receive these objects
// as parameters. One TokenSource serves the Sheets client and the Drive client (§5.2).
import {
  BASE_CURRENCY,
  DATA_DIR,
  FX_API_URL,
  FX_REFRESH_HOURS,
  GOOGLE_AUTH_MODE,
  GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SHEET_ID,
  SCRAPE_JINA_FALLBACK,
  SCRAPE_RESPECT_ROBOTS,
  SHEETS_CACHE_TTL,
} from 'astro:env/server';
import { join } from 'node:path';
import { fetch as undiciFetch } from 'undici';
import { createDriveClient, defaultDownload, type DriveClient } from './drive/index.ts';
import { GoogleConnection } from './google/connection.ts';
import { createTokenStore, type GoogleTokenStore } from './google/store.ts';
import { PhotoMonitor } from './photos-health.ts';
import { RatesCache } from './rates.ts';
import { guardedAgent } from './scrape/guard.ts';
import { CatalogueCache } from './sheets/cache.ts';
import { SheetsClient, createTokenSource, type TokenSource } from './sheets/client.ts';
import { authFromEnv, sheetIdFromEnv } from './sheets/config.ts';
import { REACTIONS_WINDOW_ROWS } from './sheets/contract.ts';
import { consoleLogger, serializeError } from './sheets/errors.ts';
import { fetchMeta, fetchRanges, snapshotFromRanges } from './sheets/read.ts';
import type { Catalogue, Snapshot } from './sheets/types.ts';
import type { RateTable } from './currency.ts';
import { SUPPORTED_CURRENCIES } from './currency.ts';

const env = {
  GOOGLE_SHEET_ID,
  GOOGLE_AUTH_MODE,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
};

let tokens: TokenSource | undefined;
let googleStore: GoogleTokenStore | undefined;
let googleConnection: GoogleConnection | undefined;
let client: SheetsClient | undefined;
let cache: CatalogueCache | undefined;
let adminDeps: AdminDeps | undefined;
let rates: RatesCache | undefined;
export const photoMonitor = new PhotoMonitor();

/**
 * The store's base currency (brief §8): prices are stored once in this currency and every other one
 * is derived.
 *
 * This runs at module scope, and this module is what every page and endpoint imports, so it must not
 * be able to throw. It reads defensively even though the schema gives BASE_CURRENCY a default:
 * `astro:env/server` is generated from astro.config.mjs when the server starts, so a dev process
 * that was already running when the variable was added exports `undefined` for it, and a build with
 * placeholder environment values can do the same. Either way the answer is USD and a warning, never
 * a stack trace that takes down every route.
 */
function resolveBaseCurrency(raw: unknown): string {
  const wanted = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if ((SUPPORTED_CURRENCIES as readonly string[]).includes(wanted)) return wanted;
  if (wanted) {
    console.warn(
      `[rates] BASE_CURRENCY "${wanted}" is not one of ${SUPPORTED_CURRENCIES.join(', ')}: using USD.`,
    );
  }
  return 'USD';
}

export const baseCurrency: string = resolveBaseCurrency(BASE_CURRENCY);

/** The FX table: hardcoded fallback → daily API → the sheet's Rates tab, in that order of authority. */
export function getRates(): RatesCache {
  if (!rates) {
    // Same reasoning as resolveBaseCurrency: neither value may make this constructor throw. An
    // unreachable URL is already handled (the cache falls back to the hardcoded table), so a missing
    // one only has to be a well-formed string.
    const hours = typeof FX_REFRESH_HOURS === 'number' && FX_REFRESH_HOURS > 0 ? FX_REFRESH_HOURS : 24;
    rates = new RatesCache({
      base: baseCurrency,
      url: FX_API_URL || 'https://api.frankfurter.dev/v1/latest',
      refreshMs: hours * 3600_000,
    });
  }
  return rates;
}

/**
 * The rate table a page renders with. The sheet wins where it has a value (the owner can pin a
 * rate), the API fills the rest, and the hardcoded table covers both being unavailable — so a
 * price is always printable.
 */
export function ratesFor(catalogue: Pick<Catalogue, 'rates'>): RateTable {
  return getRates().get(catalogue.rates);
}

/** Where the refresh token the admin stores lives; memory-only when DATA_DIR is unset. */
export function getGoogleStore(): GoogleTokenStore {
  if (!googleStore) googleStore = createTokenStore(DATA_DIR || undefined);
  return googleStore;
}

/**
 * The live connection for oauth_refresh mode. Undefined in service_account mode, where there is
 * nothing for an owner to connect: the deployment already carries its own key.
 */
export function getGoogleConnection(): GoogleConnection | undefined {
  if (GOOGLE_AUTH_MODE !== 'oauth_refresh') return undefined;
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) return undefined;
  if (!googleConnection) {
    googleConnection = new GoogleConnection({
      clientId: GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: GOOGLE_OAUTH_CLIENT_SECRET,
      store: getGoogleStore(),
      // The environment's token is the fallback, not the authority: connecting in the admin wins.
      fallbackRefreshToken: GOOGLE_OAUTH_REFRESH_TOKEN || undefined,
      logger: consoleLogger,
    });
  }
  return googleConnection;
}

/**
 * The one bearer-token source both APIs share.
 *
 * In oauth_refresh mode it reads the current refresh token on every renewal, so an authorisation
 * made in the browser takes effect on the next request rather than on the next deploy. The
 * service-account path is unchanged.
 */
function getTokens(): TokenSource {
  const connection = getGoogleConnection();
  if (connection) return { getAccessToken: () => connection.getAccessToken() };
  if (!tokens) tokens = createTokenSource(authFromEnv(env));
  return tokens;
}

export function getClient(): SheetsClient {
  if (!client) {
    const connection = getGoogleConnection();
    client = new SheetsClient(
      {
        spreadsheetId: sheetIdFromEnv(env),
        // With a live connection the client never touches this, and reading it from the environment
        // would throw before the owner has had a chance to connect one.
        auth: connection
          ? {
              mode: 'oauth_refresh',
              clientId: GOOGLE_OAUTH_CLIENT_ID ?? '',
              clientSecret: GOOGLE_OAUTH_CLIENT_SECRET ?? '',
              refreshToken: '',
            }
          : authFromEnv(env),
        logger: consoleLogger,
      },
      getTokens(),
    );
  }
  return client;
}

export function getCache(): CatalogueCache {
  if (!cache) {
    const c = getClient();
    cache = new CatalogueCache({
      load: () => fetchRanges(c),
      loadMeta: () => fetchMeta(c),
      parse: (ranges) => snapshotFromRanges(ranges),
      ttlMs: Math.max(5, SHEETS_CACHE_TTL) * 1000,
      logger: consoleLogger,
      persistPath: DATA_DIR ? join(DATA_DIR, 'catalogue.json') : undefined,
      windowRows: REACTIONS_WINDOW_ROWS,
    });
  }
  return cache;
}

export interface LoadResult {
  snapshot?: Snapshot;
  /** Visitor-safe message for the reference's `.state` element; never contains internals. */
  error?: string;
}

/** The snapshot for a page render, or the reference's error text when nothing can be served. */
export async function loadCatalogue(): Promise<LoadResult> {
  try {
    const snapshot = await getCache().get();
    photoMonitor.schedule(snapshot.catalogue.rugs); // background, throttled, never throws
    return { snapshot };
  } catch (e) {
    consoleLogger.error('no catalogue available', { error: serializeError(e) });
    return { error: 'could not load the catalogue' };
  }
}

/* ---------- admin dependencies (docs/ADMIN_SPEC.md §4.3, §5.1–5.2) ---------- */

export interface AdminDeps {
  authMode: 'service_account' | 'oauth_refresh';
  /**
   * Drive client sharing the Sheets token; undefined in service_account mode, where uploads would
   * land in the service account's own Drive (§5.1) — the photos endpoint answers `drive_not_authorised`.
   */
  drive?: DriveClient;
  scrape: { jinaFallback: boolean; respectRobots: boolean };
  /** Rates-tab conversion for non-USD supplier prices (§4.7); undefined when the currency is unknown. */
  convertToUsd: (amount: number, currency: string) => number | undefined;
}

/** Global-fetch-shaped wrapper over undici with the DNS-time BlockList agent (§4.3): image downloads only. */
const guardedFetch: typeof fetch = (input, init) =>
  undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    {
      ...(init as object),
      dispatcher: guardedAgent(),
    } as Parameters<typeof undiciFetch>[1],
  ) as unknown as Promise<Response>;

function convertToUsd(amount: number, currency: string): number | undefined {
  const code = currency.trim().toUpperCase();
  if (code === 'USD') return amount;
  let rates: Snapshot['catalogue']['rates'] | undefined;
  try {
    rates = getCache().peek()?.catalogue.rates;
  } catch {
    return undefined;
  }
  const rate = rates?.find((r) => r.currency === code);
  if (!rate || !(rate.rateToBase > 0)) return undefined;
  return amount / rate.rateToBase; // rate_to_base = units of `currency` per USD
}

export function getAdminDeps(): AdminDeps {
  if (!adminDeps) {
    // The mode is a configuration fact, so it is read directly: `authFromEnv` also validates the
    // credentials and would throw before the owner has connected an account in the browser.
    const mode: 'service_account' | 'oauth_refresh' =
      GOOGLE_AUTH_MODE === 'oauth_refresh' ? 'oauth_refresh' : 'service_account';
    adminDeps = {
      authMode: mode,
      drive:
        mode === 'oauth_refresh'
          ? createDriveClient({
              getAccessToken: () => getTokens().getAccessToken(),
              download: (url) => defaultDownload(url, guardedFetch),
              folderId: GOOGLE_DRIVE_FOLDER_ID || undefined,
              logger: consoleLogger,
            })
          : undefined,
      scrape: {
        jinaFallback: SCRAPE_JINA_FALLBACK ?? true,
        // Defaults to honouring robots.txt: an absent variable must never quietly turn a
        // politeness rule off (brief §11).
        respectRobots: SCRAPE_RESPECT_ROBOTS ?? true,
      },
      convertToUsd,
    };
  }
  return adminDeps;
}
