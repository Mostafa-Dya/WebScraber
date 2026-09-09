# Google Sheets API v4 for the Serio Ludere catalogue: service-account auth, values endpoints, quotas, batching, Node libraries

Consolidated research brief (key: `sheets-api`), edited 2026-09-05 from one research report and two independent verifications (fact-check + breakage hunt). Context: Astro site, Google Sheet as CMS, two-way like/dislike sync, server-side-only Google access, cache + `/api/revalidate` called from an Apps Script `onEdit` trigger; host undecided (Vercel | Netlify | Cloudflare | self-hosted Node). Every fact below carries its source; corrections to the original report are marked "(corrected: …)".

## Versions

| package             | version (verified 2026-09-05)                                                                                                                                                                                | registry URL                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| googleapis          | 178.0.0 (2026-08-31; manifest `node>=18`, but the 178.0.0 CHANGELOG entry is "BREAKING: minimum Node version of 22"; pins google-auth-library 10.5.0 + googleapis-common ^8.0.0; 213,050,164 bytes unpacked) | https://registry.npmjs.org/googleapis/latest          |
| @googleapis/sheets  | 14.0.0 (2026-08-03; 755,905 bytes; engines `node>=12` is stale, effective floor `>=18` via googleapis-common ^8.0.0; 14.1.0 "upgrade … to Node 22" is tagged in-repo 2026-09-02 but unpublished)             | https://registry.npmjs.org/@googleapis/sheets/latest  |
| googleapis-common   | 9.0.4 (2026-08-24; `node>=22`; google-auth-library ^11, gaxios ^7.3.0); dist-tag legacy-18 = 8.0.3 (`node>=18`; pins gaxios 7.1.3, google-auth-library 10.5.0)                                               | https://registry.npmjs.org/googleapis-common          |
| google-auth-library | 11.0.2 (2026-08-12; `node>=22`; gaxios ^7.1.4, jws ^4.0.0, gcp-metadata ^9.0.0); 11.0.0 = 2026-07-30; legacy-18 = 10.9.1                                                                                     | https://registry.npmjs.org/google-auth-library        |
| gaxios              | 8.0.0 (2026-08-21; `node>=22`; node-fetch ^3.3.2, https-proxy-agent ^7.0.1); legacy-18 = 7.3.1                                                                                                               | https://registry.npmjs.org/gaxios                     |
| google-spreadsheet  | 5.3.0 (2026-06-03; ESM+CJS; no engines field but ky ^2.0.2 → effectively `node>=22`; peer google-auth-library >=8.8.0)                                                                                       | https://registry.npmjs.org/google-spreadsheet         |
| ky                  | 2.1.0 (`node>=22`)                                                                                                                                                                                           | https://registry.npmjs.org/ky/latest                  |
| jose                | 6.2.12 (published 2026-09-05; zero deps; no engines)                                                                                                                                                         | https://registry.npmjs.org/jose/latest                |
| astro               | 7.3.1 (`node>=22.12.0`; zod ^4.5.4; vite ^8; route caching stable since 7.0.0)                                                                                                                               | https://registry.npmjs.org/astro/latest               |
| zod                 | 4.5.4                                                                                                                                                                                                        | https://registry.npmjs.org/zod/latest                 |
| vitest              | 5.0.0 (`node ^22.12.0                                                                                                                                                                                        |                                                       | ^24.0.0 |     | >=26.0.0`) | https://registry.npmjs.org/vitest/latest |
| @astrojs/node       | 11.1.5 (peer astro ^7.2.1)                                                                                                                                                                                   | https://registry.npmjs.org/@astrojs/node/latest       |
| @astrojs/vercel     | 11.0.10 (peer astro ^7.0.0; bundles @vercel/functions ^3.7.5; ships `cacheVercel()`)                                                                                                                         | https://registry.npmjs.org/@astrojs/vercel/latest     |
| @astrojs/netlify    | 8.2.5 (peer astro ^7.0.0; @netlify/functions ^5.2.0, @netlify/blobs ^10.7.4; ships `cacheNetlify()`)                                                                                                         | https://registry.npmjs.org/@astrojs/netlify/latest    |
| @astrojs/cloudflare | 14.3.0 (peer astro ^7.2.0, wrangler ^4.125.0; ships `cacheCloudflare()`)                                                                                                                                     | https://registry.npmjs.org/@astrojs/cloudflare/latest |

## Key facts

### Reads (values.get / batchGet / spreadsheets.get)

- `GET /v4/spreadsheets/{id}/values/{range}`; params `majorDimension` (ROWS|COLUMNS), `valueRenderOption` (default FORMATTED_VALUE), `dateTimeRenderOption` (default SERIAL_NUMBER, ignored under FORMATTED_VALUE); returns a ValueRange; scopes drive, drive.readonly, drive.file, spreadsheets, spreadsheets.readonly. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
- `GET …/values:batchGet` takes a repeated `ranges` query param; "The order of the ValueRanges is the same as the order of the requested ranges." https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet
- ValueRenderOption: FORMATTED_VALUE → "$1.23" (formatted by the spreadsheet's locale, not the caller's), UNFORMATTED_VALUE → 1.23, FORMULA → "=A1" (not calculated). Use UNFORMATTED_VALUE for counters, ratings, FX rates. https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueRenderOption
- DateTimeRenderOption: SERIAL_NUMBER = Lotus-style doubles (default); FORMATTED_STRING = strings in the cell's number format (locale-dependent). https://developers.google.com/workspace/sheets/api/reference/rest/v4/DateTimeRenderOption
- Parser traps: "Empty trailing rows and columns will not be included" (rows are ragged); `values` is omitted entirely when a range has no data (not `[]`); on write, `null` cells are skipped, send `""` to blank a cell. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values
- No anonymous read path: an unauthenticated GET on Google's own public quickstart sheet returns 403 PERMISSION_DENIED "Method doesn't allow unregistered callers" (live probe 2026-09-05). https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/values/Class%20Data!A2:E
- List tabs cheaply: `GET /v4/spreadsheets/{id}?fields=sheets.properties(sheetId,title,sheetType,gridProperties)`; fields comma-separated, subfields dot-separated or grouped in parentheses. https://developers.google.com/workspace/sheets/api/guides/field-masks
- A1 notation: tab names with spaces/special characters need single quotes (`'My Custom Sheet'!A:A`, then URL-encoded); a named range with the same name as a tab takes precedence. Keep tab names like Rugs/Votes/FX simple. https://developers.google.com/workspace/sheets/api/guides/concepts

### Writes (values.append / update / batchUpdate, spreadsheets.batchUpdate)

- `POST …/values/{range}:append?valueInputOption=RAW|USER_ENTERED&insertDataOption=INSERT_ROWS|OVERWRITE` with a ValueRange body; `valueInputOption` is required; the range only locates the table; extra params `includeValuesInResponse` (default false), `responseValueRenderOption`, `responseDateTimeRenderOption`; scopes exactly drive, drive.file, spreadsheets (no readonly). https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- Table detection: the header row is part of the "table"; values land on the row after the table's last row, first column. Docs example: tables at A1:C2 and B4:D6 → range `A1` writes at A3, `E4` writes at E4, `Sheet1`/`B4`/`C5:D5` write at B7. https://developers.google.com/workspace/sheets/api/guides/values
- InsertDataOption has only OVERWRITE (overwrites, still grows the sheet at the end) and INSERT_ROWS; neither copies formulas from the row above. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- Append response: `tableRange` ("Empty if no table was found" — absent on a brand-new tab, make it optional in Zod) plus `updates.updatedRange` (e.g. "Sheet1!A3:D4"), `updatedRows`, `updatedColumns`, `updatedCells`. https://developers.google.com/workspace/sheets/api/samples/writing
- `PUT …/values/{range}?valueInputOption=…` → UpdateValuesResponse {spreadsheetId, updatedRange, updatedRows, updatedColumns, updatedCells, updatedData (only if `includeValuesInResponse` was true)}. https://developers.google.com/workspace/sheets/api/reference/rest/v4/UpdateValuesResponse
- `POST …/values:batchUpdate` body `{valueInputOption, data:[ValueRange…], includeValuesInResponse?}` → totalUpdatedRows/Columns/Cells/Sheets + `responses[]`. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate
- ValueInputOption: RAW "will not be parsed and will be stored as-is" ("=1+2" stays a string); USER_ENTERED parses like UI typing ("=1+2" becomes a formula, "Mar 1 2016" a date). Use RAW for visitor payloads (blocks formula injection), USER_ENTERED only to write formulas deliberately. https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption
- `POST /v4/spreadsheets/{id}:batchUpdate` `{requests:[…]}` is atomic per call ("If any request is not valid then the entire request will fail and nothing will be applied"); `replies` mirror requests 1:1 with empty replies; there is no transaction across HTTP calls. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
- AddSheetRequest `{addSheet:{properties:{title, index?, gridProperties}}}`: "All properties are optional … if [sheetId] is not set, an id will be randomly generated"; AppendCellsRequest "Adds new cells after the last row with data in a sheet, inserting new rows into the sheet if necessary." https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#AddSheetRequest
- None of the 74 Request kinds is an increment or compare-and-set; a counter cell needs GET (UNFORMATTED_VALUE) then PUT (RAW) = 2 quota units per vote with a lost-update window between the calls. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request
- Append-only Votes tab avoids that: one `values.append` per vote, no prior read, row chosen server-side; Google does not explicitly promise serialization of concurrent appends (researcher's inference, left as inference by the verifier). https://developers.google.com/workspace/sheets/api/guides/values

### Formulas, derived columns, row identity

- Appended rows get only the cells you send; per-row formula columns stay empty (community report, 2021-10-27, plus the absence of any copy option in the reference). https://community.zapier.com/featured-articles-65/creating-google-sheets-rows-with-array-formulas-11912
- Header-cell array pattern `={"Likes"; ARRAYFORMULA(IF(A2:A="","", …))}`: semicolons separate rows in an array literal; comma-decimal locales replace commas with backslashes; cells below the header must be empty; without the IF guard the array fills to ~row 1,000,000 with ""; header count must equal data column count or #VALUE!. https://support.google.com/docs/answer/6208276
- Writing a formula cell requires `valueInputOption=USER_ENTERED` (RAW stores literal text). https://developers.google.com/workspace/sheets/api/samples/writing
- Cross-tab references `=Sheet1!A1` / `='Sheet name'!B4`; COUNTIFS(criteria_range1, criterion1, [criteria_range2, criterion2, …]) with equal-size ranges. https://support.google.com/docs/answer/75943 and https://support.google.com/docs/answer/3256550
- API writes trigger recalculation; only volatile functions (NOW()) go stale (~70 min median) under API-only polling — single-author blog dated 2017-01-25, anecdotal, no Google statement (unverified). https://jamesdobson.name/post/sheets-api-and-formula-calculation/
- Developer metadata: `createDeveloperMetadata` on a dimensionRange that "must represent a single row or column"; read/write via `values:batchGetByDataFilter` / `batchUpdateByDataFilter` with `developerMetadataLookup` (locationType ROW|COLUMN|SHEET|SPREADSHEET, locationMatchingStrategy EXACT_LOCATION|INTERSECTING_LOCATION); "IDs may be specified when metadata is created" so a deterministic metadataId per rug removes the `developerMetadata:search` round-trip; limits 30,000 characters per sheet and per spreadsheet. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.developerMetadata
- Metadata "remains associated at those locations as the spreadsheet is edited"; scanning column A is simpler but the row can shift between read and write. https://developers.google.com/workspace/sheets/api/guides/metadata
- Sheet caps: 10 million cells / 18,278 columns; Google recommends a 2 MB maximum request payload. An append-only Votes tab grows unbounded and every COUNTIFS over whole Votes columns recalculates on each write (inference) — plan periodic archive/compaction. https://support.google.com/drive/answer/37603

### Quotas, backoff, retries

- Per project: 300 read + 300 write requests/min; per user per project: 60 read + 60 write/min. A service account is one user, so 60+60/min is the practical cap (inference, not stated); `quotaUser` (`google.options({params:{quotaUser}})`) exists to spread per-user quota. No daily cap: "Provided that you stay within the per-minute quotas, there's no limit to the number of requests that you can make per day." https://developers.google.com/workspace/sheets/api/limits
- Over quota → HTTP 429; back off `min(((2^n)+random_number_milliseconds), maximum_backoff)` with random ≤ 1,000 ms and max backoff typically 32 or 64 s, then "Continue waiting and retrying … but don't increase the wait period"; requests over 180 s time out; standard use is free but "Exceeding the quota request limits is planned to incur charges … later in 2026" (no price or date published); quota increases via Cloud Console, approval not guaranteed. https://developers.google.com/workspace/sheets/api/limits
- gaxios retry (corrected: the report said gaxios "retries by default"; it retries nothing unless `retry: true` or a `retryConfig` is set — guard `if (!err || !err.config || (!config && !err.config.retry))`, re-verified by the editor 2026-09-05). Once enabled the defaults are retry 3, methods GET/HEAD/PUT/OPTIONS/DELETE (POST excluded), statuses 100-199/408/429/500-599, noResponseRetries 2, multiplier 2, and the 100 ms `retryDelay` applies only on the first retry (delays ≈ 100/500/1500 ms, far below Google's 1/2/4 s); `Retry-After` is not honoured. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/gaxios/src/retry.ts
- Who enables retries: googleapis-common `apirequest.ts` sets `options.retry = options.retry === undefined ? true : options.retry` (typed clients retry GET/PUT, still not POST append/batchUpdate); the token exchange uses `AuthClient.RETRY_CONFIG = { retry: true, retryConfig: { httpMethodsToRetry: ['GET','PUT','POST','HEAD','OPTIONS','DELETE'] } }`; a raw `authClient.fetch(url)` against sheets.googleapis.com gets no retry unless you pass `retry: true` / `transporterOptions`. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/google-auth-library-nodejs/src/auth/authclient.ts
- googleapis: `google.options({timeout, auth, …})` and per-request overrides pass straight to gaxios ("whatever gaxios supports, this library supports"); the README has no retry section. https://raw.githubusercontent.com/googleapis/google-api-nodejs-client/main/README.md

### Service-account auth and secrets

- JWT bearer flow: header `{alg:RS256, typ:JWT[, kid]}`, claims `iss` (client_email), `scope` (space-delimited), `aud` `https://oauth2.googleapis.com/token`, `iat`, `exp` (max 1 h); POST `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>` → `{access_token, token_type:"Bearer", expires_in:3600}`; cache the token until near expiry. Endpoint confirmed live (bogus assertion → 400 invalid_request). https://developers.google.com/identity/protocols/oauth2/service-account
- Self-signed JWT used directly as Bearer: Google says only "some Google APIs" accept it; Sheets is not listed anywhere checked (unverified). Hazard: google-auth-library's JWT client silently takes that path when no scopes are given (`useSelfSignedJWT = (!this.hasUserScopes() && url) || …`), so `new JWT({email, key})` + `client.fetch('https://sheets.googleapis.com/…')` sends an unverified self-signed token — always pass `scopes: ['https://www.googleapis.com/auth/spreadsheets']`. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/google-auth-library-nodejs/src/auth/jwtclient.ts
- Scopes: `spreadsheets` and `spreadsheets.readonly` are Sensitive; `drive`/`drive.readonly` Restricted; `drive.file` Non-sensitive. https://developers.google.com/workspace/sheets/api/scopes
- `drive.file` cannot reach the owner's existing spreadsheet (only files the app created/opened or the user picked via Picker) even though append lists it; use the full `spreadsheets` scope. https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Share the sheet with `<name>@<project>.iam.gserviceaccount.com` as Editor (Viewer for reads); no domain-wide delegation; "After you download the key file, you cannot download it again." https://developers.google.com/workspace/guides/create-credentials
- Org policy risk: `iam.disableServiceAccountKeyCreation` (and key upload) "is enforced by default" for organizations created on/after 2024-05-03; `iam.serviceAccountKeyExpiryHours` can expire keys after 1 h–90 days; leaked keys may be auto-disabled — check before committing to a key-based design. https://docs.cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts
- Env-var PEM newline pitfall: `key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")`; alternative is `JSON.parse(process.env['CREDS'])` of the whole key file (google-auth-library README). https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/docs/guides/authentication.md
- google-auth-library surface: `new JWT({email, key, keyFile, keyId, scopes, subject, additionalClaims})`; `client.fetch(url, init?)` → Gaxios response with `.data`; `getAccessToken()` → `{token, res}`; `getRequestHeaders(url?)` → WHATWG `Headers` (since the 10.0.0 "Request revamp", inferred from the changelog); `transporterOptions?: GaxiosOptions` for `retryConfig`. 10.0.0 (2025-06-11) was the big break (Transporter class and `additionalOptions` removed), 10.1.0 added the fetch-compatible API, 11.0.0 only raises Node to 22. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/google-auth-library-nodejs/CHANGELOG.md
- Astro `astro:env`: `envField.string({ context: "server", access: "secret" })` keeps the key out of client bundles; secrets validated on first import of `astro:env/server`; `getSecret("FOO")` for undeclared ones; Cloudflare needs adapter-specific runtime access. https://docs.astro.build/en/guides/environment-variables/

### Libraries and runtimes

- googleapis@178 + a top-level google-auth-library@11 yields two auth-library majors in node_modules (10.5.0 nested); @googleapis/sheets cannot use googleapis-common 9 until 14.1.0 publishes. https://registry.npmjs.org/googleapis-common/8.0.3
- googleapis-common 9.0.4 carries a fix for "path parameter validation and prevention of traversal/injection attacks in apiary request encodings"; whether 8.0.3 (what googleapis@178 / @googleapis/sheets@14.0.0 resolve) has it was not verified (unverified, low confidence). https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/nodejs-googleapis-common/CHANGELOG.md
- The official Node quickstart still pins `googleapis@105`. https://developers.google.com/workspace/sheets/api/quickstart/nodejs
- google-spreadsheet 5.x: `new GoogleSpreadsheet(id, auth)` with GoogleAuth | JWT | OAuth2Client | `{apiKey}` (read-only, public sheets) | `{token}` (self-managed, no refresh); `loadInfo`, `sheetsByTitle`, `addSheet`, `addRow(obj, {raw, insert})`, `getRows`, `loadCells`, `saveUpdatedCells`; 5.2.0 returns `''` for empty cells and stores `=`-prefixed strings literally; 5.3.0's ky v2 changes hook signatures and renames `prefixUrl`→`prefix` for anyone using `doc.sheetsApi`/`doc.driveApi`. https://raw.githubusercontent.com/theoephraim/node-google-spreadsheet/main/CHANGELOG.md
- Cloudflare Workers and the typed client (corrected: the report quoted a google-auth-library README sentence — "This is a server-side library with no documented browser or edge/Workers support" — that does not exist; the README only has "Supported Node.js Versions"). Proving evidence instead: googleapis-common statically imports node `http2` (`src/http2.ts` line 14, pulled in by `apirequest.ts`) and Cloudflare lists `node:http2` only among "Non-functional stub modules", so googleapis / @googleapis/sheets cannot run on Workers. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/nodejs-googleapis-common/src/http2.ts
- google-auth-library alone on Workers is untested by Google or Cloudflare; Cloudflare marks node:crypto (all but DSA/DH keygen, argon2, ed448/x448, FIPS), http, https, net, stream, zlib as supported, so it may load. `nodejs_compat` + `nodejs_compat_v2` are on by default for compatibility dates ≥ 2026-08-04 (2024-09-23…2026-08-03 need the flag). https://developers.cloudflare.com/workers/configuration/compatibility-flags/
- jose 6 runs on Bun, browsers, Cloudflare Workers, Deno, Electron, Node; CJS `require('jose')` only where require(esm) is default (`^20.19.0 || ^22.12.0 || >=23.0.0`). Web Crypto (`crypto.subtle`, stable since Node 19) already supports RSASSA-PKCS1-v1_5 with `pkcs8` import + sign, so jose is optional on Node 22/24 or Workers. https://raw.githubusercontent.com/panva/jose/main/README.md and https://nodejs.org/api/webcrypto.html
- Old-source ages: jamesdobson recalculation post 2017-01-25, Zapier ARRAYFORMULA article 2021-10-27, dt.in.th Workers guide 2022-07-06 (pre-`nodejs_compat_v2`) — re-test rather than cite as current. https://jamesdobson.name/post/sheets-api-and-formula-calculation/

### Hosting and caching

- In-process TTL cache cleared by `/api/revalidate` (corrected: refuted by the breakage hunt; it only works on one long-lived Node process). Vercel Fluid: "multiple invocations can share the same physical instance" but none is guaranteed; Cloudflare: "no guarantee that any two user requests will be routed to the same or a different instance"; Astro's memory provider is "per-process and not shared across serverless instances". https://docs.astro.build/en/guides/caching/
- Astro 7 route cache (stable since 7.0.0): `routeRules`, `Astro.cache.set({ maxAge, swr, tags })` / `context.cache.set()`, `await context.cache.invalidate({ tags })` or `{ path }` (exact match only); providers `cacheVercel()` (@astrojs/vercel/cache 11+), `cacheNetlify()` (@astrojs/netlify/cache 8+), `cacheCloudflare()` (@astrojs/cloudflare/cache 14+); disabled in dev ("Build and preview to test locally"); the Astro 7 blog calls the CDN providers "experimental" while the docs table lists them without a flag. https://docs.astro.build/en/guides/caching/
- `output: 'hybrid'` was removed in Astro 5; Astro 7 accepts `'static' | 'server'`; use `static` + `export const prerender = false` on vote/revalidate endpoints and live pages. https://docs.astro.build/en/guides/upgrade-to/v5/
- Vercel: Node 24.x default (22.x, 20.x selectable; Node 20 deprecated 2026-10-01); function body limit 4.5 MB; Runtime Cache (`getCache()` from @vercel/functions, `set(key, value, {ttl, tags})`, `expireTag`) is regional, LRU, 2 MB/item, charged, shared across all Hobby projects. https://vercel.com/docs/caching/runtime-cache
- Netlify: synchronous function limit 60 s (not configurable), 6 MB buffered payload, falls back to Node 24 (override with `AWS_LAMBDA_JS_RUNTIME`); shared cache via `Netlify-CDN-Cache-Control: public, durable, max-age=60, stale-while-revalidate=120` + `Netlify-Cache-Tag`, invalidated by `purgeCache({ tags })` from @netlify/functions in seconds. https://docs.netlify.com/build/caching/caching-overview/
- Cloudflare Workers: Free plan 10 ms CPU/request and 50 subrequests (Paid: 30 s default, 5 min max, 10,000); RS256 signing + parsing a whole-catalogue batchGet on a miss may exceed 10 ms (inference); never rely on global state — use KV/Cache API or `cacheCloudflare()`. https://developers.cloudflare.com/workers/platform/limits/

### Apps Script trigger integration

- Installable `onEdit` runs only for human edits: "Script executions and API requests don't cause triggers to run." No revalidate feedback loop from vote appends, but the site must invalidate its own cache after each vote. https://developers.google.com/apps-script/guides/triggers/installable
- `UrlFetchApp.fetch` defaults to `application/x-www-form-urlencoded` with no matching Origin; Astro's default `security.checkOrigin` returns 403 for POST with form/multipart/text content types on on-demand routes — post `contentType: 'application/json'`. https://docs.astro.build/en/reference/configuration-reference/
- Apps Script quotas: UrlFetch 20,000/day (consumer) or 100,000/day (Workspace); trigger runtime 90 min/day or 6 h/day; 30 simultaneous executions; 20 triggers/user/script; 6 min/execution. A 200-cell paste can fire up to 200 runs — debounce with CacheService/LockService and make `/api/revalidate` idempotent. https://developers.google.com/apps-script/guides/services/quotas
- Astro live content collections (`defineLiveCollection`, `getLiveCollection`/`getLiveEntry`) return a `cacheHint` (tags, lastModified) that can feed the route cache; stability wording not re-checked (unverified). https://docs.astro.build/en/guides/content-collections/

## Snippets

Append one vote (REST; RAW blocks formula injection; `tableRange` may be absent on an empty tab). https://developers.google.com/workspace/sheets/api/samples/writing

```http
POST https://sheets.googleapis.com/v4/spreadsheets/SPREADSHEET_ID/values/Votes!A1:E1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS
{ "range": "Votes!A1:E1", "majorDimension": "ROWS",
  "values": [["2026-09-05T10:00:00Z", "rug-0042", "like", "visitor-hash", "ua-hash"]] }
// docs response shape: { "spreadsheetId": "…", "tableRange": "Sheet1!A1:D2",
//   "updates": { "spreadsheetId": "…", "updatedRange": "Sheet1!A3:D4", "updatedRows": 2, "updatedColumns": 4, "updatedCells": 8 } }
```

Read every tab in one request (repeated `ranges`; URL pattern accepted by the server in a live probe). https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet

```http
GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchGet?ranges=Rugs!A1:Z&ranges=Collections!A1:F&ranges=Tags!A1:C&ranges=FX!A1:C&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS
// -> { "spreadsheetId": "…", "valueRanges": [ { "range": "Rugs!A1:Z…", "majorDimension": "ROWS", "values": [[…],[…]] }, … ] }
```

Create the Votes tab (researcher's adaptation of AddSheetRequest; write the header row with a second `values.update` on `'Votes'!A1:E1`). https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#AddSheetRequest

```http
POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}:batchUpdate
{ "requests": [ { "addSheet": { "properties": { "title": "Votes", "gridProperties": { "rowCount": 1000, "columnCount": 5, "frozenRowCount": 1 } } } } ] }
// replies[0].addSheet.properties.sheetId is the generated tab id
```

google-auth-library JWT client for plain REST calls (corrected/composed: README example plus mandatory `scopes` and explicit retry; sources: README lines 284-294, jwtclient.ts, authclient.ts, node-google-spreadsheet authentication.md). https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/google-auth-library-nodejs/README.md

```js
import { JWT } from 'google-auth-library'; // 11.0.2, Node >= 22
const client = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // env-var PEM newline fix
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], // required: no scopes => silent self-signed JWT path
  transporterOptions: {
    retry: true,
    retryConfig: { httpMethodsToRetry: ['GET', 'PUT', 'POST', 'HEAD', 'OPTIONS', 'DELETE'] },
  },
});
const res = await client.fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?ranges=Rugs!A1:Z&valueRenderOption=UNFORMATTED_VALUE`,
);
res.data.valueRanges; // also: await client.getAccessToken() -> { token, res }; await client.getRequestHeaders() -> Headers
```

Edge-safe token minting without google-auth-library (composed from jose docs + Google's service-account doc). https://developers.google.com/identity/protocols/oauth2/service-account

```js
import * as jose from 'jose'; // 6.2.12; or use crypto.subtle directly
const privateKey = await jose.importPKCS8(pemEncodedKey, 'RS256');
const assertion = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/spreadsheets' })
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuer(client_email)
  .setAudience('https://oauth2.googleapis.com/token')
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);
// POST https://oauth2.googleapis.com/token  (application/x-www-form-urlencoded)
// grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=<assertion>
// -> { "access_token": "…", "scope": "…", "token_type": "Bearer", "expires_in": 3600 }
```

Header-cell array formulas in the Rugs tab (base formula verbatim from the blog; the COUNTIFS adaptation is syntactically consistent with the COUNTIFS docs but untested on a live sheet). https://modelmonkey.io/blog/google-sheets-array-literal-header-row-arrayformula

```text
={"Revenue"; ARRAYFORMULA(IF('P&L'!A2:A="","", 'P&L'!C2:C))}
={"Likes";    ARRAYFORMULA(IF(A2:A="","", COUNTIFS(Votes!B:B, A2:A, Votes!C:C, "like")))}
={"Dislikes"; ARRAYFORMULA(IF(A2:A="","", COUNTIFS(Votes!B:B, A2:A, Votes!C:C, "dislike")))}
```

gaxios retry gate and defaults (corrected; re-verified 2026-09-05). https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/gaxios/src/retry.ts

```ts
if (!err || !err.config || (!config && !err.config.retry)) {
  /* shouldRetry: false — nothing retries without retry:true or retryConfig */
}
config.retry = config.retry === undefined || config.retry === null ? 3 : config.retry;
config.httpMethodsToRetry = config.httpMethodsToRetry || ['GET', 'HEAD', 'PUT', 'OPTIONS', 'DELETE']; // POST absent
config.statusCodesToRetry = config.statusCodesToRetry || [
  [100, 199],
  [408, 408],
  [429, 429],
  [500, 599],
];
const retryDelay = config.currentRetryAttempt ? 0 : (config.retryDelay ?? 100); // 100 ms on first retry only
calculatedDelay =
  retryDelay + ((Math.pow(config.retryDelayMultiplier!, config.currentRetryAttempt!) - 1) / 2) * 1000;
```

Apps Script → `/api/revalidate` call that passes Astro's CSRF check. https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app

```js
UrlFetchApp.fetch(url, {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify({ tags: ['sheet'] }),
  headers: { 'x-revalidate-secret': secret },
  muteHttpExceptions: true,
});
```

Astro 7 route cache calls that replace the hand-rolled TTL map. https://docs.astro.build/en/guides/caching/

```ts
// astro.config: cache: { provider: cacheVercel() }   // '@astrojs/vercel/cache' | cacheNetlify() | cacheCloudflare() | memoryCache() (per-process)
Astro.cache.set({ maxAge: 120, swr: 60, tags: ['home'] }); // or context.cache.set() in an endpoint
await context.cache.invalidate({ tags: ['data'] }); // in /api/revalidate and right after a vote append
await context.cache.invalidate({ path: '/api/data' }); // exact-match only, no globs
```

## Recommendation

1. Client: google-auth-library@11.0.2 `JWT` (scope `spreadsheets`, `transporterOptions: { retry: true, retryConfig: { httpMethodsToRetry: […,'POST'] } }`) plus plain `client.fetch()` against the REST endpoints — `values:batchGet` (UNFORMATTED_VALUE) for reads, `values.append` (RAW, INSERT_ROWS) for votes. Skip `googleapis` (213 MB, pins auth-lib 10.5.0). If typed calls are wanted, @googleapis/sheets@14.0.0 (typed clients already retry GET/PUT, still not POST); google-spreadsheet@5.3.0 only for row/header ergonomics (needs Node 22 via ky 2). Corrected from the report: retries are not on by default for the raw-fetch path, and `scopes` is mandatory to avoid the silent self-signed-JWT path.
2. Runtime: Node 22+ everywhere (Astro 7.3.1 needs 22.12; auth-lib 11, gaxios 8, googleapis-common 9, ky 2 need 22; Vercel defaults to 24, Netlify falls back to 24). Set `"engines": { "node": "22.x" }` or accept 24.
3. Host: the report's "Vercel/Netlify Node functions or self-hosted Node, not Cloudflare" stands for the typed client (node:http2 stub). Cloudflare is not excluded for a fetch + jose/Web Crypto token minter, but auth-lib-on-Workers is untested and the Free plan's 10 ms CPU is a risk; treat Cloudflare as "possible after an empirical test", the other three as ready.
4. Caching (corrected: the report's in-process TTL cache + `/api/revalidate` is refuted for every serverless target): use Astro 7 route cache with `cacheVercel()` / `cacheNetlify()` / `cacheCloudflare()` and tag invalidation, or Vercel Runtime Cache / Netlify durable cache + `purgeCache`. An in-memory map is acceptable only on self-hosted @astrojs/node (single process). `output: 'static'` + `prerender = false` replaces "hybrid".
5. Data model: append-only, formula-free Votes tab (one atomic append per vote, no read-modify-write); Rugs derives Likes/Dislikes/Rating via header-cell `ARRAYFORMULA(COUNTIFS(Votes!…))` (test the formula and its interaction with append table detection before shipping). Because API writes never fire `onEdit`, the vote endpoint must invalidate the cache itself.
6. Quotas: plan on 60 reads + 60 writes/min (service account = one user); serve reads from the shared cache, back off 1/2/4 s (+ ≤1 s jitter) on 429 including POST; keep payloads ≤ 2 MB; schedule Votes archiving.
7. Apps Script: `contentType: 'application/json'`, a shared secret header, debounce edits, idempotent revalidate.
8. Row identity: scan column A now; add developer metadata with client-chosen `metadataId`s only if the owner reorders rows.
9. Before choosing a key-based design, confirm the studio's Google Cloud org allows service-account key creation and has no key-expiry policy.

Disagreements between the verifiers: (a) gaxios defaults — fact-check confirmed the "retries by default" claim, breakage hunt refuted it; the editor's re-fetch of `retry.ts` confirms the guard, so the breakage hunt wins and the fact-check's figures apply only once retries are enabled. (b) Caching — the fact-check called the report's recommendation "consistent with all verified facts" without examining the cache; the breakage hunt refuted the in-process cache; this brief follows the breakage hunt. (c) Node floor for googleapis@178 — fact-check reads the manifest (`>=18`), breakage hunt the changelog (BREAKING Node 22); both are true, plan for 22. (d) google-auth-library on Workers — fact-check: untested and unlikely; breakage hunt: node:crypto/http/https are supported so it may load; both agree only a test settles it.

## Open questions

- Does google-auth-library 11 (jws, node-fetch, https-proxy-agent, gcp-metadata) load and sign JWTs under Workers `nodejs_compat_v2`? The typed client is ruled out (http2); the auth lib alone needs an empirical test.
- Does Sheets accept a self-signed service-account JWT as Bearer? Unverifiable in Google's docs and service definitions; keep the token exchange.
- Does an ARRAYFORMULA column emitting `""` for blank rows change `values.append` table detection? Only community anecdotes; test on the real sheet (mitigated by keeping Votes formula-free).
- Is a `values.get` right after `values.append` guaranteed to see recalculated COUNTIFS? Only a 2017 blog measurement exists; no Google statement on read-after-write consistency for formulas.
- Price and effective date of the "later in 2026" overage billing are unpublished.
- Does googleapis-common 8.0.3 include the 9.0.4 path-traversal/injection fix? Not verified; matters if range strings ever derive from user input.
- When will @googleapis/sheets 14.1.0 publish (pulls googleapis-common 9 → auth-lib 11 → Node 22)?
- Does the studio's Google Cloud organization enforce `iam.disableServiceAccountKeyCreation` or `serviceAccountKeyExpiryHours`?
- Does the cache-miss path (RS256 sign + whole-catalogue batchGet parse) exceed Cloudflare Free's 10 ms CPU? Inference only.
- google-spreadsheet 5.x `{ token }` mode on edge runtimes, and Astro live collections' stability wording — both undocumented/unchecked.

## Verification notes

- Fact-check (a96e8e9b…): 59 verdicts (44 findings + 15 snippets) — 58 confirmed, 1 refuted, 0 unverifiable; 12 additional findings merged. Live probes: unauthenticated reads → 403 PERMISSION_DENIED; bogus jwt-bearer assertion → 400 invalid_request.
- Breakage hunt (a1b82b28…): 13 verdicts — 10 confirmed, 2 refuted, 1 unverifiable; 20 additional findings merged (Apps Script trigger/CSRF behaviour, Astro 7 cache API, host limits, org policies, parser traps).
- Editor re-verification (2026-09-05): fetched gaxios `retry.ts` and confirmed the `if (!err || !err.config || (!config && !err.config.retry))` guard and the first-retry-only `retryDelay` line, resolving disagreement (a) above.
- Refuted claims and their corrections:
  1. "google-auth-library README: 'This is a server-side library with no documented browser or edge/Workers support'" — quote does not exist; replaced by the googleapis-common `node:http2` import + Cloudflare stub evidence (https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/nodejs-googleapis-common/src/http2.ts).
  2. "gaxios retries by default 3 times … POST not retried" — retries only run with `retry: true` / `retryConfig`; typed clients enable them via googleapis-common, the token exchange via `AuthClient.RETRY_CONFIG`, raw `authClient.fetch` not at all (https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/gaxios/src/retry.ts).
  3. "Serve from an in-process TTL cache (≈60 s) with `/api/revalidate`, deployed on Vercel/Netlify Node functions or self-hosted Node" — per-process only; replaced by Astro 7 route cache + provider, or platform shared caches (https://docs.astro.build/en/guides/caching/).
- Kept as unverified: self-signed JWT support for Sheets; 2017 recalculation measurements; googleapis-common 8.0.3 security-fix status; Astro live-collection stability wording; the researcher's inferences (service account = one quota user; concurrent-append serialization; Votes recalculation cost; Workers CPU budget) are labelled as inference where they appear.
