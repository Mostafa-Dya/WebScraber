# Astro 7.3.1 core: rendering modes, adapters, API routes, env, middleware

Consolidated brief for the Serio Ludere ADR (Astro site, Google Sheet as CMS, server-only Google access, TTL cache + `/api/revalidate` fired by an Apps Script `onEdit` trigger; host undecided among Vercel | Netlify | Cloudflare | Node self-hosted). State as of 2026-09-05. Every fact was confirmed by at least one verifier against npm, withastro/docs (main), withastro/astro source or GitHub advisories; corrections are marked "(corrected: …)".

## Versions

| package                  | version                                                                               | registry URL                                               |
| ------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| astro                    | 7.3.1 (engines node >=22.12.0; deps vite ^8.0.13, zod ^4.5.4; security floor >=7.2.8) | https://registry.npmjs.org/astro/latest                    |
| @astrojs/node            | 11.1.5 (peer astro ^7.2.1; security floor >=11.1.3)                                   | https://registry.npmjs.org/@astrojs/node/latest            |
| @astrojs/vercel          | 11.0.10 (peer astro ^7.0.0; security floor >=11.0.3)                                  | https://registry.npmjs.org/@astrojs/vercel/latest          |
| @astrojs/netlify         | 8.2.5 (peer astro ^7.0.0; security floor >=8.2.4)                                     | https://registry.npmjs.org/@astrojs/netlify/latest         |
| @astrojs/cloudflare      | 14.3.0 (peer astro ^7.2.0, wrangler ^4.125.0)                                         | https://registry.npmjs.org/@astrojs/cloudflare/latest      |
| @astrojs/check           | 0.9.10 (peer typescript ^5.0.0 \|\| ^6.0.0)                                           | https://registry.npmjs.org/@astrojs/check/latest           |
| typescript               | 7.0.2 is `latest`; pin 6.0.3 (highest 6.x; 6.1.0 does not exist)                      | https://registry.npmjs.org/-/package/typescript/dist-tags  |
| vitest                   | 5.0.0 (node ^22.12 \|\| ^24 \|\| >=26; peer vite ^6.4 \|\| ^7 \|\| ^8)                | https://registry.npmjs.org/vitest/latest                   |
| zod                      | 4.5.4                                                                                 | https://registry.npmjs.org/zod/latest                      |
| wrangler                 | 4.129.0 (node >=22.0.0)                                                               | https://registry.npmjs.org/wrangler/latest                 |
| @astrojs/upgrade         | 0.7.4                                                                                 | https://registry.npmjs.org/@astrojs/upgrade/latest         |
| @astrojs/markdown-remark | 7.3.0                                                                                 | https://registry.npmjs.org/@astrojs/markdown-remark/latest |
| googleapis               | 178.0.0 (node >=18; pins google-auth-library 10.5.0)                                  | https://registry.npmjs.org/googleapis/latest               |
| google-auth-library      | 11.0.2 (node >=22; repo moved to google-cloud-node-core)                              | https://registry.npmjs.org/google-auth-library/latest      |
| google-spreadsheet       | 5.3.0 (fetch-based via ky ^2; google-auth-library optional peer)                      | https://registry.npmjs.org/google-spreadsheet/latest       |
| Node.js                  | v26 Current (2026-05-05); v24 and v22 LTS                                             | https://nodejs.org/en/about/previous-releases              |

## Key facts

### Release line, runtime, security floors

- Astro 7.0.0 shipped 2026-06-22 (blog, GitHub API `published_at`, npm `time` all agree; the researcher's "2024" was a fetch-tool artefact). No 8.x dist-tag exists (latest 7.3.1, beta 7.0.0-beta.6). https://api.github.com/repos/withastro/astro/releases/tags/astro@7.0.0
- astro@7.3.1 (2026-09-03) is a one-line patch fixing astro:assets start/build (PR #17899). https://api.github.com/repos/withastro/astro/releases/tags/astro@7.3.1
- Node.js v22.12.0 or higher required; odd-numbered majors (v23, v25) unsupported; `npm create astro@latest`; upgrade with `npx @astrojs/upgrade`. https://docs.astro.build/en/install-and-setup/
- Astro 7 breaking changes: Vite 8 (Rolldown); Rust compiler errors on unclosed tags; `compressHTML` default `true` -> `'jsx'`; `src/fetch.ts` reserved (advanced routing on by default, `fetchFile: null` disables it); `@astrojs/db` removed; Sätteri is the default Markdown processor. https://docs.astro.build/en/guides/upgrade-to/v7/
- Minor line: 7.0.5 fixed a checkOrigin bypass in custom fetch pipelines; 7.0.6 fixed `astro check` locating @astrojs/check; 7.2.0 added `session: false`; 7.3.0 added `logger` for cache providers and the memory-cache `Vary: Cookie` fix. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/CHANGELOG.md
- Security floors: astro < 7.2.8 has a Critical (CVSS 9.8) RCE via AVIF in the default Sharp image service (needs Sharp 0.35.4+) https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2 ; astro <= 7.2.3 has an auth bypass when `base` is set (never gate `/api/revalidate` on `context.url.pathname` prefix checks) https://github.com/withastro/astro/security/advisories/GHSA-376h-93r7-7g6f
- Adapter floors: @astrojs/node <= 11.1.2 malformed-Host-port crash (process-killing with `staticHeaders`) https://github.com/withastro/astro/security/advisories/GHSA-qh8j-hqjv-7m4x ; @astrojs/vercel 10.0.3–11.0.2 ISR `/_isr?x_astro_path=` path override bypassing middleware auth https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2 ; @astrojs/netlify 5.2.0–8.2.3 Image CDN allowlist SSRF (relevant: rug images are remote) https://github.com/withastro/astro/security/advisories/GHSA-4233-jc72-56c5
- The "malicious code in astro@7.1.0" advisory was withdrawn on 2026-08-03; 7.1.0 is a legitimate OIDC-published release — ignore stale audit alerts. https://github.com/advisories/GHSA-hpcx-pg6g-x697

### Rendering modes

- `output` accepts only `'static' | 'server'`, default `'static'`; `'hybrid'` was merged into `'static'` in v5. An adapter is required for any on-demand route regardless of `output`. https://docs.astro.build/en/guides/upgrade-to/v5/
- Per-route control: `export const prerender = false` opts a page/endpoint out in static mode; `= true` prerenders in server mode. Docs: "Start with the default 'static' mode until you are sure that most or all of your pages will be rendered on demand". https://docs.astro.build/en/guides/on-demand-rendering/
- In static mode every custom endpoint must carry `export const prerender = false` to run on demand. https://docs.astro.build/en/guides/endpoints/
- Server islands (`server:defer`) carry no experimental flag; need an adapter; props must be serialisable; fetched via GET with encrypted props, POST fallback above 2048-byte URLs (not browser-cached); use `astro create-key` + `ASTRO_KEY` for stable encryption. https://docs.astro.build/en/guides/server-islands/
- Advanced routing (7.0.0): optional `src/fetch.ts` default-exporting `{ fetch(request) }`; when absent the default pipeline runs in order sessions -> cache -> redirects -> trailing-slash -> actions -> middleware -> pages -> i18n. Entrypoint extensions .ts/.js/.mjs/.mts. https://docs.astro.build/en/reference/modules/astro-fetch/

### Route caching (stable, Since 7.0.0)

- `cache.provider` with `memoryCache()` from `'astro/config'`; applies to on-demand pages and endpoints only. Runtime API `Astro.cache` / `context.cache`: `enabled`, `set(options | false)`, `options`, `tags`, `invalidate({ tags | path })` (needs a provider). https://docs.astro.build/en/reference/api-reference/
- `CacheOptions = { maxAge, swr, tags, lastModified, etag }`; `InvalidateOptions = { path, tags }`; `memoryCache({ max: 1000 (LRU), query: { sort, include, exclude } })`; tracking params (utm_*, fbclid, gclid) excluded from keys by default. https://docs.astro.build/en/reference/cache-provider-reference/
- `routeRules` (7.0.0) maps `[param]`/`[...rest]` patterns to rules; multiple `cache.set()` calls merge (scalars last-write-wins, tags accumulate); `cache.set(false)` opts a request out. https://docs.astro.build/en/reference/configuration-reference/
- In `astro dev` the cache is inert (`enabled` false, `set`/`invalidate` no-ops); test with `astro build && astro preview`. Outside dev with NO provider, `set`/`tags`/`options` only warn but `invalidate()` throws — guard `/api/revalidate` with `cache.enabled`. https://docs.astro.build/en/guides/caching/
- Path invalidation is exact-match only (no globs); tag invalidation removes every entry sharing a tag — tag all sheet-derived responses (e.g. `'sheet'`) and purge by tag. https://docs.astro.build/en/guides/caching/
- `memoryCache()` is "suitable for single-instance deployments": a per-process LRUMap (lost on serverless cold start); caches GET only; any response carrying `Set-Cookie` is never stored (warning logged); `Vary: Cookie` / `Vary: *` responses skipped (7.3.0); adds `X-Astro-Cache: HIT|MISS|STALE`. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/cache/memory-provider.ts
- A cache HIT short-circuits the pipeline: the provider's `onRequest` wraps middleware+pages as `next`, so `src/middleware.ts` does not run on hits (breakage-hunt, medium confidence). https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/routing/handler.ts

### CDN cache providers (experimental; must be enabled manually)

- `cacheNetlify` (`@astrojs/netlify/cache`, >= 8.0.0), `cacheVercel` (`@astrojs/vercel/cache`, >= 11.0.0), `cacheCloudflare` (`@astrojs/cloudflare/cache`, >= 14.0.0) set `Netlify-CDN-Cache-Control`/`Netlify-Cache-Tag`, `Vercel-CDN-Cache-Control`/`Vercel-Cache-Tag`, `Cloudflare-CDN-Cache-Control`/`Cache-Tag`; Vercel tag invalidation is soft. https://docs.astro.build/en/guides/caching/
- No provider reads an env token itself: Vercel calls `invalidateByTag` from `@vercel/functions` (no token inside a function; stale served once per edge while revalidating; <= 128 tags/response, 256 bytes/tag, no commas) https://vercel.com/docs/caching/cdn-cache/purge ; Netlify calls `purgeCache` from `@netlify/functions` (site id auto-injected; only 2 purges per tag/site per 5 s, then 429; <= 500 tags; durable cache not for Edge Function responses) https://docs.netlify.com/build/caching/caching-overview/
- Cloudflare purges via `cache.purge({ tags })` from `'cloudflare:workers'` (Workers Cache, GA 2026-07-06, all plans) which is OFF until `"cache": { "enabled": true }` is added to wrangler config (Wrangler >= 4.69.0); @astrojs/cloudflare does not write it. https://developers.cloudflare.com/workers/cache/configuration/
- Netlify provider always emits `public, durable`; with the purge rate limit, invalidate one coarse tag rather than one per rug (medium confidence). https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/netlify/src/cache/provider.ts

### Adapters

- No official adapter requires `output: 'server'`; bare `vercel()`, `netlify()`, `cloudflare()` are valid (corrected: `@astrojs/node` throws "Setting the 'mode' option is required" — use `node({ mode: 'standalone' | 'middleware' })`). https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/node/src/index.ts
- @astrojs/node standalone: `HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs`; `SERVER_KEY_PATH`/`SERVER_CERT_PATH` for HTTPS; middleware mode exports `handler` and you serve `dist/client` yourself; `bodySizeLimit` default 1 GB (lower to ~1 MB for a JSON-only vote API); `staticHeaders` false; filesystem sessions. https://docs.astro.build/en/guides/integrations-guide/node/
- @astrojs/vercel options: webAnalytics, imageService, imagesConfig, devImageService, includeFiles, excludeFiles, maxDuration, isr, skewProtection, middlewareMode 'edge', staticHeaders, session. ISR: `{ expiration, bypassToken, exclude: [..., /^\/api\/.+/] }`, invalidated by HEAD/GET with `x-prerender-revalidate`; ISR requests drop search params; middleware runs only on miss unless `middlewareMode: 'edge'` (>= 11.0.7 runs it before the cached response); ISR functions cannot set `Vercel-Cache-Tag`, so do not combine ISR with `cacheVercel` on the same routes. https://docs.astro.build/en/guides/integrations-guide/vercel/
- Vercel function runtime (corrected): the adapter maps the BUILD machine's `process.version` major (18 deprecated, 20/22 available, 24 default; unknown -> 24 with a warning); the build Node comes from project settings or `package.json` `engines` (engines wins). Node 20 is deprecated on Vercel from 2026-10-01. Disagreement: fact-check confirmed the docs sentence "check the settings tab … Node.js Version"; breakage-hunt refuted "not in the adapter" from source — both hold: the setting picks the build Node, the adapter derives the function runtime from it. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/vercel/src/index.ts
- @astrojs/netlify 8.x: Functions in `.netlify/functions-internal`, Edge Functions in `.netlify/edge-functions`; `cacheOnDemandPages: true` caches server pages up to a year (per-page `CDN-Cache-Control`); `middlewareMode: 'edge'` runs middleware for ALL requests incl. static assets, serialises `locals` into a header, and the function 403s requests not from the edge function; sessions via Netlify Blobs. https://docs.astro.build/en/guides/integrations-guide/netlify/
- @astrojs/cloudflare 14.x: on-demand pages always run in workerd (no Node APIs unless `compatibility_flags: ["nodejs_compat"]`; the adapter auto-adds only `nodejs_als`); env/secrets via `import { env } from 'cloudflare:workers'` and compatible with astro:env; local secrets in `.dev.vars`; `Astro.locals.runtime` removed (use `locals.cfContext`); dev server uses workerd; 14.3.0 adds `finalize()` which custom `src/fetch.ts` must call to keep cookies and CDN cache headers. https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- `session: false` (7.2.0) stops @astrojs/node 11.1.0 / netlify 8.2.0 / cloudflare 14.2.0 auto-wiring their session drivers; default session cookie is `{ name: 'astro-session', sameSite: 'lax', httpOnly: true, secure: true }`. https://docs.astro.build/en/reference/configuration-reference/
- github.com/withastro/adapters is stale (node 9.0.2 / astro ^5); shipping adapter sources live in withastro/astro `packages/integrations/*`. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/node/package.json

### API routes, cookies, clientAddress

- Any `.js`/`.ts` under `src/pages` is an endpoint (extension stripped: `src/pages/api/vote.ts` -> `/api/vote`); export `GET`/`POST`/`DELETE`/… or `ALL` typed `satisfies APIRoute`; HEAD is auto-derived from GET; read JSON via a `Content-Type === 'application/json'` check then `await request.json()`, else 400; `redirect(link, 307)`; `Response.json(...)` is the documented idiom. https://docs.astro.build/en/guides/endpoints/
- `cookies` exist only on on-demand routes: `get`/`has`/`set`/`delete`/`headers`/`merge`/`consume`; `AstroCookie` `.value`/`.json()`/`.number()`/`.boolean()`; `AstroCookieSetOptions` domain, expires, httpOnly, maxAge (seconds), path, partitioned (5.17.0, needs `secure: true`), sameSite, secure, encode (corrected: the researcher's `cookies.set('prefs', { theme: 'dark' }, {…})` is not a docs example — type-valid, but the only verbatim docs call is `Astro.cookies.set('counter', String(counter))` https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/on-demand-rendering.mdx ). https://docs.astro.build/en/reference/api-reference/
- `clientAddress` only on on-demand routes (corrected: the sentence "Certain adapters lack support for this feature" is not in the docs; the caveat lives in core's `ClientAddressNotAvailable` error). https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/errors/errors-data.ts
- Per adapter: Node trusts `X-Forwarded-For` only when the host validated against `security.allowedDomains`, else `req.socket.remoteAddress`; Vercel reads validated `x-forwarded-for`; Netlify uses `context.ip`; Cloudflare uses `cf-connecting-ip`. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/app/node.ts
- v6 carry-overs: endpoints with a file extension cannot be hit with a trailing slash; `import.meta.env` values are always inlined and never coerced; Astro components cannot render in Vitest client environments; `.cjs`/`.cts` config removed. https://docs.astro.build/en/guides/upgrade-to/v6/

### Security config

- `security.checkOrigin` (default true) runs only for on-demand pages and only for POST/PATCH/DELETE/PUT with `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain` — JSON POSTs from Apps Script `UrlFetchApp` or our own `fetch()` are NOT checked; `/api/revalidate` needs its own shared-secret header. https://docs.astro.build/en/reference/configuration-reference/
- With a custom `src/fetch.ts`, mount `middleware()` before `actions()`/`pages()` (7.0.0–7.0.4 bypass). https://raw.githubusercontent.com/withastro/astro/main/packages/astro/CHANGELOG.md
- `security.allowedDomains` (5.14.2, default `[]`) validates `X-Forwarded-Host` only, not the plain `Host`; `[{}]` allows any domain; normalise `Host` at nginx/Caddy (node 9.5.3 had a Host-header SSRF). https://github.com/withastro/astro/security/advisories/GHSA-qq67-mvv5-fw3g
- `define:vars` on `<script>` implies `is:inline` (no bundling) and was an XSS surface (<= 6.1.1); never pass sheet-sourced strings through it — use `data-*` attributes read via `dataset`. https://github.com/withastro/astro/security/advisories/GHSA-j687-52p2-xcff
- Remote rug images: configure `image.domains`/`remotePatterns` and avoid `inferSize` on untrusted URLs (medium confidence on advisory range). https://github.com/advisories/GHSA-cj9f-h6r6-4cx2

### Environment variables

- astro:env is stable (Since 5.0.0): `envField.string({ context: 'server', access: 'secret' })`, `import { X } from 'astro:env/server'`; secret client variables unsupported; `getSecret(key)` returns `string | undefined` (process.env in dev/build, adapter-provided at runtime). https://docs.astro.build/en/reference/modules/astro-env/
- All secrets are validated whenever anything imports `astro:env/server` — CI builds need real or dummy values for every secret; `env.validateSecrets` (default false) fails fast at start. https://docs.astro.build/en/guides/environment-variables/
- Virtual module: unusable in `astro.config.mjs` and standalone scripts (use `process.env` or Vite `loadEnv(process.env.NODE_ENV, process.cwd(), "")`); `.env` files are not loaded in config files. `import.meta.env`: all vars server-side, only `PUBLIC_` on the client, statically replaced. https://docs.astro.build/en/guides/environment-variables/
- Loading is Vite's dotenv + dotenv-expand (`.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local`); multi-line double-quoted values and `\n` expansion supported (dotenv >= 15); a literal `$` must be escaped `\$`; Astro docs are silent on multiline. https://raw.githubusercontent.com/motdotla/dotenv/master/README.md

### Middleware

- `src/middleware.ts` exports `onRequest`; `defineMiddleware` + `sequence(a, b, c)` from `'astro:middleware'`; `next(rewritePath?)` (4.13.0) rewrites without re-running middleware, `context.rewrite()` re-triggers it. https://docs.astro.build/en/reference/modules/astro-middleware/
- Runs at build time for prerendered pages, per request for on-demand ones, and before 404/500 pages; `locals` typed via `declare namespace App { interface Locals {…} }` in `src/env.d.ts` and cannot be overridden at runtime; `context.isPrerendered` (5.0.0) guards header/cookie access. https://docs.astro.build/en/guides/middleware/
- Client-id consequence (corrected): cookies/clientAddress exist only on on-demand routes, cached GET hits bypass middleware, and `memoryCache` never stores a `Set-Cookie` response — so issue/refresh the `c` cookie only in `POST /api/vote` and keep catalogue GET responses cookie-free. Disagreement: fact-check confirmed the researcher's alternative "render pages on demand behind route caching"; breakage-hunt refuted it from `memory-provider.ts` — the source evidence wins. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/cache/memory-provider.ts

### Tooling

- `astro check` exits 1 on errors; flags `--watch --root --tsconfig --minimumFailingSeverity --minimumSeverity --preserveWatchOutput --noSync`; runs `astro sync` first; requires `@astrojs/check` + `typescript`; docs recommend `"build": "astro check && astro build"`. https://docs.astro.build/en/guides/typescript/
- TypeScript 7.0.2 is not merely outside @astrojs/check's peer range — `astro check` cannot work with it ("TypeScript 7 does not currently support languages like Astro, Vue, Svelte"); pin 6.0.3 (Astro's own devDependency is ^6.0.3) and block Renovate/Dependabot bumps. https://github.com/withastro/astro/issues/17268
- TS 6.0 defaults `types` to `[]` and Astro's `tsconfigs/base.json` sets no `types`, so `@types/node` is no longer auto-included — add `"types": ["node"]` (+ `@types/node`) before `astro check` will type `process.env` (medium confidence). https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- Presets: `astro/tsconfigs/strict` = base + `strict: true`; `strictest` adds noUncheckedIndexedAccess, exactOptionalPropertyTypes, noUnused*, noImplicitReturns/Override, etc. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/tsconfigs/strictest.json
- Client `<script>`: TypeScript by default, bundled, `type="module"`, deduplicated per page, inlined when small; `is:inline` opts out; `is:inline src="/x.js"` loads from `public/`. https://docs.astro.build/en/guides/client-side-scripts/
- Vitest via `getViteConfig` from `'astro/config'` (2nd-arg Astro config since 4.8; `experimental_AstroContainer` since 4.9). Vitest 5 breaks: `clearMocks` defaults true, `vi.mock` must be top-level, config not searched in parent dirs, `test.sequential` removed, unawaited async assertions fail. https://vitest.dev/guide/migration.html
- Zod: `import { z } from 'astro/zod'` (Zod 4); (corrected attribution) `astro:schema` and `z` from `astro:content` are officially deprecated in the v6 upgrade guide, not merely "per search results". https://docs.astro.build/en/guides/upgrade-to/v6/

### Platform limits and quotas that shape the design

- Vercel: Hobby is non-commercial only (a studio catalogue needs Pro, $20/user/month); Functions 300 s max, 2 GB, 4.5 MB request/response body cap; Node 24.x default, 22.x available. https://vercel.com/docs/functions/limitations
- Netlify: new sites default to Node 24 (2026-07-07); synchronous function limit 60 s (not configurable); 6 MB buffered payload; credit pricing — Pro $20/month for 3,000 credits (Free 300 credits/month is from search summaries only, medium confidence). https://docs.netlify.com/build/functions/optional-configuration/
- Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU/request, 50 subrequests, 128 MB (Paid: 30 s CPU default) — RS256 JWT signing plus sheet JSON parsing is tight at 10 ms. Zone purge-by-tag is on all plans since 2025-04-03. https://developers.cloudflare.com/workers/platform/limits/
- Google Sheets API: 300 reads and 300 writes/min/project, 60/min/user; a vote doing append + counter update is 2 writes from one service account -> ~30 votes/min before 429 (batch or derive counters by formula). https://developers.google.com/workspace/sheets/api/limits
- Apps Script: UrlFetchApp 20,000 calls/day (consumer) / 100,000 (Workspace); trigger runtime 90 min/day (consumer) / 6 h; 30 simultaneous executions; 6 min/execution — coalesce `onEdit` (LockService + CacheService debounce or a 1-minute time trigger). https://developers.google.com/apps-script/guides/services/quotas

## Snippets

astro.config.mjs — default `'static'` output, Node standalone, in-process route cache (verbatim; `mode` is required). https://docs.astro.build/en/guides/caching/

```js
import { defineConfig, memoryCache } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  cache: {
    provider: memoryCache(),
  },
});
```

Tagged GET + purge endpoint (verbatim) — pattern for `/api/rugs` and the Apps-Script-called `/api/revalidate`; wrap `invalidate` in `if (context.cache.enabled)` because it throws with no provider. https://docs.astro.build/en/guides/caching/

```ts
// src/pages/api/data.ts
export function GET(context) {
  context.cache.set({ maxAge: 300, tags: ['api', 'data'] });
  return Response.json({ ok: true });
}
// src/pages/api/revalidate.ts
export async function POST(context) {
  await context.cache.invalidate({ tags: ['data'] });
  await context.cache.invalidate({ path: '/api/data' });
  return Response.json({ purged: true });
}
```

Config-level route rules and experimental CDN providers (verbatim imports). https://docs.astro.build/en/reference/configuration-reference/

```js
import { cacheNetlify } from '@astrojs/netlify/cache'; // @astrojs/netlify >= 8.0.0
import { cacheVercel } from '@astrojs/vercel/cache'; // @astrojs/vercel >= 11.0.0
import { cacheCloudflare } from '@astrojs/cloudflare/cache'; // @astrojs/cloudflare >= 14.0.0
export default defineConfig({
  cache: { provider: memoryCache() }, // or cacheVercel() etc.
  routeRules: {
    '/api/[...path]': { swr: 600 },
    '/products/[...slug]': { maxAge: 3600, tags: ['products'] },
  },
});
```

astro:env schema with a server secret + usage (verbatim) — declare SHEET_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, REVALIDATE_SECRET this way. https://docs.astro.build/en/guides/environment-variables/

```js
import { defineConfig, envField } from 'astro/config';
export default defineConfig({
  env: { schema: { API_SECRET: envField.string({ context: 'server', access: 'secret' }) } },
});
// server-side module:
import { API_SECRET, getSecret } from 'astro:env/server';
getSecret('FOO'); // string | undefined
```

Multi-line private key in `.env` (dotenv >= 15 forms). https://raw.githubusercontent.com/motdotla/dotenv/master/README.md

```dotenv
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
# or single line: PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nKh9NV...\n-----END RSA PRIVATE KEY-----\n"
```

Reverse-proxy trust for Node standalone (verbatim). https://docs.astro.build/en/reference/configuration-reference/

```js
security: {
  allowedDomains: [{ hostname: '**.example.com', protocol: 'https' }];
} // or [{}] behind a trusted proxy
```

tsconfig + scripts (docs verbatim; `"types": ["node"]` added per the TS 6 `types: []` default). https://docs.astro.build/en/guides/typescript/

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "types": ["node"] },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
// package.json: "build": "astro check && astro build"   (deps: @astrojs/check@0.9.10, typescript@6.0.3, @types/node)
```

## Recommendation

- Stack: astro 7.3.1 (floor >= 7.2.8) on Node 24 LTS, default `output: 'static'` plus an adapter. Keep marketing pages prerendered; make rug/collection pages and `src/pages/api/*` on-demand with `export const prerender = false` so a sheet edit shows within the TTL without a rebuild. Set `session: false`.
- Host: Node standalone (`@astrojs/node` >= 11.1.3, `node({ mode: 'standalone' })` in a small container on a VPS/Railway/Fly) remains the first choice after both verifications. It is the only target where the built-in `memoryCache()` is a single long-lived process, so `context.cache.invalidate({ tags: ['sheet'] })` from `/api/revalidate` is exact; it also keeps googleapis/google-auth-library on a real Node runtime. Put nginx/Caddy in front, normalise `Host`, set `security.allowedDomains`, and lower `bodySizeLimit` for the JSON API.
- Second choice: Vercel (`@astrojs/vercel` >= 11.0.3, Pro plan — Hobby forbids commercial use). Use a 60 s in-module TTL for sheet reads (per-instance memory) and either `cacheVercel()` (soft purge: stale served once) or ISR with `bypassToken` + `exclude: [/^\/api\/.+/]` — never both on the same routes. Set `engines.node` to `24.x` so the adapter emits a Node 24 function.
- Netlify is workable (`>= 8.2.4`, `cacheNetlify()`, Node 24 default) but purges are limited to 2 per tag per 5 s — the Apps Script trigger must be debounced. Avoid Cloudflare for this project: workerd without Node APIs by default, 10 ms CPU on Free, and Workers Cache must be enabled by hand; the Google SDKs' workerd compatibility is unverified.
- Client id: issue/refresh the `c` cookie only in the on-demand `POST /api/vote` (httpOnly, sameSite 'lax', secure, path '/', maxAge 1 y) and mirror it in localStorage; do not rely on middleware or on cached GET pages for cookies (cache hits skip middleware; Set-Cookie responses are never cached).
- Secrets: declare them in the astro:env schema (`context: 'server', access: 'secret'`), store the PEM `\n`-escaped and normalise at read time, supply dummy values in CI builds, and authenticate `/api/revalidate` with a shared-secret header (checkOrigin ignores JSON POSTs). Configure `image.domains`/`remotePatterns` for the rug photos.
- Tooling: `astro/tsconfigs/strict` + `"types": ["node"]`, `astro check && astro build` with @astrojs/check 0.9.10 + typescript 6.0.3 (TS 7 is unusable with Astro tooling), Vitest 5.0.0 via `getViteConfig`, `import { z } from 'astro/zod'`.
- Quotas: batch the vote writes (Sheets 60 writes/min/user) and coalesce `onEdit` -> `/api/revalidate` (Apps Script 20k UrlFetch/day, 90 min trigger runtime/day on consumer accounts).

## Open questions

- Compatibility of googleapis / google-auth-library 11 / google-spreadsheet 5 with Cloudflare workerd (even with `nodejs_compat`) — unverified by all three sources.
- Whether Vercel/Netlify/Docker env UIs preserve PEM newlines for astro:env secrets — the `\n`-escape-and-normalise approach is the safe default but was not tested on any platform.
- Vitest 5.0.0 against Astro 7.3.1's `getViteConfig`: compatible by peer ranges (vite ^8) but the Astro testing guide carries no Vitest 5 note — smoke-test early.
- How `security.allowedDomains` interacts with the Vercel/Netlify adapters, which derive `clientAddress` themselves from `x-forwarded-for` / `context.ip`; the gating was confirmed only for the Node `createRequest` path.
- Whether the platform SDKs behind `cacheVercel`/`cacheNetlify` need any credential outside their own function runtime (provider code reads none; not verified end-to-end).
- Netlify Free-plan credit allowance (300/month) comes from search summaries only; confirm on netlify.com/pricing before costing the Netlify option.
- Cache-hit-bypasses-middleware is rated medium confidence by the breakage hunt (inferred from `routing/handler.ts` + `cache/handler.ts`); confirm with `X-Astro-Cache` headers in `astro preview` before relying on it.

## Verification notes

- Fact-check verifier: 72 verdicts (54 claims + 18 snippets) — 71 confirmed, 1 refuted, 0 unverifiable; 15 additional findings merged (release date, memoryCache single-instance, provider purge mechanics, `invalidate()` throws without provider, `node()` requires `mode`, ISR search-param/middleware caveats, secret validation at import, exact-path invalidation, clientAddress error catalogue, checkOrigin on-demand-only, `fetchFile`, Vite env order/loadEnv, Netlify edge middleware, session drivers build-time).
- Breakage-hunt verifier: 15 verdicts — 13 confirmed, 2 refuted, 0 unverifiable; 26 additional findings merged (security advisories and floors, withdrawn 7.1.0 advisory, memory-provider semantics, cache-hit middleware bypass, Vercel ISR/purge limits and plans, Netlify runtime/pricing/purge limits, Cloudflare Workers Cache/limits, Node release status, 7.1–7.3 changelog, config deprecations, v6 breaking list, TS 6/7 status, Vitest 5 migration, Cloudflare `finalize()`, Google client libraries, Sheets and Apps Script quotas).
- Refuted 1 (fact-check): snippet `Astro.cookies.set('prefs', { theme: 'dark' }, { httpOnly, sameSite, maxAge })` labelled "verbatim" — not in any docs page; replaced by the verbatim `Astro.cookies.set('counter', String(counter))` with the option list kept from the API reference. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/on-demand-rendering.mdx
- Refuted 2 (breakage-hunt): "Vercel Node runtime is chosen in project settings, not in the adapter" — the adapter derives the function runtime from the build machine's `process.version` (24 default), which project settings or `package.json` `engines` select. Fact-check had confirmed the docs wording; both positions retained above. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/vercel/src/index.ts
- Refuted 3 (breakage-hunt): "…or render the pages on demand behind route caching" as a way to set the client-id cookie — memoryCache refuses Set-Cookie responses and cache hits bypass middleware; only the `POST /api/vote` half of the claim survives. Fact-check had confirmed the full claim; flagged as a disagreement above. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/core/cache/memory-provider.ts
- Attribution corrections (kept, not refuted): the docs sentence "Certain adapters lack support for this feature" does not exist (core error catalogue instead); `astro:schema` deprecation is official (v6 guide); bare `node()` throws without `mode`.
- Researcher open questions resolved by the verifiers: Astro 7.0.0 date (2026-06-22); memoryCache scope (per-process, single-instance); CDN provider purge mechanics (no token read by provider code; Cloudflare needs Workers Cache enabled); TS 7 breaks `astro check` (issue #17268); Vercel/Netlify function Node defaults (24).
