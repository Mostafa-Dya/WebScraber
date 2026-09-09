# Cache invalidation and on-demand revalidation for Astro 7 SSR on Vercel, Netlify, Cloudflare Workers and Node

Consolidated from the research report, the fact-check and the breakage hunt (all live-checked 2026-09-05), with three claims re-verified by the editor on the same day. Context: Serio Ludere catalogue, Google Sheet as CMS, server-side-only Google access, TTL cache plus `POST /api/revalidate` called from an Apps Script onEdit trigger; deployment target undecided.

## Versions

| package             | version                                                  | registry URL                                          |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| astro               | 7.3.1 (engines node >=22.12.0)                           | https://registry.npmjs.org/astro/latest               |
| @astrojs/vercel     | 11.0.10 (peer astro ^7.0.0)                              | https://registry.npmjs.org/@astrojs/vercel/latest     |
| @astrojs/netlify    | 8.2.5 (peer astro ^7.0.0, dep @netlify/functions ^5.2.0) | https://registry.npmjs.org/@astrojs/netlify/latest    |
| @astrojs/cloudflare | 14.3.0 (peer astro ^7.2.0, wrangler ^4.125.0)            | https://registry.npmjs.org/@astrojs/cloudflare/latest |
| @astrojs/node       | 11.1.5 (peer astro ^7.2.1)                               | https://registry.npmjs.org/@astrojs/node/latest       |
| @vercel/functions   | 3.9.5                                                    | https://registry.npmjs.org/@vercel/functions/latest   |
| @netlify/functions  | 6.0.0 (node >=22.12.0; still exports `purgeCache`)       | https://registry.npmjs.org/@netlify/functions/latest  |
| @netlify/cache      | 4.0.0 (node >=22.12.0)                                   | https://registry.npmjs.org/@netlify/cache/latest      |
| wrangler            | 4.129.0                                                  | https://registry.npmjs.org/wrangler/latest            |
| vite                | 8.2.2                                                    | https://registry.npmjs.org/vite/latest                |
| zod                 | 4.5.4                                                    | https://registry.npmjs.org/zod/latest                 |
| vitest              | 5.0.0                                                    | https://registry.npmjs.org/vitest/latest              |
| pm2                 | 7.0.4                                                    | https://registry.npmjs.org/pm2/latest                 |
| googleapis          | 178.0.0 (Node-first; unverified on workerd)              | https://registry.npmjs.org/googleapis/latest          |
| google-auth-library | 11.0.2 (engines node >=22)                               | https://registry.npmjs.org/google-auth-library/latest |
| @googleapis/sheets  | 14.0.0                                                   | https://registry.npmjs.org/@googleapis/sheets/latest  |

## Key facts

### Astro 7 core (host-agnostic)

- `output` is `'static' | 'server'` only (hybrid merged into static in v5); opt a route into SSR with `export const prerender = false`, or out of it in server mode with `export const prerender = true`. https://docs.astro.build/en/guides/upgrade-to/v5/
- Route caching is first-party since astro@7.0.0 (core stable): `cache: { provider }` plus `routeRules` in config, `Astro.cache.set({ maxAge, swr, tags })` in pages / `context.cache.set()` in endpoints and middleware, `await context.cache.invalidate({ tags: [...] })` or `{ path }`. Adapter CDN providers `cacheNetlify` (`@astrojs/netlify/cache`), `cacheVercel` (`@astrojs/vercel/cache`), `cacheCloudflare` (`@astrojs/cloudflare/cache`) are experimental: "During the experimental phase these providers need to be manually enabled." `memoryCache` comes from `astro/config`. (Missed by the report; found by the breakage hunt; re-verified by the editor.) https://docs.astro.build/en/guides/caching/
- Provider reference: `memoryCache({ max: 1000 })` is LRU and "suitable for single-instance deployments" (per-process; not for serverless or pm2 cluster); CDN providers implement `setHeaders()` and the internal headers are stripped before the client; runtime providers add `X-Astro-Cache: HIT|MISS|STALE`; `Cookie` is always ignored for Vary keying; in dev "no actual caching occurs"; `cache.invalidate()` requires a configured provider; path invalidation is exact-match only. https://docs.astro.build/en/reference/cache-provider-reference/
- Per-page headers via `Astro.response.headers.set(...)`; endpoints export `GET`/`POST` typed `APIRoute` and read `await request.json()`; in static mode every custom endpoint needs `export const prerender = false`. https://docs.astro.build/en/guides/endpoints/
- Secrets: `envField.string({ context: "server", access: "secret" })` then `import { X } from 'astro:env/server'`; only `PUBLIC_` variables reach the client; `astro:env` cannot be used inside `astro.config.mjs` (use `process.env` there). https://docs.astro.build/en/guides/environment-variables/
- CSRF (`security.checkOrigin`, default true) only checks POST/PATCH/DELETE/PUT with content type `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`; a JSON POST with no Origin header passes. Trap: Apps Script `UrlFetchApp.fetch` defaults `contentType` to `application/x-www-form-urlencoded`, which Astro answers with 403 — always set `contentType: 'application/json'`. https://docs.astro.build/en/reference/configuration-reference/
- Astro 7 reserves `src/fetch.ts`/`src/fetch.js` for advanced routing (`fetchFile`, default `'fetch'`); a Sheets helper at that path becomes the request entrypoint — use `src/lib/sheets.ts` or set `fetchFile: null`. https://docs.astro.build/en/guides/upgrade-to/v7/
- Other v7 breaks: Vite 8; the Rust compiler now errors on unclosed tags and no longer auto-corrects invalid HTML; `compressHTML` defaults to `'jsx'` instead of `true`; `@astrojs/db` removed; Markdown moved from remark/rehype to Sätteri. https://docs.astro.build/en/guides/upgrade-to/v7/
- `session: false` in config skips session runtime: @astrojs/netlify >=8.2.0 no longer auto-wires Netlify Blobs, @astrojs/cloudflare >=14.2.0 no longer auto-wires KV, @astrojs/node >=11.1.0 likewise — the catalogue has no login, so set it. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/netlify/CHANGELOG.md
- Adapter export maps: @astrojs/netlify `./cache`, `./functions`, `./static`; @astrojs/vercel `./cache`, `./entrypoint` (no `./serverless`); @astrojs/cloudflare `./cache`, `./hono`, `./fetch`, `./handler`, `./entrypoints/server`. https://registry.npmjs.org/@astrojs/cloudflare/14.3.0
- Engines align on Node 22.12+: astro, @netlify/functions 6, @netlify/cache 4, vitest 5 (`^22.12.0 || ^24.0.0 || >=26.0.0`); Netlify's Lambda fallback (Node 24) and Vercel's default (24.x) both satisfy it. https://registry.npmjs.org/vitest/latest
- Zod 4.5.4 (Astro 7 depends on `zod ^4.5.4`) breaks Zod-3 style schemas: single `error` param replaces `message`/`invalid_type_error`/`required_error`; `z.email()`/`z.url()` replace `.email()`/`.url()`; `z.strictObject()`/`z.looseObject()` replace `.strict()`/`.passthrough()`; `z.record()` needs two args; `.merge()` deprecated; `ZodError.errors` removed (use `.issues`). https://zod.dev/v4/changelog
- Vitest 5.0.0: needs Vite >=6.4 and Node >=22.12; `clearMocks` now defaults to true; `vi.mock`/`vi.hoisted` inside functions throw; fake timers also mock `Temporal`; `test.sequential` removed; Astro setup remains `getViteConfig` from `astro/config`. https://vitest.dev/guide/migration.html

### Vercel

- Adapter: `import vercel from '@astrojs/vercel'`; `isr: { expiration, bypassToken, exclude: [...] }`, excluded paths "will always be rendered fresh". Vercel's own "Astro on Vercel" page (updated 2026-08-26) still shows `@astrojs/vercel/serverless`, `output: 'hybrid'`, `isr: true`, `functionPerRoute`, `edgeMiddleware` — all removed in adapter 10/11; copy nothing from it. https://docs.astro.build/en/guides/integrations-guide/vercel/
- ISR on-demand: GET/HEAD with `x-prerender-revalidate: <bypassToken>`; Build Output docs (SvelteKit) say "the cache will be revalidated immediately", but Astro is listed only as "Framework-specific" in the ISR quickstart (unverified for Astro); revalidation "applies to the domain and deployment where you trigger it", so target the production domain. https://vercel.com/docs/incremental-static-regeneration/quickstart
- ISR caveats: requests carry no search params; bundled middleware runs only on miss/regeneration (`middlewareMode: 'edge'` runs before the cache); cache is per-deployment, kept 31 days, updated globally within 300 ms; a failed revalidation keeps stale content and retries after 30 s; the CDN layer is "ephemeral ... typically for minutes to hours", misses fall back to a durable ISR cache billed per 8 KB unit, and unchanged revalidations incur no write units. https://vercel.com/docs/incremental-static-regeneration
- Headers: `Vercel-CDN-Cache-Control` > `CDN-Cache-Control` > `Cache-Control`; s-maxage 1..31536000 s; SWR supported; if only `Cache-Control` is set the CDN strips `s-maxage` and `stale-while-revalidate` from the client response; CDN cache is regional and best-effort. https://vercel.com/docs/caching/cache-control-headers
- CDN caches a function response only for GET/HEAD with status 200/404/410/301/302/307/308, no `Authorization` request header, no `set-cookie`, body <=10 MB. https://vercel.com/docs/caching/cdn-cache
- `stale-if-error` is contradictory even within one page (listed as accepted, then "doesn't currently support ... stale-if-error for server-side caching") — implement stale-if-error in the app cache. https://vercel.com/docs/caching/cdn-cache
- Tag purge is on all plans since 2026-01-28: tag with `Vercel-Cache-Tag` header (comma-separated; tags are case-sensitive, no commas) or `addCacheTag()`; ISR functions must use `addCacheTag()`; purging by tag clears CDN, Runtime and Data caches; limits 256 bytes/tag, 128 tags/response, 16 tags per bulk REST call. https://vercel.com/docs/caching/cdn-cache/purge
- (corrected: `invalidateByTag` is NOT a purge — "all cached content associated with that tag is marked as stale. The next request serves the stale content instantly while revalidation happens in the background"; a low-traffic catalogue therefore shows the old page to the first visitor after an edit and refreshes only on a later visit. `dangerouslyDeleteByTag()` / `POST /v1/edge-cache/dangerously-delete-by-tags` makes "the next request fetch content from your origin before responding"; Vercel labels delete "not recommended" because of stampede risk, which is negligible when one tag covers a handful of pages. Re-verified by the editor.) https://vercel.com/docs/caching/cdn-cache/purge
- REST: `POST /v1/edge-cache/invalidate-by-tags?projectIdOrName=...` with Bearer token; body `tags` is an array (each <=256 chars) or a string (<=8196); `target` `production|preview`, default all environments. https://vercel.com/docs/rest-api/edge-cache/invalidate-by-tag
- Runtime Cache (`getCache()` from @vercel/functions, GA since 2025-08-13): `get`/`set(key, value, { ttl, tags })`/`delete`/`expireTag`; regional, ephemeral LRU, survives deploys, 2 MB/item, 128 tags/item; Hobby shares one cache across projects; billed $0.40–0.64 per 1M reads and $4.00–6.40 per 1M writes by region, no included allowance listed; "Runtime Cache entry tags will not apply to ISR pages" — only a CDN tag purge clears all layers. https://vercel.com/docs/caching/runtime-cache
- Fluid compute (default for projects created on/after 2025-04-23) shares one process and its global state across invocations, so a module-level Map survives warm requests, but "Cold starts can still happen, such as during periods of low traffic" and nothing guarantees a single instance. https://vercel.com/docs/fundamentals/what-is-compute
- Deploy Hooks: unauthenticated GET/POST to `https://api.vercel.com/v1/integrations/deploy/<project>/<hook>`; 5 hooks/project, 60 triggers/hour/project; Hobby 100 deployments/day — a rebuild per sheet edit is rate-limited and slow. https://vercel.com/docs/deploy-hooks
- Hobby is "restricted to non-commercial, personal use only" (fair-use example: "Advertising the sale of a product or service"); exceeding a Hobby limit blocks the feature for 30 days; Pro is $20 per user/month. Function limits: 4.5 MB request/response payload, 300 s max, 2 GB memory, single region `iad1` by default. https://vercel.com/docs/plans/hobby
- Node 20 is disabled in Project Settings on 2026-10-01; runtimes are 24.x (default), 22.x, 20.x — set `"engines": { "node": "24.x" }`. https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

### Netlify

- Adapter 8.2.5 options: `cacheOnDemandPages` (default false; "cache all server-rendered pages for up to one year"), `imageCDN` (true), `middlewareMode` (`'ssr' | 'edge'`), `includeFiles`/`excludeFiles`, `staticHeaders` (false), `devFeatures` (`{ images: true, environmentVariables: false, edgeFunctions: true }`); per-page `Astro.response.headers.set('CDN-Cache-Control', ...)`. Dev env-var injection needs `netlify link`; edge-function emulation can throw filesystem errors (set `edgeFunctions: false`) — keep the service-account secret in a local `.env`. https://docs.astro.build/en/guides/integrations-guide/netlify/
- Function responses are not cached by default (`public, max-age=0, must-revalidate`); precedence `Netlify-CDN-Cache-Control` > `CDN-Cache-Control` > `Cache-Control`; SWR supported; `stale-if-error` undocumented; the `durable` directive adds a shared cache consulted on edge-node misses (Functions only, "Not yet supported on Edge Function responses"). https://docs.netlify.com/build/caching/caching-overview/
- Tags and purge: `Netlify-Cache-Tag: a,b,c` up to 500 per response; `purgeCache({ tags })` from `@netlify/functions` infers site ID and auth inside Netlify Functions (`token` defaults to `NETLIFY_PURGE_API_TOKEN`; `siteID | siteSlug | domain` mutually exclusive); `purgeCache()` with no arguments purges the whole site; REST `POST https://api.netlify.com/api/v1/purge` with a personal access token and `{ site_slug, cache_tags }`. Propagation "takes just a few seconds" (unverified: sentence surfaced via search, not pinned). https://docs.netlify.com/build/functions/api/
- Netlify's Astro ISR guide pairs `netlify-cdn-cache-control: s-maxage=31536000` with a per-slug `netlify-cache-tag` (purge-driven, no TTL); the `public, durable, s-maxage=300, stale-while-revalidate=604800` line is its "optimized example". https://developers.netlify.com/guides/how-to-do-advanced-caching-and-isr-with-astro/
- Cache API: `caches.open()/match()/put()` in Functions; regional ("not replicated across regions"); entries drop when their tags are purged; `cacheHeaders({ ttl, swr, durable, tags, vary })` from @netlify/cache 4.0.0; 100 lookups and 20 insertions-or-deletions per invocation. https://docs.netlify.com/build/caching/cache-api/
- Functions: AWS Lambda Node runtimes with fallback Node 24; 60 s synchronous limit (not configurable); 1024 MB (configurable only on credit-based Pro/Enterprise); `AWS_LAMBDA_JS_RUNTIME` set via UI/CLI/API, not `netlify.toml`; Lambda-compat mode deploys rejected from 2027-07-01; warm-instance reuse is undocumented. AWS deprecates `nodejs22.x` on 2027-04-30, so pin builds to Node 24. https://docs.netlify.com/build/functions/configuration/
- Payload limits: streaming responses 60 s and 20 MB; 6 MB buffered request/response (~4.5 MB effective after Base64) and 256 KB for background functions (unverified: the 6 MB figures were surfaced via search, not quoted). https://docs.netlify.com/build/functions/api/
- Build Hooks: `POST https://api.netlify.com/build_hooks/<id>` (`trigger_branch`, `trigger_title`, `clear_cache`). Credits: production deploy 15, bandwidth 20/GB, compute 10/GB-hour, web requests 2 per 10,000; Deploy Previews, branch deploys, failed deploys and rollbacks cost 0 — a build hook per sheet edit exhausts 300 credits in 20 edits. https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Plans: Free $0, 300 credits/month, hard limit, cannot buy credits; Personal $9 for 1,000; Pro $20 for 3,000. Commercial projects are allowed on Free (official blog and staff forum answer; no personal-use clause on the pricing page). When credits run out "all of your web projects ... are paused" with a "Site not available" page until the next billing cycle. https://docs.netlify.com/manage/accounts-and-billing/billing/resume-paused-projects/

### Cloudflare Workers

- Adapter 14.3.0 requires astro ^7.2.0 and wrangler ^4.125.0; 13.0.0 "Drops official support for Cloudflare Pages in favor of Cloudflare Workers" and removed `workerEntryPoint` and `cloudflareModules` (`platformProxy` removal (unverified) — the string no longer appears in docs; use @cloudflare/vite-plugin options instead); 14.0.0 upgraded to Vite 8 and made the Wrangler config optional; cite the withastro/astro monorepo changelog (the withastro/adapters one is frozen at 12.2.1). Cloudflare: "Start new projects with Workers." https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/CHANGELOG.md
- Runtime access: `import { env } from 'cloudflare:workers'`, `Astro.locals.cfContext` (ExecutionContext / `waitUntil`), `Astro.request.cf`, global `caches`; wrangler `main: "@astrojs/cloudflare/entrypoints/server"` + `compatibility_flags: ["nodejs_compat"]`; `astro dev`/`preview` run inside workerd, so the Sheets client must be Workers-compatible from day one; run `wrangler types` before `astro dev`. https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- `nodejs_compat` is enabled automatically only for compatibility dates >= 2026-08-04 (2024-09-23..2026-08-03 still need the flag); `node:child_process`, `node:worker_threads`, `node:http2`, `node:vm`, `node:cluster` are non-functional stubs, a risk for Node-centric Google SDKs. https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Isolates: "not store mutable state in your global scope"; isolates may be evicted and are recreated at the 128 MB limit. Free: 100,000 requests/day, 10 ms CPU, 50 subrequests and 50 Cache API calls per request; Paid $5/mo: 10M requests, 30M CPU-ms, 30 s default CPU (5 min max), 10,000 subrequests, 1,000 Cache API calls; static-asset requests free and unlimited. https://developers.cloudflare.com/workers/platform/limits/
- Cache API (`caches.default.match/put/delete`) is per data center; "Workers deployed to custom domains have access to functional `cache` operations"; dashboard editor and Playground are no-ops; unavailable behind Cloudflare Access; `cache.delete` is local-DC only. DISAGREEMENT on `*.workers.dev`: fact-check reads the sentence "This restriction does not apply on `.workers.dev` domains, which include the query string in the cache key by default" as implying it works there; breakage hunt cites (unpinned) docs text that "*.workers.dev deployments will have no impact". Editor re-fetched the runtime-API page and the "How the Cache works" page and found no "no impact on workers.dev" sentence; treat as untested — a custom domain is needed anyway for purge. https://developers.cloudflare.com/workers/runtime-apis/cache/
- KV: `put(key, value, { expirationTtl })` minimum 60 s, 1 write/second/key, values <=25 MiB; `get(key, { cacheTtl })` minimum 30 s, default 60 s; eventually consistent (other locations up to 60 s stale). Free: 100,000 reads, 1,000 writes/day (resets 00:00 UTC) — one KV write per vote caps at 1,000 votes/day. https://developers.cloudflare.com/kv/api/write-key-value-pairs/
- Purge: all methods on all plans since 2025-04-03; `POST /client/v4/zones/{zone_id}/purge_cache` with `{"tags": [...]}` or `{"files": [...]}` and a token holding Cache Purge; Free 5 requests/minute for tag/host/prefix/everything (100 operations per request; up to 100 tags per call; tag <=1,024 chars; aggregate `Cache-Tag` header <=16 KB), 800 URLs/s single-file. A per-cell onEdit trigger firing 6+ times a minute gets 429s — debounce/coalesce. Requires a zone, i.e. a custom domain on Cloudflare DNS. https://developers.cloudflare.com/cache/how-to/purge-cache/
- (corrected: the report said fetch option `cf: { cacheTags }` is Enterprise-only; the live Request docs and purge-by-tags page show no plan requirement — plan-gating is unknown; irrelevant since the Worker sets the `Cache-Tag` response header itself.) https://developers.cloudflare.com/workers/runtime-apis/request/

### Node self-hosted

- `adapter: node({ mode: 'standalone' })`, run `HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs`; TLS via `SERVER_KEY_PATH`/`SERVER_CERT_PATH`; options `staticHeaders`, `experimentalDisableStreaming`, `bodySizeLimit` (default 1 GB). https://docs.astro.build/en/guides/integrations-guide/node/
- 10.0.0 changed the standalone default host to `localhost`; 11.0.0 restricted `X-Forwarded-Proto` trust to `security.allowedDomains` — behind nginx/Caddy/Docker set `HOST=0.0.0.0` and configure `allowedDomains` for the public hostname (unverified: changelog quoted, not exercised). https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/node/CHANGELOG.md
- A process-level cache (`memoryCache` or a Map) is the only setup where one purge call reliably clears everything, but it is lost on restart/redeploy and must not be combined with pm2 cluster mode. https://docs.astro.build/en/reference/cache-provider-reference/
- Free hosts: Render Free is 0.1 CPU / 512 MB, spins down after 15 idle minutes with ~1 minute spin-up, 750 instance-hours/month, "Do not use them for production applications"; Railway Free gives $1 usage credit/month (Hobby $5); Fly.io has only a 7-day / 2-VM-hour trial (shared-cpu-1x 256 MB about $2.02/mo). https://render.com/docs/free

### Google side

- Only an installable onEdit trigger may call `UrlFetchApp` (`ScriptApp.newTrigger('fn').forSpreadsheet(ss).onEdit().create()`); the trigger needs the `script.external_request` scope and the owner may see an "unverified app" warning on first authorization. Consumer quotas: 20,000 URL Fetch calls/day (Workspace 100,000), 90 min trigger runtime/day (6 h), 30 simultaneous executions, 20 installable triggers/user/script, 6 min/execution, 50,000 Properties reads+writes/day; quota breach throws. `e.value`/`e.oldValue` exist only for single-cell edits. https://developers.google.com/apps-script/guides/services/quotas
- Sheets API: 300 read and 300 write requests/minute/project but 60 per user per minute — one service account is one user, so more than 60 vote appends (or cache-miss reads) per minute returns 429; batch votes, use exponential backoff, keep payloads under 2 MB. https://developers.google.com/workspace/sheets/api/limits

## Snippets

Astro 7 route caching (config, page/endpoint, invalidation) — https://docs.astro.build/en/guides/caching/

```js
// astro.config.mjs (Node); swap in cacheNetlify()/cacheVercel()/cacheCloudflare() from '@astrojs/<adapter>/cache'
import { defineConfig, memoryCache } from 'astro/config';
export default defineConfig({
  cache: { provider: memoryCache() },
  routeRules: { '/products/[...slug]': { maxAge: 3600, tags: ['products'] } },
});
// in an endpoint or middleware
context.cache.set({ maxAge: 300, tags: ['api', 'data'] });
await context.cache.invalidate({ tags: ['data'] }); // or { path: '/api/data' } (exact match)
```

Vercel: tag the response, then delete (not merely invalidate) by tag — https://vercel.com/docs/caching/cdn-cache/purge and https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package

```ts
Astro.response.headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
Astro.response.headers.set('Vercel-Cache-Tag', 'sheet'); // or: await addCacheTag('sheet') inside ISR
import { dangerouslyDeleteByTag } from '@vercel/functions';
await dangerouslyDeleteByTag('sheet'); // invalidateByTag('sheet') would only mark stale and serve the old page once more
```

Netlify: hand-rolled page headers (fallback if `cacheNetlify()` is not enabled) — https://developers.netlify.com/guides/how-to-do-advanced-caching-and-isr-with-astro/

```astro
Astro.response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
Astro.response.headers.set("Netlify-CDN-Cache-Control", "public, durable, s-maxage=300,
stale-while-revalidate=604800"); Astro.response.headers.set("netlify-cache-tag", "books");
```

Netlify: `POST /api/revalidate` (adapted from the guide's verified endpoint; secret from the verified `astro:env` pattern) — https://developers.netlify.com/guides/how-to-do-advanced-caching-and-isr-with-astro/ and https://docs.astro.build/en/guides/environment-variables/

```ts
export const prerender = false;
import { purgeCache } from '@netlify/functions';
import { REVALIDATE_SECRET } from 'astro:env/server'; // envField.string({ context: "server", access: "secret" })
export async function POST({ request }) {
  if (request.headers.get('Authorization') !== `Bearer ${REVALIDATE_SECRET}`)
    return new Response('Unauthorized', { status: 401 });
  await purgeCache({ tags: ['sheet'] }); // site ID + auth are inferred inside Netlify Functions
  return new Response('ok', { status: 200 });
}
```

Cloudflare zone purge by tag (any plan; needs a zone/custom domain and a Cache Purge token) — https://developers.cloudflare.com/api/resources/cache/methods/purge/

```sh
curl https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -d '{"tags": ["sheet"]}'
```

Apps Script installable onEdit trigger + JSON POST (`contentType` is mandatory, see CSRF fact) — https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app

```js
ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
function onSheetEdit(e) {
  UrlFetchApp.fetch('https://<site>/api/revalidate', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('REVALIDATE_SECRET'),
    },
    payload: JSON.stringify({ sheet: e.range.getSheet().getName() }),
  });
}
```

## Recommendation

Default target: Netlify Free with @astrojs/netlify 8.2.5 on Astro 7.3.1, `output: 'server'`, `session: false`, builds pinned to Node 24. The researcher's reasoning survives every verification: Vercel Hobby forbids commercial use (so Vercel means Pro at $20/user/month); Cloudflare Free caps CPU at 10 ms, forbids mutable global state, and needs wrangler, a custom-domain zone and a Workers-compatible Sheets client before caching or purge work; no Node host has an always-on free tier. Netlify allows commercial projects on Free, `purgeCache` evicts immediately with no token plumbing, and the durable cache plus stale-while-revalidate hides Lambda cold starts.

Implementation, corrected by the breakage hunt: use Astro 7 route caching rather than a hand-rolled per-host header/purge layer. Enable `cacheNetlify()` from `@astrojs/netlify/cache` (experimental, manual enable), tag catalogue routes with `sheet` via `routeRules` or `Astro.cache.set({ maxAge: 60, swr: 600, tags: ['sheet'] })`, and have `POST /api/revalidate` (prerender=false, Bearer secret from `astro:env/server`) call `context.cache.invalidate({ tags: ['sheet'] })`, falling back to `purgeCache({ tags: ['sheet'] })` if the provider misbehaves. Keep an app-level stale-if-error and single-flight guard around the Sheets fetch (the CDN layers do not guarantee stale-if-error). The vote endpoint responds `Cache-Control: no-store`, appends to the Votes tab, and must batch or back off above 60 writes/minute; the rating column stays a sheet formula. Debounce the Apps Script trigger (LockService + a PropertiesService timestamp) so bursts of cell edits coalesce into one purge, send `contentType: 'application/json'`, and never wire Build Hooks per edit (15 credits per production deploy; 300 credits/month).

Portability: the same code moves to Vercel Pro with `cacheVercel()` — but use `dangerouslyDeleteByTag` (or the REST dangerously-delete endpoint) instead of `invalidateByTag`, which only marks entries stale — or to Cloudflare Workers Paid with `cacheCloudflare()` plus a custom domain and a debounced zone purge (5 requests/minute on Free). Node self-hosting with `memoryCache()` is the only setup where one purge call clears everything, at the cost of a paid always-on box.

Explicit disagreements: (1) the fact-check confirmed the report's portable hand-rolled design as matching Netlify's guide, while the breakage hunt refuted its framing because Astro 7 route caching now provides the same thing first-party — both are true; the hand-rolled path is kept as the fallback. (2) Worst-case staleness of ~1 minute holds on Netlify and Cloudflare (immediate eviction) but not on Vercel with `invalidateByTag`. (3) Cloudflare Cache API on `*.workers.dev` remains contested (see Key facts).

## Open questions

- Does `cacheNetlify()` (experimental) emit the `durable` directive and `Netlify-Cache-Tag` exactly as the hand-rolled headers do, and does `context.cache.invalidate({ tags })` map to `purgeCache`? Verify against the provider source before removing the fallback.
- Vercel: does Astro's `x-prerender-revalidate` request regenerate the ISR copy for all users? Only SvelteKit/Nuxt are documented (unverified). Moot if route caching + `dangerouslyDeleteByTag` is used.
- Netlify: warm-instance reuse and cold-start latency are undocumented; measure whether a module-level cache is worth keeping alongside the durable CDN cache.
- Netlify: exact purge propagation time ("a few seconds") and the 6 MB buffered payload limit were surfaced via search, not quoted from a pinned page.
- Cloudflare: whether the Cache API works on `*.workers.dev` (contested); whether an SSR render plus Zod parse of the full sheet fits 10 ms CPU on Free; whether googleapis 178 / google-auth-library 11 run under workerd or a fetch + WebCrypto JWT flow is required.
- Cloudflare: plan-gating of the fetch option `cf: { cacheTags }` is unknown after the correction (not needed for this design).
- Node: the `security.allowedDomains` / `X-Forwarded-Proto` behaviour behind a reverse proxy was read from the changelog, not exercised.
- Apps Script: which debounce window (10 s server-side vs LockService in the trigger) keeps a burst of edits under Cloudflare's 5 purges/minute if that target is ever chosen.

## Verification notes

- Fact-check verifier: 48 confirmed, 1 refuted, 1 unverifiable (all 12 package versions matched the npm registry on 2026-09-05).
- Breakage-hunt verifier: 9 confirmed, 2 refuted, 1 unverifiable, plus 21 additional findings merged above (all 16 of its package versions matched the registry).
- Editor re-verification (WebFetch, 2026-09-05): Astro caching guide (confirms route caching added in astro@7.0.0, adapter CDN providers experimental); Vercel purge page (confirms invalidate = stale-while-revalidate, delete = foreground origin fetch); Cloudflare runtime Cache API page and "How the Cache works" page (no `*.workers.dev` no-impact sentence found).
- Refuted 1 (fact-check): "only the fetch option `cf: { cacheTags }` remains Enterprise-only" — replaced: no plan requirement appears in the live Request docs or the purge-by-tags page; plan-gating unknown. https://developers.cloudflare.com/workers/runtime-apis/request/
- Refuted 2 (breakage hunt): "pages must hand-set host CDN headers and /api/revalidate must call each host's purge API; only the purge call changes per host" — replaced: Astro 7 ships `cache`/`routeRules`, `Astro.cache.set`, `context.cache.invalidate` and adapter providers `cacheNetlify`/`cacheVercel`/`cacheCloudflare`/`memoryCache`; hand-rolled headers kept only as fallback. https://docs.astro.build/en/guides/caching/
- Refuted 3 (breakage hunt): "after `invalidateByTag('sheet')` freshness is about max(Map TTL, purge propagation) ~1 minute" — replaced: on Vercel invalidation marks entries stale and serves stale on the next request, so staleness on a low-traffic site is unbounded; use `dangerouslyDeleteByTag` / `POST /v1/edge-cache/dangerously-delete-by-tags`. https://vercel.com/docs/caching/cdn-cache/purge
- Unverifiable (fact-check): `platformProxy` listed as a removed @astrojs/cloudflare option — kept, tagged (unverified). Unverifiable (breakage hunt): Astro-specific behaviour of `x-prerender-revalidate` — kept in Open questions.
- Verdict-label mismatches between verifiers: portable design (confirmed vs refuted — reconciled above); Vercel ISR header (confirmed as a Build Output primitive vs unverifiable for Astro — substance agrees); Cloudflare Cache API on `*.workers.dev` (implied working vs no impact — unresolved, flagged).
- Dropped snippets (unused by the recommendation, though confirmed): Vercel ISR `astro.config`, `x-prerender-revalidate` HEAD fetch, Runtime Cache `getCache()`, Vercel REST invalidate curl, Deploy Hook curl, Netlify REST purge curl, Netlify Cache API `cacheHeaders`, Build Hook curl, wrangler.json (its `compatibility_date` literal is not load-bearing: two fetches showed different example dates), Cloudflare env/KV access, Node standalone config.
