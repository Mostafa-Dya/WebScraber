# Tooling for the Astro 7 catalogue: test, typing, lint and scripting versions (verified 2026-09-05)

Scope: the test / type / lint / script toolchain for the Serio Ludere rebuild (Astro 7, Google Sheet as CMS, server-side-only Google access, TTL cache + `/api/revalidate` from an Apps Script `onEdit` trigger, host undecided). Every statement comes from the research report or one of the two verification passes; refuted items carry "(corrected: …)". Version-check date: 2026-09-05.

## Versions

| package                                       | version                                                                                                                 | registry URL                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| astro                                         | 7.3.1 (node >=22.12.0; vite ^8.0.13; zod ^4.5.4; @astrojs/compiler-rs ^0.4.0)                                           | https://registry.npmjs.org/astro/latest           |
| vite                                          | 8.2.2 (node ^20.19.0 \|\| >=22.12.0; rolldown-based)                                                                    | https://registry.npmjs.org/vite/latest            |
| vitest                                        | 5.0.0 (2026-09-03; V4 tag 4.1.11; node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0)                                             | https://registry.npmjs.org/vitest                 |
| @vitest/coverage-v8                           | 5.0.0 (peer vitest exactly 5.0.0)                                                                                       | https://registry.npmjs.org/@vitest/coverage-v8    |
| zod                                           | 4.5.4 (zero dependencies)                                                                                               | https://registry.npmjs.org/zod                    |
| typescript                                    | 7.0.2 latest (native, no API); 6.0.3 last 6.x; 5.9.3 last 5.x; `@typescript/typescript6` 6.0.2 (bin `tsc6`)             | https://registry.npmjs.org/typescript             |
| @types/node                                   | 26.4.1 latest; 24.13.3 last 24.x; 22.20.1 last 22.x                                                                     | https://registry.npmjs.org/@types/node            |
| @astrojs/check                                | 0.9.10 (peer typescript ^5.0.0 \|\| ^6.0.0)                                                                             | https://registry.npmjs.org/@astrojs/check/latest  |
| eslint                                        | 10.10.0 (maintenance 9.39.5; node ^20.19.0 \|\| ^22.13.0 \|\| >=24)                                                     | https://registry.npmjs.org/eslint                 |
| @eslint/js                                    | 10.0.1 (peer eslint ^10.0.0)                                                                                            | https://registry.npmjs.org/@eslint/js             |
| eslint-plugin-astro (+ astro-eslint-parser)   | 3.1.0 / 3.1.0 (ESM-only; eslint >=10; node ^22.22.3 \|\| ^24.16.0 \|\| >=26.3.0; parser on @astrojs/compiler-rs ^0.4.0) | https://registry.npmjs.org/eslint-plugin-astro    |
| typescript-eslint                             | 8.69.0 (peer typescript >=4.8.4 <6.1.0; eslint ^8.57 \|\| ^9 \|\| ^10)                                                  | https://registry.npmjs.org/typescript-eslint      |
| eslint-plugin-jsx-a11y                        | 6.10.2 (2024-10-26; peer eslint ^3–^9 only)                                                                             | https://registry.npmjs.org/eslint-plugin-jsx-a11y |
| prettier                                      | 3.9.6                                                                                                                   | https://registry.npmjs.org/prettier               |
| prettier-plugin-astro                         | 0.14.1 (2024-07-16, WASM compiler); beta 1.0.0-beta.2 (2026-09-04, compiler-rs)                                         | https://registry.npmjs.org/prettier-plugin-astro  |
| tsx                                           | 4.23.13 (node >=18; dep esbuild)                                                                                        | https://registry.npmjs.org/tsx                    |
| dotenv                                        | 17.4.2                                                                                                                  | https://registry.npmjs.org/dotenv                 |
| playwright / @playwright/test                 | 1.63.0 (2026-09-04; node >=20)                                                                                          | https://registry.npmjs.org/playwright             |
| google-auth-library                           | 11.0.2 (node >=22 since 11.0.0)                                                                                         | https://registry.npmjs.org/google-auth-library    |
| google-spreadsheet                            | 5.3.0 (ESM; ky 2 + es-toolkit; effectively node >=22)                                                                   | https://registry.npmjs.org/google-spreadsheet     |
| googleapis / @googleapis/sheets               | 178.0.0 (~213 MB unpacked; pins google-auth-library 10.5.0 exactly) / 14.0.0 (~0.76 MB; dep googleapis-common only)     | https://registry.npmjs.org/googleapis             |
| @astrojs/node / vercel / netlify / cloudflare | 11.1.5 (astro ^7.2.1) / 11.0.10 / 8.2.5 / 14.3.0 (wrangler ^4.125.0)                                                    | https://registry.npmjs.org/@astrojs/node/latest   |
| jsdom / happy-dom                             | 30.0.1 (node ^22.22.2 \|\| ^24.15.0 \|\| >=26) / 20.14.0 (node >=20)                                                    | https://registry.npmjs.org/jsdom                  |

## Key facts

### Runtime (Node.js)

- Status on 2026-09-05: v26 Current (LTS from 2026-10-28), v24 "Krypton" Active LTS (Maintenance from 2026-10-20, EOL 2028-04-30), v22 Maintenance (EOL 2027-04-30), v25 and v20 EOL; latest LTS v24.20.0, latest Current v26.8.1; from Node 27 the cycle is annual with an alpha phase. https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Astro needs Node >=22.12.0; odd-numbered lines (v23, v25) are unsupported. https://docs.astro.build/en/install-and-setup/
- Effective Node floor of the lint stack is eslint-plugin-astro / astro-eslint-parser `^22.22.3 || ^24.16.0 || >=26.3.0`. https://registry.npmjs.org/@eslint/js/latest
- The workstation runs Node v24.8.0: below that floor, below jsdom 30.0.1's `^24.15.0`, and before `--env-file`/`loadEnvFile` (24.10.0) and type stripping (24.12.0) were declared stable. https://registry.npmjs.org/eslint-plugin-astro/latest
- Serverless hosts offer only the 24.x line (Vercel: 24.x default, 22.x, 20.x with Node 20 deprecated 2026-10-01; Netlify falls back to Node 24), so Node 24 stays the deployment target after Node 26 goes LTS. (medium) https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- `--env-file=file`: added v20.6.0, stable v24.10.0/v22.21.0; multiple flags allowed (later overrides earlier); missing file throws, `--env-file-if-exists` (v22.9.0) does not; multi-line values (PEM keys) since v20.12.0/v21.7.0; already-set process env wins. Programmatic twin `process.loadEnvFile(path)` (same stability dates, default `'./.env'`, ignores NODE_OPTIONS in the file: https://raw.githubusercontent.com/nodejs/node/main/doc/api/process.md). https://raw.githubusercontent.com/nodejs/node/main/doc/api/cli.md
- Type stripping: on by default since v22.18.0/v23.6.0, no warning since v24.3.0, stable since v24.12.0/v25.2.0; Node 26 removed `--experimental-transform-types`. Unsupported: enums, namespaces with runtime code, parameter properties, import aliases, tsconfig `paths`, TS under node_modules; imports need explicit `.ts` and `type` on type-only imports. https://raw.githubusercontent.com/nodejs/node/main/doc/api/typescript.md
- tsx is a drop-in `node` replacement that forwards all Node CLI flags, including `--env-file` (`tsx --env-file=.env ./file.js`) — resolves the report's open question. https://raw.githubusercontent.com/privatenumber/tsx/master/docs/node-enhancement.md

### TypeScript

- `npm i -D typescript` now installs 7.0.2 (2026-07-08), the native Go compiler, which "does not ship with an API" until 7.1; Microsoft: "Workflows that use Vue, MDX, Astro, Svelte, and others will likely not yet be able to leverage TypeScript 7". `astro check` (Volar), typescript-eslint and Vitest typecheck all need the JS API. https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- typescript-eslint 8.69.0 peer `typescript >=4.8.4 <6.1.0` (warns on unsupported versions); @astrojs/check 0.9.10 peer `^5.0.0 || ^6.0.0` — TS 7 is outside both. https://registry.npmjs.org/@astrojs/check/latest
- Last JS-based line is `typescript@6.0.3` (2026-04-16). `@typescript/typescript6` (bin `tsc6`, re-exports the 6.0 API for side-by-side use) tops out at 6.0.2 (corrected: the report said 6.0.3 was available there — https://registry.npmjs.org/@typescript/typescript6).
- The default changes shipped in TypeScript 6.0 (2026-03-23), not 7: `strict: true`, `module: esnext`, `types: []`, `target` = current-year ES (es2025), `rootDir` = tsconfig directory; `baseUrl`, `moduleResolution node/node10`, `target es5` became deprecation errors bypassable with `"ignoreDeprecations": "6.0"`, and 7.0 removes them entirely (corrected: the report attributed the defaults to TS 7 — re-verified https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/).
- Consequence of `types: []`: `@types/node` globals (`process`, `Buffer`) are no longer auto-visible; Astro 7.3.1's `astro/tsconfigs/base` sets no `types`, so add `"types": ["node"]` (or a `"*"` entry). (medium) https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/

### Unit tests (Vitest 5 + Astro)

- Vitest 5 requires Vite >=6.4.0 and Node >=22.12.0; inline projects now inherit the root config (plugins, resolve.alias). https://vitest.dev/blog/vitest-5.html
- Astro's testing guide configures Vitest via `getViteConfig()` from `astro/config` (`getViteConfig(userViteConfig, inlineAstroConfig = {})` returns an async Vite config function); the second argument (Astro 4.8+) overrides Astro config in tests; no minimum Vitest version is stated. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/testing.mdx
- The official `with-vitest` example pairs astro ^7.3.1 with vitest ^5.0.0-beta.2 (a caret range that resolves to 5.0.0 final today — medium); Astro 7.3.1 and Vitest 5.0.0 were published the same day. https://raw.githubusercontent.com/withastro/astro/main/examples/with-vitest/package.json
- Vitest 5 breaking changes: `clearMocks` defaults true; `vi.mock`/`vi.hoisted` must be top-level; `test.sequential` removed (use `concurrent: false`); unawaited async assertions fail; `toThrow("")` matches any message; `-t` matches the full name joined by `' > '`; all artifacts under `.vitest/`; no parent-directory config lookup; `json`/`junit` reporters write files instead of stdout (`[['json', { stdout: true }]]` restores); coverage include/exclude matched relative to the project root; `vitest/coverage`/`vitest/reporters` → `vitest/node`, `vitest/environments`/`vitest/snapshot` → `vitest/runtime`; `VITEST_POOL_ID` is 1-based; `expect.poll` rejects on timeout. https://vitest.dev/guide/migration
- Coverage includes only files imported during the run unless `coverage.include` is set; the default `v8` provider needs `@vitest/coverage-v8` pinned to the exact vitest version. https://vitest.dev/config/coverage
- Vitest `typecheck` cannot resolve `.astro` imports (vitest#9428, open since 2026-01-10); keep it off and rely on `astro check`. (medium) https://github.com/vitest-dev/vitest/issues/9428
- Container API (`experimental_AstroContainer` from `astro/container`, since 4.9.0) is still experimental in Astro 7, "subject to breaking changes, even in minor or patch releases", scoped to testing `.astro` output in vite/vitest; `create({ streaming?, renderers? })`, `renderToString`/`renderToResponse` with slots, props, request, params, locals, routeType, partial (default true). https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/container-reference.mdx
- Astro 7 deprecates `getContainerRenderer()` from an integration root; use `@astrojs/<fw>/container-renderer` with `loadRenderers` from `astro:container`. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/upgrade-to/v7.mdx
- getViteConfig + Vitest broke on the Astro 5 and 6 majors (e.g. #15847 "exports is not defined", closed); no Astro-7 breakage found and the config shape is unchanged in 7.3.1. (medium) https://github.com/withastro/astro/issues/15847
- Vite 8 renamed `build.rollupOptions` → `build.rolldownOptions`, `esbuild` → `oxc`, `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`; `build.commonjsOptions` is a no-op; object-form `manualChunks` unsupported; default build target Chrome/Edge 111, Firefox 114, Safari 16.4; Lightning CSS minifies CSS. https://vite.dev/guide/migration

### Validation (Zod 4)

- App import is `import * as z from "zod"` (`zod/v4` subpaths stay available forever); Astro 7.3.1 depends on zod ^4.5.4 and imports `zod/v4` internally, so one Zod major in the tree; content-collection schemas still use `z` from `astro:content`. https://cdn.jsdelivr.net/npm/astro@7.3.1/dist/core/cache/config.d.ts
- `z.coerce.number()` is `Number(input)` (input type `unknown`), so an empty cell `""` becomes 0; `z.coerce.boolean()` is `Boolean(input)`, so `"FALSE"`, `"false"`, `"0"` become true — use `z.stringbool()`; a missing key on a coerce field errors unless `.default()`. https://zod.dev/api
- google-spreadsheet 5.2.0+ returns `''` (not `undefined`) for empty cells, so `.optional()`/`.default()` never trigger unless a `z.preprocess` maps `''` → `undefined`. https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/CHANGELOG.md
- `.default()` short-circuits on `undefined` and must match the output type (`.prefault()` for Zod-3 behaviour); `z.number()` rejects ±Infinity; `z.int()` accepts only safe integers; `z.string().email()` → `z.email()`; `z.record()` needs two args; `.merge()` → `.extend()`; `.strict()`/`.passthrough()` → `z.strictObject()`/`z.looseObject()`; `z.nativeEnum` → `z.enum`; `z.preprocess` returns a `ZodPipe`; `z.unknown()` keys required at parse time since 4.4.0. https://zod.dev/v4/changelog
- Error formatting: `z.prettifyError()`, `z.treeifyError()`, `z.flattenError()`; `ZodError.format()`/`.flatten()` deprecated; `safeParse` returns `{ success, data } | { success: false, error }` with `error.issues`. https://zod.dev/error-formatting
- `zod/mini` only pays off in client bundles; not needed server-side. https://zod.dev/packages/mini

### Lint / format

- ESLint 10 (10.0.0 on 2026-02-06): flat config only, eslintrc removed; `defineConfig`/`globalIgnores` from `eslint/config`; `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error` added to recommended; config lookup from each file's directory; `@eslint/v9-to-v10` codemod; typescript-eslint's `tseslint.config()` is deprecated in favour of core `defineConfig()`. https://eslint.org/docs/latest/use/migrate-to-10.0.0
- A `.ts` ESLint config needs jiti >=2.2.0 or the `unstable_native_nodejs_ts_config` flag; simplest is a plain `eslint.config.js` in a `"type": "module"` project. https://eslint.org/docs/latest/use/configure/configuration-files
- eslint-plugin-astro 3.x: 2.0.0 (2026-06-22) dropped ESLint 8/9 and CJS; 3.0.0 parses with `@astrojs/compiler-rs` and deprecated `astro/no-omitted-end-tags` and `astro/valid-compile`; 3.1.0 resolves the TS parser from `typescript-eslint` so no direct `@typescript-eslint/parser` install; configs `base|recommended|all|jsx-a11y-recommended|jsx-a11y-strict`; pass the `.astro` extension to the CLI explicitly. https://raw.githubusercontent.com/ota-meshi/eslint-plugin-astro/main/CHANGELOG.md
- Verifier disagreement — TypeScript inside `.astro` frontmatter: the breakage hunt says a `files: ['**/*.astro']` block with `parserOptions.parser` (TS parser) and `extraFileExtensions: ['.astro']` is required (astro-eslint-parser README, standalone use); the fact-check says the plugin's configs wire the parser automatically. Editor re-check of the plugin user guide: it requires only that `typescript-eslint` or `@typescript-eslint/parser` be installed and shows `parserOptions.project` for `**/*.astro` only when type-aware rules are wanted — no explicit `parser` block. https://ota-meshi.github.io/eslint-plugin-astro/user-guide/
- eslint-plugin-jsx-a11y 6.10.2 peer `eslint ^3…^9`, no newer tag: the plugin's `jsx-a11y-*` configs hit ERESOLVE under ESLint 10 without `--legacy-peer-deps`/overrides. https://registry.npmjs.org/eslint-plugin-jsx-a11y/latest
- prettier-plugin-astro 0.14.1 builds on the WASM `@astrojs/compiler ^2.9.1`; config is `.prettierrc.mjs` with `plugins: ['prettier-plugin-astro']` and an `*.astro` override `parser: 'astro'`. https://github.com/withastro/prettier-plugin-astro
- `1.0.0-beta.2` (2026-09-04) is a rewrite on `@astrojs/compiler-rs ^0.4.0` with an `astroCompressHTML` option mirroring Astro's `compressHTML`, Node >=22.12.0 (medium). Related: `astro check` (@astrojs/language-server 2.16.16) still parses with the WASM `@astrojs/compiler ^2.13.1` while the build uses compiler-rs, so diagnostics may diverge (low; https://registry.npmjs.org/@astrojs/language-server/latest). https://github.com/withastro/prettier-plugin-astro/releases
- Astro 7 defaults `compressHTML` to `'jsx'` (whitespace between inline elements separated by a newline is stripped: `hello world` → `helloworld`) and the Rust compiler errors on unclosed non-void tags and no longer auto-corrects invalid HTML — material for a pixel-faithful rebuild and for formatter-induced line breaks; `compressHTML: true` restores the old behaviour. https://docs.astro.build/en/guides/upgrade-to/v7/

### Screenshots / E2E (Playwright)

- `npx playwright screenshot [options] <url> <filename>` exists in 1.63.0 with `--full-page`, `--viewport-size "1280, 720"`, `--wait-for-timeout`, `--wait-for-selector`, `--color-scheme`, `--device`, `-b` (default chromium), `--timeout`, plus proxy/har/storage options — verified via `--help` and source; https://playwright.dev/docs/cli returns 404. https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/cli/program.ts
- `npx playwright install chromium` (`--with-deps` on Linux CI; `--only-shell` for the headless shell); Windows cache `%USERPROFILE%\AppData\Local\ms-playwright`; `PLAYWRIGHT_BROWSERS_PATH=0` keeps browsers in node_modules. https://playwright.dev/docs/browsers
- 1.63 removed `Locator.ariaRef()`, the `handle` option of `exposeBinding`, the connect `logger` option and context `videosPath`/`videoSize`, and dropped Ubuntu 20.04; `@playwright/cli` 0.1.19 is a separate agent CLI (npm `playwright-cli` is deprecated) — not the `screenshot` command. https://playwright.dev/docs/release-notes

### Google Sheets access

- google-auth-library 11.0.0 (2026-07-29) has one breaking change, Node >=22; the package now lives in the google-cloud-node monorepo. `new JWT({ email, key, scopes })` (also `keyFile`, `subject`); `fetch()` is documented as "the modern method" and `request<T>()` stays public and undeprecated — resolves the report's open question. https://cdn.jsdelivr.net/npm/google-auth-library@11.0.2/build/src/auth/authclient.d.ts
- google-spreadsheet 5.x: constructor takes a `JWT | OAuth2Client | GoogleAuth` as second argument; 5.0.0 swapped axios→ky and lodash→es-toolkit (export streams return a web `ReadableStream`); 5.2.0 added `retryConfig` for 429/5xx; 5.3.0 moved to ky 2 (hook signatures changed, `prefixUrl` → `prefix`, only relevant for direct `doc.sheetsApi` use). https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/CHANGELOG.md
- googleapis 178.0.0 pins google-auth-library to exactly 10.5.0, so installing it beside v11 yields two copies with non-interchangeable JWTs; @googleapis/sheets depends only on googleapis-common. https://registry.npmjs.org/googleapis
- Keys pasted into host env UIs carry literal `\n`: the auth guide uses `key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")`; the sheet must be shared with the service-account email; an API key alone is read-only. https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/docs/guides/authentication.md
- Sheets API quota: 300 read / 300 write per minute per project but 60 read / 60 write per minute per user — the service account is one user, so two writes per vote caps at ~30 votes/min unless coalesced into `batchUpdate`; on 429 use truncated exponential backoff; no daily cap. https://developers.google.com/workspace/sheets/api/limits
- Apps Script installable triggers: "Script executions and API requests don't cause triggers to run" — the site's own vote writes never fire `onEdit`, so the vote handler must invalidate the cache itself. Quotas: 20,000 URL Fetch calls/day (consumer; 100,000 Workspace), 90 min/day trigger runtime, 6 min/execution, 20 triggers/user/script — debounce bulk-paste edit bursts (https://developers.google.com/apps-script/guides/services/quotas). https://developers.google.com/apps-script/guides/triggers/installable
- Google Cloud projects inside a Workspace organisation created on/after 2024-05-03 enforce `iam.managed.disableServiceAccountKeyCreation`; an org-policy admin must lift it or the project must sit under a personal account. (medium) https://docs.cloud.google.com/resource-manager/docs/secure-by-default-organizations

### Astro 7 platform facts touching the cache / revalidate design

- Astro 7.0 stabilised route caching: `cache: { provider: memoryCache() }` (from `astro/config`), `routeRules` (keys use `[param]`/`[...rest]`, not globs; path invalidation is exact-match — https://cdn.jsdelivr.net/npm/astro@7.3.1/dist/core/cache/config.d.ts), and `Astro.cache`/`context.cache` with `set({ maxAge, swr, tags })` and `invalidate({ tags } | { path })` — the mechanism the project planned to hand-roll (corrected: the report treated built-in caching as irrelevant — https://cdn.jsdelivr.net/npm/astro@7.3.1/dist/config/entrypoint.d.ts).
- `memoryCache()` is a per-process LRU (1000 entries) "suitable for single-instance deployments": on Vercel/Netlify/Cloudflare a POST `/api/revalidate` purges only the instance that receives it; the adapter CDN providers (`cacheVercel`, `cacheNetlify`, `cacheCloudflare`) are experimental and manually enabled; responses that set cookies are not cached. The cache is a no-op in `astro dev` (`cache.enabled === false`) — exercise it via `astro build` + `astro preview` or a mocked provider (https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/caching.mdx). https://docs.astro.build/en/guides/caching/
- BREAKAGE: Astro's default CSRF check (`security.checkOrigin: true`) returns 403 to a cross-origin non-GET with a form-like or absent content-type; Apps Script `UrlFetchApp` defaults to `application/x-www-form-urlencoded` and sends no Origin — the trigger must send `contentType: 'application/json'`. https://cdn.jsdelivr.net/npm/astro@7.3.1/dist/core/app/origin-check.js
- `output` is `'static' | 'server'` only (no hybrid); per-route on-demand rendering is `export const prerender = false` with an adapter (https://docs.astro.build/en/reference/configuration-reference/). `src/fetch.ts` is a reserved advanced-routing file (`fetchFile: null` disables) — do not name the Sheets helper that; Markdown is now rendered by Sätteri; `@astrojs/db` is removed (Node's built-in `node:sqlite`, since v22.5.0, is the suggested replacement — medium); `session: false` (7.2.0) opts out of sessions. https://docs.astro.build/en/guides/upgrade-to/v7/
- Secrets: `astro:env` `envField.string({ context: 'server', access: 'secret' })` with `getSecret()`/`validateSecrets: true`; only `PUBLIC_` vars reach the client; `import.meta.env[dynamicKey]` does not work; `.env` is not loaded inside astro.config; with @astrojs/node "Neither Astro nor the adapter loads environment variables for you" — start with `node --env-file=.env ./dist/server/entry.mjs`. https://docs.astro.build/en/guides/environment-variables/
- Vercel ISR invalidation is per-URL (`x-prerender-revalidate` header, no tags); Netlify `cacheOnDemandPages` caches server pages for up to a year unless `CDN-Cache-Control` is set per page. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/integrations-guide/vercel.mdx
- Vercel Hobby is non-commercial only (Pro $20/user/month), 4.5 MB body limit, 300 s max duration (https://vercel.com/docs/plans/hobby). Netlify: synchronous functions 60 s, 6 MB buffered payload, Node 24 fallback runtime; @netlify/functions 6.0.0 needs Node >=22.12.0; Free plan is credit-capped (300), Personal $9/month. (medium) https://docs.netlify.com/build/functions/optional-configuration/
- Cloudflare Workers Free: 10 ms CPU/request, 100,000 requests/day, 50 subrequests, 128 MB; `nodejs_compat` on by default for compatibility dates >= 2026-08-04 and `node:crypto` fully supported; Sharp does not run on Workers; google-auth-library on Workers unverified. (medium) https://developers.cloudflare.com/workers/platform/limits/

## Snippets

vitest.config.ts — from the Astro testing guide (whitespace collapsed); an optional second argument overrides Astro config in tests. https://docs.astro.build/en/guides/testing/

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';
export default getViteConfig({ test: {/* Vitest configuration options */} });
```

Rendering an .astro component with the experimental Container API — verbatim from the Astro testing guide. https://docs.astro.build/en/guides/testing/

```ts
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test } from 'vitest';
import Card from '../src/components/Card.astro';

test('Card with slots', async () => {
  const container = await AstroContainer.create();
  const result = await container.renderToString(Card, {
    slots: { default: 'Card content' },
  });
  expect(result).toContain('This is a card');
  expect(result).toContain('Card content');
});
```

eslint.config.js (ESLint 10 + typescript-eslint + eslint-plugin-astro; needs `"type": "module"` or the `.mjs` name). The astro block is verbatim from the plugin guide, the `defineConfig`/`extends` block from typescript-eslint; only the composition is adapted. See the parser disagreement above before adding a `**/*.astro` `parserOptions` block. https://ota-meshi.github.io/eslint-plugin-astro/user-guide/

```js
// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintPluginAstro from 'eslint-plugin-astro';

export default defineConfig([
  globalIgnores(['dist/', '.astro/']),
  { files: ['**/*.{js,ts}'], extends: [js.configs.recommended, tseslint.configs.recommended] },
  ...eslintPluginAstro.configs.recommended,
  { rules: {/* e.g. "astro/no-set-html-directive": "error" */} },
]);
// Run: eslint "src/**/*.{js,ts,astro}"
// Install: npm install --save-dev eslint @eslint/js typescript typescript-eslint eslint-plugin-astro
```

Running a TypeScript sync/seed script on Node 24 without tsx — Node docs examples combined; tsconfig keys as recommended by Node. https://nodejs.org/api/typescript.html

```sh
node --env-file=.env --env-file=.development.env index.js   # later files override earlier ones
node --env-file=.env scripts/sync-sheet.ts                    # type stripping; use --env-file-if-exists=.env to tolerate a missing file
# tsconfig: "rewriteRelativeImportExtensions": true, "erasableSyntaxOnly": true, "verbatimModuleSyntax": true
# imports must use './file.ts'; no enums, namespaces, parameter properties or tsconfig paths
```

Side-by-side screenshots with the Playwright 1.63.0 CLI — option names verbatim from `--help`; invocations adapted. https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/cli/program.ts

```sh
npm i -D playwright@1.63.0 && npx playwright install chromium
npx playwright screenshot --full-page --viewport-size "1280, 720" --wait-for-timeout 1000 https://old-site.example/rugs old-rugs.png
npx playwright screenshot --full-page --viewport-size "1280, 720" --wait-for-timeout 1000 http://localhost:4321/rugs new-rugs.png
```

Opt-in live E2E with @playwright/test — `webServer` keys verbatim from the Playwright docs (command/url adapted to Astro). https://playwright.dev/docs/test-webserver

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
```

Server-side Sheets access: google-auth-library JWT from env passed to google-spreadsheet — verbatim from the authentication guide (the `.replace` variant is the guide's own for hosts that escape newlines; `loadInfo` line is from the README). https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/docs/guides/authentication.md

```ts
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];
const jwtFromEnv = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: SCOPES,
});
const doc = new GoogleSpreadsheet('<YOUR-DOC-ID>', jwtFromEnv);
await doc.loadInfo(); // loads document properties and worksheets
```

## Recommendation

1. Runtime: Node 24 LTS. Upgrade the workstation from 24.8.0 to 24.20.0 first (eslint-plugin-astro needs ^24.16.0; jsdom ^24.15.0; env-file/type-stripping stable at 24.10/24.12). `"engines": { "node": ">=24.16.0 <25 || >=26.3.0" }`, `@types/node` ^24.13.3.
2. TypeScript: `"typescript": "~6.0.3"` (plain package — not `@typescript/typescript6`, which is 6.0.2). Extend `astro/tsconfigs/base`, add `"types": ["node"]`, and for scripts `erasableSyntaxOnly` + `verbatimModuleSyntax` + `rewriteRelativeImportExtensions`. Revisit TS 7 only once typescript-eslint and @astrojs/check list 7.1.
3. Tests: `vitest` 5.0.0 + `@vitest/coverage-v8` 5.0.0 (exact lockstep) through `getViteConfig()`; smoke-test on Astro 7.3.1 immediately, fallback 4.1.11 with the same config. Set `coverage.include`, leave `typecheck` off, add `.vitest/` to .gitignore, isolate Container-API render tests (experimental API).
4. Validation: `zod` ^4.5.4 via `import * as z from "zod"`. For sheet rows: `z.preprocess` mapping `''` → `undefined` before `.optional()`/`.default()`, `z.stringbool()` for checkbox columns, `z.coerce.number()` only where 0-for-empty is acceptable, `safeParse` + `z.prettifyError` for owner-readable errors.
5. Lint/format: `eslint` ^10.10.0 flat config with `@eslint/js` 10.0.1, `typescript-eslint` ^8.69.0, `eslint-plugin-astro` ^3.1.0 in `eslint.config.js` (ESM); skip the `jsx-a11y-*` configs. `prettier` ^3.9.6 + `prettier-plugin-astro` 0.14.1 today. Disagreement: the report/fact-check keep 0.14.1; the breakage hunt says its 2024 WASM parser predates Astro 7's `'jsx'` whitespace model and prefers the compiler-rs beta or `compressHTML: true`. For a pixel-faithful rebuild set `compressHTML: true` and stay on 0.14.1 until 1.0.0 is stable.
6. Scripts: `node --env-file=.env scripts/x.ts` natively; no dotenv; keep `tsx` ^4.23.13 only as an escape hatch (it forwards `--env-file`).
7. Screenshots/E2E: `playwright` 1.63.0 CLI for the side-by-side script; `@playwright/test` 1.63.0 with a `webServer` block — `npm run preview` is safe on the Node adapter; on Vercel/Netlify point it at the platform CLI or built entry.
8. Google: `google-auth-library` ^11.0.2 JWT + `google-spreadsheet` ^5.3.0 (use `retryConfig`; normalise `\n` in the key). Avoid `googleapis` (213 MB and a pinned google-auth-library 10.5.0 duplicate); `@googleapis/sheets` 14.0.0 if a raw client is ever needed. Coalesce vote writes into one `batchUpdate` to respect 60 writes/min per service account.
9. Cache/revalidate — disagreement with the researcher's hand-rolled design: the fact-check says the report's recommendation stands; the breakage hunt shows Astro 7 ships stable route caching (`memoryCache()` + `context.cache.invalidate({ tags })`). Evaluate the built-in cache first. It is single-instance, so it only meets the 1-minute freshness target on Node self-hosted; on Vercel/Netlify/Cloudflare the CDN providers are experimental — this weighs on the host decision. In any design: the Apps Script call must send `contentType: 'application/json'` (CSRF 403 otherwise) and the vote endpoint must invalidate the cache itself (API writes never fire `onEdit`).

## Open questions

- Vitest 5.0.0 final on Astro 7.3.1 is untested by us (the official example still pins `^5.0.0-beta.2`); run the smoke test before committing.
- Whether `eslintPluginAstro.configs.recommended` type-parses TS frontmatter without an explicit `parserOptions.parser`/`extraFileExtensions` block — the two verifiers disagree; try `eslint src/**/*.astro` on a TS-frontmatter file and add the block only if it fails.
- Container API: not verified whether `renderToString` honours middleware, `Astro.locals` or `astro:env` for on-demand routes.
- Upstream timelines: typescript-eslint / @astrojs/check / Vitest typecheck support for TypeScript 7.1's new API (stay on 6.0.x until then); an ESLint-10-compatible eslint-plugin-jsx-a11y (a11y linting via the plugin's `jsx-a11y-*` configs is blocked or needs `--legacy-peer-deps`).
- Low-confidence items: `npx playwright screenshot` is verified in source and `--help` but its docs page is 404; whether google-auth-library (gaxios) runs on Cloudflare Workers; whether `astro preview` is reliable under the Vercel/Netlify adapters (https://docs.astro.build/en/reference/cli-reference/).
- Whether the owner's Google Cloud project sits in a Workspace org that blocks service-account key creation.
- Whether to adopt Astro's built-in route cache instead of the planned TTL cache, and therefore which host (memory cache needs a single Node process). Adapter choice itself is out of scope here.

## Verification notes

- Fact-check pass: 57 verdicts (46 findings + 11 snippets) — 56 confirmed, 1 refuted, 0 unverifiable (its own summary phrases this as "42 of 43 findings and all 11 code snippets confirmed"); 13 additional findings, all merged (2 resolve open questions: tsx forwards `--env-file`; `request()` not deprecated). Four confirmed snippets omitted for length: framework-renderer Container example, composed Zod block, `.prettierrc.mjs`, google-auth-library REST example.
- Breakage-hunt pass: 31 verdicts — 29 confirmed, 2 refuted, 0 unverifiable; 36 additional findings merged (8 medium, 2 low confidence, tagged inline).
- Editor re-verification (WebFetch, 2026-09-05): TypeScript 6.0 announcement (defaults changed in 6.0, dated 2026-03-23) and eslint-plugin-astro user guide (no explicit `parserOptions.parser` block shown).
- Refuted claims and corrections:
  1. "TypeScript 6.0.3 is available side-by-side as `@typescript/typescript6` (`tsc6`)" — refuted by the fact-check: that package tops out at 6.0.2; pin plain `typescript@~6.0.3`. https://registry.npmjs.org/@typescript/typescript6
  2. "TS 7 changed the defaults (`strict` true, `module` esnext; `target es5`, `baseUrl`, `moduleResolution node/node10` removed)" — refuted by the breakage hunt on attribution (the fact-check had confirmed the TS 7 blog wording): the defaults shipped in TS 6.0 with deprecation errors bypassable via `"ignoreDeprecations": "6.0"`; 7.0 makes the removals hard. Confirmed by editor re-fetch. https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
  3. "Astro 7 route `cache`/`routeRules` config is not relevant (hand-rolled TTL cache + `/api/revalidate`)" — refuted by the breakage hunt: Astro 7.0 stabilised `cache`, `routeRules` and `Astro.cache`/`context.cache`; evaluate before writing a custom cache. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/CHANGELOG.md
