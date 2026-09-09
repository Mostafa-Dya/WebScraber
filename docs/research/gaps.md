# Gap round — what the completeness critic asked, what was found, what the ADR does with it

Date 2026-09-05. After the seven topic briefs were verified, a completeness critic listed eight gaps and twelve
contradictions. Each gap was researched by a fresh agent and independently fact-checked against live sources.
Raw reports (`gap-<key>.research.json` / `.verify.json`, plus the critic's `critic.json`) are in `docs/research/gaps/`; this
file keeps the parts that drive decisions. Verdict counts are confirmed / refuted / unverifiable.

## 1. deploy-target-conflict → ADR D2 (22 / 1 / 0)

**Question.** Which always-on container hosts run a Node 24 image as exactly one long-lived instance by default, with a
custom domain and TLS, and what do they cost in September 2026?

**Answer.** Railway Hobby $5/month flat (one replica, sleep opt-in, 2 domains, volumes); DigitalOcean App Platform
`apps-s-1vcpu-0.5gb` $5/month (`instance_count` default 1, auto-HTTPS, no disk); Render Starter $7/month (0.5 CPU / 512 MB,
persistent disks available, Free tier spins down after 15 min); Hetzner CX23 + Coolify ≈ €6/month (self-managed OS);
Fly.io ≈ $2–3 but `fly launch` creates two Machines and stops idle ones. Netlify Free is a 300-credit hard cap that pauses every
site at 0; Vercel Hobby is non-commercial. Node 24 is Maintenance LTS from 2026-10-20 (EOL 2028-04-30); `node:lts` flips to 26
on 2026-10-28, so pin `node:24`.

**Fact-check corrections.** Railway's ToS and fair-use page contain no Hobby restriction, but Railway staff on their forum
state that a for-profit service "is a Pro workload" and the pricing FAQ recommends Pro for commercial apps — a real risk.
The Dockerfile in the report is a customised (layered `npm ci`) variant of Astro's recipe, not the recipe itself.
`cache.invalidate()` throws without a provider and `cache.enabled` is false in dev — guard the revalidate route.

**Decision impact.** Node standalone on DigitalOcean App Platform ($5) is the default; Railway only on Pro or after support
confirms Hobby is acceptable; Render Starter if a persistent disk is wanted for the image mirror.

## 2. vote-state-store → ADR D5, D8 (51 / 3 / 0)

**Question.** Which durable key-value stores with compare-and-set exist per host, with free-tier limits and consistency?

**Answer.** Netlify Blobs (`onlyIfNew` / `onlyIfMatch`, `consistency: 'strong'` opt-in, credits-based, auto-authenticated in
Functions); Vercel Blob (`ifMatch` ETag → 412, reads CDN-cached unless private + `useCache:false`, Hobby ≈ 2K advanced
ops/month, Vercel KV shut down → Marketplace Upstash); Cloudflare Durable Objects / D1 (real transactions, but workerd and a
custom entry); `node:sqlite` on Node 24.20 (Stability 1.2, cleanest CAS, needs a local disk); Upstash Redis REST (500K
commands/month free, works on every host).

**Fact-check corrections.** `astro dev` already starts a local Netlify Blobs server (no `netlify dev` needed); Astro's session
driver is `cloudflareKVBinding`, not `cloudflareKV`; `StatementSync` has no `close()` in Node 24.

**Decision impact.** On a single Node process none of these is needed: the `Votes` tab itself is the durable vote record
(rebuilt into memory on every refresh), rate limits are in-process, and the last-good snapshot is in memory (plus disk where a
volume exists). The table above is the documented migration path if the site ever moves to a serverless host.

## 3. keyless-sheets-auth → ADR D3, D9 (17 / 4 / 1)

**Question.** Can the server call the Sheets API without a service-account JSON key, and what does google-auth-library 11 need?

**Answer.** Yes on every host. Google Cloud organisations created on/after 2024-05-03 block key creation by default
(`iam.managed.disableServiceAccountKeyCreation`); leaked keys are auto-disabled (`DISABLE_KEY` since 2024-06-16); an org-policy
admin can override per project. Keyless paths: (a) Workload Identity Federation with the host's OIDC token — only Vercel issues
one (`x-vercel-oidc-token`, all plans; needs `roles/iam.workloadIdentityUser` and service-account impersonation because
Drive files are authorised by sharing, not IAM); (b) the owner's OAuth refresh token via `UserRefreshClient` with an
**Internal** consent screen (no verification, no 7-day expiry) — host-agnostic, three env vars; (c) an API key reads only
"Anyone with the link" sheets. `@googleapis/sheets` 14.0.0 does **not** escape the `google-auth-library@10.5.0` pin
(via googleapis-common 8.0.3).

**Fact-check corrections.** Four refutations were attribution/scope details (the `@googleapis/sheets` pin above; Netlify's lack
of OIDC is argued from absence; the WIF gcloud snippet needs the `workloadIdentityUser` binding). Core thesis stands.

**Decision impact.** `client.ts` supports `GOOGLE_AUTH_MODE = service_account | oauth_refresh` from day one; `SHEET_SETUP.md`
documents both; the org-policy question is on the owner's checklist.

## 4. image-endpoint-allowlist → ADR D6 (21 / 3 / 1)

**Question.** How does a custom `image.endpoint` in Astro 7.3 validate remote hrefs at request time against a dynamic allow-list?

**Answer.** `image.endpoint.entrypoint: 'src/image-endpoint.ts'` is honoured in dev and build; the file exports `GET`, checks the
request, then delegates to Astro's own handler (`astro/assets/endpoint/node` under @astrojs/node, `…/generic` on Vercel or
Netlify with `imageCDN: false`; Cloudflare overwrites the endpoint, so the pattern does not apply there). `image.domains` must
still list `lh3.googleusercontent.com`, otherwise `<Image>` emits the raw URL unoptimised. Config-level patterns cannot scope to
the studio's files because Drive ids are opaque.

**Fact-check corrections.** Validate the **whole** transform tuple (`href, w, h, f, q, fit, position`), not just `href`/`w`,
or an attacker still mints unbounded sharp work; Astro's sharp service hardcodes `failOn: 'none'`, so set `limitInputPixels`;
the delegate module differs per adapter; a `data:` href passes `isRemoteAllowed` only with an unconstrained `{}` pattern.
`@astrojs/cloudflare` exports `./image-transform-endpoint`, not `./image-endpoint`.

**Decision impact.** Phase 3 uses a plain `<img>` (no `/_image` exposure at all); the validated-endpoint pattern is the
documented route if `<Image>` is reintroduced after the image mirror exists.

## 5. drive-hotlink-reliability → ADR D6 (22 / 2 / 0)

**Question.** Is `lh3.googleusercontent.com/d/<id>` hotlinking throttled, blocked or policy-changed in 2025–2026?

**Answer.** The pattern is undocumented; Google's stated position since 2024-01 is that Drive download URLs are not an
embedding mechanism. Live probes on three of the studio's own photo ids: 200 `image/jpeg`, size suffixes `=w`/`=s`/`-c`/`-rw`
honoured, ETag `"v1"` with 304 revalidation, `Cache-Control: private, max-age=86400`, no referrer or UA gating, a 45-request
burst clean. `/thumbnail` is a 302 to the same lh3 URL; `uc?export=view` 303s to `drive.usercontent.google.com` with
`private, max-age=0`. Google changed thumbnail access without notice in 2025-10. Drive's separate per-file "too many users have
viewed or downloaded" lock (≈24 h, no published threshold) still exists. Hotlinking requires "Anyone with the link" sharing,
which one Workspace admin toggle can revoke for every file.

**Fact-check corrections.** The "10+ images rate-limited" quote is one GitHub comment (2024-12), not two independent reports;
Astro's build cache revalidates lh3 with `If-None-Match` (304) rather than re-downloading.

**Decision impact.** Hotlink lh3 in Phase 3 (parity with the legacy site), mirror server-side in Phase 5/6; keep a single
`driveImageUrl()` so the switch is one function; do not make ImageKit the default (it would still use lh3 as origin).

## 6. counter-formula-vs-write → ADR D4 (23 / 1 / 1)

**Question.** Can concurrent `values.append` calls lose rows, and does a read right after a write see recalculated COUNTIFS?

**Answer.** Google's own engineer (2016) confirmed concurrent appends can overwrite each other and offered two workarounds:
`insertDataOption=INSERT_ROWS`, or a `batchUpdate` of `insertDimension` + `updateCells` "in one atomic unit". Field reports
2023–2026 match (several via n8n, which actually does client-side read-then-update). Only `batchUpdate` carries a documented
per-call atomicity guarantee; server-side serialisation of batches is plausible but not documented. Read-after-write
recalculation is undocumented; the only measurement (2017) shows API writes trigger recalculation. `batchUpdate` can return the
recalculated row in the same call (`includeSpreadsheetInResponse` + `responseRanges`). Sheets API overage billing is planned
"later in 2026".

**Fact-check corrections.** The researcher missed that the same 2016 thread endorsed `INSERT_ROWS`; the "batches are
serialised server-side" explanation is unverified.

**Decision impact.** Site writes one atomic `batchUpdate` insert per vote; `likes`/`dislikes` are COUNTIFS array formulas
(summing `Votes` and `VotesArchive` so archiving never changes counts); `values.append` with `OVERWRITE` and with `INSERT_ROWS`
exists only in the Phase-5 three-writer concurrency test, whose result is recorded here before shipping.

## 7. apps-script-anonymous-deploy → ADR D3 (17 / 1 / 2)

**Question.** Which Workspace admin settings prevent an Apps Script web app with access "Anyone", and how does it fail?

**Answer.** Two switches: Drive and Docs › Google Apps Script OFF (kills web apps **and** triggers) and Drive external sharing /
publish-on-the-web OFF (hides the "Anyone" option; no error, the dropdown simply lacks it). Apps Script became a Workspace core
service on 2026-06-22 with no new web-app restriction. Rhino stopped executing 2026-01-31 → `runtimeVersion: "V8"` is mandatory.
Node's `fetch` strips `Authorization` on the cross-origin 302 that every `/exec` answer performs. The only quantitative web-app
timing (2018 benchmark) implies ≈0.4–0.5 s overhead per call; the "400–1500 ms" figure concerns `google.script.run`.

**Fact-check corrections.** The latency reading of the 2018 benchmark was wrong (server slept 5 s by design); two UI-label
claims remain unverifiable without a throwaway tenant.

**Decision impact.** Moot for the main path: the legacy web app is retired and the new script is outbound-only (trigger →
`/api/revalidate`). The two admin switches go into the owner runbook because they also affect the trigger.

## 8. sheets-client-choice → ADR D3 (24 / 4 / 0)

**Question.** Can google-spreadsheet 5.3.0 set `valueRenderOption`/`dateTimeRenderOption` and retry 429s, or must we call
`values:batchGet` ourselves?

**Answer.** `getRows()` cannot set render options (always `FORMATTED_VALUE`, locale strings). `doc.sheetsApi.get('values:batchGet',
{ searchParams })` and `sheet.batchGetCellsInRange(ranges, opts)` forward the options (the TS type lacks `dateTimeRenderOption`,
so a cast is needed; the type is not exported). ky retries 429/5xx on GET by default and **retries network errors for every
method listed in `retry.methods`**, so a naive `post` retry would replay a vote. google-auth-library's `client.request()` /
`fetch()` retries nothing unless `retry:true`/`retryConfig` is passed, and its `params` object comma-joins arrays (so repeated
`ranges=` must be built by hand). gaxios resolves to 7.3.1 (byte-identical retry code to 7.3.0).

**Fact-check corrections.** Three of the report's snippets were broken (ky `shouldRetry` signature, non-exported type,
gaxios `params` array handling) — all fixed in the notes above.

**Decision impact.** Neither wrapper buys anything once reads need raw `values:batchGet` and writes need raw `batchUpdate`:
the ADR uses google-auth-library 11 for tokens only, native `fetch` with a hand-built query string, and an explicit 20-line
retry that never replays writes on network errors.

## Contradictions the critic listed, and how they were resolved

| Contradiction                                                                              | Resolution                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Host: Node standalone vs Netlify Free vs Vercel                                            | Node standalone container (D2); Netlify Free and Vercel Hobby ruled out on hard cap / non-commercial terms                          |
| Client library: raw fetch vs google-spreadsheet                                            | Raw REST + google-auth-library (gap 8)                                                                                              |
| `onChange` fires for API writes?                                                           | Irrelevant: revalidation uses `onEdit` only (never install `onChange`), and the vote endpoint updates the in-memory snapshot itself |
| gaxios retries default on/off                                                              | Off unless configured (re-verified from `retry.ts`); we own the retry                                                               |
| Hand-rolled cache vs Astro 7 route cache                                                   | Both layers, one process (D5): data cache with stale-if-error + route cache with tags                                               |
| Vercel `invalidateByTag` soft                                                              | Documented in the portability table; `dangerouslyDeleteByTag` if Vercel is ever chosen                                              |
| Vercel ISR `x-prerender-revalidate` for Astro                                              | Unverified; moot for Node                                                                                                           |
| Client-id cookie in middleware                                                             | Set only in `POST /api/vote` (D8)                                                                                                   |
| Vercel Node runtime selection                                                              | Build-machine Node via `engines`; moot for Node standalone                                                                          |
| Version attributions (`typescript6` 6.0.2, Netlify remote-images 5.2.0, Cloudflare 13.0.0) | Corrected in the briefs and D11                                                                                                     |
| Frankfurter Google Sheets page 404                                                         | Page exists (`frankfurter.dev/google-sheets/`); IMPORTDATA recipe documented as the zero-code option                                |
| Zod `RatesRow` schema                                                                      | Reads use `UNFORMATTED_VALUE` + `FORMATTED_STRING`; `''` → `undefined` before Zod                                                   |
