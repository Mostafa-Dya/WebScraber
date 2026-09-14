# ADR — Serio Ludere catalogue: Astro + Google Sheets (two-way)

|            |                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | **Proposed — revision 2, Phase 1 checkpoint** (r1 was reviewed through four adversarial lenses; the 57 findings and their judge verdicts are summarised in §7)                                       |
| Date       | 2026-09-06 (research 2026-09-05)                                                                                                                                                                     |
| Author     | Claude (Fable 5.1) for Ramez                                                                                                                                                                         |
| Supersedes | `reference/catalogue.html` (vanilla HTML + JSONP to Apps Script)                                                                                                                                     |
| Evidence   | 7 topic briefs in `docs/research/` (each = 1 researcher + 2 independent verifiers against live docs), 8 gap reports + 8 fact-checks in `docs/research/gaps/` (summarised in `docs/research/gaps.md`) |

## 1. Context

The studio publishes a rug catalogue from a Google Sheet. Today a single HTML file calls a Google
Apps Script web app over JSONP with a shared secret embedded in the page, renders cards with
string templating, and fire-and-forgets "save" events back to the script. We are rebuilding it as
an Astro project with a Google Sheet as CMS + database, server-side data access only, typed
endpoints, like **and** dislike votes, a rating derived in the sheet, and cache invalidation driven
by sheet edits. Visual design must not change.

Two facts discovered during research reshape the brief's assumptions and are worth stating up front:

1. **Astro is at 7.3.1, not 5.x.** It ships a first-party route cache (`memoryCache()`, tags,
   `context.cache.invalidate`) and `output: 'hybrid'` no longer exists.
2. **Only a single long-lived Node process makes the brief's in-process TTL cache, `bust()`,
   per-visitor rate limiter and last-good fallback exact.** On Vercel, Netlify and Cloudflare every
   instance has its own memory, so a revalidate call clears only the instance that received it.
   The host choice is therefore the first decision, not the last.

## 2. Reference inventory — behaviours that must survive the port

| #   | Behaviour in `reference/catalogue.html`                                                                                                                                                                                  | Lines                   | Port target                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R1  | Design tokens (`--paper`, `--paper-deep`, `--ink`, `--ink-soft`, `--rule`, `--accent`, `--green`, Inter + JetBrains Mono)                                                                                                | 11–16                   | `src/styles/tokens.css`, unchanged                                                                                        |
| R2  | Reset + body (`box-sizing`, `line-height:1.5`, antialiasing)                                                                                                                                                             | 17–18                   | `src/styles/global.css`                                                                                                   |
| R3  | Header: masthead (inline SVG wordmark `viewBox 0 0 14371 1528`, `aspect-ratio:14371/1528`, `clamp(220px,30vw,340px)`), eyebrow "Catalogue", controls                                                                     | 20–24, 71–85            | `Header.astro`, `Wordmark.astro`                                                                                          |
| R4  | Unit toggle cm/ft (`.toggle button.on`), currency `<select class="cur">` over USD MXN CAD EUR AED SAR; conversion happens in the browser                                                                                 | 26–29, 76–83, 133–137   | `Controls.astro` (island); rates + symbols embedded in the page as JSON (D12)                                             |
| R5  | Collection `<nav>` tabs with per-tab counts (`.n`), active = `--accent` underline; ordering `Classics, Gabbeh, Modern, Kilims, Tulu, Wabi Sabi, Signed, More`, then others A→Z; tabs are buttons that filter client-side | 31–35, 106, 157–168     | `CollectionNav.astro`; ordering becomes `Collections.sort_order` data seeded with the reference order (D12)               |
| R6  | Grid `repeat(auto-fill,minmax(230px,1fr))`, gap `34px 24px`, main padding `34px 5vw 70px`                                                                                                                                | 37–38                   | `RugGrid.astro`                                                                                                           |
| R7  | Card: 3:4 photo box, `object-fit:contain`, drop shadow, "photo to come" hatched placeholder hidden once `img.loaded`                                                                                                     | 39–47                   | `RugCard.astro`, `RugPhoto.astro`                                                                                         |
| R8  | Rotate: `data-rot="force                                                                                                                                                                                                 | 1                       | 0"`; on load add `.rot`when`force`, or when `1`and`naturalWidth > naturalHeight`; `.rot` box = 133.333% × 75% rotated 90° | 48–51, 199–212 | `RugPhoto.astro` + one bundled client module; pure decision fn in `src/lib/rotate.ts` (tested) |
| R9  | ❤ save button, `aria-pressed`, `aria-label="Save <name>"`, `--accent` when on, **toggles** (un-save), persisted in `localStorage["sl-saved"]`, POSTed with `client` from `?c=`                                           | 52–56, 187–193, 214–221 | `VoteButtons.astro` (like + new dislike in the same `.like` idiom), `POST /api/vote`                                      |
| R10 | Meta list `dims · material · age · origin` (mono 11.5px), name 14px/500, price green mono 13.5px/600                                                                                                                     | 58–60, 175–182          | `RugCard.astro`                                                                                                           |
| R11 | `ftIn(cm)` (floor feet, round inches, carry 12→+1') and `money(usd)` (`SYM[cur] + Math.round(v).toLocaleString()`; symbols `"AED "`/`"SAR "` carry a trailing space)                                                     | 127–137                 | `src/lib/units.ts`, `src/lib/currency.ts` (ported verbatim, tested); `Rates.symbol` is **never trimmed**                  |
| R12 | Loading / empty / error state text in `.state`                                                                                                                                                                           | 62, 146–154             | `RugGrid.astro` states                                                                                                    |
| R13 | Footer links (site, Instagram, WhatsApp, mail, © year)                                                                                                                                                                   | 63–66, 90–96            | `Footer.astro` (year rendered server-side)                                                                                |
| R14 | `<meta name="robots" content="noindex, nofollow">`, Google Fonts preconnect + stylesheet                                                                                                                                 | 6–9                     | `Layout.astro`                                                                                                            |
| R15 | `?c=` client id is read on every page load (no persistence in the reference)                                                                                                                                             | 101                     | read from the URL by the vote island; URL wins over a remembered value (D12)                                              |
| R16 | Unit/currency choices are not persisted in the reference; the brief asks for `localStorage` keys `sl-unit`, `sl-cur`                                                                                                     | —                       | `Controls.astro` persists both and restores them on load (D12)                                                            |

New UI required by the brief, styled in the same idiom: a 👎 dislike button next to ❤ (same `.like` pill, `aria-pressed`,
`--accent` when on) and a rating line in the mono `.meta` style (`4.6 · 23 votes`, hidden when there are no votes).

Things the reference does that we deliberately drop: JSONP `call()` (99–125), `esc()` (138),
client-side `RATES`/`SYM` constants (104–105, replaced by the `Rates` tab), the shipped `SECRET`.

## 3. What the data actually looks like today (inspected 2026-09-05)

### 3.1 Legacy endpoint output (`action=list_catalogue`, read once, saved as `reference/live_catalogue.2026-09-05.json`)

- `{ ok, count, rugs[] }`, 20 rugs, fields: `id, name, collection, material, width, length, age, origin, method, tags, rotate, price, photos`.
- `tags` is a **comma**-separated string (the brief wants pipe-separated in the new sheet).
- `rotate` is `false` or the string `"force"` (no `true` observed).
- `photos` is `[]` for 14 rugs; the other 6 use `https://drive.google.com/thumbnail?id=<fileId>&sz=w800`.
- `width`/`length` are numbers; rows whose sheet cell holds `"238x74"` arrive as `0`, so 8 rugs show no dimensions.
- Collections present: `Kilims 8, Classics 4, Modern 2, Tulu 2, Gabbeh 1, More 1, Wabi-sabi 1, Kilim 1`.
  Two of these are spelling variants (`Wabi-sabi` ≠ `Wabi Sabi` in the reference ORDER list; `Kilim` ≠ `Kilims`), so the
  reference page currently shows **two extra tabs**. Normalise at import time (D10.5).
- IDs mix `SL-0xx`, supplier numbers (`1389`, `363242` — **eight ids are numeric-looking**, which matters for typed reads, D4)
  and a slug generated from the name when the id cell is blank (`people-antique-oushak-runner`). A row literally named
  `Test // testing` is published.
- Strings are untrimmed (`"Hand-Woven "`, `"Denizli, Turkey "`); `age` has a typo (`Anitque`).
- The endpoint enforces the secret (`{"ok":false,"error":"unauthorized"}` without it) and answers `action=ping`.
  There is no CORS; the reference only ever used JSONP + `no-cors` POST. Its `save` action **writes into the studio's
  operations workbook** with visitor-controlled strings, gated only by the leaked secret (D9).

### 3.2 The studio's real workbook ("Stock")

The legacy script reads the studio's private operations workbook (owned by the studio's operations lead, not by
`hello@serioludere.com`). Its inventory tab carries the public rug fields (id, name, `html collection`, tags, material,
width, length, method, age, origin, retail price, description) **alongside cost, markup and supplier columns**. Only rows
with a non-empty `html collection` are published today. The workbook also holds the reference's `save`/`unsave` log
(four test rows, all `anon`), a `filters` wishlist tab and a `Collection / Subcollection` tab.

**It must not become the public site's database and no site credential may be able to read it.** Nothing from the private
columns is copied into this repository, and `scripts/init-sheet.ts` never opens it (§3.3).

### 3.3 The new sheet and the cut-over

A fresh, empty spreadsheet **"Catalog Database"** (owner `hello@serioludere.com`, created 2026-09-05,
id `1IL99sIGvRTG_prFcNkHpb5inLIszueew9R-gBDVGpGA` — configuration, not a secret, see D9) exists in the studio's Drive.
It matches the brief's intent (a dedicated CMS sheet with the §5 schema). Decisions:

- It is `GOOGLE_SHEET_ID`; `scripts/init-sheet.ts` creates the five tabs (idempotent, headers only if missing).
- **Seed is credential-free:** the 20 rugs are imported from the committed `reference/live_catalogue.2026-09-05.json`
  (public data; `Test // testing` becomes `draft`). `description` is left blank; if the owner wants the supplier descriptions,
  they export `id, Description` from Stock to a CSV once and run `npm run seed:merge -- file.csv`. Demo rugs are not seeded.
- **After the import, Catalog Database is the only source of truth.** Stock's `html collection` column stops publishing; the
  owner maintains rugs in the new sheet (README: "add a product in under two minutes"). The four-row legacy `save` log is not migrated.
- Ownership: the Google Cloud project, service account, bound Apps Script and hosting account are created under
  `hello@serioludere.com` (or a studio-controlled billing identity), never under the developer's personal accounts.

### 3.4 Column mapping (legacy JSON → new `Rugs` tab)

| Legacy field                 | New column                                 | Transform                                                                                         |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `id`                         | `id`                                       | `String(id).trim()`; blank → slug of name (same rule the legacy script used); written as **text** |
| —                            | `slug`                                     | `slugify(name)`; de-duplicated with `-2`, `-3`                                                    |
| `name`                       | `name`                                     | trim                                                                                              |
| —                            | `description`                              | blank (optional owner CSV merge, §3.3)                                                            |
| `collection`                 | `collection`                               | trim + canonicalise (`Wabi-sabi`→`Wabi Sabi`, `Kilim`→`Kilims`)                                   |
| `tags` (comma string)        | `tags`                                     | split on `,`, trim, dedupe case-insensitively, join with `\|`                                     |
| `photos[]`                   | `photos`                                   | reduce every Drive URL to its file id (D6), join with `\|`                                        |
| `width`, `length`            | `width_cm`, `length_cm`                    | numbers; `0`/blank → empty cell (not 0) so "no dims" stays honest                                 |
| `material`, `age`, `origin`  | same                                       | trim; `Anitque`→`Antique`                                                                         |
| `method`                     | `method` (**extra column, appended last**) | trim; D10.1                                                                                       |
| `price`                      | `price_usd`                                | number                                                                                            |
| `rotate` (`false`/`"force"`) | `rotate`                                   | `force` / `true` / `false`                                                                        |
| —                            | `featured`                                 | `FALSE`                                                                                           |
| —                            | `status`                                   | `active`, except `Test // testing` → `draft`                                                      |
| —                            | `likes`, `dislikes`, `rating`              | formula-owned, see D4                                                                             |
| —                            | `created_at`, `updated_at`                 | ISO timestamps at import                                                                          |

Owner-added rows get read-time defaults so "add a row and it appears" holds: blank `slug` → slugified name, blank `status` →
`active`, blank `featured` → `FALSE`, blank timestamps → ignored, blank `rotate` → `false`.
`Collections` is seeded with the eight reference names (`sort_order` 1–8) plus any other collection found in the import;
`Tags` is seeded from the distinct tags of the imported rugs (`slug` = slugified name, `color` blank).

## 4. Decisions

### D1 — Astro 7.3.1, `output: 'server'`, Node 24

**Facts (verified, `docs/research/astro-core.md`):** current stable is astro 7.3.1 (2026-09-03), engines `node >=22.12.0`;
security floor `>=7.2.8` (AVIF RCE in the default sharp service, GHSA-26w7-cxv4-gfx2) and 7.3.0 shipped an `astro:assets`
regression fixed in 7.3.1. `output` is `'static' | 'server'`; per-route `export const prerender` flips either way.
Route caching is stable core since 7.0.0: `cache: { provider: memoryCache() }`, `context.cache.set({ maxAge, swr, tags })`,
`context.cache.invalidate({ tags })`. `memoryCache()` is per-process, GET-only, never stores `Set-Cookie` responses, is inert
in `astro dev`, and `invalidate()` throws without a provider. A cache HIT bypasses middleware (medium confidence, inferred from
source — verified in Phase 2, §8). `astro:env` is stable (`envField.string({ context:'server', access:'secret' })`).
`security.checkOrigin` ignores JSON POSTs, so `/api/revalidate` and `/api/vote` need their own checks. Node 24 is Active LTS
(EOL 2028-04-30); every host defaults to 24.

**Decision:**

- `astro@7.3.1` pinned exactly (renovate floor `>=7.3.1`), `@astrojs/node@11.1.5` `mode: 'standalone'`, Node **24**
  (`engines.node: ">=24.16.0 <25"`, `.nvmrc` `24.20.0`, Docker `node:24-bookworm-slim`).
- `output: 'server'`: every catalogue page is **rendered on demand from the cached snapshot (D5)**; the sheet is read at most
  once per TTL or revalidation, never per request. `/api/*` are ordinary on-demand endpoints.
- `cache: { provider: memoryCache({ query: { exclude: ['collection', 'c'] } }) }` with tag `sheet` on `/`, `/rugs/[slug]`,
  `/tags/[slug]`, `GET /api/catalogue` (`maxAge: 60, swr: 60` — a shorter stale window than the original 600 s: renders come from memory, so a synchronous miss is cheap, and it bounds how long another visitor can see a previous count at data TTL + route age + one stale serve, about three minutes); vote, revalidate and health responses are `no-store`.
- `GET /api/catalogue` DTO: active rugs only with their public fields plus `likes`, `dislikes`, `rating`; collections; tags;
  rates. Never vote state, hashes, user agents or client ids (they live in a separate in-memory structure, D8).
- `session: false` (no login), `compressHTML: true` (Astro 7's new `'jsx'` default strips whitespace between inline elements and
  would break pixel parity), `bodySizeLimit: 64 * 1024` (bytes — `@astrojs/node` 11 types it as a number). `security.allowedDomains` is **not** set: it is build-time
  configuration, the image is built once with placeholder values and configured per environment through `SITE_URL`, so Host validation
  is left to the platform edge (§8 item 8).
- Secrets only via `astro:env` server/secret fields with `env.validateSecrets: true`; `getSecret()` for optional ones; dummy values in CI.
- Client scripts: bundled `<script>` modules with `querySelectorAll` + data attributes; **no `define:vars`** (past XSS surface),
  no inline `onerror=`, never spread sheet objects onto elements. That discipline makes a real CSP achievable: `security.csp`
  (stable since Astro 6) with `script-src 'self'`, `style-src 'self' fonts.googleapis.com`, `font-src fonts.gstatic.com`,
  `img-src 'self' lh3.googleusercontent.com data:`, plus `X-Content-Type-Options: nosniff`. **Implemented (2026-09-06):** `security.csp`
  in `astro.config.mjs` with `directives`, `styleDirective.resources` (fonts.googleapis.com) and `scriptDirective.hashes` holding the
  SHA-256 of `src/scripts/prepaint.js`, computed from the file at build time; Astro hashes its own inlined modules and scoped styles.
  The Node adapter sends it as a `Content-Security-Policy` response header (verified on the built server), and `src/middleware.ts`
  adds `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` and `nosniff`. Shiki's CSP warning at build time is moot (no code blocks).

### D2 — Deployment target: Node standalone in a container on an always-on host (DigitalOcean App Platform recommended)

**Facts (verified, `cache-invalidation.md`, gap `deploy-target-conflict` + fact-check):** Vercel Hobby is contractually
non-commercial ("advertising the sale of a product" is commercial; Pro is $20/seat/month); tag purge on Vercel is soft
(`invalidateByTag` serves stale once; `dangerouslyDeleteByTag` needed); ISR must exclude `/api`. Netlify Free is a 300-credit hard
cap that pauses **all** sites at 0 (15 credits per production deploy, 20 per GB), purge is limited to 2 per tag per 5 s, functions
are per-instance. Cloudflare Workers Free gives 10 ms CPU per request, runs workerd (no sharp; the typed Google clients import
`node:http2`, a non-functional stub). Always-on Node 24 containers as one instance by default: Railway Hobby $5/month flat with 5 GB
volumes (but Railway staff state that commercial services are a Pro workload at $20, and a volume-backed service cannot use
replicas and has a short outage on every deploy); DigitalOcean App Platform `apps-s-1vcpu-0.5gb` $5 (`instance_count` default 1,
automatic HTTPS, no spin-down, no hobby-versus-commercial distinction, **no persistent disk**); Render Starter $7 (persistent disk
available; brief downtime on deploys with a disk); Hetzner CX23 + Coolify ≈ €6 (self-managed OS); Fly.io ≈ $2–3 but defaults to two
Machines that stop when idle.

**Decision:** `@astrojs/node` standalone in a `node:24-bookworm-slim` Docker image, one replica, on **DigitalOcean App
Platform** ($5/month). Rationale in five lines: it is the only class of host where the brief's mandated in-process cache,
`bust()`, per-visitor rate limit and last-good fallback are exact; Google's Node SDKs run on a real Node runtime; there is no CDN
purge SDK to plumb; deploys come straight from the Git repository; the owner's ops burden is a dashboard, not a server.
Accepted trade-off: no persistent disk, so the last-good snapshot lives in memory (rebuilt from the sheet at boot; after a deploy
the first request must reach Google, otherwise the reference's error text shows), and the Phase-6 image mirror would use DO Spaces
or a host with a volume. Deploys replace the container; in-memory state (rate-limit buckets, vote-state map) is rebuilt, which the
design tolerates. Alternatives at the same price class: Railway (Pro $20 for a commercial site; volumes), Render Starter ($7 +
disk), Hetzner + Coolify (≈ €6, someone must patch the server). Portability is preserved: the adapter and cache provider are the
only host-specific lines (Vercel Pro → `cacheVercel()` + `dangerouslyDeleteByTag`; Netlify Personal → `cacheNetlify()` +
`purgeCache`; both would additionally need Netlify Blobs / Upstash for vote state). **Needs the owner's confirmation (§6).**

### D3 — Data backend: direct Sheets API from the server; Apps Script only as the edit notifier

**Facts (verified, `sheets-api.md`, `apps-script.md`, gaps `sheets-client-choice`, `keyless-sheets-auth`,
`apps-script-anonymous-deploy`):** Sheets API v4 quotas are 300 reads + 300 writes/min/project and **60 + 60 per user per
minute**; a service account is one user; no daily cap; overage billing is "planned later in 2026". `values:batchGet` reads every
tab in one request (repeated `ranges=` params — the auth library's `params` helper comma-joins arrays, so the query string is built
by hand; `valueRenderOption=UNFORMATTED_VALUE` returns numbers, the default `FORMATTED_VALUE` returns locale strings;
`dateTimeRenderOption=FORMATTED_STRING` avoids serial dates). Blank cells arrive as `''`, trailing empty cells are omitted,
`values` is absent for an empty range. There is no atomic increment; only `spreadsheets.batchUpdate` is atomic per call.
Library facts: `googleapis@178` is 213 MB and pins `google-auth-library@10.5.0` (installing v11 beside it duplicates majors);
`@googleapis/sheets@14.0.0` inherits the same pin via googleapis-common 8.0.3; `google-spreadsheet@5.3.0`'s `getRows()` is
`FORMATTED_VALUE`-only, while its public `batchGetCellsInRange()` / `doc.sheetsApi` do forward render options (type cast needed
for `dateTimeRenderOption`), its ky retries cover GET by default and would replay POSTs on network errors if `post` were added;
`google-auth-library@11.0.2` (Node ≥22) `JWT` works alone, **scopes are mandatory** (without them it silently sends a self-signed
JWT) and gaxios retries are **opt-in**. Apps Script: an installable `onEdit` can call `UrlFetchApp`; the docs say "Script executions
and API requests don't cause triggers to run" for `onEdit`, while a reproducible community demonstration shows installable
`onChange` **does** fire for Sheets-API structural edits; a web app answers with a 302 hop, no HTTP status control, an unmeasured
latency (the only benchmark implies ≈0.5 s overhead per call) and a 30-simultaneous-executions cap. Org policy: Google Cloud
organisations created on/after 2024-05-03 block service-account key creation by default; leaked keys are auto-disabled. A stored
user OAuth refresh token (`UserRefreshClient`) is a host-agnostic keyless alternative, but the `spreadsheets` scope is
**account-wide**, an Internal consent screen only removes the 7-day Testing expiry, and the token is still revoked after 6 months
unused, past 100 tokens per client, or when an admin marks Sheets "Restricted" without trusting the app.

**Decision:**

- **Reads and writes go directly to the Sheets API from the Node server.** `src/lib/sheets/client.ts` = `google-auth-library@11.0.2`
  for the access token only (`JWT`, `scopes: ['https://www.googleapis.com/auth/spreadsheets']`), native `fetch` against the REST
  endpoints with a hand-built query string, and an explicit ~20-line retry: 429/503 only, 1/2/4 s + jitter, at most 3 attempts,
  **writes are never retried on network errors** (a replayed insert would double-count a vote). The trade-off with
  `google-spreadsheet` is stated plainly: it would give free GET retries and typed rows for two extra dependencies (ky, es-toolkit),
  but every call we need (`values:batchGet` with render options, `spreadsheets.batchUpdate` for the insert) is raw on either path,
  and its POST-replay hazard is the deciding factor. `googleapis` / `@googleapis/sheets` are excluded by the duplicate-auth-library pin.
- One `values:batchGet` per refresh: `Rugs!A1:V`, `Collections!A1:F`, `Tags!A1:D`, `Rates!A1:D`, and a **bounded window**
  `Votes!A2:G5001` (newest-first, used only to rebuild the visitor→rug state map, D4). Header rows are validated against the
  contract before any row is parsed; `''` → `undefined` before Zod.
- **Auth: the service-account key is the mode built in Phase 2.** The refresh-token mode is a documented recipe
  (`SHEET_SETUP.md`, implemented only if the owner's organisation blocks key creation) and, because the scope is account-wide, it
  may only be minted from a **dedicated least-privilege identity** (a `catalogue-bot@serioludere.com` user invited as Editor on
  Catalog Database and nothing else) — never from `hello@` or the operations lead's account. `invalid_grant` is treated as a failed
  refresh (last-good snapshot + owner alert, D5).
- **Containment:** the owner protects the `Rugs`, `Collections`, `Tags` and `Rates` tabs and the `Votes` header row (Data ›
  Protect sheets and ranges, editors = owner only). Sheets protections apply to API edits by non-permitted editors, so the service
  account can only insert into `Votes`; the Phase-2 spike verifies that `insertDimension` at row 2 of `Votes` still succeeds and
  that an `updateCells` on `Rugs` is refused. `Votes` rows and `VotesArchive` stay writable because `archive-votes.ts` needs them;
  the bound script's `refreshRates` runs as the owner and is unaffected by the protections.
- **The legacy Apps Script web app is retired.** A new bound script does two outbound-only jobs: `onEdit` → `POST /api/revalidate`
  (D5) and the optional `refreshRates` time trigger (D7). It never serves requests, so the "Anyone" deployment option and its
  admin-policy risks disappear. Its manifest pins `oauthScopes` to exactly `spreadsheets.currentonly`, `script.external_request`,
  `script.scriptapp`, because every Editor of the sheet can edit the bound script and its triggers run as the owner; anything
  needing wider scopes (backup copies, e-mail alerts) lives in a separate standalone script that editors cannot touch (D5).
- Fallback kept in the docs, not in the code path: if the owner can create neither a key nor a bot OAuth client, the
  `doPost` + `LockService` web app design from `docs/research/apps-script.md` becomes the writer (body-secret auth, `redirect:
'follow'`; note Node's `fetch` drops `Authorization` on the cross-origin 302).

### D4 — Votes: insert-only log, formula-owned counters, atomic `batchUpdate` insert

**Facts (verified, gap `counter-formula-vs-write` + fact-check):** concurrent `values.append` calls can overwrite each other
(Google's own engineer, 2016: "a known limitation of the append requests"; 2023–2026 field reports are consistent with it, though
most of them exercised client-side read-then-write); the same engineer named two workarounds: `insertDataOption=INSERT_ROWS`, or a
`batchUpdate` of `insertDimension` + `updateCells` "in one atomic unit". Read-modify-write of a counter cell costs an extra read and
write per vote and has a lost-update window. API writes trigger recalculation; read-after-write freshness of `COUNTIFS` is undocumented (one
2017 measurement) — eventually consistent within seconds. `RAW` / `stringValue` never parse formulas; `USER_ENTERED` would.
`batchUpdate` can return recalculated cells in the same call (`includeSpreadsheetInResponse` + `responseRanges`). Header-cell array
literals use `;` as the row separator in `en_US`-style locales and `\` in comma-decimal locales; `COUNTIFS` inside `ARRAYFORMULA`
with an array criterion is a documented pattern but was **not live-tested** by the research (§8). A spreadsheet holds 10 M cells.

**Decision:**

- **The site writes exactly one thing per vote: new row(s) at the top of `Votes`**, via `spreadsheets.batchUpdate` =
  `[insertDimension(ROWS, 1..n, inheritFromBefore:false), updateCells(rows 1..n, userEnteredValue.stringValue / numberValue)]`.
  Newest-first, atomic per call, no "find the last row" step, no formula parsing, 1 write-quota unit per vote.
  `insertDimension`/`updateCells` address the tab by numeric `sheetId`, not title, so `client.ts` resolves the `Votes` id once via
  `spreadsheets.get?fields=sheets.properties` (cached; re-resolved on a `sheetId` error, because a recreated tab gets a new random id).
  `values.append` (with `OVERWRITE` and with `INSERT_ROWS`) exists only inside the test harness (below), not as a production flag.
- **`likes` and `dislikes` are formula-owned, like `rating`.** Header-cell array formulas in `Rugs` count the log and its archive:
  `={"likes"; ARRAYFORMULA(IF(A2:A="","", COUNTIFS(Votes!B:B,A2:A,Votes!C:C,"like",Votes!G:G,"add") - COUNTIFS(Votes!B:B,A2:A,Votes!C:C,"like",Votes!G:G,"remove") + COUNTIFS(VotesArchive!B:B,A2:A,VotesArchive!C:C,"like",VotesArchive!G:G,"add") - COUNTIFS(VotesArchive!B:B,A2:A,VotesArchive!C:C,"like",VotesArchive!G:G,"remove")))}`
  (same for `dislikes`), and `rating` keeps the brief's formula as an array formula so a human-added row needs no copying:
  `={"rating"; ARRAYFORMULA(IF(A2:A="","", IF(Q2:Q+R2:R=0, 0, ROUND(Q2:Q/(Q2:Q+R2:R)*5, 2))))}`.
  Runtime code never writes Q, R or S. **One-time exception (D10.8):** `init-sheet.ts` installs these three header formulas with
  `valueInputOption=USER_ENTERED` (everything else it writes is `RAW`), first reading `spreadsheets.get?fields=properties.locale`
  and refusing to proceed unless the locale uses `.` as the decimal separator (comma-decimal locales change the function-argument
  separator to `;` and the array column separator to `\`, which would break the formula text; documented: set the sheet locale to
  `United States` / `United Kingdom`). It then protects `Q1:S` (warning-only) so a paste cannot turn the columns into `#REF!`,
  and asserts that `Q1` reads back as exactly `likes`.
- **Ids are text.** `init-sheet.ts` sets number format `@` on `Rugs!A:A` and `Votes!B:B` and writes ids as strings; the schema is
  `id: z.preprocess(v => v === '' ? undefined : String(v).trim(), z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))` (no `*`, `?`, `=`,
  `<`, `>` — `COUNTIFS` would treat them as patterns). The concurrency test uses a numeric-looking id such as `1389`.
- `Votes` gains a seventh column **`action` = `add | remove`** so the reference's toggle (un-save) survives: like on an already-liked
  rug inserts `like/remove`; like on a disliked rug inserts `dislike/remove` + `like/add` in one atomic batch.
- One vote per rug per visitor is enforced from the **in-memory vote-state map** (keyed by the visitor id from the cookie, D8),
  rebuilt from the bounded `Votes` window on every refresh and updated in place on every write.
- **Duplicate-request race:** the per-(visitor, rug) check and the state update happen synchronously before the first `await`, with an
  in-flight guard per (visitor, rug), so N parallel requests from one visitor produce one row; a Vitest case fires 10 parallel
  same-visitor votes against a mocked client and asserts a single insert.
- **No cache bust on a vote.** The write applies its delta to the in-memory snapshot (counts + state map) and the response
  `{ ok, rugId, state: 'liked' | 'disliked' | 'none', likes, dislikes, rating }` is computed from it; the 60 s TTL reconciles with the
  sheet's own COUNTIFS (optionally the same `batchUpdate` reads the rug's `Q:S` back via `responseRanges`). Apps Script triggers do
  not fire for API writes, so nothing else has to happen. HTTP statuses: 200 add/flip/remove, 400 bad input, 429 with `Retry-After`,
  503 when the sheet write fails (the client keeps its previous state).
- **Verification before shipping (Phase 5):** an opt-in integration test fires 25 concurrent votes at a scratch sheet and asserts
  exactly 25 new rows and `likes == 25` after a short poll, for three writers: `append+OVERWRITE` (expected loss),
  `append+INSERT_ROWS` (expected pass, forum-level endorsement) and `batchUpdate insertDimension+updateCells` (expected pass,
  documented per-call atomicity). The result is recorded in `docs/research/gaps.md`; if `INSERT_ROWS` passes it is the simpler
  default and needs no `sheetId` lookup.
- Housekeeping: `scripts/archive-votes.ts` **copies** to `VotesArchive`, then deletes from `Votes`, the rows older than N months that are
  **superseded** — a newer row exists for the same (`visitor_hash`, `rug_id`, `vote`) — so the newest row per triple, which encodes the
  visitor's current state, always stays inside the 5 000-row read window; the formulas above sum both tabs, so counts never change. Growth is bounded by D8's limits and a
  circuit breaker: above 200 000 `Votes` rows the endpoint answers 503 and the health endpoint flags it. The breaker input is the
  `Votes` grid row count from the spreadsheet metadata, which includes the tab's ~1 000 default blank rows, so it trips at roughly
  199 000 votes and falls back after `votes:archive` deletes rows; a failing metadata read keeps the last known count and is logged.

### D5 — Cache layer, failure policy, invalidation and monitoring

**Facts (verified, `cache-invalidation.md`, `apps-script.md`):** see D1 for route-cache semantics. Apps Script installable `onEdit`
runs only for human edits, must send `contentType: 'application/json'` (Astro's CSRF check 403s form-encoded POSTs),
`timeBased().after(ms)` guarantees only a minimum delay, fired one-shot triggers should be deleted (20 triggers/user/script), Script
Properties are readable by every Editor of the sheet, consumer quotas are 20 000 UrlFetch calls/day and 90 min trigger runtime/day
(Workspace: 100 000 / 6 h).

**Decision — two layers, one process:**

1. **Data cache** `src/lib/sheets/cache.ts`: one in-memory snapshot of the parsed, validated catalogue with per-tab accessors
   (`rugs()`, `collections()`, `tags()`, `rates()`; vote state is held separately, D8); TTL `SHEETS_CACHE_TTL` (default 60 s);
   single-flight refresh; **stale-if-error**; `bust()`. Where the host offers a volume the last good snapshot is also written to
   `DATA_DIR/catalogue.json`, validated with the same Zod schema on boot and ignored if invalid.
2. **Failure policy** (the "fails loudly" and "never blank" promises reconciled): a header mismatch, a Google error, or more than
   10 % of rows failing validation **rejects the whole refresh** — the last good snapshot keeps serving, the error is recorded
   (`lastError`) and surfaced (item 5). A single bad row (`price_usd` = "ask", `rotate` = "yes") is **dropped** and logged with row
   number and column; rows with a blank `id` are ignored before validation. Only at boot with no snapshot at all does the page show
   the reference's error text.
3. **Route cache** (Astro `memoryCache()`, tag `sheet`) in front of the HTML/JSON so a page render costs nothing between refreshes.
4. `POST /api/revalidate` (`Authorization: Bearer <REVALIDATE_SECRET>` compared with `crypto.timingSafeEqual`; JSON body
   `{ source }`; idempotent): `bust()` then `if (cache.enabled) await cache.invalidate({ tags: ['sheet'] })`. Because the secret is
   readable by sheet editors it is **low-trust**: busts within 4 s of the previous one return 202 without scheduling another read
   (≤ 15 effective busts/min, well inside the 60 reads/min quota; the notifier re-arms its trailing trigger outside this window), unauthenticated attempts are capped per IP with a constant 401 body, and only `source` + a hashed IP are logged.
5. `GET /api/health` (`no-store`, unauthenticated, no secrets): `{ ok, lastRefreshOk, snapshotAgeSec, lastError,
rowsDropped, dropped, rowsWarned, warnings, votesRowsRead, votesRowsTotal, voteStateTruncated, photosChecked, photosCheckedAt,
photosFailing, photosFailingRugs, ratesOldestUpdatedAt, secretsOk, uptimeSec, rugs }` (implemented shape). `photosFailing` comes
   from a background HEAD sweep of every active rug's first photo, at most every 10 minutes after a refresh, so the health call itself
   never fans out to lh3; `votesRowsTotal` is the `Votes` grid's row count from the spreadsheet metadata (the breaker input). A **standalone** Apps Script owned by the owner (not bound to the sheet, so sheet Editors
   cannot edit it; scopes `script.external_request` + `script.send_mail` only) runs a 6-hourly trigger that calls it and emails the
   owner (`MailApp`) when `lastRefreshOk` is false or the snapshot is older than 6 hours, naming the failing rug rows or photos. This
   is the only channel through which a dead credential, a renamed column or a blocked `UrlFetch` becomes visible to a non-technical owner.
6. **Apps Script notifier** (`google-apps-script/onEdit.gs`): installable `onEdit` installed from the owner's account, filtered to
   the four content tabs (**never install `onChange`** — it can fire for API writes and would turn every vote into a revalidate;
   `SHEET_SETUP.md` says so), coalescing bursts with a Script-Properties timestamp (direct POST at
   most every 15 s plus one trailing one-shot trigger so the last edit of a paste is never lost; the trigger id and a timestamp are
   recorded so a stale flag cannot block re-arming, and the trailing run re-arms itself when it would land inside the server's 4 s
   coalescing window; the script lock is held only around the decide-and-stamp step, `UrlFetchApp` runs with `followRedirects: false`,
   a 20 s timeout and an https-only `SITE_URL` unless `LOCAL_DEV=1`; non-2xx answers are logged as warnings and reset the throttle),
   `contentType: 'application/json'`, `runtimeVersion: "V8"`, `ScriptApp.requireAllScopes()`. `everyMinutes(1)` remains a documented
   fallback if the owner's tenant restricts triggers.
7. **Backup:** Google Sheets version history is the owner's undo; the same standalone script's weekly trigger copies the
   spreadsheet (`DriveApp.makeCopy`, which needs the `drive` scope — exactly why it must not live in the bound script) into a
   `Catalogue backups` folder with 8-week retention.
8. Portability table (documented, not built): Vercel Pro → `cacheVercel()` + `dangerouslyDeleteByTag('sheet')`; Netlify →
   `cacheNetlify()` + `purgeCache({ tags: ['sheet'] })` (2 purges per tag per 5 s); Cloudflare → `cacheCloudflare()` + zone purge.
   In all three the data cache becomes per-instance and vote state must move to Netlify Blobs / Upstash (`docs/research/gaps.md` §2).

### D6 — Images: Drive stays the inbox, `lh3` URLs today, a server-side mirror as hardening

**Facts (verified live on the studio's own photo ids, `images.md`, gaps `drive-hotlink-reliability`, `image-endpoint-allowlist`):**
`https://lh3.googleusercontent.com/d/<id>=w<px>` returns 200 `image/jpeg` directly (no redirect, `Access-Control-Allow-Origin: *`,
`Cache-Control: private, max-age=86400`, ETag with 304 revalidation, WebP via `-rw`, never upscales); `drive.google.com/thumbnail?id=…`
is a 302 to the same URL; `uc?export=view` is 403 for a browser `<img>`. The pattern is **undocumented**; Drive thumbnail access changed
without notice in 2025-10; throttling evidence is thin (one 2024 anecdote about 10+ thumbnails per page, late-2025 403/429 reports on
`uc?export=view`) and a 45-request probe was clean; files must be shared "Anyone with the link" and one Workspace admin toggle revokes
that for every file. Astro `<Image>` with `image.domains: ['lh3.googleusercontent.com']` would make `/_image` a public decoder for
**any** Drive file; a custom `image.endpoint.entrypoint` can scope it but must validate the whole transform tuple. With no domains
configured, `/_image` answers 403 for every remote href.

**Decision:**

- The sheet stores Drive share URLs or bare file ids; `src/lib/images.ts#driveImageUrl(id, width)` is the **only** place that formats
  `https://lh3.googleusercontent.com/d/<id>=w<px>` (800 for cards, 1600 for the gallery). Ids are validated at parse time
  (`^[A-Za-z0-9_-]{20,}$`, from any Drive URL shape); invalid cells drop the photo with a logged warning. Never emit `/uc?export=view` or `/thumbnail`.
- **Phase 3 renders a plain `<img>`** (exactly like the reference: `object-fit: contain`, placeholder until `load`, rotate on
  `naturalWidth`), lazy + async decoding, capture-phase `error` fallback to the placeholder. Not Astro `<Image>`: the sheet has no
  pixel dimensions, `inferSize` would fetch on every render, lh3 already resizes, and an allow-listed `/_image` is an open proxy
  without extra code. `image.domains` stays empty so `/_image` refuses remote hrefs. **Deviation from the brief's "Astro `<Image>`
  where possible" — D10.4.**
- **Owner workflow** (`SHEET_SETUP.md`): one Drive folder "Catalogue photos" shared "Anyone with the link" once (inherited by its files);
  paste each file's share link into `photos`, `|` between photos, first photo is the card. `npm run check:photos` HEADs every photo id
  and prints the rows with non-200 answers; the same count is `photosFailing` in `/api/health`, so a forgotten share is diagnosed
  instead of silently showing "photo to come".
- **Phase 5/6 hardening — image mirror** (only on a host with a volume or object storage): on each catalogue refresh the server
  fetches every photo once (`=w1600`, keyless, `redirect: 'manual'`, `image/*` content type only, ≤ 15 MB) into `DATA_DIR/images/<id>.jpg`;
  `GET /img/<id>-<w>.jpg` serves resized copies (`w ∈ {800, 1600}`, `id` must exist in the current snapshot, files resolved through an
  internal map — never by joining request strings into paths; sharp `>=0.35.4` with `limitInputPixels: 30_000_000`) with
  `Cache-Control: public, max-age=31536000, immutable`; `driveImageUrl()` switches to the local path when the mirror has the file and
  falls back to lh3 otherwise. A nightly integrity job HEADs each mirrored id. If Drive still proves flaky, **ImageKit Free**
  (20 GB/month, Astro 7 integration) is the recommended host.
- If Astro `<Image>` is reintroduced later, it goes through a custom `image.endpoint.entrypoint` that validates the **whole**
  transform tuple (`href`, `w`, `h`, `f`, `q`, `fit`, `position`) against the sheet-derived allow-list before delegating to Astro's own
  endpoint (the delegate module differs per adapter), with `limitInputPixels` set because Astro's sharp service hardcodes `failOn: 'none'`.

### D7 — Currency rates: the `Rates` tab owns prices; an optional Apps Script trigger refreshes it from Frankfurter v2

**Facts (verified live, `fx-rates.md`):** Frankfurter **v2** (`https://api.frankfurter.dev/v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR`)
returns all five with no key, no quotas, commercial use allowed, no attribution; AED 3.6725 and SAR 3.75 are seeded pegs; v1 and
`providers=ECB` silently drop AED/SAR; an unknown code fails the whole request with 422. `open.er-api.com/v6/latest/USD` covers all
five, daily, but **requires an attribution link** on pages showing rates. exchangerate.host needs a key (100 req/month),
openexchangerates is USD-base-only on free, currencyapi's free tier is "Private Use". Live on 2026-09-05: MXN 16.92, CAD 1.38,
EUR 0.86 versus the reference constants 17.5 / 1.37 / 0.92 (3–7 % apart).

**Decision:**

- `Rates` tab exactly as the brief (`currency | rate_to_base | symbol | updated_at`), seeded with the reference values. The site reads
  it through the same cached batchGet; **no FX API is called at request time**; `symbol` is never trimmed (R11); `money()` is ported
  verbatim and runs in the browser (D12).
- **One refresher, owner-operable:** the bound script's `refreshRates` function (time trigger every 6 h, **off by default**) fetches
  Frankfurter v2, rejects future-dated or > 5-day-old rows and non-JSON bodies, and writes `rate_to_base` + `updated_at` only for the
  currencies listed in the `RATES_AUTO` Script Property (default `MXN,CAD,EUR`; AED and SAR stay pegged; removing a code pins it for
  manual editing), then POSTs `/api/revalidate` itself (script writes do not fire `onEdit`). `open.er-api` is a documented fallback
  only if the owner accepts the attribution link. No Node CLI duplicate. Whether to turn the trigger on is the owner's pricing
  decision (§6.5); at handover they are told the seeded values are the reference's, not today's market.

### D8 — Visitor identity, one-vote-per-rug, rate limiting, input validation

- **Identity = a server-issued cookie.** `POST /api/vote` mints `__Host-sl_v` (`sl_v` without the prefix or `Secure` when `SITE_URL` is http, i.e. local development — the server warns at
  boot when that happens with `NODE_ENV=production`; random 128-bit id; `HttpOnly; Secure; SameSite=Lax;
Path=/`; 1 year) when absent. The stored `visitor_hash` (Votes column E) is `HMAC-SHA256(VOTE_SALT, cookieId)` truncated to 32 hex
  chars; it keys the vote-state map. Clearing the cookie makes a new voter — accepted, the IP limiter is the backstop.
- **IP is used only for rate limiting and is never stored.** The client IP is host-specific: DigitalOcean App Platform puts it in
  `do-connecting-ip` while `x-forwarded-for` carries the ingress server, so `src/lib/ip.ts` reads the header named by
  `CLIENT_IP_HEADER` (**default empty**: a host header is trusted only when the operator names it, because on any other host a client
  could send `do-connecting-ip` itself; the last comma-separated value is taken) and otherwise `X-Forwarded-For` counted from the right:
  the `TRUSTED_PROXY_HOPS`-th entry from the end (default 1 — the value the trusted edge appended), or `undefined` (one shared limiter
  bucket) when the header has fewer entries than that. Astro's `clientAddress` is not used. The Phase-2 spike sends a
  spoofed `X-Forwarded-For` through the host's edge and asserts the spoofed and the real address are distinguishable (§8).
  `ip_hash = HMAC-SHA256(VOTE_SALT, ip)`.
- **Limits (in-process, exact on one instance):** 20 votes / 10 min per visitor id, 60 / 10 min per `ip_hash`, 10 votes per rug per
  hour per ip_hash, and a global 10 writes / min bucket (worst case 14 400 rows/day, ~100 days to the 10 M-cell ceiling even under
  attack, well under the 60-writes/min quota). Excess returns 429 with `Retry-After`.
- **Request validation:** `Content-Type: application/json` required; `Sec-Fetch-Site`, when present, must be `same-origin` or `none`
  (fallback: `Origin` must equal `SITE_URL`); the endpoint never sets `Access-Control-Allow-*`. Body schema:
  `rugId` must be in the current active-rug id set; `vote ∈ {like, dislike}`; `client` must match `^[A-Za-z0-9_-]{1,64}$` else `anon`.
  Stored `user_agent` is a coarse family string (browser + OS, ≤ 64 chars) derived server-side, not the raw header — less personal
  data and no injection surface. Every `Votes` cell is written as `userEnteredValue.stringValue`; an integration test writes `=1+1` and
  reads back the literal.
- **`?c=`** is read from the URL on each page load (R15), validated with the same regex, mirrored in `localStorage` for later visits;
  the URL always wins. It is not handled in middleware (cached GET pages cannot set cookies).
- **Client state:** `aria-pressed` on ❤ / 👎 is rendered from `localStorage` (`sl-saved`, now `{ [rugId]: 'liked' | 'disliked' }`)
  and reconciled with the `state` returned by `POST /api/vote`.
- **Privacy:** the site now sets a first-party identifier cookie and stores hashed visitor ids, coarse user agents and client ids in a
  sheet shared with studio staff. `README` and `SHEET_SETUP.md` state this plainly; `archive-votes.ts` retention (N months) is the
  deletion rule; nothing in `Votes` maps back to an IP.

### D9 — Secrets, the leaked `SECRET`, logging

- **Rotate now, not at launch (brief §8):** the reference ships `SECRET = "SL-view-9f3c81"` and the Apps Script URL to every visitor,
  and the legacy `save` action writes attacker-controlled strings into the studio's operations workbook. **Phase-0 owner action**
  (before Phase 2): redeploy the legacy script as a new version with the `save` action removed and a fresh `list_catalogue` secret
  (the currently published page keeps reading if it is updated with the new secret, or goes dark — owner's choice, D10.13), audit the
  Stock log tab for cells starting with `=`, `+`, `-`, `@`, and archive the deployment once the new site is live (date recorded here).
- New site: no Google credential ever reaches the browser. Server secrets via `astro:env`: `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_PRIVATE_KEY` (`\n`-escaped, normalised at read), `REVALIDATE_SECRET`, `VOTE_SALT` (and, only if the recipe is used,
  `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`). Runtime configuration: `GOOGLE_SHEET_ID`, `GOOGLE_AUTH_MODE`, `SITE_URL`,
  `DATA_DIR`, `SHEETS_CACHE_TTL`, `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`. **Implementation note (2026-09-06):** Astro inlines
  `access: 'public'` variables into the build (verified in `astro/dist/env/vite-plugin-env.js`), so a container built once and
  configured per environment must declare every runtime setting as `access: 'secret'` (read from the environment at runtime);
  the schema does that, and the Dockerfile's build stage supplies placeholder values for the two real secrets so
  `validateSecrets: true` can run at build. `.env.example` committed, `.env` ignored and excluded from the Docker build context.
- **Secrets validated at boot:** `REVALIDATE_SECRET` and `VOTE_SALT` are declared `envField.string({ context: 'server',
access: 'secret', min: 32 })` with `env.validateSecrets: true`, so the process refuses to start on a missing or short value (an
  empty bearer secret would otherwise compare equal to an empty header, and a short salt makes `ip_hash` brute-forceable);
  `/api/health` reports `secretsOk`.
- **Log redaction:** every log call in `src/lib/sheets/*` goes through `serializeError()` (allow-list: name, message, HTTP status,
  Google `code`/`status`); raw error objects are never logged. gaxios already redacts `Authorization` headers and token-exchange
  bodies by default, so this is defence in depth for our own `fetch` errors. A Vitest case builds a gaxios-style error containing
  `refresh_token=` and asserts the logged line does not contain it. The host's HTTP access logs still record raw client IPs (noted in
  the privacy text).
- Sharing: only the new sheet is shared with the service account (Editor, then protections per D3); the Stock workbook is never
  shared with any site credential; staff who only need to add rugs are added as Editors of Catalog Database, knowing that Editors can
  also read the bound script's Script Properties (hence the low-trust treatment of `REVALIDATE_SECRET`).

### D10 — Deviations from the brief (each with its reason)

1. **`method` column appended** to `Rugs` (column V) — the studio's data has it for every rug; appending keeps the brief's column letters.
2. **`likes`/`dislikes` are formula-owned; runtime code never writes them** (D4) — removes the only race in the system and halves write quota.
3. **`Votes` gains `action` (`add|remove`)** — needed for the reference's un-save toggle with an insert-only log.
4. **Plain `<img>` instead of Astro `<Image>`** for rug photos in Phase 3 (D6) — pixel parity, no dimensions in the sheet, open-proxy risk; the mirror is the upgrade path.
5. **Collection canonicalisation at import time, not runtime**, and **the ORDER list becomes `Collections.sort_order` data** seeded with the reference order — the sheet stays the single source of truth and the owner can reorder tabs; the code falls back to the reference ORDER list only when `Collections` is empty.
6. **`width_cm`/`length_cm` left blank instead of `0`** when unknown — the legacy `0` is an artefact of unparsed `"238x74"` cells.
7. **No `?c=` middleware cookie** — read per page load by the island, remembered in `localStorage` (route-cache constraint, D8).
8. **`init-sheet.ts` writes the three header formulas once with `USER_ENTERED`** — the only way to create them; runtime never touches Q:S.
9. **Apps Script coalescing at 15 s + trailing trigger instead of a 30 s debounce** — `after()` is only a minimum delay, so 30 s could miss the 1-minute freshness target. Server-side coalescing is 4 s (was 10 s): with the notifier's 15 s throttle a 10 s window could swallow the trailing notification.
10. **Write retries on 429/503 only, never on network errors** (brief: "429/5xx") — a replayed insert would double-count a vote.
11. **One snapshot with per-tab accessors instead of a cache keyed by tab** — one `batchGet` fetches all tabs; per-tab keys would add nothing.
12. **Service-account key is the only auth mode built in Phase 2**; the refresh-token recipe is documented for the blocked-key case — hedges the 2024-05-03 org policy without doubling the code.
13. **Legacy secret rotation is immediate and may take the old page dark** — the brief mandates rotation; keeping the old page alive requires the owner to paste the new secret into it.
14. **`user_agent` stores a coarse family string, not the raw header** — privacy and injection surface; the column keeps its name.
15. **Seed = the 20 published rugs from the committed JSON, not demo rugs** — demo rows would have to be deleted before launch.
16. **`update-rates.ts` CLI dropped; the Apps Script `refreshRates` trigger is the single refresher** — one implementation the owner can operate.

### D11 — Toolchain pins (all versions verified against the npm registry on 2026-09-05)

| Purpose           | Package                                                            | Version                        | Note                                                                                              |
| ----------------- | ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Framework         | `astro`                                                            | 7.3.1                          | floor 7.2.8 (sharp AVIF RCE), 7.3.0 broken                                                        |
| Adapter           | `@astrojs/node`                                                    | 11.1.5                         | `mode` is mandatory                                                                               |
| Image lib         | `sharp`                                                            | ≥0.35.4 (override)             | libheif fix; only used by the Phase-6 mirror                                                      |
| Types             | `typescript`                                                       | ~6.0.3                         | **7.0.2 is `latest` but has no JS API — `astro check`, typescript-eslint and Vitest break on it** |
| Type check        | `@astrojs/check`                                                   | 0.9.10                         | `astro check && astro build`                                                                      |
| Node types        | `@types/node`                                                      | ^24.13.3                       | TS 6 defaults `types: []` → add `"types": ["node"]`                                               |
| Tests             | `vitest` + `@vitest/coverage-v8`                                   | 5.0.0 (lockstep)               | smoke-test on day 1; fallback 4.1.11                                                              |
| Validation        | `zod`                                                              | ^4.5.4                         | `import * as z from 'zod'`; `z.stringbool()` for TRUE/FALSE cells; `''`→`undefined` preprocess    |
| Lint              | `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-astro` | 10.10.0, 10.0.1, 8.69.0, 3.1.0 | flat config; eslint-plugin-astro 3.1 declares Node `^24.16`                                       |
| Format            | `prettier`, `prettier-plugin-astro`                                | 3.9.6, 0.14.1                  | keep `compressHTML: true`                                                                         |
| Google auth       | `google-auth-library`                                              | 11.0.2                         | Node ≥22                                                                                          |
| Screenshots / E2E | `playwright`, `@playwright/test`                                   | 1.63.0                         | `npx playwright screenshot --full-page`                                                           |
| Scripts           | Node `--env-file` + type stripping                                 | Node 24                        | `tsx` 4.23.13 only as escape hatch                                                                |
| Runtime           | Node                                                               | `>=24.16.0 <25`                | workstation is 24.8.0 → developer prerequisite: install 24.20.0 (`nvm-windows` / `winget`)        |

### D12 — Page contract (what two engineers would otherwise build differently)

- **`/`**: all active rugs are rendered server-side into **one** cached page; the tabs are the reference's buttons that filter
  client-side (keyboard-navigable: arrow keys move focus, `Enter`/`Space` select, `aria-selected`); the active tab is written to
  `?collection=<slug>` with `history.replaceState` and honoured on load by the same script (default: first tab). The route cache
  ignores `collection` and `c` in its key. `prefers-reduced-motion` disables the placeholder/rotate transitions.
- **Collections and tags join:** rugs store display names; the runtime matches `Collections.name` / `Tags.name` case-insensitively
  after trim, ordering tabs by `sort_order` then A→Z; an unknown value still renders (raw string, slugified for URLs). `/tags/[slug]`
  matches `Tags.slug`, falling back to slugified names; `/rugs/[slug]` matches `Rugs.slug` (404 for `draft`/`archived`).
- **Currency in the browser (R4):** the page embeds `{ rates: { USD:1, MXN:…, … }, symbols: { … } }` from the `Rates` tab as a
  `<script type="application/json">` block (public data; `<`, `>`, `&`, U+2028 and U+2029 are escaped as `\uXXXX` because
  `JSON.stringify` does not neutralise `</script>` and the editor-controlled `symbol` passes through this sink), so `money()` runs
  client-side exactly as in the reference; the server renders
  USD first, and the island re-renders on change and restores `sl-unit`/`sl-cur` from `localStorage` (R16). The server uses `en-US`
  grouping; the browser uses `toLocaleString()` as the reference did.
- **Rating text:** `<rating> · <n> votes` (singular `vote` when `n = 1`) in the mono `.meta` idiom on cards and detail pages, omitted
  when `n = 0`; a single dislike therefore reads `0.0 · 1 vote`, which is what the sheet's rating formula yields.
- **Home link:** the wordmark is wrapped in `<a href="/">` on every page (a deliberate addition: the detail and tag pages need a
  way back; rendering is pixel-identical on the index page).
- **Pre-paint step:** one inline script at the end of `<body>` (Layout.astro, CSP-hashed) applies `?collection=`, the saved votes
  and the saved unit/currency before the deferred modules run, so returning visitors never see cm/USD flash.
- **Vote buttons:** 👎 then ❤ in the same `.like` pill (the heart keeps the reference's far-right position), `aria-pressed`, `aria-label="Like <name>" / "Dislike <name>"`; a click
  POSTs, applies the returned `state`, and on 429/503 restores the previous state and shows nothing (silent, like the reference).

### D13 — Design pass (2026-09-07): editorial spread, plates, skeletons, motion, cross-document transitions

**Decision.** The owner asked for a visually better site "with the same layout", skeleton loaders, animations and
page transitions (GSAP allowed). A judged design round (three directions, three judges, `docs/DESIGN.md`) picked the
editorial direction; what shipped:

1. **Same layout, new rhythm.** `catalogue.css` stays byte-identical as the parity record; `editorial.css` and
   `motion.css` layer over it by cascade order. Masthead, controls, tabs with counts, card grid, mono meta and the vote
   pill keep their places. Additions: a sticky tab bar with a sliding ink bar, a per-collection standfirst
   (`Collections.description`), price and rating on one row, 32 px vote buttons in a bordered pill, a home link on the
   wordmark, and a lead card (first `featured` landscape rug of a collection with ≥ 3 rugs spans two columns).
2. **The rug is an object on paper.** Every photo sits uncropped on a `--paper-deep` plate whose ratio is predicted
   from the sheet's dims and rotate flag (`view.ts#plateRatio`, seven buckets, `data-ar`), so nothing shifts when the
   image lands. Rugs without a photo show a proportion diagram with their dims instead of a bare grid; loading and
   missing are different states (`photos.ts`: `is-pending` / `is-loaded` / `is-empty` + `aria-busy`).
3. **Detail page = a spread.** `Gallery` (hero at the rug's ratio, `=w800` base + `=w1600` full layer, thumbnails,
   native `<dialog>` lightbox), sticky spec column (`Specs`, description, tags, enquiry links with the reference id),
   prev/next `Pager` within the collection, `RelatedRugs`. Enquiry links use `src/lib/studio.ts`.
4. **Honest skeletons.** Shimmer only where bytes arrive (plates near the viewport, gated by IntersectionObserver);
   a static ghost grid + Try again on 503; none on tab switches; a 2 px progress bar + sibling dim while the next
   document loads (`transitions.ts`).
5. **Motion inventory** (`docs/DESIGN.md` §7): CSS for entrances, reveals, hover lift + contact shadow, heart pop,
   count tick, ink bar; **GSAP 3.15 core + Flip** only for the tab reflow, dynamically imported on nav hover/focus,
   never under `prefers-reduced-motion`. Everything else respects reduced motion (opacity dissolves ≤ 160 ms).
6. **Page transitions without a client router.** Astro's `<ClientRouter />` is documented as unsupported with
   `security.csp`, and `transition:*` directives emit unhashed styles (verified with a built probe). The site stays an
   MPA and uses the browser's cross-document View Transitions: `@view-transition { navigation: auto }` in bundled CSS,
   the clicked card's plate and the detail hero named `rug-hero` through the CSSOM in `pageswap`/`pagereveal`
   (allowed by the hash CSP), a sessionStorage handshake for the return morph, `rel=expect` so the deep-linked state
   is captured after the pre-paint step. Firefox and older browsers simply navigate; every script still runs once per
   document, so nothing needed `astro:page-load` re-initialisation. Verified on the built server: zero CSP
   violations, CLS 0.00, route cache MISS→HIT unchanged, the transition class present on arrival.
7. **Supersedes** D12's "no transitions anywhere" note and catalogue.css's closing comment; the vote pill order is
   👎 then ❤ (heart keeps the reference position); `swr` stays 60 s.

**Owner choice left open.** Plate tint: photos are scanned on white, so a white rectangle sits on the beige plate. The
alternative (plate turns paper-coloured once the photo has loaded) is one CSS rule; screenshot both and pick.

### D14 — Brief v0.5: the customer realm replaces the public catalogue as the product

**Decision.** `brief-astro-developer.pdf` v0.5 describes a **private, per-buyer preview** at
`/{customer-slug}` behind that buyer's own password, not the public catalogue this project was
originally built as (see `docs/BRIEF_GAP.md` for the section-by-section reading). What shipped:

1. **`/{slug}` and `/{slug}/{productId}`** are the last routes in the tree. Astro's static segments
   (`/admin`, `/api`, `/rugs`, `/tags`) win against `[slug]`, and `RESERVED_SLUGS` refuses those
   names anyway, so a customer can never shadow a real route.
2. **The middleware default-denies** (`src/lib/customer/gate.ts`). Every path is matched against an
   explicit allowlist; anything that is neither on it nor a well-formed slug is a 404 _before_ a page
   runs. The gate performs no I/O, so a 404 costs nothing and cannot be used to probe the sheet.
3. **Per-realm cookies.** One cookie per slug (`sl_c_<slug>`, `__Host-` on https), the slug mixed
   into both the signed payload and the HMAC key. A cookie minted for one buyer, copied under
   another's name, verifies against neither. A customer cookie never touches `/admin`, and the admin
   gate reads only its own cookie name.
4. **Generated passwords, revealed once.** Three lowercase words and two digits
   (`amber-loom-serai-47`), readable down a phone line. The plaintext exists only in the create /
   regenerate response body; the row stores a scrypt hash. `POST /api/admin/clients/[code]/regenerate`
   mints a new one and does **not** sign the buyer out — the owner is usually reading it to them.
5. **Visits** are appended one row per buyer per 30 minutes (`VisitThrottle`), coarse user agent
   only, fire-and-forget: a failed visit write can never fail a render.

**The one deliberate divergence.** The public catalogue still works. `PUBLIC_CATALOGUE=true` (the
default) keeps `/`, `/rugs/*` and `/tags/*` on the allowlist; setting it to `false` gives exactly the
brief's posture, where the site serves nothing but `/{slug}` and `/admin`. Keeping both is one flag,
costs nothing, and means the earlier work is not thrown away before the owner has decided. The gap
document raised this as open question 4 and it stays the owner's call.

**Trade-off accepted.** A known-but-unauthenticated slug renders the password gate; an unknown one
404s. That distinction is observable, so a determined attacker can enumerate which slugs exist. The
alternative — showing a gate for every syntactically valid path — makes typos indistinguishable from
real links and contradicts the default-deny rule. With a handful of privately shared, random-suffixed
slugs, enumeration is not the threat; a leaked link is, and the password covers that.

### D15 — Reaction buffering, and reactions become asymmetric

**Decision.** Brief §3 rule 2 calls client-side batching "requirements, not advice", and the reason
is the Sheets quota: 60 writes per minute per user. Every tap now paints instantly from
`localStorage` and drops its intent into a buffer keyed by product id; the buffer flushes after 2.5 s
of quiet, when the tab is hidden (`visibilitychange` / `pagehide`, through `sendBeacon`), or at 25
items. One flush is one `POST /api/reactions` and one append — a burst of forty taps costs one write,
not forty.

The buffer keeps the newest intent per product but the **original** `previous` state, so a failed
flush reverts to what the visitor saw before the burst rather than to a mid-burst state.

Reactions are asymmetric (§7): a grid card offers **like only**, the detail page offers like and "Not
for me", and `source` records which surface it came from — the server refuses a dislike claiming to
come from a card. Each control is a real `<button>` whose accessible name is text content in a
visually hidden span, not an `aria-label` on an icon: that is what the brief asks for and what voice
control needs. The circle stays 32 px; a `::after` pseudo-element pads the target to 44 px on coarse
pointers, so nothing moves visually.

**Identity.** The page publishes its realm as `data-customer` on `<html>` and the batch carries it.
It is a **claim, not a credential**: `/api/reactions` believes it only after verifying that slug's own
cookie, and a forged or lapsed claim degrades silently to the anonymous identity rather than failing —
a buyer whose session expired mid-visit still has their taps recorded, just not against their name.

**Supersedes D4's client contract.** `POST /api/vote` with `{rugId, vote, action, client}` is gone;
the `?c=` client id it used for attribution is gone with it, replaced by the verified cookie.

### D16 — scrypt for customer passwords, not argon2 or bcrypt

**Decision.** Brief §10 says argon2 or bcrypt. This uses Node's built-in `scrypt` with OWASP
parameters (N = 2¹⁷, r = 8, p = 1), the same primitive and the same code path the admin password
already uses.

**Why.** scrypt is in the same memory-hard family as argon2 and is the only one of the three in the
Node standard library. argon2 and bcrypt both mean a native module: a compiler in the image, a
rebuild on every Node upgrade, and a class of deployment failure this project has no other reason to
carry. One hashing implementation with one set of tests beats two.

**What would change the answer.** A password-cracking threat model where argon2id's side-channel
resistance matters — that is, if these hashes ever leave the spreadsheet into an untrusted context.
They do not: the sheet is the trust boundary, and anyone who can read it can already read everything.

### D17 — Brief §5 tokens: three modes from the brief's prose, not from the Figma file

**Decision.** `src/styles/modes.css` defines the three `[data-mode]` sets the brief asks for —
`preview`, `admin`, `admin-dark` — with the values the brief's own text states: canvas `#FEFCF0` /
`#F8F7F5` / `#141413`, surface `#FFFFF5`, brand red `#B80D09`, feedback `#307A07` / `#ED8A00` /
`#CB2B2B`, IBM Plex Mono, 13 px base with the 11/12/13/15/19 scale, headings 28.8 → 11.2, radius 0
with a 9999 pill for chips and reaction circles only, an **ink** focus ring (explicitly not the brand
red), the six container widths, and the off-grid values the brief says to carry rather than round
(`input-y 10.4`, `input-x 12.8`, `control-gap 10`, `checkbox 14`).

Components read semantics (`--canvas`, `--surface`, `--brand`, `--focus-ring`), never a primitive, so
a mode switch is one attribute. The pre-brief names in `tokens.css` (`--paper`, `--accent`, `--focus`)
now _resolve_ to those semantics rather than holding their own values, which moves the whole page
without a sweep through every component.

**What is still missing, and why it cannot be guessed.** §5 forbids re-deriving values from
screenshots and names the Figma file (`07 · Handoff`) as the authority for the component inventory,
the frame specs and the decision log. None of that is in this repo. Nothing above was eyeballed —
every number is quoted from the brief — but the component work waits on the file.

**Page transitions stay off the admin.** `@view-transition { navigation: auto }` lives in
`motion.css`, which only `Layout.astro` imports; `AdminLayout.astro` imports `tokens.css`,
`modes.css` and `admin.css`. The gap document flagged this as a risk; it was already correct.

### D18 — The customer preview is rebuilt from the Figma handoff (2026-09-09)

**Decision.** The Figma file arrived (`Zzv9aXvSad5NTZc9rFRFxx`, page "05 · Customer Preview"), which
is the input `docs/BRIEF_GAP.md` §5 recorded as blocking. It draws six frames — gate, catalog and
product detail, at 1440 and at 390 — and the three customer-realm screens are rebuilt from it.

**The public catalogue is untouched.** `catalogue.css` is the byte-for-byte parity record of the
original page and `editorial.css` is the design pass over it; bending those into a second design
would have destroyed the record and produced a stylesheet that serves two masters. The preview gets
its own shell (`PreviewLayout.astro`), its own stylesheet (`preview.css`) and its own components
under `src/components/customer/`. Nothing in the public catalogue changed except three shared
seams, each additive: `dims()` takes an optional separator, `CardView` carries `pile`, and the
pre-paint step reads `data-sep`.

**What the file settled that prose could not.** Every token value in `modes.css` was written from the
brief's text in D17; the file's own variables corrected several of them — ink is `#000000` not
`#141413`, secondary `#403f3c` not `#6b645c`, the rule `#d8d6cc` not `#e3d9c2`, and the 15px step is
`--text-lg` rather than a `--text-md`. It also added the ones prose never mentioned: `#efefef` for
the unselected chip and the photo plate, `#ffffff` for the raised reaction circle, the 4/8/12/16
stack scale, the 48 gutter and the 64 section gap.

Two things a screenshot would have got wrong, and a zoomed render settled:

- the 1142×1 box between the wordmark and the buyer's name is a **flex spacer**, not a rule; the only
  hairline in the header is along its bottom edge;
- the filter chips are **square**, not pills. The brief said "pill 9999 only for chips + reaction
  circles"; the file draws chips at radius 0 and rounds nothing but the reaction circles.

The chip label is Body S — Inter 400, sentence case — not the Label style. Shouting
"KILIM — FLATWEAVE" would lose the spaced em dash the design sets, and a tag reads as a caption.

**Reactions gained two states from the component documentation** (18:100), which is more specific
than the brief was:

- **syncing** — buffered but not yet stored: the circle keeps its fill, the glyph drops to 45%, and a
  4px muted dot appears. Common by design, since every tap waits out the 2.5 s buffer.
- **failed** — "the optimistic state is HELD and a 12px alert glyph appears. Retry is automatic."

That last one reverses what D15 shipped. The old behaviour silently reverted a tap when the flush
failed, which meant a dropped train tunnel quietly undid a buyer's shortlist. Now a transient failure
holds the state and retries with backoff, and only a definitive 4xx undoes it. Both marks are
`aria-hidden`: the documentation is explicit that the pending state is visible and **not** announced.

**Deliberate deviations, all three worth the trade:**

1. **The currency picker stays a native `<select>`.** The file draws an Open state — a 74px panel of
   40px rows, each a code beside its symbol, with a 16px check. Building it means a hand-rolled
   listbox that has to re-earn keyboard handling, the iOS and Android pickers, and screen-reader
   support that the platform gives away. The closed trigger matches the drawing; the open menu is the
   platform's. Contained to change later if the studio wants the drawn panel.
2. **The card photo is `contain`, not `cover`.** The mobile frame annotates the card as "a 4:5 crop",
   but what it draws is a rug floating clear of the box edges. A rug is judged on its border, and
   cropping one to fill a box cuts off the thing the buyer is looking at. The 4:5 box is the crop;
   the artwork inside it is never trimmed.
3. **The type chips are capped at eight**, the number the file draws. The development sheet carries
   thirty tags, which would turn a one-line strip into two dense rows and bury the grid. "All" still
   reaches every rug.

**Two additions the file does not draw, both necessary:** an error line under the gate's button,
because a wrong password has to say so somewhere, and a visually hidden `<label>` on the field,
because a placeholder is not an accessible name.

**The bug that made the first pass look wrong.** The body kept its 8px user-agent margin, so every
gutter measured 56 instead of 48 and the full-bleed bands — the header rule, the hero, the footer —
stopped 8px short of the viewport on both sides. One `margin: 0` fixed the whole page. It was found
by reading the rendered geometry back out of the browser and diffing it against the frame's numbers,
which is the check worth repeating on any future screen: header 0,0 1440×152; wordmark at 48,64; the
buyer's name flush to 1392; title block at y=216; filters at 349; grid at 449 on a 1344 column.

**Verified against the running site**, not against the mock: the six screens were rendered by a real
browser at 1440 and 390 and are in `docs/screenshots/preview/`. Computed styles were read back from
the DOM rather than eyeballed — every token, the 300px four-column grid, the square chips at weight
400, the 28.8px uppercase title. Four taps on one card produced exactly one `POST /api/reactions`
carrying one item, with the realm claim attached and accepted.

### D19 — The Drive pipeline closes to the brief's shape (2026-09-13)

**Decision.** Brief §12's three outstanding items are built: the per-product folder tree, the
row-first `pending`/`complete` commit with a retry, and photos served through our own origin.

**The commit order is inverted from what this project did before,** and that is the whole point.
It used to upload every photo and then write the row; a failure part-way left files in Drive that no
row pointed at — invisible, unreferenced, unretryable. The order is now: validate the id → write the
row `pending` → create the folders → upload one at a time → update the row `complete`. What a failure
leaves behind is a **visible row** the products list marks "photos pending" with a "Finish photo
import" button beside it. `src/lib/drive/commit.ts` therefore never throws: every outcome is
reported, because a half-finished import has to leave something the admin can act on.

**The retry asks Drive what is missing, not the row.** `Products` is the brief's fixed 42-column
Shopify set and has one image column, so a row records only the primary. Counting row photos to find
the shortfall would re-upload everything after the first photo on every retry. Instead
`POST /api/admin/rugs/[id]/retry` re-scrapes `Source URL` for the photo list and lists the `All
Images` folder for what already landed; filenames are deterministic (`01-primary`, `<slug>-02`), so a
name already present is a photo already stored. The endpoint is idempotent — pressing it twice
uploads nothing the second time. A failure to list the folder is not fatal: it falls back to
uploading, because a duplicate file is a smaller problem than a retry button that does not work.

**Why re-scrape rather than store the source URLs.** The alternative was a 43rd column holding the
pending photo URLs. The brief pins the Products columns, the scraper is cached and idempotent, and
the row already carries `Source URL` — so re-reading the supplier page costs one cached fetch and
adds no second source of truth. The cost is honest and stated: if the supplier page changes between
the import and the retry, the retry imports the new photos.

**The proxy tries lh3 anonymously before the Drive API.** D6 kept `lh3.googleusercontent.com` links
in the markup; §12 asks for `/api/image/[fileId]` with aggressive cache headers, and `driveImageUrl()`
now returns `/api/image/<id>?w=<n>`. The upstream order is the part worth recording:

1. **lh3, with no token.** The photo folder is shared with anyone holding the link, so an anonymous
   request works — which means the proxy serves images before the owner has granted the Drive scope
   and keeps serving them if that grant lapses. lh3 also downscales on demand, so a card asks for
   `=w800` and gets 800px rather than the original four megabytes; `files?alt=media` cannot do that.
2. **The authenticated Drive API**, only when lh3 says the file is not public and a client exists.

`?w=` is a closed set (400 / 800 / 1600, anything else → 800) because the value goes into a URL, and
the id is matched against `^[A-Za-z0-9_-]{10,200}$` before it reaches one. There is no parameter that
accepts a URL, so the route adds no SSRF surface. The response is `immutable, max-age=31536000`: a
Drive id addresses one immutable blob, and replacing a photo mints a new id, which is a new URL.

**Server-side probes deliberately did not move.** `waitForLh3` (upload verification) and
`scripts/check-photos.ts` still call `lh3Url()`. They exist to answer "is this file readable from
Drive"; pointing them at our own proxy would have them checking us instead of Drive.

**A folder-listing capability was added to the Drive client** (`listFolder`, `name → id`) purely to
serve the retry. It reads one page of 100, which covers the 12-photo cap many times over.

**Verified.** 36 new unit tests cover the folder tree, the lister, the reuse path, the endpoint's
refusals and its idempotency, the lh3 reader and the proxy's two upstreams. The proxy was also
exercised against a real Drive file through the built server: all three widths served as `image/jpeg`
(36 KB / 125 KB / 197 KB), `w=9999` clamped to 800, a malformed id answered 400, and the
year-long immutable header was present. The upload half is still unverified live — the connected
token carries Sheets but not `drive.file` (see D3's note on the consent screen).

### D20 — Ten owner requirements land on the Figma build (2026-09-13)

**Decision.** The owner added ten requirements mid-build. Seven are ordinary feature work; three
forced a choice this project had to make explicitly rather than by default.

**A product belongs to several collections, and the `Collection` cell splits on `|` only.** `Tags`
accepts both `|` and `,`, and copying that here would have been the obvious move. It is wrong: a
collection name is prose the owner types, and "Wabi Sabi, Vol. 2" is one collection, not two. Pipe
only means a cell written before this change still parses as exactly one collection, so **no sheet
migration is required** — every existing row means what it always meant. `Product.collections[]` is
canonical; `Product.collection` survives as the primary (`collections[0]`) because one collection
still has to be _the_ one: the canonical `/[slug]/` route, the single label a card has room for, and
the grouping key for lead-first ordering. Membership questions read the array; identity questions
read the primary. `navTabs` counts a rug under every collection it claims, and
`orderedCollectionNames` offers a tab for a collection that is nobody's primary — without that, a
collection used only as a second membership would silently have no tab.

**The per-supplier price formulas replace the Settings markup for those two suppliers.** Karavan is
`base × 0.7 × 2 + band(base)` with bands `<500 → +100`, `500–1000 inclusive → +150`, `>1000 → +200`;
ecarpetgallery is `USD × 1.5 + 150`. Neither is a multiplication, so the single `retail_markup.*`
number could not express them. The formula **ignores** a configured markup for those suppliers rather
than letting it override: a stale Settings row silently repricing the catalogue is a failure the
owner cannot see. `retail_markup` still governs owned stock and anything unrecognised, which is what
it is now for. The visible consequence is a repricing — ECG $700 moves 1120 → 1200, a $4000 Karavan
6000 → 5800.

**The scrambled customer route uses `-` and `_`, not the `~` and `.` first chosen.** The owner's
example (`/hi6g2a3a%s`) uses `%`, which begins a percent-escape in a URL path; `%s` is not valid hex,
so the link would be mangled or rejected. The obvious substitutes were the other RFC 3986 unreserved
characters, `~` and `.`, and those were built first — **and would have been a real defect**. The same
string is written into the sheet as the Customers tab's own `slug` and into every Reactions row as
`client`. **Correction (D22, 2026-09-14): those two columns do NOT share an alphabet, and the
sentence that used to stand here — "both of which parse against `/^[A-Za-z0-9_-]{1,64}$/`" — was
false and caused a site-down defect.** Reactions uses that rule; Customers uses
`SLUG_RE = /^[a-z0-9-]{1,80}$/`, which admits neither `~`, `.` nor `_`. The narrower column governs,
so the filler set is `-` alone. A character outside it does not look odd; the customer's own row
fails to parse, the buyer disappears, and past a 10 % drop ratio the whole catalogue 503s. The generator is therefore constrained to
the **intersection** of what a URL path allows and what the sheet stores, and never places a filler
first or last. The code is a locator, not a credential — it leaks roughly half the buyer's letters by
design and carries perhaps 25 bits — which is acceptable only because §10 keeps a password gate
behind the route.

**Two departures from the Figma file, on the owner's instruction, recorded because the file is
otherwise authoritative.** The like control moves from the top right of the card image (53:62) to the
bottom right, which frees the top-left corner for the Signed/Antique badge — the two requests fit
together rather than competing. And the pressed like state fills the _heart_ red rather than the
whole circle with ink (18:54); that is the idiom every buyer already knows from every other wishlist,
and it is scoped to `[data-vote='like']` so the dislike circle keeps what is drawn.

**Supplier image fixes are applied to the bytes at import, not with a CSS transform.** A rug's photos
become the studio's own asset — re-used in exports, sent to buyers, opened straight out of Drive — so
a file that is correct only inside this website is not correct. `src/lib/drive/transform.ts` owns the
policy; the supplier is passed explicitly from the form rather than sniffed from the photo host,
because Karavan is a Shopify store and its images arrive from the shared `cdn.shopify.com`. A
transform that fails is never fatal: the original bytes are stored and the reason is logged, because
losing a product image to a cosmetic fix is the worse trade.

**Background removal is deliberately not implemented.** `sharp` cannot do it — separating a rug from
its backdrop needs a segmentation model, not an image filter. The options were a hosted API
(~$0.20/image, and every supplier photo leaves the studio's control) or a local ONNX model (~180MB
and materially more CPU per import). The owner chose neither for now, so `removeBackground()` returns
its input unchanged and `transformsFor()` still lists the intent. The seam is one function wide.

**One parallel system was retired rather than kept.** `ui/UnitToggle.astro` and
`ui/CurrencyPicker.astro` re-implemented controls that `customer/PreviewControls.astro` already
shipped. Keeping both would have been exactly the duplication the brief forbids. PreviewControls
survived because it is what renders, and because its documented deviation — native `<select>` over
the drawn `role="listbox"` panel — buys the platform's keyboard handling, the iOS and Android
pickers, and screen-reader support a hand-built widget would have to re-earn. The accessibility tests
that covered the deleted pair now cover PreviewControls, which previously had none.

### D21 — The admin screens are built from the Figma file (2026-09-14)

**Decision.** A1-A3, F3-F5, P5-P9 and the mobile frames are implemented. Four of them forced a
choice worth recording, because in each case the file and the working system disagreed.

**A2's copy supersedes the generic login failure.** Figma says "That password is not correct.";
ADMIN_SPEC §8 said "Login failed." A generic message exists to prevent _username_ enumeration, and
this form has no username — one shared password is the only secret — so the specific message tells an
attacker nothing the generic one did. The throttle, the control that actually matters, is unchanged.
A3 is a separate state from A2 in a way that is not cosmetic: the attempt was refused **before** the
password was read, so the field is _unavailable_, not _invalid_. It carries a warning tone and does
**not** set `aria-invalid`, because announcing the field as invalid would be a lie about a password
that was never judged. `Input` gained `errorTone` for exactly this.

**F3 cannot be built as drawn, and was not faked.** The frame shows a live "Their link will be"
preview that updates as you type, and errors with "hala-nasser is already taken. Try hala-nasser-2".
Both assume the route is derived from the name — which D20 replaced with a random, server-generated
code. There is nothing to preview and no "-2" to suggest. The title, field and password guidance are
used verbatim; the preview row is replaced by a line that says what actually happens; and the
taken-code case is reported by the server's 409 rather than guessed at while typing.

**The fetch modal gates the form, and that is a behaviour change.** P5-P9 are not a restyling of the
inline preview: the scrape no longer reaches the form until "Use these" is pressed. P6 exists as its
own frame because the first photo lands BEFORE the fields — the wrong rug is recognised from the
picture and the whole scrape discarded before a single field has been read, and nothing has been
written either way. P8 distinguishes a field the page never carried ("Not found on the page.") from
one it carried and could not parse ("Couldn't read a number from 'POA'"), because those need
different actions and collapsing them makes a refused price look like an absent one. On any page
that does not render the modal the flow degrades to applying directly, which is what it did before.

**Mobile drops data, never controls.** MF1 (111:2865) draws a customer card with name, badge, link
and a copy control — no Active switch and no row buttons. Those are the only way to revoke a link or
reset a password, so they are kept and stacked; only `Created` is dropped, and only because the name
now links to the screen that shows it. A control that exists at one width and silently not at another
is a worse failure than a taller card.

**One line from 06 · States & Edge Cases was a real gap.** 63:487: "The counter ticks visibly. A
static message reads as broken; a countdown reads as finite." The lockout number was server-rendered
and then immediately stale; a frozen counter provokes a reload, which on a throttled login is the one
action that makes things worse. `src/scripts/admin/lockout.ts` ticks it and hands the form back at
zero. The rest of that canvas specifies states already built.

**A guard was added that would have caught four defects the same day.** An undefined `var()` with no
fallback is silent — the declaration is dropped and nothing complains. `--display`,
`--font-weight-bold`, `--leading-tight` and `--inset` were written from the handoff's naming rather
than this repo's and would have shipped as a missing font, weight, line-height and background.
`tests/unit/styles/token-cascade.test.ts` now asserts every token any component reads is defined.

### D22 — Six defects the green gates were hiding (2026-09-14)

**Decision.** A full scope audit ran against a tree where 1008 tests, `astro check`, lint, build and
the 12-point geometry sweep were all green. It found **6 blockers and 30 major defects**. Every gate
had been passing throughout. The lesson is recorded here because it governs how this repo should be
checked from now on: **the gates prove nothing regressed, not that a requirement works.** Four of the
six were invisible to the suite by construction — two were CSS cascade and serialisation facts no
unit test observed, one was asserted by a test reading the wrong side of the behaviour, and one was
a cross-module contract no single module's tests could see.

**The underscore in a customer code was a site-down defect, and this ADR asserted the opposite.**
D20 states that the code is stored in two columns "both of which parse against
`/^[A-Za-z0-9_-]{1,64}$/`". That is false, and the false half is load-bearing. `ReactionRow
.customer_slug` does use that rule, but the Customers tab's own `slug` uses `SLUG_RE =
/^[a-z0-9-]{1,80}$/` — no underscore (`src/lib/sheets/parse.ts:70,142`). Measured: **38.9 % of
generated codes contained `_`**. Such a row is written happily and dropped on every read, and because
`Customers` is a `GUARDED_TAB` at `MAX_DROPPED_RATIO = 0.1` (`src/lib/sheets/read.ts:8-17`), **more
than one bad customer in ten rejects the entire refresh and 503s the whole catalogue** — every buyer,
not just the one with the bad link. The fix narrows `FILLER_SYMBOLS` to `'-'` AND narrows
`CLIENT_CODE_RE` to match, so the generator's own guard now fails loudly rather than the sheet
failing silently. `CLIENT_CODE_RE` must stay a subset of `SLUG_RE`; widening it re-arms the outage.

**`hidden` did not hide, so the default admin Products view listed every rug twice.**
`[hidden] { display: none }` lives in the user-agent origin, so `.grid { display: grid }` beat it and
`view-switch.ts`'s `grid.hidden = true` had no effect. The unit test read the `.hidden` *property*,
which was correctly `true` the entire time — the test and the screen disagreed and only the screen
was right. Fixed with a `[hidden]` reset in the admin origin, and guarded by a live computed-style
check in `verify-geometry.ts` rather than another declaration test, because only a real cascade can
prove a cascade. `catalogue.css`, `editorial.css` and `controls.css` each patch one selector for the
same reason; this is that fix made general.

**Every inline row rename 400'd.** `POST /api/admin/rugs/:id` validates with `RugUpdate`, which is
the whole rug plus a version — it replaces the row rather than patching it. `inline-row.ts` posted
`{ name }`. The rename now reads the row first and returns it with one field changed, which also
keeps optimistic concurrency honest because `version` comes from that same read. `slug` and
`sourceUrl` are `.optional()` and not nullable, so an empty string fails validation and they are sent
only when non-empty. The new guard asserts the posted body against the real `RugUpdate` schema, so it
cannot drift from the route.

**The like threshold was skin-deep.** `visibleLikes()` was correct and correctly used for the painted
badge, while the raw sub-5 count shipped anyway in `data-like-count` and `data-likes`, and the "Most
liked" sort ranked on those hidden numbers — publishing the whole secret ordering even though no
digit was ever drawn. Both attributes are now thresholded. Because `likesOf` reads a missing
attribute as 0, this also settles PLAN decision 4(c) the only way consistent with the requirement:
**the sort ranks within the visible set and leaves every hidden-count rug in served order beneath
it.** `POST /api/reactions` echoed exact counts back to anyone who asked — a body of 25
`reaction: "none"` items writes nothing, spends no budget and returned 25 exact counts — so the
response is thresholded for a named buyer. It is not thresholded for an anonymous visitor, because
the public catalogue card renders a real rating line and needs the totals to repaint it.

**Every customer's scrypt hash was serialised into the admin page.** `parseClients` sets
`passwordHash` on every row despite a doc comment claiming otherwise, and both the clients API and
the admin page spread the row wholesale into JSON. `withoutSecrets()` is now the only shape allowed
to leave the server, written as an explicit destructure so a future secret on `ClientRow` forces a
compile-time decision rather than shipping silently.

**A 59-character customer name threw a 500.** `ClientInput` allows 60 characters and the field has no
`maxlength`, so "half the name" plus fillers overflowed `CLIENT_CODE_RE`'s 28-character ceiling and
the owner simply could not add that customer. `take` is capped at 24, which is the largest value that
can never overflow once up to four fillers are woven in.

**Every fix carries a mutation-tested guard.** Each new test was run against the reintroduced bug and
confirmed to fail, then against the fix and confirmed to pass. A guard that has not been seen to fail
is not evidence. Gates after this batch: **1014 tests, 0 typecheck errors, lint clean, build green,
13/13 live geometry.**

### D23 — A server module in a browser bundle killed the Customers screen (2026-09-14)

**Decision.** The owner reported that no button on `/admin/clients` did anything — no new link, no
password reset, no Active toggle — with one console error: `Module "node:crypto" has been
externalized for browser compatibility … at auth.ts:1:50`.

**Cause.** `src/scripts/admin/clients.ts` imported `customerPasswordProblem` from
`src/lib/customer/auth.ts` to validate a typed password before sending it. That module imports
`node:crypto` at the top for scrypt, HMAC and `timingSafeEqual`. Vite externalises `node:crypto` for
the browser and its stub **throws on first property access**, so the import failed at module scope
and nothing in that file ever bound. One bad import took down every handler on the screen — the
failure is total, not partial, which is why it looked like "the whole page is dead" rather than one
broken button.

**Why nothing caught it.** Typecheck is satisfied (the types are real and the function is genuinely
exported), lint is satisfied, the integration tests render the page through the container API and
never execute its scripts, and `astro build` **warned and continued**: `Module "node:crypto" has been
externalized for browser compatibility, imported by src/lib/customer/auth.ts`. That warning was
visible in the build output during the D22 pass and was not acted on. A warning nobody is required to
read is not a gate.

**Fix.** The pure half — `CUSTOMER_MIN_PASSWORD` and `customerPasswordProblem`, which use no crypto
at all — moved to `src/lib/customer/password-policy.ts`, a module that must never import a Node
builtin. `customer/auth.ts` re-exports both, so every server caller is unchanged; the admin script
imports the policy module directly. Confirmed on the built output: the shipped
`clients.astro…js` bundle carries the password check and contains **zero** references to
`node:crypto` or the Vite stub, and the build now emits **no** externalisation warnings at all
(there were two).

**The general rule, now enforced.** When a browser needs a constant or a validator that happens to
live beside server crypto, split the shared part into its own Node-free module — never import the
server one. `tests/unit/styles/client-bundle-purity.test.ts` walks the import graph from every entry
under `src/scripts/` and fails on the first `node:*` it can reach, printing the whole chain. It
carries its own mutation check (it asserts that `customer/auth.ts` IS still detected as a violation)
so it cannot go quietly green if the walker breaks. Gates: **1049 tests**, 0 typecheck errors, lint
clean, build green with no warnings, 13/13 live geometry.

### D24 — The admin was a half-migrated stylesheet (2026-09-14)

**Decision.** The owner reported the admin UI "not too good" — inputs, dropdowns and general feel.
Rendering the real pages through the container API and screenshotting them with the live CSS showed
the cause plainly, and it was not taste: **`admin.css` was still the `reference/admin.html` port**,
while `controls.css` and `components.css` had moved onto the Figma token system. The admin was
running a second, older design language beside the one the rest of the app uses.

**What was actually wrong**, measured rather than judged:

- **23 rules set `var(--mono)` at hardcoded 9, 10, 11, 12, 13 and 22px**, and ten of those were also
  uppercase with 0.1–0.28em tracking. Form labels, buttons, chips, table headers, help text and
  status messages were all tiny letterspaced monospace. Paragraphs of guidance rendered as terminal
  output. Mono now survives on seven selectors only, each a machine value: product id, price, `<pre>`,
  key names, the count badge, the stat numeral, copyable cells.
- **Three control heights on one row** — 37.8 (inputs), 40.6 (buttons/chips), 42.2 (the multi-select).
  Cause: the legacy `input` rule omitted `line-height`, so it inherited the ambient value and landed
  4.4px short of the canonical `.input`. Now 42.2 for inputs and 40.6 for buttons everywhere, which
  is what `controls.css` already produced and what Figma draws (41.8 / 40.8). Two heights by design,
  not three by accident.
- **Figma's 1px spacer frames were being painted as hairlines.** `.page-head__rule` and `.crow__rule`
  gave every page header and collection row a long thin line running into the button, which reads as
  a rendering fault. `PreviewHeader.astro` already documents the correct reading of the same element
  — "a zoomed render shows no line there" — and `.pv-spacer` is correctly invisible. The admin simply
  read it the other way. `.divider` is a real divider and is untouched.
- **The add-rug strip had no visible labels at all** — name, collections, tags and supplier link were
  placeholder-only, and a placeholder disappears exactly when you need it (checking what you typed).
  At 390 the link placeholder truncated mid-word, so the field was unidentifiable. The revealed
  `.fields` grid below it always had labels; the top of the form now matches it.
- **The tag row had no rule of its own**, so chips, the new-tag input and its button fell into a bare
  flex wrap at three different heights with the button orphaned under its field.

**Convergence, not a new look.** Every value comes from tokens the project already had and the admin
was ignoring — `--input-y`/`--control-y`, `--tight`, `--space-field`, `--size-label`, `--text-xs`.
`.f label` is now identical to `controls.css`'s `.field__label` rather than a third label style that
nearly agreed with it, and `.f__legend` exists so a control group whose own label is `sr-only` (the
chip group, the multi-select) still shows one. No new visual language was invented and no Figma
geometry changed: the 13-point live sweep still passes unaltered.

**Guarded.** `tests/unit/styles/admin-typography.test.ts` fails on any monospace rule outside the
machine-value allow-list, on any raw px `font-size`, and on an input or button without an explicit
`line-height`. Mutation-tested against a reintroduced `.hint` regression. Gates: **1056 tests**, 0
typecheck errors, lint clean, 13/13 geometry.

### D25 — The admin under-delivered on Figma; the shared layer was never finished (2026-09-14)

**Decision.** After D24 fixed the admin's typography and control metrics, the owner said the visual
UI was still not good. D24 had treated it as a styling problem. It was not: six reviewers compared
every admin screen against its Figma frame, and the finding was that **elements the file draws were
never built**, plus two features that shipped dead.

**Two features nobody had ever seen.**
- **The Add-product drawer.** Figma specifies Add product as a slide-over (P3 80:1480, P4 80:1578),
  `Drawer.astro` is fully built, and `/admin/rugs` renders it wired to the real form. But the button
  carried both `href="/admin/rugs/new"` and `data-open="add-rug"`, and `overlay.ts` never called
  `preventDefault()` — so the drawer opened for one frame and the browser navigated away. The `href`
  is a deliberate no-JS fallback and is kept; the drawer now wins whenever the dialog exists.
- **The page title.** Figma draws "PRODUCTS" over "412 products · 3 failed to save" (79:1390/79:1392);
  the build rendered only the grey count line. Every admin page opened with no heading, which is most
  of why the panel read as unfinished.

**The shared layer.** These are all one-line faults that every screen inherited:
- `td { vertical-align: top }` against a `.toggle` carrying `min-height: 44px` — so every Customers
  row opened to ~60px with the text pinned at the top and the switch 22px below it. One declaration,
  and the loudest single reason the tables looked broken.
- `.acts`, the action cell, **had no rule at all**: a 21px Copy control baseline-aligned against a
  32px button with a whitespace node between them.
- `--subtle` is annotated "table row hover" in the tokens and was **unused** — no hover, no zebra.
- `data-status="revoked"` was emitted on every customer row and **styled nowhere**, so a dead link
  looked identical to a live one.
- `.field { gap: var(--tight) }` — `--tight` is 12 in the preview realm but **4 in admin**, so every
  label crowded its input and error messages sat flush against the field box. Moved to `--stack-sm`,
  which is mode-invariant. The same token was behind "Open"/"Edit" running together in the row
  actions.
- The topbar's `meta` slot was plumbed through `AdminLayout` → `AppShell` and **no page ever passed
  it**, so the right half of the bar was empty everywhere. `syncLabel()` fills it.
- **Login** printed the wordmark twice with the strapline in brand red between them — the only red in
  the panel — and `.bare` had no height and a 440 cap, so the drawn 400 card was clamped to 392 and
  sat at the top of an empty viewport.

**A regression this pass caused, and caught.** D24 added `[hidden] { display: none !important }` so
the attribute would work. Below 768px the products table is `display: none` and `view-switch.ts`
defaults to the table — so once `hidden` started being honoured, **a phone rendered the header, the
filters, and no products at all.** Before the reset, the grid leaked through and mobile worked by
accident. Fixed in `bindViewSwitch`, which must decide it in JS because no stylesheet can outrank
`!important`; it re-evaluates on the breakpoint's `change` event so rotating a phone cannot strand
the catalogue either.

**A second data-visibility bug.** The Products status filter hardcoded "Active" as pressed, while
`default_status` is a Settings value that legitimately returns `draft` — so a freshly scraped
catalogue opened on "Nothing matches those filters" above a full sheet. The pressed chip now follows
the data: never a filter that hides everything.

**One reviewer finding rejected.** A reviewer called the unlit nav on `/admin` a bug and proposed
lighting "Products". `tests/integration/admin-dashboard.test.ts:114` states the intent explicitly —
"the dashboard is the wordmark link, not a tab" — and lighting Products would claim the owner is
somewhere they are not. Reverted, with the reasoning recorded in `AdminLayout.astro` so it is not
re-raised.

**Still departing from Figma, deliberately and on the record.** Figma's Products screen draws three
filter dropdowns (All collections / All sources / Any date); the build ships chip rows instead, which
carry counts the dropdowns do not. That is invented UI and it stays only until the owner rules on it.

**Guarded.** New: two live geometry checks that render the login card in its REAL container (the
standalone probe never saw the `.bare` clamp, which is why 392 passed as 400 for weeks), and two
view-switch tests driving an injectable `matchMedia`. Both mutation-tested — the container checks
fail at exactly 392 and top-aligned on the old CSS. Gates: **1061 tests**, 0 typecheck errors, lint
clean, build with no warnings, **15/15 live geometry**.

### D26 — Finishing the admin: the drawer, the tag block, and two features with nothing behind them (2026-09-14)

**Decision.** The remainder of the D25 build list, worked to the end.

**The Add-product drawer now looks like P3.** Its footer slot was never passed, so `Drawer.astro`
rendered a permanent ~17px empty bar under a full-width rule, and the only Fetch control was a small
dark button floating inline mid-body. The footer now carries ghost Cancel + spacer + primary Fetch,
with `.drawer__footer:empty { display: none }` so no future footer-less drawer shows a bare rule
again. `RugFields` gained a `fetchButton` prop rather than a duplicate id: the drawer suppresses the
inline control, and `/admin/rugs/new` — the no-JS fallback, which has no footer — keeps it.
Two spacing faults went with it: the drawer's insets used `--space-inline`, which is 8 in admin
against the drawn 16, and `.addform` painted a surface-plus-rule card *inside* a drawer that is
already `--surface`, producing a same-coloured box on a box with doubled padding.

**The drawer's primary field was invisible.** `#f_id` sat inside `#preview`, which is `display: none`
until a scrape succeeds — so the server allocated the next id, rendered it, and hid it, and the
drawer opened on "Your name for this rug" with its first field nowhere on screen. Hoisted to the top
of the panel with its drawn hint. `fetchUrl` now refuses to scrape without it: the rug number keys
the sheet row and names the Drive folder, so a scrape had nowhere to land, and it was previously
checked only on SAVE — after the fetch had run and the modal had been reviewed.

**A second banner was the wrong fix.** The review proposed a `.msg.err` element at the top of the
panel. `#m1` already lives there and is already visible, so a second one would have been precisely
the parallel system this project forbids. The new check writes to `#m1`.

**Collections.** The reorder pair was two ghost buttons whose entire label was the character ▲ / ▼ —
bare triangles in the heading font, reading as stray typography. Now the `chevron-down` icon, with
"up" the same glyph rotated: `chevron-up` is not in the handoff's set (69:2) and `icons.test.ts` pins
that set exactly, so adding a nineteenth glyph was not an option. Both ends are now `disabled`, since
`move()` returns silently out of range and those buttons previously took focus and did nothing. The
JS row builder clones a `<template>` for the same reason the Customers copy control does — it used to
insert the literal character where the server had rendered an icon.

**`.stack h3` was rendering section headings SMALLER and lighter than the body beneath them**
(`--text-xs` / `--ink-soft`), so every block on the dashboard, Collections and Customers had no
visible owner. It is a heading now. That one rule lifts every section in the panel.

**The colour picker** was pinned to 38px in the Collections page's own `<style is:global>`, against
the 41.8px controls beside it. Deleting that override *is* the fix — the generic `input` rule already
supplies the shared padding and line-height, so it now matches its neighbours by inheritance.

**Two things deliberately NOT built, both because the control would have had nothing behind it.**
- **Delete a collection.** The review called its absence a straight gap. There is no DELETE endpoint
  (`collections/[id].ts` is `methodNotAllowed('POST')`), and the real question is not the button: it
  is what happens to rugs filed under a collection that is removed. That is a data decision for the
  owner, not a visual fix.
- **Removing the "Client saves" section.** A dead-looking heading over a lone Refresh button, and the
  reviewer was right that the data has a home on the customer detail screen — but deleting a feature
  is the owner's call, not a styling pass.

Gates: **1062 tests**, 0 typecheck errors, lint clean, build with no warnings, **15/15 live geometry**.

### D27 — The admin filter: three of Figma's four boxes, and a data-loss bug found on the way (2026-09-14)

**Decision.** Figma's Filter Bar (23:183) draws search + three 180px selects — All collections, All
sources, Any date. The build shipped search plus two rows of chips below the bar. Four independent
positions argued the difference; the verdict adopts the drawn STRUCTURE and re-points its CONTENTS.

**The filters move into the bar.** `FilterBar.astro` has always declared `slot="filters"` and
`components.css` has always carried `.filterbar__select { width: 180px }` — Figma's exact
measurement. Neither had a single reference anywhere in `src/`. This is the fourth instance of the
same pattern in this codebase (the drawer footer, the topbar `meta` slot, `.acts`, `--subtle`): the
component layer was built faithfully to the file and the pages never wired it up. Filling the slot
also hands the table back roughly 110px of vertical space on every visit.

**Collections becomes the drawn select, with the counts in the option labels.** It is the control
that does not survive a real catalogue — eight collections already made two rows — and ADR D18
capped the preview's type chips at eight for exactly this reason, on evidence from this same project.
`Kilims (12)` keeps the number; it costs a click.

**Status stays chips, and that is a departure with a reason.** The file draws no status control at
all — and P2's table has no status column either — so a REQUIRED domain field has no expression
anywhere in the frame. A file silent on a required field is a gap, not a ruling. `defaultStatusOf`
can legitimately return `draft`, which is the case the page already guards, and a value the owner
flips constantly deserves one click rather than a menu.

**"All sources" ships as capability, not chrome.** `supplier` is a two-value enum, so a 180px box for
two options is furniture; it joins the search haystack instead, in BOTH row and card so one filter
still drives both views.

**"Any date" is not built, for cause — and the cause is a bug.** `productFieldsToCells` writes a
FULL-WIDTH row and sets `cells[scrapedAt] = f.scrapedAt ?? ''`. The create and retry paths each
stamped the date inline, but **neither `fieldsOfRug` nor `rugFieldsFrom` carried the field** — so
every ordinary edit (a price, a title, the inline rename) and every status change wrote an empty
string over `scraped_at`. Proven before fixing: `expected '' to be '2026-09-01T10:00:00Z'`. Both
helpers now carry it, and the update endpoint takes it from the ROW rather than the body, because it
is provenance the server owns and `RugUpdate` rightly has no field for it. Building a date filter
over a column the app erases would have been worse than not drawing one.

**The filter neither design drew.** `pendingCount` — rugs whose Drive import never finished — was
already computed and already printed in the header as text nobody could click. It is now a fifth
status chip, "Needs photos N". It is deliberately NOT a status value: a half-imported rug can be
active, draft or archived, so `matches()` asks about the import rather than the status column.

**And the state that only existed in one view.** `RugCardAdmin` has rendered the pending badge and
its retry button since it shipped; `RugRow` rendered neither — and the row is the DEFAULT view. So
the only route to a half-imported rug was to switch to cards and scroll the catalogue hunting for
badges. Brief §12 says the list offers to finish it; "every state ships" means in both views.

**What the owner loses.** The catalogue's distribution no longer arrives unasked. A glance used to
say twelve Kilims, eight Tulu, one unfiled; behind a select you only learn that by looking. The
counts-in-labels trick does not fully repay it. That is the price of a control that still works at
forty collections.

Guarded: four `matches()` tests for the attention filter, four provenance tests asserting `scraped_at`
survives every write path, and a component test rendering RugRow and RugCardAdmin from the SAME rug
so the two views cannot drift apart again. All mutation-tested. Gates: **1074 tests**, 0 typecheck
errors, lint clean, build with no warnings, 15/15 live geometry.

### D28 — Pre-deployment sweep: the credential the reset destroyed, and four more (2026-09-14)

**Decision.** Asked for a bug check before going live, five confirmed defects were fixed. One was
worse than anything in the original audit.

**Resetting a customer's password destroyed it.** `#linkOut` — the reveal-once credential panel —
lives inside `<Modal id="new-client">`. "Reset password" is a control on a TABLE ROW, outside that
modal. `showLink()` only un-hid the panel, so a reset wrote the one-time plaintext into a hidden
element inside a CLOSED dialog, announced "copy it now, it is not shown again", and the new password
was already live in the sheet. **The buyer was locked out of their preview with no way back**, and
resetting again repeated it. It worked on the CREATE path only because the modal is already open
there, which is why it survived review. `showLink` now opens the dialog and hides the create form so
the panel stands alone as F4 (52:1115) draws it; the opener restores the form for the next create.

**`/api/catalogue` published every rug's exact like count.** It is on the PUBLIC allowlist whenever
`PUBLIC_CATALOGUE` is on — the default — so the endpoint served unauthenticated what the card was
carefully hiding below five. `rating` and `dislikes` are nulled with it: `rating = likes / (likes +
dislikes) x 5` hands the number straight back.

**"Finish photo import" never rotated the Karavan primary.** `retry.ts` called `commitPhotos` without
`supplier`, so `transformsFor('', 0)` returned `[]`. A half-imported Karavan rug finished from the
Products list came out unrotated while the same rug imported in one go came out correct — the two
paths disagreed silently.

**Every visitor shared one rate-limit bucket.** `clientIp` had two sources: a host header, trusted
only when `CLIENT_IP_HEADER` is set (NOT the default), and `X-Forwarded-For`. With neither present it
returned undefined and `ipHash` hashed the literal `"unknown"` — so five wrong admin passwords from
one person locked every admin out for fifteen minutes, and one visitor could exhaust the vote limit
for the whole site. Astro's `context.clientAddress` is now the last resort, wired at all five call
sites. Deliberately LAST: behind a proxy the socket peer is the proxy, which would recreate the
shared bucket. Read through `socketAddressOf`, never destructured — the getter throws when the
adapter cannot supply an address. Setting `CLIENT_IP_HEADER` at deploy is still correct; this is the
floor, not the ceiling.

**Non-USD prices silently lost their retail suggestion on a cold server.** `convertToUsd` reads
`getCache().peek()` — the in-memory snapshot, deliberately not loading it, because the conversion is
synchronous and a scrape must not block on a sheet read. On a fresh process that snapshot is empty,
and no admin page warms it, so a freshly deployed server could stay cold indefinitely. The scrape
endpoint now awaits `warmRates()` alongside its existing Settings read, so it costs no extra latency.

**The Signed badge was inert on every fresh sheet.** `badgesFor()` keys off a rug's TAGS, but
"Signed" is seeded as a COLLECTION and the Tags tab was built only from names the reference catalogue
happened to contain — which has Antique and not Signed. No Tags row meant no chip in the rug form,
meant no way to apply it, meant a badge that could never appear. `BADGE_TAG_NAMES` is now seeded
unconditionally, case-insensitively so Antique is not duplicated. NOTE: this fixes new sheets only —
an existing sheet needs the tag adding once from the admin's "+ new tag".

**Also observed, not a code defect:** the suite failed four integration files with load errors on one
run and passed three consecutive runs after. A Windows transform race under load. Worth knowing
before wiring CI, which will occasionally go red for no reason.

Gates: **1084 tests**, 0 typecheck errors, lint clean, build with no warnings, 15/15 live geometry.
Every fix mutation-tested.

### D29 — The studio creates its own catalogue sheet (2026-09-14)

**Decision.** `npm run sheet:init` assumes a developer: a terminal, a checkout, and a `.env` to write
the new spreadsheet id into. For this deployment the person setting the site up is the CLIENT. They
open `/admin/google` on the live site, connect their Google account, and expect a catalogue. There
was no path from there to a working sheet at all — `GOOGLE_SHEET_ID` is an astro:env variable, read
at startup, and the app simply threw until a developer intervened.

**The provisioning logic is now shared, not duplicated.** Phases 1–7 of `scripts/init-sheet.ts` moved
to `src/lib/sheets/provision.ts`; the CLI is a thin wrapper over it (347 lines → 81) and the admin
endpoint calls the same function. Two copies — one for the terminal, one for the button — would drift
within a release, and the failure mode is a sheet that looks initialised and is not.

**The id lives in DATA_DIR**, in a store shaped like the Google token store beside it, for the same
reason: it is a value the server learns after it started. **Env still wins.** A deployment that pins
`GOOGLE_SHEET_ID` is stating which sheet is live, and a button in the admin must not quietly move the
site onto a different one.

**The endpoint refuses in three cases, each deliberate.**
- A sheet already exists → 409. Creating a second would orphan the first WITH THE STUDIO'S DATA IN IT,
  and they would have no way to tell which of two identical spreadsheets the site reads.
- No Google connection → 409. The sheet is created in the studio's own Drive; a service account has
  no Drive storage and cannot own one, which is the same error the CLI reports.
- **No DATA_DIR → 409.** This is the important one. Without it the id is remembered for this process
  only, so the next restart shows "no catalogue yet", the studio presses the button again, and the
  first sheet is orphaned. Refusing is kinder than the silent version of that, and the admin says so
  in words rather than hiding the button.

**Seeded with `seed: 'none'`.** Nobody wants twenty reference rugs in a client's catalogue. The badge
tags remain the exception — they are contract, not samples, and the corner badge cannot work without
them (D28), so `provisionSheet` writes them whatever the seed mode.

**Ordering.** The id is stored LAST, after every phase has succeeded, so a failure never points the
site at a half-built sheet; on failure the response carries the spreadsheet id so the studio can find
and delete it rather than being left with an invisible orphan. `resetSheetClient()` then drops the
Sheets client and the snapshot cache, which were both built around "no sheet" and would otherwise
keep failing until a restart.

Gates: **1092 tests**, 0 typecheck errors, lint clean, build with no warnings, 15/15 live geometry.

## 5. Sheet contract (created/validated by `scripts/init-sheet.ts`)

Column headers are the contract; Zod validates the header row on every read (D5.2 governs what happens on mismatch).
Header cells for `likes`, `dislikes`, `rating` are array formulas whose first element is the header text, so the header check still passes.

**Rugs** — `id | slug | name | description | collection | tags | photos | width_cm | length_cm | material | age | origin | price_usd | rotate | featured | status | likes | dislikes | rating | created_at | updated_at | method` (A…V; Q, R, S are formula columns; `A:A` formatted as text; `Q1:S` protected, warning-only)
**Collections** — `id | slug | name | description | cover_image_url | sort_order` (seeded with the reference order)
**Tags** — `id | slug | name | color`
**Rates** — `currency | rate_to_base | symbol | updated_at`, seeded `USD 1 $ · MXN 17.5 $ · CAD 1.37 $ · EUR 0.92 € · AED 3.67 "AED " · SAR 3.75 "SAR "`
**Votes** — `timestamp | rug_id | vote | client | visitor_hash | user_agent | action` (newest row first; header row protected; `B:B` formatted as text; the site inserts, never edits)
**VotesArchive** — same columns; filled only by `archive-votes.ts`.

Parsing rules: `tags`/`photos` split on `|`; `rotate ∈ {force,true,false}` (blank → `false`); `status ∈ {active,draft,archived}`
(blank → `active`; only `active` renders); `featured` accepts checkbox booleans and `TRUE/FALSE` text (blank → `FALSE`); numbers via
`UNFORMATTED_VALUE`; blanks → `undefined`; strings trimmed **except `Rates.symbol`**; per-context validators: `photos` → Drive id
regex, `cover_image_url` → `https:` URL on an allow-listed host, `color` → `^#[0-9a-fA-F]{6}$`, `slug` → `^[a-z0-9-]{1,80}$`,
`description` rendered as text (never `set:html`); an invalid cell drops that field with a logged warning.

## 6. Decisions needed from the owner at checkpoint 1

1. **Sheet ID** — confirm `1IL99sIGvRTG_prFcNkHpb5inLIszueew9R-gBDVGpGA` ("Catalog Database").
2. **Host** — DigitalOcean App Platform ($5/month) as recommended in D2. What you will pay: host $5; domain ≈ $12/year; DO Spaces
   $5/month only if the Phase-6 image mirror is adopted; Google Sheets API $0 (overage billing "later in 2026" only above 60
   requests/min, which the cache prevents); Frankfurter $0. Alternatives: Railway Pro $20 (volumes), Render Starter $7 (+ disk),
   Hetzner ≈ €6 (self-managed), Vercel Pro / Netlify Personal (change the cache and vote-state design).
3. **Google auth** — service-account key (built in Phase 2) if your Google Cloud organisation allows key creation; otherwise the
   refresh-token recipe from a dedicated `catalogue-bot` account. `SHEET_SETUP.md` covers both.
4. **Legacy Apps Script** — rotate the leaked secret now and remove the `save` action (D9); decide whether the old page keeps
   working (paste the new secret into it) or goes dark until the new site launches.
5. **Rates** — turn on the 6-hourly Frankfurter refresh for MXN/CAD/EUR (AED/SAR stay pegged), or keep all rates manual as today.

Decided without asking (per §10 of the brief): seed from the 20 published rugs; developer workstation moves to Node 24.20.

## 7. Research and review log

| Topic              | Brief                                 | Researcher findings | Verifier verdicts (facts / breakage) | Load-bearing corrections                                                                           |
| ------------------ | ------------------------------------- | ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Astro core         | `docs/research/astro-core.md`         | 54                  | 71 ✓ 1 ✗ / 13 ✓ 2 ✗                  | route cache exists; cache hits skip middleware; cookie only in POST; `node()` needs `mode`         |
| Sheets API         | `docs/research/sheets-api.md`         | 44                  | 58 ✓ 1 ✗ / 10 ✓ 2 ✗ 1 ?              | gaxios retries opt-in; in-process cache refuted for serverless; scopes mandatory                   |
| Apps Script        | `docs/research/apps-script.md`        | 40                  | 46 ✓ 0 ✗ 3 ? / 9 ✓ 3 ✗               | googleapis pins auth-lib 10.5; `import.meta.env` inlined; API writes never fire onEdit             |
| Cache invalidation | `docs/research/cache-invalidation.md` | 30                  | 48 ✓ 1 ✗ 1 ? / 9 ✓ 2 ✗ 1 ?           | Vercel `invalidateByTag` is soft; Netlify Free hard cap; Astro 7 providers                         |
| Images             | `docs/research/images.md`             | 35                  | 49 ✓ 2 ✗ / 18 ✓ 2 ✗                  | Netlify remote-images since 5.2.0; pathname matching anchored 5.18.1; Free-plan assumption refuted |
| FX rates           | `docs/research/fx-rates.md`           | 33                  | 43 ✓ 0 ✗ 1 ? / 17 ✓ 2 ✗              | Frankfurter Sheets page exists; Zod schema must coerce sheet strings                               |
| Tooling            | `docs/research/tooling.md`            | 46                  | 56 ✓ 1 ✗ / 29 ✓ 2 ✗                  | TS 7 unusable with Astro; TS 6 changed defaults; built-in cache relevant                           |

Gap round (critic found 8 gaps; each researched and independently fact-checked, reports in `docs/research/gaps/`, summary in
`docs/research/gaps.md`): `deploy-target-conflict` → D2 (fact-check: Railway commercial use is a Pro matter → DigitalOcean);
`vote-state-store` → D5/D8; `keyless-sheets-auth` → D3 (fact-check: refresh tokens are still revocable; `@googleapis/sheets` keeps the
auth-lib pin); `image-endpoint-allowlist`, `drive-hotlink-reliability` → D6 (fact-check: validate the whole transform tuple; the
throttling anecdote is a single report); `counter-formula-vs-write` → D4 (fact-check: `INSERT_ROWS` was also endorsed by Google's
engineer); `apps-script-anonymous-deploy` → D3 (fact-check: latency benchmark misread; moot once the web app is retired);
`sheets-client-choice` → D3 (both candidate clients verified against tarballs; raw REST chosen).

**Adversarial review of revision 1** (four lenses, each with a refuting judge): facts 13 findings, spec 14, security 15,
implementer/owner 15. Confirmed or partially confirmed findings drove revision 2: cookie-based identity (D8), immediate secret
rotation (D9), no cache bust per vote and a bounded Votes read (D4/D3), archive-safe formulas (D4), text-formatted ids (D4),
`USER_ENTERED` formula install + locale check (D4/D10.8), failure policy + health endpoint + owner alerts (D5), revalidate hardening
and least-privilege Apps Script scopes (D5/D3), refresh-token blast radius (D3), tab protections (D3), log redaction (D9), input
validation and coarse user agents (D8), mirror route validation (D6), the page contract (D12), `Rates.symbol` untrimmed (R11), the
collections/tags join and seeding (D12/§3.4), credential-free seed (§3.3), DTO for `/api/catalogue` (D1), engines pin (D11), and the
trimmed owner questions (§6). Findings the judges refuted or rated taste were not applied. The facts and security judges (re-run
after a session-limit failure) confirmed 6 and 8 findings respectively and each listed five missed items; the ones that survived
scrutiny are also in this revision: host-specific client-IP header (D8), backup/alerts moved to a standalone script so the bound
script keeps `spreadsheets.currentonly` (D3/D5), the parallel duplicate-vote race (D4), escaping of the embedded rates JSON plus a CSP
(D12/D1), secret validation at boot (D9), the `sheetId` lookup and the locale rule for the formula install (D4).

**Adversarial review of Phases 3–5 (2026-09-06, five reviewers + judges, ultracode):** every confirmed finding was applied the same day.
Server: header-trust semantics for the client IP (`CLIENT_IP_HEADER` default empty, X-Forwarded-For counted from the right, D8),
failure cooldown without a snapshot and `discardVote` so a failed write is never replayed over a refresh (D5/D4), vote intent
(`action`) with idempotent repeats, budgets peeked before consumption and refunded on write failure, the 200 000-row breaker fed by
spreadsheet metadata (D4/D8), revalidate authorising before touching body or cache with a 4 s coalescing window (D5.4), `bodySizeLimit`
in bytes and a hash-based CSP (D1), 503 shells with `no-store` and `Astro.cache.set(false)` so an outage is never cached. Apps Script:
lock scope, redirect and timeout hardening, trailing-trigger bookkeeping, `RATES_AUTO` validation, monitor retry and per-sheet backup
pruning (D5.6/D7). Client: tab semantics (`role=tablist`, `aria-selected`), `aria-busy` during a vote, queued-intent replay, USD
fallback in the rates table, case-variant collections merged into one tab and blank collections under "More" (D12). The new happy-dom
tests then caught a replay loop in `votes.ts` (a failed request re-sent its own intent without end) that the review had not seen;
fixed by separating the in-flight marker from the queued intent. Archive script now moves only superseded rows (D4).

**2026-09-06 (final parity + evidence review, 67 agents: 4 lenses → 3 skeptics per finding, majority):** 17 findings confirmed, 4 refuted.
Applied: tab counts and ordering keyed by collection slug so an owner-typed spelling variant ("Wabi-sabi") joins the "Wabi Sabi"
tab with a correct count and slot (`text.ts#collectionSlug` shared by `view.ts` and `parse.ts`); clicks during an in-flight vote
now toggle from the pending intent and paint immediately (`votes.ts`); the pre-paint step restores the saved unit/currency and
moved to `Layout.astro` so detail pages get it; a failing metadata read keeps the last known Votes row count and is logged
(`cache.ts`), and the monitor alerts when the count is unknown twice in a row; the dislike button is rendered before the heart so
the heart keeps its reference position; `swr` 600 → 60; the revalidate comment and the http-cookie behaviour documented; a boot
warning for a non-https `SITE_URL` in production. Recorded as accepted: extra collections sort with `localeCompare` (ADR R5 says
A→Z), the hidden dims `<li>`, the visitor-locale price grouping after the pre-paint step, the `aria-label` wording (D12), and the
evidence explanations (coalesced revalidate + route cache, `0.0 · 1 vote`, Astro's origin check answering 403 before the route).

## 8. Claims still unverified that the plan tests before relying on them

1. Atomicity of `insertDimension + updateCells` (and of `append + INSERT_ROWS`) under concurrent callers — Phase 5 three-writer test. **Verified 2026-09-06 (live dev sheet):** five concurrent single-row `batchUpdate` inserts at row 2 for the numeric-looking id `1389` all succeeded (1.1 s wall clock), the top five `Votes` rows were intact with five distinct visitors, the header `COUNTIFS` showed `likes=5` 391 ms later, and five concurrent removes brought it back to 0 in 362 ms. `append + INSERT_ROWS` was not exercised (not used).
2. `COUNTIFS` freshness on read-after-write — the same test polls until consistent and records the delay. **Verified 2026-09-06 (live dev sheet):** the recount was visible 416–571 ms after the insert in every round trip (`sheet:roundtrip`, `test:live`, and the API flow through `/api/revalidate`).
3. Header-cell `ARRAYFORMULA(COUNTIFS(...))` on a live sheet, including the `VotesArchive` term and numeric-looking ids — Phase 2 smoke assertion. **Verified 2026-09-06:** `sheet:init` installed the three header formulas with `USER_ENTERED` on an `en_US` sheet and read `[0,0,0]` back; eight `Votes` rows (add/remove, like/dislike) recounted correctly for `SL-004`; the `=1+1` probe cell stayed literal text. Numeric-looking ids: see the concurrency run below.
4. A route-cache HIT bypasses middleware (medium confidence) — Phase 2: `X-Astro-Cache: HIT` in `astro preview` with a middleware log line. **Verified 2026-09-06 (built server):** a `HIT` response still carries every middleware header (`X-Frame-Options`, `Referrer-Policy`, `nosniff`) and the CSP header, so whether the middleware runs or the headers are cached with the entry, the observable posture is identical.
5. Vitest 5.0.0 with Astro 7.3.1 `getViteConfig` — Phase 2 smoke test (fallback 4.1.11). **Verified 2026-09-06:** 131 tests run under it, including happy-dom and Astro container tests.
6. `eslint-plugin-astro` 3.1 parsing TS frontmatter without an explicit parser block — Phase 2. **Verified 2026-09-06:** `npm run lint` covers every `.astro` file with no parser override.
7. lh3 behaviour for a file **not** shared publicly (only a bad id was probed: 500) — Phase 3 with a private test file.
8. The host's edge overwrites `X-Forwarded-For` (spoof test) and `security.allowedDomains` validates its `Host` — Phase 2 spike on DigitalOcean.
9. Sheets tab protections block the service account's `updateCells` on `Rugs` while allowing the `Votes` insert — Phase 2 spike.
10. DigitalOcean App Platform delivers the client IP in `do-connecting-ip` and replaces the container on every deploy (in-memory state
    and local files lost) — Phase-2 spike and Phase-6 first deploy.
