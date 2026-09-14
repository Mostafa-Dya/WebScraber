# Gap analysis — `brief-astro-developer.pdf` v0.5 vs. the project as built (2026-09-08)

> ## Status, 2026-09-08 (later the same day)
>
> The analysis below is the original reading of the brief and is left unedited as the record. Most of
> it has since been built. What is **done**, with where to look:
>
> | Gap                                                | Now                                                                                            |
> | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
> | §1/§7/§10 the customer realm                       | ✅ `/{slug}`, `/{slug}/{productId}`, gate, per-realm cookies, reserved slugs, default-deny     |
> | §10 generated passwords                            | ✅ three words + two digits, scrypt, revealed once, reset from the clients table               |
> | §2 `Visits`                                        | ✅ one row per buyer per 30 min, coarse UA, never fails a render                               |
> | §2/§9 `Products` as the Shopify CSV set            | ✅ 42 columns A..AP, keyed by `Product ID`                                                     |
> | §2 `Reactions` with `event_id` + `source`          | ✅; counts are derived from the log, not stored                                                |
> | §3 rule 2 client batching                          | ✅ 2.5 s buffer, one append per flush, `sendBeacon` on hide                                    |
> | §3 rule 3 compaction as an action                  | ✅ `POST /api/admin/compact-reactions`                                                         |
> | §7 asymmetric reactions, text labels, 44 px        | ✅ card = like only, detail = both, `source` recorded and enforced                             |
> | §7 footer disclaimer, no enquiry action            | ✅ both                                                                                        |
> | §7 collection description clamped with "See more"  | ✅                                                                                             |
> | §8 `BASE_CURRENCY`, `FX_API_URL`, fallback, GBP    | ✅ `src/lib/rates.ts`; a price renders with no network at all                                  |
> | §8 `GET /api/rates`                                | ✅                                                                                             |
> | §9 `GET /api/export/shopify-csv`                   | ✅ at `/api/admin/export/shopify-csv` — the brief's path would have been public                |
> | §12 `/api/image/[fileId]`                          | ✅ and every photo is now served through it — lh3 anonymously first, the Drive API as fallback |
> | §12 folder tree + duplicated primary               | ✅ `<root>/<id> — <name>/All Images`, primary copied up as `01-primary`                        |
> | §12 commit order + `Commit Status` + retry         | ✅ row written `pending` first, `complete` after; "Finish photo import" re-runs the shortfall  |
> | §11 `fieldStatus`, size band, Shopify-first ladder | ✅ `src/lib/scrape/*`, plus robots.txt, a 2 s per-host throttle and a photo-first response     |
> | §13 `@view-transition` must not reach the admin    | ✅ it never did: `motion.css` is imported by `Layout.astro` only                               |
> | §5 the three `[data-mode]` token sets              | ✅ `src/styles/modes.css`, corrected against the Figma file's own variables                    |
> | §5/§7 the customer preview's visual design         | ✅ rebuilt from the Figma handoff on 2026-09-09 — see ADR D18 and `docs/screenshots/preview/`  |
> | §18 env names                                      | ✅ `AUTH_SECRET`, `BASE_CURRENCY`, `FX_API_URL` added; `PUBLIC_CATALOGUE` is new               |
>
> **One decision this pass surfaced and cannot make for you.** Honouring robots.txt is what §11 asks
> for, and it is now on by default — but eCarpetGallery publishes `Disallow: /`, so with it on a scrape
> of that supplier answers `blocked` before a single request. `SCRAPE_RESPECT_ROBOTS=false` turns it
> off. That is a relationship question, not a code question: decide it and write the answer down.
> `docs/ADMIN_SPEC.md` §4.5 already called this "tolerated-use territory".
>
> **Not done, deliberately: Tailwind (§4).** The brief asks for Tailwind plus CSS variables. The
> variables are done; Tailwind is not. Under the hash-based CSP the play CDN is unusable, so it would
> mean a build-step dependency and rewriting every component's styles, for no behaviour the token
> layer does not already give. It is a real deviation, not an oversight: raise it if the intent was
> the utility classes themselves rather than the token discipline.
>
> **The Figma file arrived on 2026-09-09** and the three customer-realm screens are rebuilt from it
> (ADR D18). That closes the item this document opened with as "blocking input needed". The admin's
> visual design is still not drawn anywhere.
>
> **The Drive pipeline was closed on 2026-09-13** (the three rows above). Three things worth knowing
> about the shape it landed in:
>
> - The retry works out what is missing by **listing `All Images`**, not by counting the photos on the
>   row. The Products tab has one image column, so a row records only the primary; counting it would
>   re-upload everything after the first photo. Filenames are deterministic, so a name already in the
>   folder is a photo that already landed — which makes the endpoint idempotent.
> - The proxy tries **lh3 anonymously before the Drive API**. The folder is shared with anyone holding
>   the link, so that path needs no token: images keep serving when the Drive grant lapses, and lh3
>   downscales on demand (`?w=400|800|1600`) where `files?alt=media` returns the original.
> - `driveImageUrl()` now returns `/api/image/<id>?w=<n>`. Server-side probes (`waitForLh3`,
>   `scripts/check-photos.ts`) deliberately still use `lh3Url()`: they check Drive, not our own origin.
>
> Still **not** built, and why: the
> admin IA rework (§6, a large UI change with no dependency on the rest) and RTL/Arabic (§8, not
> drawn).
>
> Open question 4 ("does the public catalogue stay?") is answered by a flag rather than a decision:
> `PUBLIC_CATALOGUE=false` gives the brief's posture exactly. Question 5 is answered — the enquiry
> links are gone. Questions 1 and 2 (adapter, islands) are unchanged and still the owner's.
>
> How to exercise all of it: `docs/TESTING.md`. The reasoning behind each choice: ADR D14–D17.

---

Read the brief as the current source of truth for **data, auth, scraping and storage**; it names the
Figma file (`07 · Handoff`) as the source of truth for **UI, tokens, IA and motion**. The project in
this repo was built from the earlier brief (rebuild `reference/catalogue.html` as a public catalogue
with likes/dislikes) plus the owner's later admin request. The infrastructure carries over almost
completely; the **product shape does not**.

**One-line verdict:** roughly 60 % of the engine is reusable as is, but three pillars are missing
entirely — the per-customer gated preview (`/{slug}`), the Shopify-CSV `Products` tab, and the Figma
design system — and two more (admin IA, Drive pipeline) are built to a different shape than the brief
specifies.

**Blocking input needed:** the Figma file itself. §5 forbids re-deriving token values from
screenshots, and §5/§6/§13 reference frames, a component inventory and a decision log that are not in
this repo. Everything marked **F** below cannot be finished correctly without it.

Legend: ✅ done · 🟡 partial (works, wrong shape) · ❌ missing · ⚠️ built but contradicts the brief.

---

## 1. Scope (§1)

| Requirement                                  | Status | Note                                                              |
| -------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Astro SSR app                                | ✅     | Astro 7.3.1, `output: 'server'`                                   |
| `/admin` password gate                       | 🟡     | Built (scrypt hash + signed cookie), but the IA is wrong — see §6 |
| `/{customer-slug}` private preview per buyer | ❌     | **Not built at all.** The catalogue is public at `/`              |
| `preview.serioludere.com`                    | ❌     | No host chosen; deployment targets a container, see §4            |
| Recording visits                             | ❌     | No visit tracking anywhere                                        |

The single biggest gap: today the site is a **public** catalogue. The brief describes a **private,
per-buyer** preview where the catalogue lives under a customer slug behind that customer's own
password, and the root is not public at all.

## 2–3. Storage model and the Sheets rules (§2, §3)

| Brief tab     | Columns                                                           | Ours                                                                       | Status                                                                                   |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Products`    | Shopify product-CSV set + rug fields (≈40 cols, listed in §9)     | `Rugs` A–V + admin W–Z, custom names                                       | 🟡 different contract                                                                    |
| `Collections` | id, name, slug, description, created_at                           | id, slug, name, description, cover_image_url, sort_order                   | 🟡 close; needs `created_at`, ours adds two                                              |
| `Customers`   | slug, display_name, password_hash, note, created_at, active       | `Clients`: code, name, note, status, created_at, created_by, link          | 🟡 same idea, wrong shape, **no password hash**                                          |
| `Reactions`   | event_id, customer_slug, product_id, reaction, source, created_at | `Votes`: timestamp, rug_id, vote, client, visitor_hash, user_agent, action | 🟡 append-only ✅, but no `event_id`, no `source`, `none` is modelled as `action=remove` |
| `Visits`      | event_id, customer_slug, occurred_at, user_agent, referrer        | —                                                                          | ❌ missing                                                                               |

Extra tabs we have that the brief does not mention: `Tags`, `Rates`, `VotesArchive`, `AuditLog`,
`Settings`. None of them conflict; `Rates` partly overlaps §8's rate table.

Rules in §3:

- **Rule 1, append-only, latest event wins** — ✅ implemented (`parseVoteState`), but keyed by
  `visitor_hash`, not `customer_slug`. Needs re-keying once customers exist.
- **Rule 2, batch writes on the client (buffer 2–3 s, flush one multi-row append, flush on
  `visibilitychange`/pagehide)** — ❌ **not implemented.** Today every click is its own POST and its
  own single-row insert. This is the rule the brief says is "requirements, not advice", and the
  reason is quota (60 writes/min/user), so it must change before more than a handful of buyers.
- **Rule 3, 60 s cache + manual refresh + compaction** — 🟡 cache ✅ (60 s TTL, `/api/revalidate`
  for manual refresh); compaction exists only as a CLI (`npm run votes:archive`), not as the
  `POST /api/admin/compact-reactions` action the brief lists in §14.

## 4. Stack (§4)

| Concern       | Brief                                                 | Ours                                                              | Status                                                                                                                           |
| ------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Adapter       | Vercel or Netlify, **Node runtime**                   | `@astrojs/node` standalone + Dockerfile, DigitalOcean recommended | ⚠️ works, but not what the brief asks; a decision to confirm                                                                     |
| UI islands    | **React or Svelte**                                   | vanilla TS modules                                                | ⚠️ deliberate (CSP-friendly, zero framework weight). Drawer + fetch modal + inline-edit table is where a framework starts paying |
| Styling       | **Tailwind + CSS variables from the Figma variables** | plain scoped CSS, hand-written tokens                             | ❌ no Tailwind, tokens not from Figma                                                                                            |
| Data / Images | Sheets v4 / Drive v3                                  | same                                                              | ✅                                                                                                                               |

## 5. Design system (§5) — **F, largest UI gap**

Nothing of this section exists. Ours came from the legacy `catalogue.html`, so values are _close but
not equal_, which is worse than absent because it looks intentional.

| Token      | Brief                                                                                     | Ours                               |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| Canvas     | `#FEFCF0` Preview · `#F8F7F5` Admin · `#141413` Admin Dark                                | `--paper #fffdf2` only             |
| Surface    | `#FFFFF5`                                                                                 | `--paper-deep #f6f0dc`             |
| Brand red  | `#B80D09`                                                                                 | `--accent #bb3e03`                 |
| Feedback   | success `#307A07`, warning `#ED8A00`, danger `#CB2B2B`                                    | `--green #2f6b3a` only             |
| Mono       | **IBM Plex Mono**                                                                         | JetBrains Mono                     |
| Body type  | Inter, base **13px**, scale 11/12/13/15/19                                                | Inter, base 15/14                  |
| Headings   | 28.8 / 25.2 / 19.8 / 16.2 / 12.6 / 11.2                                                   | ad-hoc                             |
| Radius     | **0** on buttons/inputs/cards; pill 9999 only for chips + reaction circles                | `--radius-1: 2px` everywhere       |
| Focus ring | **Ink, 2px** (explicitly _not_ the brand red)                                             | `2px solid var(--accent)` — red ❌ |
| Containers | 440 / 680 / 980 / 1150 / 1260 / 1360                                                      | none                               |
| Aliases    | `space/section` 112 Preview → 24 Admin; `motion/transition` 600 ms Preview → 150 ms Admin | `--dur-1..4`, 120–560 ms           |
| Modes      | three `[data-mode]` custom-property sets                                                  | one                                |

Also missing: the off-grid values the brief says to carry rather than round (`input-y 10.4`,
`input-x 12.8`, `control-gap 10`, `checkbox 14`, `container/md 1150`), and the rule that components
read **semantics only, never a primitive**.

## 6. Admin IA (§6) — ⚠️ built to the superseded brief

| Brief                                                                                                                             | Ours                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/admin/products` is the primary and default screen                                                                               | `/admin` is a **dashboard with counts** — the brief explicitly says there is no dashboard and no KPI summary |
| Add product = **480 px right drawer** over the list, list stays mounted                                                           | separate page `/admin/rugs/new`                                                                              |
| Fetch result = **modal over the drawer**                                                                                          | inline preview section on that page                                                                          |
| **Inline row editing** (Enter commits, Esc reverts, Tab next cell) + idempotent debounced `PATCH /api/products/[id]`              | separate edit page + full-row `POST`                                                                         |
| Nav: Products · Collections · Customers                                                                                           | Add rug · Catalogue · Collections · Clients · Audit                                                          |
| Mobile admin **required**: 1440 / 810 / 390, bottom tab bar, bottom sheet, full-screen fetch modal, inline editing dropped at 390 | desktop-only, no breakpoints                                                                                 |
| Table drops `Source` and `Added` columns first at 810                                                                             | no table view at all (card grid)                                                                             |

## 7. Customer preview (§7) — ❌ the whole section

- `/{slug}` gate + catalog and `/{slug}/{productId}` detail: **missing**.
- Personalisation ("Welcome, Hala.", name in the header from `Customers.display_name`): missing.
- **Asymmetric reactions**: card = like only, detail = like **and** dislike, with `source` recorded
  on the event. Ours shows like + dislike on both, and stores no `source`. ⚠️
- Buttons must be **real focusable buttons with text labels** ("Like this rug" / "Not for me"),
  never icon-only. Ours are icon-only with `aria-label`. ⚠️
- 32 px visual circles, **44 px** mobile hit area: ours are 32 px with no enlarged tap target.
- Buffered pending state deliberately **not** announced: ours has no buffering at all.
- `Collections.description` shown to buyers, clamped to one line with **See more**: ours renders it
  as a standfirst with no clamp and no expander. 🟡
- Footer must carry `hello@serioludere.com` ✅ **and** the line _"Prices are indicative and convert
  at an approximate rate."_ ❌ missing.
- **No inquiry action.** Ours added "Enquire on WhatsApp" and "Email the studio" on the detail page.
  ⚠️ contradicts the brief and must come out.
- Spec block = Size, Material, Method, Origin, **Pile**, Age; `Shape` stored but not displayed.
  Ours shows Size, Material, Age, Origin, Method, Reference — **no Pile, no Shape columns exist**,
  and "Reference" is an addition.

## 8. Units and currency (§8)

| Item                                                                      | Status                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| cm ⇄ ft/in toggle, persists across pages                                  | ✅ (localStorage; brief says session-scoped)                                          |
| CM canonical, imperial derived, round to nearest inch / whole cm          | ✅                                                                                    |
| Reconverts every dimension at once, instant, no animation                 | ✅                                                                                    |
| At 390 the imperial segment abbreviates to `ft`                           | ❌                                                                                    |
| Currencies USD · EUR · **GBP** · CAD · MXN · AED · SAR                    | 🟡 **GBP missing** (we have the other six)                                            |
| Base currency as a store-level constant (`BASE_CURRENCY`, recommend USD)  | 🟡 USD is hard-coded, not a constant                                                  |
| Rate source: free daily API (Frankfurter / exchangerate.host)             | 🟡 rates live in a sheet tab; an optional Apps Script refresh exists, no `FX_API_URL` |
| Cache the table in memory, long TTL, **hardcoded fallback table in code** | ❌ no fallback table                                                                  |
| `GET /api/rates`                                                          | ❌                                                                                    |
| Round converted prices to whole units, never cents                        | ✅                                                                                    |
| RTL/Arabic not drawn — flag before a Gulf buyer gets a link               | ❌ not flagged anywhere                                                               |

## 9. `Products` tab (§9) — ❌ the column set

The brief pins the tab to Shopify's product-CSV import format so it imports without remapping:
`Handle, Title, Body (HTML), Vendor, Product Category, Type, Tags, Published, Option1 Name,
Option1 Value, Variant SKU, Variant Grams, Variant Inventory Qty, Variant Inventory Policy,
Variant Price, Variant Compare At Price, Variant Requires Shipping, Variant Taxable, Image Src,
Image Alt Text, SEO Title, SEO Description, Status`, plus `Width CM, Length CM, Size Label,
Size Band, Material, Method, Origin, Age, Pile, Shape, Collection, Source URL, Source Site,
Drive Folder ID, Drive Folder URL, Scraped At, Commit Status, Internal Notes`, keyed by a
manually assigned **Product ID** rendered in mono.

Ours stores a different, smaller set and derives likes/dislikes/rating with sheet formulas (which the
brief does not ask for). Also missing: `Image Src` holding **only** the primary image,
`Commit Status` (pending/complete) and the retry path, and `GET /api/export/shopify-csv`.

✅ Already right: rows are addressed by id → row index, never by position; reads are cached at 60 s.

## 10. Auth (§10)

| Item                                                                                                                                                   | Status                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin: one password, no username/accounts/recovery                                                                                                     | ✅                                                                                                                                                              |
| `ADMIN_PASSWORD` env var                                                                                                                               | 🟡 we use `ADMIN_PASSWORD_HASH` (scrypt) — stronger, and the brief's intent ("from the code, minus the risk of committing a password") is met; worth confirming |
| Signed HttpOnly, SameSite=Lax, Secure cookie, 7-day, `AUTH_SECRET`                                                                                     | ✅ (`ADMIN_SESSION_SECRET`, 12 h idle / 7 d absolute)                                                                                                           |
| Constant-time comparison                                                                                                                               | ✅                                                                                                                                                              |
| Login rate limit 5/IP/15 min, in memory                                                                                                                | ✅                                                                                                                                                              |
| **Customer auth: generated password per customer** (3 lowercase words + 2 digits, argon2/bcrypt, reveal once, `POST /api/customers/[slug]/regenerate`) | ❌ entirely missing                                                                                                                                             |
| Cookies scoped per realm; a customer cookie must not unlock another slug or `/admin`                                                                   | ❌                                                                                                                                                              |
| Reserved slugs blocked (`admin`, `api`, `login`, `logout`, `_astro`, `assets`, `favicon.ico`)                                                          | ❌                                                                                                                                                              |
| **Middleware default-denies**                                                                                                                          | ❌ ours default-allows; only `/admin*` is gated                                                                                                                 |

## 11. Scraping (§11)

| Item                                                                                                                                 | Status                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Server-side only, one URL per request, no bulk                                                                                       | ✅                                                                                                   |
| Two-step contract: scrape writes nothing, commit takes the **edited** payload and never re-scrapes                                   | ✅ (`/api/admin/scrape` + `/api/admin/rugs`; route names differ from `/api/scrape`, `/api/products`) |
| Extraction ladder: **Shopify JSON first for every URL** → JSON-LD → OG/microdata → per-source selectors                              | 🟡 ours tries a supplier adapter first; there is no generic `shopify.ts` tried for unknown hosts     |
| `cheerio`, no Playwright/Puppeteer in v1                                                                                             | ✅                                                                                                   |
| `src/lib/scrapers/{index,shopify,jsonld,ecarpetgallery,karavan,generic,normalise}.ts`                                                | 🟡 ours is `src/lib/scrape/*` with the same responsibilities, different names                        |
| `ScrapedProduct` incl. **`fieldStatus`** (`found`/`inferred`/`missing`) driving missing-field flags                                  | ❌ no `fieldStatus`                                                                                  |
| Size normalised to cm ✅, **Size Band from area** (XS <0.75 m², S ≤2.5, M 2.5–5, L 5–10, XL >10)                                     | ❌ no size band                                                                                      |
| `Size Label` rendered `240 × 170 cm`                                                                                                 | ✅                                                                                                   |
| 15 s timeout ✅, one retry with backoff 🟡, realistic UA ✅, **respect robots.txt** ❌, **2 s between requests to the same host** ❌ |                                                                                                      |
| Distinguish blocked / not_found / parse_failed / timeout                                                                             | ✅ exactly these codes                                                                               |
| **Photo-first response** (stream, or return the primary image URL in a first chunk)                                                  | ❌                                                                                                   |
| Indeterminate progress with stage labels (fetching page → parsing → resolving images); counted progress only on commit               | ❌                                                                                                   |

## 12. Drive image pipeline (§12)

| Item                                                                                                                                      | Status                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folder tree `/Serio Ludere — Preview Catalog/{Product ID} — {Product Name}/01-primary.jpg` + `/All Images/`                               | ❌ ours uploads flat into one folder                                                                                                               |
| Primary duplicated deliberately                                                                                                           | ❌                                                                                                                                                 |
| **Commit order: validate unique ID → write row `pending` → create folders → upload sequentially with progress → update row + `complete`** | ⚠️ ours uploads photos **first**, then writes the row — the exact inverse, so a failure leaves orphaned uploads instead of a visible retryable row |
| `Commit Status` pending/complete, failed-row treatment, retry action                                                                      | ❌                                                                                                                                                 |
| Drive auth resolved: OAuth refresh token on Ramez's account                                                                               | ✅ same conclusion                                                                                                                                 |
| **Serve through `/api/image/[fileId]` with aggressive cache headers** (Drive is not a CDN)                                                | ❌ we link `lh3.googleusercontent.com` directly                                                                                                    |
| 20 images/product, 10 MB each                                                                                                             | 🟡 ours caps at 12 and 5 MB                                                                                                                        |
| Check platform function timeout; batch uploads if tight                                                                                   | ❌ not considered                                                                                                                                  |

## 13. Motion (§13)

Ours is a complete, documented motion system — but with **different numbers**, and it was derived
from the reference page, not the handoff.

| Element                                                                                           | Brief                                                       | Ours                                   |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Card image hover                                                                                  | 600 ms, **130 % zoom**, ease-out                            | 420 ms, translate −4 px                |
| Grid entry                                                                                        | 400 ms, 60 ms stagger, **capped at 12**                     | 560 ms, 45 ms stagger, capped at 12 ✅ |
| Detail hero                                                                                       | 500 ms, opacity only, no scale                              | 420 ms fade ✅ close                   |
| Like/dislike tap                                                                                  | 120 ms, scale 1 → 0.92 → 1                                  | 360 ms spring pop to 1.28              |
| Pending dot                                                                                       | none, deliberately static                                   | no pending state at all                |
| Drawer / bottom sheet / fetch modal / currency menu / toast                                       | specified                                                   | none exist                             |
| Unit toggle                                                                                       | instant                                                     | ✅                                     |
| Admin, everything else                                                                            | 150 ms                                                      | n/a                                    |
| `@view-transition { navigation: auto }` inherited by the preview, **must not apply to the admin** | ⚠️ ours is global in `motion.css`, so the admin inherits it |
| `prefers-reduced-motion` collapses everything                                                     | ✅                                                          |

## 14. Routes (§14)

Present in some form: admin login/logout ✅, scrape ✅, product create/update ✅ (different paths),
collections CRUD ✅, customers CRUD 🟡 (as "clients", no passwords), rates ❌, image proxy ❌,
CSV export ❌, compact-reactions ❌, customer auth ❌, reactions batch ❌, `/[slug]` ❌,
`/[slug]/[productId]` ❌, `PATCH`/`DELETE`/`retry` on products ❌, `/admin/customers/[slug]`
(visits + liked/disliked) ❌.

Also: `/[slug]` is a catch-all and **must be the last route** and must not shadow `/admin` — not yet
relevant, but it constrains the file layout when it is added.

## 18. Environment (§18)

| Brief                         | Ours                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| `ADMIN_PASSWORD`              | `ADMIN_PASSWORD_HASH` 🟡                                              |
| `AUTH_SECRET`                 | `ADMIN_SESSION_SECRET` 🟡 (rename)                                    |
| `GOOGLE_SHEET_ID`             | ✅                                                                    |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `GOOGLE_DRIVE_FOLDER_ID` 🟡 (rename + it is a _root_ now)             |
| `BASE_CURRENCY`               | ❌                                                                    |
| `FX_API_URL`                  | ❌                                                                    |
| `PUBLIC_SITE_URL`             | `SITE_URL` 🟡 (renamed on purpose: Astro inlines `PUBLIC_*` at build) |
| OAuth trio                    | ✅                                                                    |

---

## What is reusable as is

`src/lib/sheets/*` (client, contract, parse, cache with TTL + single-flight + stale-if-error,
atomic batch writes), the rate limiter, the admin session/auth/audit layer, `src/lib/scrape/*`
(supplier adapters, SSRF guard, size/money parsing), `src/lib/drive/*`, units/currency maths, the
route-cache posture, the CSP and security headers, the test and QA harness. That is the majority of
the hard engineering.

## Suggested order (mapped onto the brief's §17 sequence)

1. **Get the Figma file** and generate the three token modes (§5). Everything visual waits on this.
2. Decide the two open stack questions: adapter (Vercel/Netlify vs. our container) and islands
   (React/Svelte vs. vanilla). Both change file layout, so decide before writing UI.
3. Migrate the sheet: `Products` to the Shopify-CSV column set, add `Customers`, `Visits`, add
   `event_id` + `source` to `Reactions`. This is the deepest change and everything else reads it.
4. Customer realm: `/{slug}` gate, generated passwords, per-realm cookies, reserved slugs,
   default-deny middleware, visit logging.
5. Rework the admin to the drawer + inline-edit IA and drop the dashboard.
6. Reactions batching (2–3 s buffer, one multi-row append, flush on hide) and asymmetric
   card/detail sources.
7. Drive pipeline to the folder tree + `pending`/`complete` commit order + `/api/image/[fileId]`.
8. FX: `BASE_CURRENCY`, `FX_API_URL`, `/api/rates`, hardcoded fallback, add GBP.
9. Shopify CSV export, compact-reactions action, mobile admin.

## Questions the brief leaves to you

1. Confirm the adapter (the brief says Vercel/Netlify Node; we built a portable container).
2. Confirm React or Svelte for the islands, or accept vanilla TS and lose the framework ergonomics
   for the drawer/inline-edit table.
3. Customer passwords: hash + regenerate (brief's recommendation, and mine) vs. reversible storage.
4. Does the existing public catalogue at `/` stay at all, or does everything move behind `/{slug}`?
5. The current site's WhatsApp/email enquiry links contradict §7 — remove them, or keep them as a
   deliberate deviation?
