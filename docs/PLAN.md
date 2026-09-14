# PLAN — Serio Ludere catalogue → Astro + Google Sheets

Living document. Updated at the start of every phase and whenever a decision changes.

## Phase 1 — Read reference · inspect live data · research · ADR (IN PROGRESS → checkpoint)

Goal: no code yet. Understand the reference exactly, learn the real sheet shape, verify
every library/API/hosting fact against live docs, and record decisions in `docs/ADR.md`.

Steps

1. Read `reference/catalogue.html` end to end; list every behaviour that must be preserved. ✅
2. Inspect the live data: call the existing Apps Script `list_catalogue` once (read-only) and
   record the actual field names, types and quirks (comma-separated tags, `method` column,
   `Wabi-sabi` vs `Wabi Sabi`, untrimmed strings, empty photos). ✅ (ADR §3)
3. Locate the source Google Sheet via the Drive connector; read the real headers. ✅
   (private "Stock" workbook = legacy source; new empty "Catalog Database" = proposed target)
4. Research: 7 topics × (researcher + fact-checker + breakage-hunter) = 21 agents ✅;
   completeness critic ✅ (8 gaps, 12 contradictions); gap round: 8 researches ✅,
   8 fact-checks (3 ✅, 5 ⏳). Consolidated briefs in `docs/research/<topic>.md` ✅.
   (A session restart killed the first run mid-way; 25 finished results were recovered from
   the run journal and only the unfinished agents were re-run.)
5. ADR decisions D1–D11 written from the briefs ✅ → gaps brief `docs/research/gaps.md` ✅ (raw
   reports copied to `docs/research/gaps/`) → adversarial ADR review, 4 lenses × (reviewer + judge):
   57 findings; all four judges done ✅ (facts/security re-run after a session-limit failure) →
   **ADR revision 2 written** applying every confirmed/partial finding plus the judges' surviving
   missed items ✅ (cookie identity, host-specific client-IP header, standalone alert/backup script,
   immediate secret rotation, no bust per vote, bounded Votes read, archive-safe formulas, text ids,
   USER_ENTERED formula install, failure policy + /api/health + owner alerts, revalidate hardening,
   least-privilege Apps Script scopes, tab protections, log redaction, input validation, page contract D12).
6. ⏸ **Checkpoint 1 reached (2026-09-06)** — waiting for "go". Owner decisions listed in ADR §6:
   sheet ID, host, Google auth mode, legacy secret rotation / old page, rates auto-refresh.

## Phase 2 — Scaffold (IN PROGRESS, started 2026-09-06 on the owner's "development OAuth client, keep the

## sheet local" instruction; remaining ADR §6 answers deferred to checkpoint 2)

Done: package.json (pinned D11 versions, installed), astro.config.mjs (server output, Node standalone,
memoryCache, astro:env schema with validateSecrets), tsconfig/eslint/prettier/vitest configs, .env
(dev OAuth client, random secrets; gitignored), scripts/google-auth.ts (local consent helper),
src/lib/sheets/{contract,types,errors,client,parse,read,write,cache,config}.ts, src/lib/{text,images,units,
currency,rotate}.ts, scripts/{init-sheet,roundtrip}.ts + scripts/lib/{seed,env}.ts, 8 unit test files +
1 mocked integration test, docs/SHEET_SETUP.md. Adversarial code review (correctness · sheets-api ·
security · tests, each with a judge; 51 findings) applied: header validation on empty tabs,
order-independent vote-state rebuild, warnings split from drops + per-tab 10 % rule, cache failure
cooldown / bust-while-in-flight / delta replay / validated raw-range persistence (no vote data on
disk), stricter parsing (no comma coercion, whitespace blanks, duplicate ids, contract-only rotate and
featured, allow-listed cover URLs, bounded vote cells), stronger log scrubber, token errors fail fast,
non-replayed spreadsheet creation, PKCE + state hygiene in the consent helper, check-photos script,
route-cache key `include: []`, live round-trip proves literal "=1+1" storage and can probe containment.
87 tests, typecheck/lint/build green. Waiting on: owner consent (redirect URI registration + consent
click) → sheet:init → roundtrip → checkpoint 2.
Original plan:
astro 7.3.1 + @astrojs/node 11.1.5 (standalone) + Node 24; astro:env schema; `src/lib/sheets/{client,read,write,cache}.ts`
(google-auth-library JWT or refresh-token + native fetch + own 429/503 retry); Zod schemas + header contract;
`scripts/init-sheet.ts` (create tabs, header array formulas for likes/dislikes/rating, seed Rates, import the 20
live rugs); Vitest 5 smoke test; ESLint 10 flat config. Round-trip demo = batchGet all tabs → insert one Votes row
via atomic batchUpdate → read counts back.

## Phase 3 — Port the reference page 1:1 (code complete 2026-09-06; screenshot comparison in the final test pass)

`src/styles/{tokens,catalogue}.css` verbatim; components Layout/Header/Wordmark/Controls/CollectionNav/RugGrid/RugCard/
RugPhoto/VoteButtons/Footer; client modules `src/scripts/{prefs,tabs,photos,votes}.ts` (localStorage `sl-unit`/`sl-cur`,
`?collection=` tab state, rotate/placeholder, toggle votes with `sl-saved`); `src/lib/view.ts` pure view helpers;
`src/lib/runtime.ts` singletons from astro:env; `/` renders on demand from the cached snapshot, route cache tag `sheet`.
Owner instruction 2026-09-06: run Phases 3–6 without checkpoint pauses; all testing (live Google, screenshots) at the end.

## Phase 4 — Detail page, tags, rating (code complete 2026-09-06)

`/rugs/[slug]` (gallery, description, dims, meta incl. method, price, rating "4.6 · 23 votes", tags, votes; 404 for
draft/archived/unknown; 503 when no snapshot), `/tags/[slug]`, rating line on cards, `GET /api/catalogue` DTO, `GET /api/health`.

## Phase 5 — Voting API, rate limit, revalidation (code complete 2026-09-06)

`POST /api/vote` (JSON-only + Sec-Fetch-Site posture, `__Host-sl_v` cookie identity hashed with VOTE_SALT, host-specific
client-IP header, per-visitor/ip/rug/global limits, synchronous in-flight guard, toggle/flip semantics, optimistic
in-memory delta with revert on write failure), `POST /api/revalidate` (constant-time bearer check, 10 s coalescing, per-IP
failure cap, data + route cache bust), `google-apps-script/{onEdit.gs,appsscript.json,monitor.gs}` (notifier with 15 s
throttle + trailing trigger, optional Frankfurter refresh, standalone health alerts + weekly backup). The three-writer
concurrency test needs the live sheet → final test pass.

## Phase 6 — Tests, hardening, docs, final summary (code complete 2026-09-06; final test pass pending consent)

Done: Dockerfile + .dockerignore (build verified without .env using the placeholder secrets; Docker daemon is not
running on this machine, so the image itself is unbuilt), `scripts/archive-votes.ts` (archives only superseded rows),
`scripts/screenshots.ts` (Playwright + Chromium installed), SHEET_SETUP §5 (Apps Script install), README,
component render tests (Astro container API), client-script tests (happy-dom), smoke test of the built server
(pages, API posture, CSP + security headers) without a sheet, env schema switched to runtime-read variables (Astro
inlines `public` ones at build), hash-based CSP, `bodySizeLimit`, `SITE_URL` required, `CLIENT_IP_HEADER` default empty.
Adversarial review of Phases 3–5 (2026-09-06) applied in full — see ADR §7; the review also surfaced a client-side
replay loop in `votes.ts` (a failed request re-sent its own intent forever), caught by the new happy-dom test.
Gates: 139 tests, typecheck, lint, prettier, build green.
Live pass 2026-09-06 (owner consent landed with a new dev OAuth client, project `poised-beach-484215-e5`):
`sheet:init` created "Serio Ludere — Catalog Database (dev)" (id in `.env`), seeded 20 rugs / 8 collections / 30 tags / 6 rates,
formulas OK; `sheet:roundtrip --check-containment` OK (atomic insert 751 ms, recount 416 ms, `=1+1` literal, undo OK;
`updateCells` on Rugs allowed because the dev sheet is unprotected and owned by the same account); `test:live` 1/1;
built server against the sheet: pages 200/404, route cache MISS→HIT, CSP header, 19 active cards (draft row hidden),
vote flow through `/api/vote` (add, idempotent add, flip, remove) + `/api/revalidate` reconciled with the sheet
(8 rows, formulas back to 0/0/0); screenshots `docs/screenshots/{reference,site,site-kilims}.png` refreshed.
Owner's `astro dev`, running during `sheet:init`, reloaded `.env` the moment the id was written and answered 503
(contract error on the still-empty Rates headers) for a few seconds, then recovered; `sheet:init` now writes the id last.
Multi-agent parity + evidence review (67 agents): 17 findings confirmed, 4 refuted; the four should-fix items (slug-keyed tab
counts/order, clicks during an in-flight vote, unit/currency pre-paint on every page, metadata-read failure keeping the breaker
armed) plus the cheap notes were applied the same evening — details in ADR §7.

## Design pass (2026-09-07, complete)

Owner request: better visuals for the detail page and images, skeleton loaders, animations, page transitions (GSAP ok),
same layout language. Design round: docs/DESIGN.md (3 directions, 3 judges, "Folio" won). Shipped per ADR D13:
editorial.css + motion.css layers, plate ratio system, proportion-diagram placeholders, plate state machine, sticky tabs
with ink bar + standfirst, lead cards, price/rating row, Gallery/Specs/Pager/RelatedRugs, native lightbox, GSAP Flip tab
reflow (lazy), cross-document view transitions with the card→hero morph (no ClientRouter: unsupported under the CSP),
navigation progress bar, ghost grid on 503. Verified with `npm run qa` on the built server (CSP clean, CLS 0.00,
reduced-motion path, keyboard reach) and fresh screenshots (site, kilims, detail, mobile). Gates: 165 tests green.

## Admin panel (2026-09-07, spec ready — docs/ADMIN_SPEC.md, phases 7–11 pending)

Owner request: rebuild reference/admin.html as an authenticated /admin route (scraper-assisted add rug, product CRUD,
collections tab, unique client links + audit log, round-up-to-5 prices). Research verified: ecarpetgallery.com is
Magento/Hyvä behind Cloudflare (Node fetch blocked, impit/curl pass, Jina Reader fallback), karavanrug.com is Shopify
with JSON-LD + /products/<handle>.js. `src/lib/price.ts` (roundUpTo5) already in. Owner decisions listed in
ADMIN_SPEC §11.

## Admin panel build (2026-09-08)

Phases 7–11 of docs/ADMIN_SPEC.md are implemented: scraper library (src/lib/scrape, supplier adapters

- SSRF guard + fixtures), Drive client (src/lib/drive), admin foundations (auth/session/audit/lock/
  row-addressed writes), admin pages and JSON API under /admin and /api/admin, vanilla-TS admin scripts.
  The build's integrator agent was cut off by a session limit, so the tree was left red; repaired here:
  3 typecheck errors, 4 lint errors and 8 failing tests (three test expectations contradicted the shared
  fixture defaults, one needed a table wrapper, one needed a per-test limiter reset, and rug-form.test.ts
  had to move to the node environment because Astro's container cannot resolve .astro under happy-dom —
  see tests/helpers/dom.ts). Gates: 503 tests, typecheck, lint, prettier, build all green.

## Brief reconciliation (2026-09-08)

`brief-astro-developer.pdf` v0.5 arrived and supersedes the original brief for data, auth, scraping and
storage; the Figma file is the source of truth for UI. Full gap analysis in **docs/BRIEF_GAP.md**.
Headline: three pillars missing (per-customer gated preview `/{slug}`, Shopify-CSV `Products` tab,
Figma design system) and two built to a different shape (admin IA, Drive commit pipeline). The Figma
file itself is blocking input for anything visual.

## Decision log

- 2026-09-05: `reference/catalogue.html` is a copy of the root `catalogue.html` (kept untouched).
- 2026-09-05: Host = Node standalone container (DigitalOcean App Platform $5 recommended; Railway Hobby dropped after
  Railway staff called commercial use a Pro workload); likes/dislikes formula-owned;
  votes = atomic batchUpdate insert at row 2; plain `<img>` + lh3 in Phase 3, image mirror in Phase 5/6;
  both service-account-key and OAuth-refresh auth modes. See ADR D1–D11.
- 2026-09-05: The shared `SECRET` shipped in the reference (`SL-view-9f3c81`) is treated as compromised;
  the legacy web app is archived once the new site is live.

## Phase 12 — Owner requirements (2026-09-13)

Ten requirements arrived together. Mapped one agent per requirement against the repo, then reconciled
across them; the reconciliation changed the shape of the work materially, so the plan below is by
**work item**, not by requirement. The mappers' independent sum was 145.5h; the honest combined figure
is **~47h plus one unpriceable spike**, because four of the ten collapse into two and one is already
85% built.

### Incident — uncommitted half-migration in the tree (2026-09-13)

The mapping pass was instructed to read only. It did not: ~34 files were modified and
`src/components/ui/MultiSelect.astro` + `src/scripts/ui/multi-select.ts` were created, landing roughly
85% of requirement R3 (multi-collection) with none of its design decisions taken. **Consequence: 4
tests red and the admin rug form cannot save** — `src/scripts/admin/rug-form.ts:364` posts `collection`
while `src/lib/admin/dto.ts:50` now requires `collections`, so every Add and Edit 400s. This work is
interleaved with the uncommitted Figma pass in the same files, so a wholesale `git checkout` would
destroy both. Resolve forward (finish R3) rather than revert. Nothing may be committed until the tree
is green.

### Work items, in dependency order

**W1 · Unbreak + finish multi-collection (R3)** — ~14h, ~2h of which is the fire above.
Already landed: `collections: string[]` on the domain type, `splitCollections` / `joinCollections`
(`src/lib/text.ts:76-100`), parse, tab ordering, `CardView.collections`, prev/next by slug overlap,
public card `data-collections`, write DTO + resolver + sheet write. Still open: the rug form post body;
`src/scripts/prepaint.js:26` still reads the primary-only attribute (a first-paint flash of the wrong
cards on `?collection=` deep links, and its CSP hash moves); admin filter and chip counts are
primary-only (`src/scripts/admin/rug-list.ts:29`, `RugCardAdmin.astro:29`, `RugRow.astro:38`);
`/api/catalogue` still publishes the scalar; the copy at `src/pages/admin/collections.astro:130,142`
("A rug can only sit in one") is now false; ADR D12's join rule was amended by code with no record.
**Blocked on owner decisions 3a–3d below.** Do this first — W4 and W5 edit the same `data-*` contract.

**W2 · Footer phone (R8)** — 10 minutes of code; the rest is one question.
`src/lib/studio.ts:7-8` (two constants) plus `tests/unit/design-view.test.ts:104`. The number renders
in `src/components/Footer.astro:35-36` (public catalogue) only; `PreviewFooter.astro:8` imports just
`STUDIO_EMAIL` and `STUDIO_NAME`, so if the owner is looking at a `/{slug}` preview link a correct fix
changes nothing they can see. Also correct `docs/DESIGN.md:552,1842`, which hardcode the old number as
spec. Leave `reference/catalogue.html:93` alone — parity record, ADR D18.

**W3 · One pricing rule for both suppliers (R1 + R2)** — ~9h combined, vs 15h apart.
These cannot be sequenced: whichever lands first gets rewritten by the second. Both rewrite the same
nine-line `retailSuggestion` (`src/lib/scrape/money.ts:97-105`), reached only from
`src/lib/scrape/index.ts:136`. One rule subsumes all three shapes:
`retail = round(base x PRODUCT(factors) + band(x), step)` — ECG `factors=[1.5], bands=[always +150]`;
Karavan `factors=[0.7, 2], bands=[(0,500) -> 100, [500,1000] -> 150, (1000,inf) -> 200]`; a plain
markup `factors=[m], bands=[]`. One `PricingRule` type, one `pricingRuleFor(settings, supplier, env)`
beside the existing `markupFor`, one substitution point, one provenance set, one form hint.
**Blocked on decisions 1a–1d.**

**W4 · Preview card pass (R5 + R6 + R7)** — ~14h combined (likes ~10h, badges ~4h).
Four requirements land on one 30-line block, `src/components/customer/ProductCard.astro:78-111`, and
they are complementary rather than conflicting — but only visibly so from above. The heart moving to
bottom-right vacates top-right, and the badge then brackets the plate the way the public card already
does (`catalogue.css:178-187`). One rewrite of the overlay layer, one z-index ladder, one D18
amendment. Likes are **already stored and derived** — `parse.ts:553-566`, on `CardView` at
`view.ts:29-31`, populated at `:122-124`, already returned by `POST /api/reactions` — so R5's "stored
count" needs no new storage; nine of the fourteen files in its mapped change surface were "only if
stored". The real work is the sort comparator, the control, the heart restyle and the 5+ threshold.
Note `tests/unit/styles/icons.test.ts:19-38` asserts the glyph set is exactly 18 names — fill the
existing heart path, do not add `heart-filled`. **Blocked on decisions 4a–4d and 5a–5b.**

**W5 · Customer route obfuscation (R4)** — 5h without a literal `%`, 12h+ with it.
The entire cost difference is the `%`. `src/lib/customer/gate.ts:83` reads the raw
`context.url.pathname` while Astro hands the route param back `decodeURI`'d, so the gate would mint a
cookie for `sl_c_x%25s` while `login.ts` sets `sl_c_x%s` — a silent, permanent, unlogged login loop.
Two must-fixes regardless of the answer: reserved words are enforced on requests but **not at
generation** (`src/lib/admin/clients.ts:28-43` can currently mint `admin`), and `newClientCode` retries
exactly once, which is safe at 36^6 and not safe once the keyspace shrinks. Also fix
`docs/ADMIN_SPEC.md:705`, which documents a link shape (`/?c=`) that has not been shipped since
`clients.ts:52`. **Blocked on decisions 2a–2c.**

**W6 · Rotate the Karavan primary image (R9)** — ~5h scoped honestly.
The sheet stores exactly one photo per product (`src/lib/admin/write.ts:134`), so "rotate the first
image" and "rotate the image" are the same instruction, and the gallery / thumbnail / lightbox half of
the mapped surface is work for a multi-photo world the sheet cannot express. Recommended shape: the
supplier **seeds the existing `rotate` tag flag** at scrape time and the owner always overrides — that
keeps one source of truth (ADR R8), makes double rotation structurally impossible, and makes any
backfill a plain Tags-cell rewrite. The only real chunk is that the preview realm has no rotation
support at all. **Gated on W7's ingest-vs-render answer — it is the same seam.**

**W7 · Background removal (R10)** — unpriceable; spike before planning.
The repo has no image-processing capability, and the target host is ADR D2's `apps-s-1vcpu-0.5gb`
($5, 512 MB, no disk). Feasibility is **unknowable from the repo**: no image bytes are committed, only
URLs. Two unverified blockers — whether lh3's `=w800` re-encode preserves alpha
(`src/lib/drive/media.ts:124`; the repo's own research documents WebP and no-upscaling but says nothing
about alpha), and whether ECG scraping runs at all (`SCRAPE_RESPECT_ROBOTS` defaults true,
`astro.config.mjs:74-78`). **Do a 30-minute spike first: 5 real supplier URLs plus one alpha probe.**
If the source photos are flat studio white, sharp is already in `node_modules` as Astro's optional
dependency and this collapses to ~6h. If not, the honest answer may be that the studio cuts out the
primary by hand — `rug-form.ts` already accepts a pasted Drive id.
If both W6 and W7 ship, **rotate-then-cut is the only correct order**: a cutout's tight alpha bounding
box is meaningless if the image is subsequently turned 90 degrees.

### Owner decisions this phase is blocked on

1. **Pricing** — (a) in the Karavan band, is X the scraped base or the post-x1.4 subtotal? base 400 ->
   **$660** under the base reading, **$710** under the subtotal reading; 500 -> $850 either way;
   800 -> $1270 vs $1320; 1200 -> $1880 either way. (b) Are the band edges inclusive as written — 500
   exactly -> +150, 1000 exactly -> +150? (c) Does the existing round-up-to-5 still run, and before or
   after the additive term? (d) Do 0.7 / 2 / the bands live in the Settings tab, where every sheet
   Editor can read them? ADMIN_SPEC 3.2 and ADR 3.2 both call margin structure confidential.
2. **Route** — (a) must a literal `%` appear, or was `%s` shorthand for "some punctuation"? Compare
   `hi6g2a3a-s` / `hi6g2a3a_s` against `hi6g2a3a%25s`, which is what the address bar would actually
   show. (b) Derived from the name or random? "Half the letters" reads derived; "no fixed rule" reads
   random; the example's digits (6, 2, 3) are in neither. (c) Retro-fit existing customers, or new
   links only?
3. **Collections** — (a) which collection owns a product's breadcrumb and lead placement when it is in
   three? (b) Per-tab counts now sum to more than the catalogue — acceptable? (c) **Audit the live
   Collections tab for a `|` before this ships** — `splitCollections` has no escaping and
   `CollectionInput.name` does not refuse the character, so a collection already named with a pipe
   shatters silently and unrecoverably on the next read. This is a 60-second check only the owner can
   do. (d) Does the admin _list filter_ become multi-select too, or only the edit form?
4. **Likes** — (a) "bottom right of **the page**" — one floating button fixed to the viewport, or one
   heart per card? Only per-card is consistent with per-product liking. (b) Whose likes does the count
   show — every buyer's, or only this buyer's? A buyer seeing other buyers' counts is a disclosure.
   (c) Sorting by a hidden count discloses it ordinally: either sort only among the 5+ set, or drop the
   threshold — those are the only two internally consistent answers. (d) Is "highest likes" the default
   order or opt-in? It competes with `withLeads()` (`view.ts:138-163`), which physically splices a
   featured rug to the front of its run and cannot co-exist with a popularity sort.
5. **Badges** — (a) `Signed` is already a **collection** in this system (`contract.ts:176`, ADR R5) as
   well as a tag. Does the badge key off the tag, the collection, or either? Multi-collection makes
   "filed under Signed _and_ tagged Signed" much more likely, and nobody has said what that card shows.
   (b) Does a `Signed` row exist in the `Tags` tab of every sheet? If not, `resolveTags` 422s and the
   feature is inert (`_shared.ts:87-94`).
6. **Scope** — is `PUBLIC_CATALOGUE` staying on? It defaults true (`astro.config.mjs:84`) while ADR D14
   says the preview _replaces_ the public catalogue as the product. If it is going off, roughly a third
   of the change surface above is work on pages nobody will see. One question, very large answer.

### Doc and decision-record defects found while mapping

- **ADMIN_SPEC.md:733-734 is false and will produce a wrong price**: "the step is configurable so a
  tiered rule (e.g. >= 1000 -> 50) can be added without touching callers". `roundUpToStep(1120, 200)`
  is 1200, not 1320. The Karavan band is additive, not a rounding step; anyone reaching for
  `price_round_step` — the obvious existing knob, blessed by the spec — gets a plausible-looking wrong
  number. Correct it in the same pass.
- **There is no admin-panel ADR at all.** `ADMIN_SPEC.md:993-995` cites "ADR D13 (D13.6 price rule)";
  `ADR.md:530` D13 is the Design pass. Neither pricing requirement has an existing decision to amend.
- **ADR D4 (ADR.md:266-268)** still documents formula-owned `likes` / `dislikes` via COUNTIFS over tabs
  (`Rugs` / `Votes`) that no longer exist, while `parse.ts:530-533` states the site never reads a
  stored count. Amend it whichever way decision 4 lands, or the next engineer implements COUNTIFS
  straight from the ADR.
- **ADR D12 (ADR.md:512)** — "rugs store display names" was amended by uncommitted code, no record.
- **ADR D14 (ADR.md:599-601)** rests on slugs being random-suffixed (36^6 ~ 2.2e9); a name-derived
  scheme is ~1e6-1e7, so that trade-off must be re-accepted explicitly rather than inherited.
- **ADR D18 (ADR.md:671-675)** — badges on the public card go in `editorial.css`, never
  `catalogue.css`. D18 also pins the reaction control to "#000000 on #ffffff"; a red-filled heart
  overturns it and contradicts `preview.css:64` ("the focus ring is ink, never the brand red: red next
  to a destructive action reads as an error"). It would be the first brand-red non-destructive
  affordance in the preview realm.
- **ADMIN_SPEC.md:699-702** claims code uniqueness is checked "under the admin lock". It is not — the
  snapshot read is outside `withAdminLock`. Harmless at 36^6; not harmless once the keyspace shrinks.
- **tests/unit/revalidate-view.test.ts:219-221** ("every card's `data-collection` matches exactly one
  tab, and the counts add up") is now **vacuously green** — every fixture is single-collection. That is
  worse than red; give it a multi-collection fixture.
- Write **one** ADR entry covering this batch, not nine.
