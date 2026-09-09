// Regression: `src/lib/runtime.ts` runs at module scope and every page and endpoint imports it, so
// nothing in it may throw while reading configuration. `astro:env/server` is generated from
// astro.config.mjs when the server starts, which means a dev process that was already running when a
// variable was added exports `undefined` for it, defaults and all. That crashed every route once
// (`Cannot read properties of undefined (reading 'toUpperCase')`); these tests keep it fixed.
//
// The mock below deliberately omits BASE_CURRENCY, FX_API_URL, FX_REFRESH_HOURS, PUBLIC_CATALOGUE
// and SCRAPE_RESPECT_ROBOTS — exactly the shape a stale process sees.
import { describe, expect, it, vi } from 'vitest';

const staleEnv = {
  SITE_URL: 'https://catalogue.example.test',
  VOTE_SALT: 'v'.repeat(40),
  REVALIDATE_SECRET: 'r'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  ADMIN_PASSWORD_HASH: undefined,
  ADMIN_SESSION_SECRET: undefined,
  ADMIN_USER: 'owner',
  RETAIL_MARKUP: undefined,
  GOOGLE_SHEET_ID: 'dev',
  GOOGLE_AUTH_MODE: 'service_account',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined,
  GOOGLE_PRIVATE_KEY: undefined,
  GOOGLE_OAUTH_CLIENT_ID: undefined,
  GOOGLE_OAUTH_CLIENT_SECRET: undefined,
  GOOGLE_OAUTH_REFRESH_TOKEN: undefined,
  GOOGLE_DRIVE_FOLDER_ID: undefined,
  SHEETS_CACHE_TTL: 60,
  DATA_DIR: undefined,
  AUTH_SECRET: undefined,
  // Everything the FX layer, the customer realm and the scraper added is missing on purpose.
};

vi.mock(
  'astro:env/server',
  () =>
    // Vitest refuses to read an export a mock does not declare; the real virtual module simply yields
    // `undefined`. This Proxy reproduces the stale process rather than a stricter fiction.
    new Proxy(staleEnv as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : undefined),
      has: () => true,
    }),
);

describe('runtime.ts with a stale astro:env (every new variable undefined)', () => {
  it('imports without throwing and falls back to USD', async () => {
    const runtime = await import('../../src/lib/runtime.ts');
    expect(runtime.baseCurrency).toBe('USD');
  });

  it('still builds a usable rate table, so prices render with no configuration at all', async () => {
    const { getRates } = await import('../../src/lib/runtime.ts');
    const table = getRates().get([]);
    expect(table.rates.USD).toBe(1);
    expect(table.rates.GBP).toBeGreaterThan(0);
    expect(table.symbols.AED).toBe('AED ');
    // The hardcoded table is in play, not a half-built one.
    expect(getRates().health().source).toBe('fallback');
  });

  it('keeps the public catalogue reachable and robots.txt honoured rather than flipping to falsy', async () => {
    const { customerRuntime } = await import('../../src/lib/customer/http.ts');
    // A missing PUBLIC_CATALOGUE must not 404 the whole public site.
    expect(customerRuntime.publicCatalogue).toBe(true);
    // A missing AUTH_SECRET does disable the realm — that one is a real "off" default (brief §10).
    expect(customerRuntime.configured).toBe(false);
  });
});
