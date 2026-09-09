// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, envField, memoryCache } from 'astro/config';
import node from '@astrojs/node';

// See docs/ADR.md D1 (framework, security headers), D5 (cache), D8 (limits), D9 (secrets).

// The inline pre-paint step (src/scripts/prepaint.js) is the only hand-written inline script; its
// hash is registered so the CSP can stay hash-based. Astro hashes its own inlined modules itself.
const prepaintHash = /** @type {import('astro').CspHashEntry} */ (
  `sha256-${createHash('sha256')
    .update(readFileSync(join(import.meta.dirname, 'src/scripts/prepaint.js'), 'utf8'))
    .digest('base64')}`
);

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
    // JSON-only API bodies: 64 KiB is generous (a vote is ~80 bytes). Bytes, per @astrojs/node's type.
    bodySizeLimit: 64 * 1024,
  }),
  // Astro 7 defaults to 'jsx' compression, which strips whitespace between inline elements
  // and would break pixel parity with reference/catalogue.html.
  compressHTML: true,
  session: false,
  cache: {
    // Single long-lived Node process (ADR D2): the in-process LRU is exact.
    // No page reads the query string server-side (tabs filter client-side, ?c= is read by the island),
    // so every parameter is dropped from the key: `include: []` (an `exclude` list would REPLACE
    // Astro's default utm_*/fbclid/gclid exclusions instead of adding to them). ADR D12.
    provider: memoryCache({ query: { include: [] } }),
  },
  env: {
    // Secrets are validated at build (the Dockerfile supplies placeholders) and again at runtime.
    validateSecrets: true,
    schema: {
      // Everything below is `access: 'secret'` on purpose: Astro inlines `public` variables into the
      // build, whereas `secret` variables are read from the runtime environment. A container built
      // once and configured per environment needs the latter (docs/ADR.md D9). Only the last two
      // are sensitive; the rest is runtime configuration.
      GOOGLE_SHEET_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_AUTH_MODE: envField.enum({
        context: 'server',
        access: 'secret',
        values: ['service_account', 'oauth_refresh'],
        default: 'service_account',
      }),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_OAUTH_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_OAUTH_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_OAUTH_REFRESH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      SHEETS_CACHE_TTL: envField.number({ context: 'server', access: 'secret', default: 60 }),
      DATA_DIR: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Trusted only when set explicitly (a client could send it itself on other hosts). DigitalOcean: do-connecting-ip.
      CLIENT_IP_HEADER: envField.string({ context: 'server', access: 'secret', default: '' }),
      TRUSTED_PROXY_HOPS: envField.number({ context: 'server', access: 'secret', default: 1 }),
      // Required (no default): a production deployment that forgets it must not silently mint an insecure cookie.
      SITE_URL: envField.string({ context: 'server', access: 'secret', url: true }),
      REVALIDATE_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
      VOTE_SALT: envField.string({ context: 'server', access: 'secret', min: 32 }),
      // Admin panel (docs/ADMIN_SPEC.md §9.1), all optional: with the hash or the session secret
      // unset every /admin* route answers 404. `scrypt.<N>.<r>.<p>.<salt>.<key>` from `npm run admin:password`.
      ADMIN_PASSWORD_HASH: envField.string({ context: 'server', access: 'secret', optional: true, min: 80 }),
      ADMIN_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true, min: 32 }),
      ADMIN_USER: envField.string({ context: 'server', access: 'secret', default: 'owner' }),
      RETAIL_MARKUP: envField.number({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_DRIVE_FOLDER_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      SCRAPE_JINA_FALLBACK: envField.boolean({ context: 'server', access: 'secret', default: true }),
      SCRAPE_ECG_GRAPHQL: envField.boolean({ context: 'server', access: 'secret', default: false }),
      // Brief §11 asks the scraper to honour robots.txt, and the default does. eCarpetGallery
      // publishes "Disallow: /", so with this on, scraping that supplier answers `blocked` before any
      // request is made. Set it to false only for a supplier the studio has a relationship with, and
      // record that decision — it is the owner's call, not the code's (docs/ADMIN_SPEC.md §4.5).
      SCRAPE_RESPECT_ROBOTS: envField.boolean({ context: 'server', access: 'secret', default: true }),
      // Customer realm + FX (brief §8, §10, §18). AUTH_SECRET signs customer session cookies; when it
      // is unset the customer realm stays disabled and /{slug} answers 404.
      AUTH_SECRET: envField.string({ context: 'server', access: 'secret', optional: true, min: 32 }),
      // Keeps the public catalogue (/, /rugs/*, /tags/*) reachable without a customer session. Set
      // it to false for the brief's posture, where the site serves only /{slug} and /admin (§10).
      PUBLIC_CATALOGUE: envField.boolean({ context: 'server', access: 'secret', default: true }),
      BASE_CURRENCY: envField.string({ context: 'server', access: 'secret', default: 'USD' }),
      FX_API_URL: envField.string({
        context: 'server',
        access: 'secret',
        default: 'https://api.frankfurter.dev/v1/latest',
      }),
      FX_REFRESH_HOURS: envField.number({ context: 'server', access: 'secret', default: 24 }),
    },
  },
  security: {
    checkOrigin: true,
    // Hash-based CSP (ADR D1): Astro hashes its own inlined scripts and scoped styles; the pre-paint
    // script and the Google Fonts stylesheet are the only additions. Delivered as a <meta> tag, so
    // frame protection lives in src/middleware.ts (X-Frame-Options) instead of frame-ancestors.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' https://lh3.googleusercontent.com data:",
        'font-src https://fonts.gstatic.com',
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      styleDirective: { resources: ["'self'", 'https://fonts.googleapis.com'] },
      scriptDirective: { resources: ["'self'"], hashes: [prepaintHash] },
    },
  },
  image: {
    // Intentionally empty: rug photos are plain <img> tags (ADR D6); /_image refuses remote hrefs.
    domains: [],
  },
});
