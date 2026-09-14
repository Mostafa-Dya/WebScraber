# ADMIN_SPEC — Serio Ludere admin panel (`/admin`)

Status: implementation spec, 2026-09-07. Companion to `docs/ADR.md` (new decision **D13**), `docs/SHEET_SETUP.md`,
`docs/PLAN.md` (phases 7–11). Everything marked **[assumption]** was not verified in research and must be checked by
the phase that first depends on it; everything else is grounded in the verified research log (ADR §7) or in the code
as it exists today.

The legacy page being replaced is `reference/admin.html` (JSONP to an Apps Script with a hard-coded shared secret,
the legacy shared secret (redacted)). That secret and the deployment URL are burned; nothing in the new admin reuses them.

---

## 1. Goals, non-goals, security model

### 1.1 Goals

- Rebuild the three legacy tabs (**Add rug** with supplier scrape, **Catalogue**, **Client saves**) as server-rendered
  Astro routes under `/admin`, in the legacy page's paper/ink/mono idiom.
- Add what the owner asked for: **description, tags, collection dropdown, supplier link** on every rug; a **Collections**
  tab (add/edit/reorder); a **rug CRUD dashboard**; a **unique client-link generator** (link carries the client's code so
  their ❤/👎 are attributed); an **audit log**; **round up prices to the next multiple of five**; the best
  practical **scraper** for ecarpetgallery.com and karavanrug.com.
- Keep the public site untouched: the Rugs `A:V` contract is frozen, `likes/dislikes/rating` (Q:S) are never written,
  `/`, `/rugs/[slug]`, `/tags/[slug]`, `/api/vote`, `/api/health`, `/api/revalidate` keep their behaviour.

### 1.2 Non-goals (this iteration)

- No multi-user roles: one admin identity (the owner). No self-service password reset (rotate via env).
- No browser-side file uploads (photos travel supplier → server → Drive); pasting Drive ids/links stays supported.
- No bulk price re-rounding of existing rows, no row deletion (soft archive only), no Rates editing (the Rates tab and
  its Apps Script refresh stay as they are, ADR D7).
- No headless browser in the container (ADR D13.3; Jina Reader is the JS-rendering fallback if a supplier ever needs it).
- No JS-free fallback for the CRUD forms (only the login/logout forms work without JS).

### 1.3 Security model (summary; details in §2, §9)

| Concern                                                                     | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Credentials in the browser                                                  | **Never.** Google tokens, the refresh token, the session secret, the password hash, supplier fetches and raw IPs exist only server-side. The HTML contains no secret, no API key, no Apps Script URL.                                                                                                                                                                                                                                                                                |
| Authentication                                                              | Single password, stored as an scrypt hash (`ADMIN_PASSWORD_HASH`), verified with `crypto.scryptSync` + `timingSafeEqual` (§9.2). Login is a plain `<form method="post">` (works without JS).                                                                                                                                                                                                                                                                                         |
| Session                                                                     | Stateless HMAC-SHA256 token in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie named `__Host-sl_admin` (plain `sl_admin` when `SITE_URL` is http, same rule as `visitorCookieName`). Idle timeout 12 h (re-issued when > 1 h old), absolute 7 days. Logout adds the `sid` to an in-process revocation set until its absolute expiry; rotating `ADMIN_SESSION_SECRET` logs everyone out. `session: false` stays in `astro.config.mjs` (no Astro session driver).                   |
| CSRF                                                                        | JSON API: `Content-Type: application/json` required (415 otherwise) + `Sec-Fetch-Site` same-origin/none or `Origin == SITE_URL` (403) via the existing `rejectCrossSite`, now parameterised with a 64 KiB cap; `SameSite=Lax` cookie; **no state-changing GET route**. Login/logout are urlencoded forms covered by Astro `security.checkOrigin` (verified: it checks form-like bodies, not JSON). No CSRF token is needed (OWASP: custom content type + fetch-metadata + SameSite). |
| Route cache                                                                 | A cache HIT bypasses middleware and the memory key ignores cookies (verified in astro 7.3.1). Therefore: admin middleware calls `context.cache.set(false)`, sets `cache-control: no-store` and `x-robots-tag: noindex, nofollow`; no admin page ever calls `Astro.cache.set({maxAge                                                                                                                                                                                                  | tags})`; no `routeRules`entry matches`/admin*`or`/api/admin*`. A test asserts `GET /admin`never returns`X-Astro-Cache: HIT`.                                              |
| Rate limits (in-process `RateLimiter`, exact on the single process, ADR D2) | Login: 5 failures / 15 min per `ip_hash` and 20 / 15 min global, checked **before** scrypt runs (scrypt costs ~184 ms CPU and 128 MiB); exponential `Retry-After` (1 s doubling, cap 15 min) after the 3rd failure. API: 120 reads / min and 30 mutations / min per session; scrape 10 / min per session and 30 / 10 min global; photo import 5 / min per session.                                                                                                                   |
| Audit                                                                       | Every mutation writes its `AuditLog` row **in the same `batchUpdate`** as the change (atomic per call, verified). A mutation whose audit row cannot be built (e.g. diff too large) is refused (422), never silently un-audited. Login success, lockout, logout, scrape fetches and photo imports are audited too.                                                                                                                                                                    |
| SSRF                                                                        | The scraper accepts a pasted link but rebuilds the outbound URL from `(supplier, handle                                                                                                                                                                                                                                                                                                                                                                                              | sku)`against a strict host allow-list; redirects are manual and re-validated; image downloads go through a guarded`undici`client with a DNS-time`BlockList` check (§4.5). |
| Sheet safety                                                                | All cell writes use `userEnteredValue.stringValue/numberValue/boolValue` (formula-injection safe, ids stay text). Rugs Q:S (`likes/dislikes/rating`) are never inside any `updateCells` range (unit-tested). Rows are never inserted at the top of Rugs (the header array formulas anchor at `A2:A`).                                                                                                                                                                                |
| Secrets & logs                                                              | Same `serializeError`/`scrub` logging as the site; the audit `ip_hash` is `HMAC(VOTE_SALT, ip)` (never a raw IP); passwords never logged; the password hash never leaves the process.                                                                                                                                                                                                                                                                                                |

---

## 2. Routes

All admin routes are `export const prerender = false` (on-demand). Pages render server-side from a fresh admin read
(§3.5), never from the public route cache.

### 2.1 Pages

| Route                | Method    | Purpose                                                                                                                                                                                                        |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`             | GET       | Dashboard: counts (active / draft / archived rugs, collections, tags, clients), newest 10 audit rows, health strip (snapshot age, `driveScopeOk`, `adminWriteFailures`), quick links.                          |
| `/admin/login`       | GET, POST | Password form. POST handled in frontmatter: rate limit → `verifyPassword` → cookie → `Astro.redirect(next, 303)`. Generic failure text. `?next=` accepted only when it matches `^/admin(/[A-Za-z0-9_\-/]*)?$`. |
| `/admin/logout`      | POST      | Form POST (button in the header). Revokes `sid`, deletes the cookie, audits `auth.logout`, redirects 303 to `/admin/login`. GET → 405.                                                                         |
| `/admin/rugs`        | GET       | CRUD list: legacy Catalogue cards + collection chips + status chips (active/draft/archived) + search box; each card links to the edit page.                                                                    |
| `/admin/rugs/new`    | GET       | Add rug (legacy "Add rug" tab): owner's name, collection `<select>`, tag chips, supplier link → **Fetch** → preview fields → optional "Save photos to Drive" → **Add to sheet**; manual-entry fallback.        |
| `/admin/rugs/[id]`   | GET       | Edit form for one rug (same field grid as the add form + status/archive/restore). 404 for an unknown id.                                                                                                       |
| `/admin/collections` | GET       | Collections list (reorder up/down, edit inline) + add form; Tags section (add/edit name + colour) on the same page.                                                                                            |
| `/admin/clients`     | GET       | Unique link generator (name, note → code → link + copy button), client list (status, created, saves), and the saves report (most saved, per-client lists) from Votes.                                          |
| `/admin/audit`       | GET       | Log viewer: newest 100 rows, client-side filter by action / target id, "load more" via the API.                                                                                                                |

### 2.2 Middleware (`src/middleware.ts` → `sequence(securityHeaders, adminGate)`)

```ts
// src/lib/admin/gate.ts — pure function, unit-tested; src/middleware.ts wires it.
const ADMIN_PAGE = /^\/admin(\/|$)/;
const ADMIN_API = /^\/api\/admin(\/|$)/;
const PUBLIC_ADMIN = new Set(['/admin/login', '/admin/logout']);

export const adminGate = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!ADMIN_PAGE.test(pathname) && !ADMIN_API.test(pathname)) return next();
  context.cache.set(false); // belt and braces: never cached
  context.locals.requestId = randomBytes(8).toString('hex');
  const session = verifySessionCookie(context.cookies, ADMIN_SESSION_SECRET, revoked, Date.now());
  if (session) context.locals.admin = session; // { sid, user, iat, exp, abs }
  let response: Response;
  if (!session && !PUBLIC_ADMIN.has(pathname)) {
    response = ADMIN_API.test(pathname)
      ? noStore({ ok: false, error: 'unauthorized' }, 401)
      : context.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`, 303);
  } else {
    response = await next();
    if (session && session.exp - Date.now() < 11 * 3600_000) reissueCookie(context.cookies, session); // sliding idle window
  }
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
});
```

`src/env.d.ts` (new; `tsconfig` already includes `**/*`):

```ts
declare namespace App {
  interface Locals {
    admin?: { sid: string; user: string; iat: number; exp: number; abs: number };
    requestId: string;
  }
}
```

### 2.3 JSON API under `/api/admin/*`

Common rules for every endpoint (`src/lib/admin/http.ts`):

1. Middleware has already required a session (401 otherwise) and disabled caching.
2. `POST` only for mutations. Every handler starts with `rejectCrossSite(request, ADMIN_MAX_JSON_BODY /* 64 * 1024 */)`
   (415 / 413 / 403), then the per-session `RateLimiter` check (429 + `Retry-After`), then `zod.safeParse` of the body
   (400 with `{ ok:false, error:'invalid body', issues }`).
3. Responses via `noStore(body, status)`. Success shape `{ ok: true, ... }`; failure `{ ok: false, error, code? }`.
4. Sheets failures: `SheetsApiError` 429/503 → 503 `{ error: 'sheet unavailable' }`; row-version mismatch → 409 with the
   fresh row; any other error → 500 with a scrubbed message. `adminWriteFailures` counter incremented on 5xx.
5. Every mutation returns `audit: { row: number, action }` so the UI can link to `/admin/audit`.
6. Unsupported methods → 405 with `Allow`.

Shared Zod 4 schemas (`src/lib/admin/dto.ts`, `import * as z from 'zod'`):

```ts
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // parse.ts ID_RE (excludes * ? = < > by construction)
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;
export const CLIENT_CODE_RE = /^[a-z0-9]([a-z0-9-]{0,26})[a-z0-9]$/; // subset of the site's ^[A-Za-z0-9_-]{1,64}$
const Id = z.string().regex(ID_RE);
const Slug = z.string().regex(SLUG_RE);
const Text = (max: number) => z.string().trim().max(max).default('');
const HttpsUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => u.startsWith('https://'), 'https only');
export const Version = z.string().regex(/^[a-f0-9]{16}$/);

export const RugInput = z.object({
  id: Id.optional(), // create only; absent → server allocates the next SL-nnn
  slug: Slug.optional(), // absent → derived from name (create) / kept (update)
  name: z.string().trim().min(1).max(120),
  description: Text(4000),
  // Owner 2026-09-13: a product can sit in several collections. A bare string is accepted and split
  // on "|", so a single-value caller still validates. 1-10 names, each matching a Collections.name
  // (case-insensitive); de-duplicated case-insensitively before the 422 check.
  collections: CollectionList, // string | string[] -> string[]
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .refine((t) => !t.includes('|')),
    )
    .max(20)
    .default([]),
  photos: z.array(z.string().regex(DRIVE_ID_RE)).max(12).default([]), // src/lib/images.ts DRIVE_ID_RE
  widthCm: z.number().int().min(10).max(2000).optional(),
  lengthCm: z.number().int().min(10).max(2000).optional(),
  material: Text(80),
  method: Text(80),
  age: Text(80),
  origin: Text(80),
  priceUsd: z.number().min(0).max(1_000_000).multipleOf(0.01).optional(),
  rotate: z.enum(['force', 'true', 'false']).default('false'),
  featured: z.boolean().default(false),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  sourceUrl: HttpsUrl.optional(),
  supplier: z.enum(['ecarpetgallery', 'karavanrug', '']).default(''),
  supplierRef: Text(40),
  notes: Text(2000),
  roundPrice: z.boolean().default(false), // apply roundUpToStep(priceUsd) server-side before writing (§7)
});
export const RugUpdate = RugInput.omit({ id: true }).extend({ version: Version });
export const RugStatus = z.object({ status: z.enum(['active', 'draft', 'archived']), version: Version });

export const CollectionInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: Text(1000),
  coverImageUrl: z.string().trim().max(500).default(''), // validated with normaliseImageUrl(); '' clears
});
export const CollectionUpdate = CollectionInput.extend({ version: Version });
export const CollectionReorder = z.object({ order: z.array(Id).min(1).max(200) }); // ids in the new sort order
export const TagInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((t) => !t.includes('|')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export const TagUpdate = TagInput.extend({ version: Version });

export const ClientInput = z.object({ name: z.string().trim().min(1).max(60), note: Text(200) });
export const ClientStatus = z.object({ status: z.enum(['active', 'revoked']), version: Version });

export const ScrapeRequest = z.object({
  url: z.string().trim().min(8).max(500),
  force: z.boolean().default(false),
});
export const PhotoImportRequest = z.object({
  urls: z.array(HttpsUrl).min(1).max(12),
  namePrefix: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/), // e.g. the slug; files are <prefix>-<n>.jpg
  // Owner 2026-09-13: which supplier sent these photos, so the FIRST image gets that supplier's
  // fixes on the way into Drive (src/lib/drive/transform.ts — Karavan's first image is rotated 90°).
  // Sent explicitly, never sniffed from the photo host: Karavan is a Shopify store, so its images
  // arrive from the shared cdn.shopify.com and the host does not identify the supplier.
  supplier: z.enum(['ecarpetgallery', 'karavanrug', '']).default(''),
});
export const SettingsUpdate = z.object({
  key: z.enum([
    'retail_markup',
    'retail_markup.ecarpetgallery',
    'retail_markup.karavanrug',
    'price_round_step',
    'default_status',
  ]),
  value: z.string().trim().max(40), // parsed per key server-side (§3.3); '' clears
});
export const AuditQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
```

Endpoints:

| Endpoint                           | Method     | Body                           | Success                                                                                                                                              | Errors                                                                      |
| ---------------------------------- | ---------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/api/admin/rugs`                  | GET        | — (`?status=`, `?q=` optional) | `{ ok, rugs: AdminRug[], collections, tags }`                                                                                                        | 503                                                                         |
| `/api/admin/rugs`                  | POST       | `RugInput`                     | 201 `{ ok, rug: AdminRug, row, audit }`                                                                                                              | 400, 409 (id/slug exists), 422 (unknown collection / tag; unauditable), 503 |
| `/api/admin/rugs/[id]`             | GET        | —                              | `{ ok, rug: AdminRug }` (`rug.version` included)                                                                                                     | 404                                                                         |
| `/api/admin/rugs/[id]`             | POST       | `RugUpdate`                    | `{ ok, rug, audit }`                                                                                                                                 | 400, 404, 409 `{ error:'version mismatch', rug: <fresh> }`, 422, 503        |
| `/api/admin/rugs/[id]/status`      | POST       | `RugStatus`                    | `{ ok, rug, audit }`                                                                                                                                 | 404, 409                                                                    |
| `/api/admin/rugs/next-id`          | GET        | —                              | `{ ok, id: 'SL-030' }` (preview only, not reserved)                                                                                                  | —                                                                           |
| `/api/admin/collections`           | GET / POST | — / `CollectionInput`          | `{ ok, collections }` / 201 `{ ok, collection, audit }`                                                                                              | 409 (slug exists)                                                           |
| `/api/admin/collections/[id]`      | POST       | `CollectionUpdate`             | `{ ok, collection, audit }`                                                                                                                          | 404, 409                                                                    |
| `/api/admin/collections/reorder`   | POST       | `CollectionReorder`            | `{ ok, collections, audit }`                                                                                                                         | 400 (unknown id)                                                            |
| `/api/admin/tags`                  | GET / POST | — / `TagInput`                 | `{ ok, tags }` / 201 `{ ok, tag, audit }`                                                                                                            | 409                                                                         |
| `/api/admin/tags/[id]`             | POST       | `TagUpdate`                    | `{ ok, tag, audit }`                                                                                                                                 | 404, 409                                                                    |
| `/api/admin/clients`               | GET / POST | — / `ClientInput`              | `{ ok, clients }` / 201 `{ ok, client: { code, name, link, … }, audit }`                                                                             | 400                                                                         |
| `/api/admin/clients/[code]/status` | POST       | `ClientStatus`                 | `{ ok, client, audit }`                                                                                                                              | 404, 409                                                                    |
| `/api/admin/clients/report`        | GET        | —                              | `{ ok, generatedAt, mostSaved: [{ rugId, name, slug, status, saves }], byClient: [{ code, name, known, liked: [...], disliked: [...] }], rowsRead }` | 503                                                                         |
| `/api/admin/audit`                 | GET        | `AuditQuery` (query string)    | `{ ok, rows: AuditRow[], offset, total }`                                                                                                            | —                                                                           |
| `/api/admin/scrape`                | POST       | `ScrapeRequest`                | `{ ok, data: ScrapedRug, via: 'impit'                                                                                                                | 'undici'                                                                    | 'jina', cached, ms, audit }` | 400 `unsupported_host`, 429, 502 `blocked`/`fetch_failed` (+ `manual: { supplier, supplierRef }`), 404 `not_found`, 422 `parse_failed` (+ partial `data`), 504 `timeout` |
| `/api/admin/photos`                | POST       | `PhotoImportRequest`           | `{ ok, photos: [{ url, id?, error? }], imported, audit }`                                                                                            | 409 `drive_not_authorised`, 502                                             |
| `/api/admin/settings`              | GET / POST | — / `SettingsUpdate`           | `{ ok, settings }` / `{ ok, settings, audit }`                                                                                                       | 400 (bad value for key)                                                     |

`AdminRug` = the public `Rug` shape (`src/lib/sheets/types.ts`) + `{ row: number, version: string, sourceUrl, supplier,
supplierRef, notes, createdAt, updatedAt }`; `likes/dislikes/rating` are included read-only.

`/api/health` gains `adminConfigured` (both admin secrets present), `driveScopeOk` (§5.4) and `adminWriteFailures`.
No secrets, no-store, unchanged status semantics.

---

## 3. Sheet contract changes

### 3.1 Rugs: four admin-only columns after V (W…Z)

| Col    | Header         | Type                         | Meaning                                                                                                                                          |
| ------ | -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| W (22) | `source_url`   | text                         | Supplier product URL (https, allow-listed host).                                                                                                 |
| X (23) | `supplier`     | text                         | `ecarpetgallery` \| `karavanrug` \| blank (owned). Replaces the legacy `ECG`/`KV` codes and the two legacy tabs "External Inventory"/"Products". |
| Y (24) | `supplier_ref` | text (column formatted TEXT) | The supplier's product number (was the legacy id). New ids are `SL-nnn`.                                                                         |
| Z (25) | `notes`        | text                         | Internal notes; never rendered publicly.                                                                                                         |

- Staying within 26 columns avoids `appendDimension(COLUMNS)` on existing sheets (a tab defaults to 26 × 1000).
- **Not** added to `HEADERS.Rugs` (that would make W:Z mandatory for the public reader and widen `READ_RANGES`).
  Instead in `contract.ts`:

  ```ts
  export const RUGS_ADMIN_HEADERS = ['source_url', 'supplier', 'supplier_ref', 'notes'] as const; // indexes 22..25
  export const RUGS_ADMIN_RANGE = `${TABS.rugs}!A1:Z`;
  export const RUGS_COLS = {
    id: 0,
    slug: 1,
    name: 2,
    description: 3,
    collection: 4,
    tags: 5,
    photos: 6,
    widthCm: 7,
    lengthCm: 8,
    material: 9,
    age: 10,
    origin: 11,
    priceUsd: 12,
    rotate: 13,
    featured: 14,
    status: 15,
    likes: 16,
    dislikes: 17,
    rating: 18,
    createdAt: 19,
    updatedAt: 20,
    method: 21,
    sourceUrl: 22,
    supplier: 23,
    supplierRef: 24,
    notes: 25,
  } as const;
  ```

  `assertHeaders` (positional over `HEADERS[tab]`, verified to tolerate trailing columns) stays as is; the admin adds
  `assertAdminHeaders(headerRow)` = `assertHeaders('Rugs', row)` + `row[22..25]` equal to `RUGS_ADMIN_HEADERS`
  (blank W1:Z1 is reported as "run `npm run sheet:init`", not as a contract error).

- Deliberately **no `cost` / `supplier_price` column**: margin data is confidential (ADR §3.2) and every sheet Editor can
  read every tab. The scraped supplier price and the markup applied are recorded in the `AuditLog` `after` JSON of
  `rug.create` instead (auditable, not browsable). The legacy "Launch collection" becomes a tag if wanted (§11 Q4).

### 3.2 New tabs (ignored by the site's positional reader; created idempotently by `init-sheet.ts`)

**Clients** — `code | name | note | status | created_at | created_by | link`

- `code`: §6.1 format; column A formatted TEXT; unique (checked under the admin lock).
- `status ∈ {active, revoked}`; a revoked client keeps its history (the site keeps accepting the code — attribution of
  old links is preserved; the report marks it "revoked").
- `link` = `${SITE_URL}/?c=${code}` stored for copy-paste from the sheet; the admin always regenerates it from the
  runtime `SITE_URL` when displaying.
- Rows are inserted **newest-first at row 2** with the generalised insert primitive (no formulas on this tab).

**AuditLog** — `timestamp | actor | action | target_tab | target_id | before | after | ip_hash | request_id | note`

- `timestamp` ISO-8601 UTC; `actor` = `ADMIN_USER` (default `owner`); `action` ∈
  `rug.create | rug.update | rug.status | collection.create | collection.update | collection.reorder | tag.create |
tag.update | client.create | client.status | settings.update | photo.import | scrape.fetch | auth.login |
auth.logout | auth.lockout`; `target_tab` ∈ `Rugs | Collections | Tags | Clients | Settings | Drive | - `;
  `target_id` (column E formatted TEXT); `before` / `after` = JSON of the **changed fields only** (create: all fields;
  status: `{status}`; scrape: `{url, supplier, via, ok, ms, seenPrice, seenCurrency}`), each truncated to 40 000 chars
  (cell cap 50 000) — if truncation would cut a mutation's diff the mutation is refused (422 `unauditable`);
  `ip_hash` = `ipHash(VOTE_SALT, ip)`; `request_id` = `locals.requestId` (correlates `scrape.fetch` → `photo.import` →
  `rug.create` from the same form); `note` = free text (sheet row number, "verify-failed", lockout window…).
- Newest-first at row 2, same primitive. Login **failures** are counted in memory only; one `auth.lockout` row per
  lockout window (so the log cannot be flooded).
- Whole-tab warning-only protection "append-only; written by the admin".

**Settings** — `key | value | updated_at | updated_by`, seeded when the tab has no data rows:

| key                            | seed      | parsed as                                               |
| ------------------------------ | --------- | ------------------------------------------------------- |
| `retail_markup`                | _(blank)_ | positive number (multiplier, e.g. `1.6`); blank = unset |
| `retail_markup.ecarpetgallery` | _(blank)_ | **no longer consulted** — see below                     |
| `retail_markup.karavanrug`     | _(blank)_ | **no longer consulted** — see below                     |

> **Per-supplier formulas supersede the markup for the two known suppliers (owner, 2026-09-13).**
> `karavanrug` prices at `base × 0.7 × 2 + band(base)`, where the band is `+100` below 500, `+150`
> across 500–1000 inclusive, and `+200` above 1000 — the band reads the **scraped** price, not the
> multiplied one. `ecarpetgallery` prices at `USD × 1.5 + 150`. Both are then rounded up by
> `price_round_step` as before. The formula ignores any `retail_markup.*` row for that supplier
> rather than letting a stale setting silently reprice the catalogue; `retail_markup` still governs
> owned stock and any unrecognised supplier. Implemented in `src/lib/price.ts` (`supplierRetail`).
> | `price_round_step` | `5` | positive integer (§7) |
> | `default_status` | `active` | `active                                                 | draft` |

A bad value parses to `undefined` with a logged warning, never a crash. Lookup order for the markup:
`retail_markup.<supplier>` → `retail_markup` → env `RETAIL_MARKUP` → unset (§4.7).

### 3.3 `contract.ts` / `init-sheet.ts` changes

1. `TABS` += `clients: 'Clients'`, `auditLog: 'AuditLog'`, `settings: 'Settings'`; `HEADERS` for the three;
   `RUGS_ADMIN_HEADERS`, `RUGS_ADMIN_RANGE`, `RUGS_COLS`, `SETTINGS_SEED`; `READ_RANGES` **unchanged**.
2. `ALL_TABS` += the three (so `createSpreadsheet` and the `addSheet` step create them).
3. Header step: additionally read `Rugs!W1:Z1`; write `RUGS_ADMIN_HEADERS` when blank; abort on mismatch unless
   `--force-headers`. Guard: if `Rugs.gridProperties.columnCount < 26`, `appendDimension(COLUMNS)` first.
4. Freeze row 1 on the new tabs; TEXT format on `Clients!A:A`, `AuditLog!E:E`, `Rugs!Y:Y`.
5. Protections (all `warningOnly`, as today): keep `Rugs!Q1:S` and the Votes header; add `AuditLog` whole tab and
   the header rows of `Clients`/`Settings`.
6. Seed `Settings` when empty (table above).
7. Existing step 7 verification unchanged; log the admin columns/tabs found or created. Re-running on the existing dev
   sheet only adds the tabs and headers.

**Containment change (ADR D3 amendment):** the current advice (owner-only protection of `Rugs/Collections/Tags/Rates` so
the site identity can only insert into `Votes`) is incompatible with an admin that writes through the same credential.
New rule: hard-protect only `Rugs!Q1:S` and `Votes!1:1` (editors: owner); `scripts/lib/roundtrip.ts --check-containment`
probes `Rugs!Q2` (expects "refused") instead of `C2`. `SHEET_SETUP.md §2.3` is rewritten accordingly.

### 3.4 Row addressing and optimistic concurrency (`src/lib/admin/write.ts`)

- **Admin read** (`src/lib/admin/read.ts`): one `batchGet` of `Rugs!A1:Z`, `Collections!A1:F`, `Tags!A1:D`,
  `Settings!A1:D`, `Clients!A1:G` (+ `AuditLog!A1:J101` for the dashboard/viewer). Row number = array index + 1.
  Parsed with the public parsers for A:V (so the admin sees exactly what the site sees, including dropped-row reasons)
  plus the admin columns; **not cached** beyond the request (the public `CatalogueCache` is untouched).
- **Version token** = `sha256(JSON.stringify(cells A..P ++ T..Z as read)).hex.slice(0, 16)`. Q:S are excluded on
  purpose: a visitor's vote during an edit must not cause a spurious 409. `updated_at` is included, so a human edit
  in the sheet (which does not touch `updated_at`) is still caught by the other cells.
- **Every write runs under one in-process async mutex** `withAdminLock(fn)` (exact on the single process; also keeps
  the admin far below the 60 writes/min/user quota).
- **Update** sequence: (a) `batchGet(Rugs!A{row}:Z{row})`; (b) assert `A{row} === id` **and** hash === `version`,
  else 409 with the fresh row; (c) **one** `batchUpdate` containing `updateCells` for `B{row}:P{row}` (cols 1–15) and
  `U{row}:Z{row}` (cols 20–25: `updated_at, method, source_url, supplier, supplier_ref, notes`) plus the AuditLog
  insert (§3.2). `A` (id), `Q:S` (formulas) and `T` (`created_at`) are never in any request — enforced by a unit test
  that walks every request and asserts no `updateCells` range covers column indexes 16–19 and that updates never start
  at 0. Blank fields are sent as `{}` (an empty `CellData` inside the `userEnteredValue` mask clears the cell);
  numbers as `numberValue`, `featured` as `boolValue`, everything else as `stringValue`. (d) read back `A{row}:B{row}`;
  on mismatch log `error` and append an audit row `note: verify-failed` (the batchUpdate has already committed).
- **Insert** (new rug): target row = `(Rugs!A2:A values).length + 2`; assert every cell of `A{target}:P{target}` and
  `T{target}:Z{target}` is empty (Q:S may contain `""` spills from the array formulas — ignored); if
  `target > gridProperties.rowCount` add `appendDimension(ROWS, length 50)` **to the same batchUpdate**, first; then
  `updateCells` `A{target}:P{target}` and `T{target}:Z{target}` (`created_at = updated_at = now`) + the audit insert.
  **Never** `insertDimension` at row 2 of Rugs (the header formulas anchor at `A2:A`/`Q2:Q` and would shift) and never
  `values.append`/`appendCells` on Rugs (table detection with the Q:S spill is unverified — `docs/research/sheets-api.md`).
- **Collections / Tags / Settings**: same row-addressed `updateCells` with the version token (whole row A:F / A:D /
  A:D — no formula columns), inserts at the bottom by the same target-row rule. `collection.reorder` rewrites
  `sort_order` (col F) for every listed row in one batchUpdate (versions not required; the audit row carries the full
  before/after order).
- **Clients / AuditLog**: newest-first insert at row 2 via `buildInsertRows(sheetId, rowIndex = 1, cells[][])`, the
  generalisation of `buildInsertRequests` in `write.ts` (same shape, any tab). Client `status` changes are
  row-addressed updates with the version token.
- **Soft delete only**: `rug.status` → `archived` (site: `activeRugs` filters it, `/rugs/[slug]` 404s, `handleVote`
  rejects it); `active` restores. Rows are never deleted (Votes rows and the COUNTIFS keep referencing the id; deletion
  would shift row numbers for other editors).
- **Id rule**: `nextRugId(rows, auditRows)` = `'SL-' + zeroPad(max numeric suffix over /^SL-(\d{3,})$/ across ALL Rugs
rows (any status) and the `target_id`s of `rug.create` audit rows, + 1, min 3 digits)` → `SL-030` today; grows past 999. Supplier numbers go to `supplier_ref`, never `id`. The form may override the id (validated with `ID_RE`, unique
  across all rows, refused when it matches `/^SL-\d+$/` with a number ≤ the current max).
- **Slug rule**: `slugify(name)` then `-2`, `-3` … against every existing slug (all statuses, same rule as `parse.ts`).
  On rename the slug is **kept** (stable URLs) unless the admin clicks "regenerate slug".
- **Collection must match** a `Collections.name` case-insensitively (dropdown); **tags** must be a subset of
  `Tags.name` (chips; a new tag is created through `tag.create` first). `collection.create`: `id = slug =
slugify(name)`, `sort_order = max + 1`, unique by slug. `tag.create`: `id = slug = slugify(name)`, optional colour.
- After every successful mutation: `revalidateState.lastBustAt = now; await cache.bust(); await invalidateRoutes()`
  through a shared `invalidateCatalogue(getCache, context)` helper extracted from `src/pages/api/revalidate.ts`
  (tolerant of the dev provider). API writes never fire the onEdit notifier (verified), so the admin must invalidate
  itself. The admin's own page re-reads `Rugs!A1:Z` after the bust.

### 3.5 Client-saves report (`src/lib/admin/saves.ts`, pure)

Input: `Votes!A2:G` read fully (bounded by the existing 200 000-row breaker), rows newest-first. For each
`(visitor_hash, rug_id, vote)` the **first** row seen decides; it counts only when `action === 'add'`. Then:
`mostSaved` = per rug the number of distinct visitors currently liking it (dislikes counted separately), sorted by saves
desc then name; `byClient` = for each `client` of the deciding rows: the set of liked rug ids and disliked rug ids,
joined to `Clients` for the display name (`known: false` for codes not in the tab; `anon` shown as "anonymous").
Archived rugs still display (greyed). This is the legacy `loadSaves()` net-state rule applied per visitor, which is what
the insert-only log encodes.

---

## 4. Scraper design (`src/lib/scrape/`)

### 4.1 Overview

Server-side TypeScript, no browser. Per URL: **normalise → site adapter → generic extractors → text heuristics →
`ScrapedRug`**. The owner's name, collection and tags **always win** (legacy rule: the scrape never overwrites them).

```ts
export interface ScrapedRug {
  supplier: 'ecarpetgallery' | 'karavanrug';
  supplierRef: string; // ECG sku (URL suffix / dataLayer item_sku); KV Stock Code (fallback: variant sku)
  sourceUrl: string; // normalised outbound URL (ECG forced to /us_en/)
  supplierTitle: string; // shown as "Supplier calls it: …" (reference only)
  description?: string;
  widthCm?: number;
  lengthCm?: number;
  sizeRaw?: string; // sizeRaw = supplier's own measurement string (legacy size_ft)
  material?: string;
  method?: string;
  age?: string;
  origin?: string;
  seenPrice?: number;
  seenCurrency?: string;
  currencyAssumed?: boolean;
  retailEstimate?: string; // ECG "Estimated Retail" text, hint only
  priceUsd?: number; // seenPrice converted to USD (Rates tab) when not USD; else = seenPrice
  suggestedRetailUsd?: number; // roundUpToStep(priceUsd × markup) — undefined when no markup is configured
  markupApplied?: number;
  roundStep?: number;
  tagsSuggested: string[];
  photos: Array<{ url: string; width?: number; height?: number }>; // full-size candidates, max 12
  warnings: string[]; // e.g. "no cm on page; converted 4'3\" × 7'5\" → 130 × 226 cm"
}
```

### 4.2 URL normalisation and supplier detection (`detect.ts`)

1. `new URL(input)`; require `https:` (rewrite `http:` to `https:`), no userinfo, no port, hostname compared
   **case-sensitively after lowercasing** against the allow-list `{ ecarpetgallery.com, www.ecarpetgallery.com,
karavanrug.com, www.karavanrug.com }`; anything else → 400 `unsupported_host` (the UI offers manual entry).
2. Strip query and hash (tracking).
3. **ECG**: path `^/(?:(us_en|ca_en|eu_en|ca_fr)/)?([a-z0-9-]+?-(\d{4,}))/?$` → `urlKey`, `sku`; outbound
   `https://ecarpetgallery.com/us_en/<urlKey>` (store code forced to `us_en` so the price is USD — verified: the same
   product is 700 USD / 900 EUR / 980 CAD by store path).
4. **KV**: path `^/products/([a-z0-9-]+)/?$` → `handle`; outbound `https://karavanrug.com/products/<handle>.js`
   (documented Shopify Ajax product endpoint) and `https://karavanrug.com/products/<handle>` (HTML, for JSON-LD).
5. The outbound URL is **rebuilt** from `(supplier, urlKey|handle)`; the pasted string is never fetched as is.

### 4.3 Fetch layer (`fetch.ts`) — two clients chosen by host

| Client                                                                                                                          | Used for                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **impit 0.14.4** (`Impit({ browser: 'chrome', timeout: 15000, followRedirects: false })`, `fetch(url, { redirect: 'manual' })`) | Only the two supplier hosts (fixed hostnames, no DNS-rebinding exposure)                                                        | ECG's Cloudflare returned 403 to Node's native fetch 10/10 and 200 to impit 5/5 (~1.8 s). impit has no DNS hook, so it must never see a user-influenced host. **[assumption]** the prebuilt `linux-x64-gnu` binary loads in `node:24-bookworm-slim` — Phase 9 smoke-tests it in the Docker build; `vanillaFallback: true` keeps KV working if it does not.                                                                                     |
| **guarded undici** (`import { fetch, Agent } from 'undici'` — pinned direct dependency, never mixed with Node's global fetch)   | Image downloads (`images.ecarpetwholesale.com`, `cdn.shopify.com`, `karavanrug.com/cdn/…`), the Jina fallback, and nothing else | `Agent({ connect: { lookup: vettedLookup, timeout: 5000 }, headersTimeout: 10000, bodyTimeout: 10000 })`; `vettedLookup` resolves with `dns.lookup(host, { all: true })`, unmaps `::ffff:a.b.c.d` literals to IPv4, rejects any address in a `node:net BlockList` (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, 100.64/10, ::1/128, fc00::/7, fe80::/10 — **not** `::ffff:0:0/96`, which blocks all IPv4), returns the vetted address. |

Common rules: `redirect: 'manual'`, max 3 hops, each `Location` re-validated (https + allow-list) before following
(ECG redirects `www` → bare host and store codes; KV `www` → apex); `AbortSignal.timeout(10_000)` per request, 20 s per
scrape overall; streaming body caps 4 MB for HTML/JSON (ECG pages are ~1.2 MB), 12 MB per image; accepted content
types `text/html`, `application/json`, `application/javascript` (Shopify `.js`), `image/*`; browser-like `User-Agent`
and `Accept` headers; reject IP-literal hosts, `localhost`, `.local`, `.internal`, single-label names before DNS.

**Fallback (config `SCRAPE_JINA_FALLBACK=true`)**: `GET https://r.jina.ai/<outbound url>` with `X-Return-Format: html`
through the guarded undici client, keyless (20 RPM free tier; verified to return ECG's complete raw HTML in ~2 s), fed to
the same parsers. Triggered when impit returns 403 / a Cloudflare challenge page / a network error, or when the parse
yields no price. Never with an API key (an ECG page is ~1.39 MB ≈ 350k billed tokens). Every 403 is logged.

Result cache: in-process `Map` keyed by normalised outbound URL, 15 min TTL, max 100 entries; `force: true` bypasses.

### 4.4 Site adapters

**karavanrug.com (`karavan.ts`)** — Shopify, server-rendered, no bot protection (verified).

1. `GET /products/<handle>.js` → `{ title, handle, description (HTML), vendor, type, tags[], price (cents), variants[]
{ sku, price }, images[], featured_image, media[] { width, height, src } }`. Fallback `GET /products/<handle>.json`
   (`product.body_html`, `variants[].price` as '910.00', `images[].src`).
2. `GET /products/<handle>` (HTML) → JSON-LD `@type: Product` → `offers.priceCurrency` (verified USD), `sku`, `description`;
   `og:price:currency` as second source. If the HTML fetch fails: `seenCurrency = 'USD'`, `currencyAssumed: true`.
3. Specs from `description`/`body_html`: strip tags, split on `<br>`/newlines, parse `Label: value` lines from the
   "Item Details" / "Item Summary" / "Details:" block: `Stock Code → supplierRef`, `Size → widthCm/lengthCm` (cm pair
   first, §4.6), `Material`, `Technique → method`, `Age`, `Origin`, `Colors`/`Style` → `tagsSuggested`,
   `Dyes`/`Condition` → appended to `warnings` as info. `method` fallback: first of `Kilim | Cicim | Soumak | Tulu |
Handwoven | Hand-knotted` found in title/description.
4. `tagsSuggested` += `tags[]` (e.g. `RUGS`, `VINTAGE LARGE RUGS` — title-cased, de-duplicated, `RUGS` dropped).
5. Photos: `media[]` entries with `src` on `cdn.shopify.com` (or `images[]`), `?width=1600` appended for Drive import,
   original kept for reference; `width/height` from `media[]`.
6. `seenPrice = price / 100` (cents; `variants[0].price` when only `.json` is available).

**ecarpetgallery.com (`ecg.ts`)** — Magento 2 / Hyvä behind Cloudflare, product page fully server-rendered (verified).

1. Fetch the `/us_en/` product page via impit (fallback Jina). Detect a challenge page (`Attention Required! |
Cloudflare`, ~5.5 KB, status 403) → try the fallback.
2. `supplierRef`: GTM dataLayer `"item_sku":"<n>"` → else the URL suffix digits.
3. `supplierTitle`: `og:title`. `description`: `og:description` → else `div.product.attribute.description div.value`
   (text). Price: `<meta property="product:price:amount">` + `product:price:currency` → else `meta[itemprop=price]` +
   `itemprop=priceCurrency` → else `.pricing-div .final-price` text (`USD $700 ECARPETGALLERY`). `retailEstimate`:
   `.pricing-div .retail-price` text (hint only; never used as our price).
4. Spec table `table.additional-attributes` rows `<th>label</th><td>value</td>`: `Made In → origin`, `Weave → method`,
   `Age → age`, `Material → material`, `Width` / `Length` (feet-inches only) → cm (§4.6), `Collection`, `Style`,
   `Pattern`, `Color`, `Rug Type` → `tagsSuggested` (split on commas). Ignore the junk `New` row and `Remarks=NA`.
5. Photos: the inline gallery JSON inside the `x-data="initGallery"` component — regex
   `/images:\s*(\[[\s\S]*?\])\s*[,}]/` then `JSON.parse` → for each entry prefer `full` (1930×3200); the original
   (`/cache/<hash>/` stripped) is offered as an alternative. Host `images.ecarpetwholesale.com` is not behind the bot
   block (verified: plain fetch 200).
6. Optional enrichment **[assumption — off by default, `SCRAPE_ECG_GRAPHQL=false`]**: `GET /graphql` with header
   `Store: us_en`, query `products(search:"<sku>")`, keep only the item whose `sku === <sku>` (the `url_key` filter
   returned a different product, verified), read `custom_attributesV2` `width_sort/length_sort` (cm) and `msrp`.
   Verified with curl only; not verified through impit, and blocked for Node's native fetch. Never use its
   `media_gallery` (placeholder images).

**Generic extractors (`generic.ts`)**, run after the adapter to fill gaps: JSON-LD `Product`/`Offer` (walk `@graph` and
arrays), OG/product meta (`og:title`, `og:image`, `og:description`, `product:price:amount/currency`, `og:price:*`),
microdata `itemprop=price/priceCurrency`, then text heuristics (§4.6, `Label: value` lines for Material/Age/Origin/Weave/
Stock Code). Parsing = **cheerio 1.2.0** (MIT); never its `fromURL` helper — always feed it our fetched string.

### 4.5 SSRF and etiquette rules (recap)

- Only `(supplier, handle|sku)` reaches the network; the supplier hosts are constants; every redirect and every image
  URL is re-validated against its own allow-list (`images.ecarpetwholesale.com`, `cdn.shopify.com`, `karavanrug.com`).
- Timeouts and caps as in §4.3; no listing/search pages ever; one fetch per admin action; results cached 15 min; the
  endpoint exists only behind the admin session with a 10 / min limit. ECG's robots.txt is `Disallow: /` and its
  Cloudflare actively blocks non-browser clients — this is tolerated-use territory: keep volume to single product pages
  the owner intends to buy and keep the manual-entry path working.
- `got-scraping` (EOL), `metascraper` (no product rules), `@extractus` (articles), Playwright/Chromium in the container
  (Playwright's own docs: testing/dev only, +120–200 MB) are all rejected.

### 4.6 Unit conversion (`size.ts`, pure, tested)

1. Prefer an explicit cm pair anywhere in the size string / title / spec: `/(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)\s*cm/i`
   (matches `202 x 315 cm / 6'8" x 10'4" ft`, `4.3 x 11.9 feet / 130 x 360 cm`, `65 x 362 cm`).
2. Else feet-inches: `/(\d{1,2})'\s*(\d{1,2}(?:\.\d)?)?"?\s*[x×]\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d)?)?"?/` →
   `cm = Math.round((ft * 12 + in) * 2.54)`: `4'3" → 130`, `7'5" → 226`, `6'8" → 203` (KV states 202 — cm wins),
   `10'4" → 315`, `2'11" → 89`. For ECG, read the `Width`/`Length` table rows (never the `5x8` category in the title).
3. **Never** parse KV's `4.3 x 11.9 feet` as decimal feet (it is feet.inches: 130 cm = 4'3").
4. Keep the raw supplier string as `sizeRaw`; order the pair so `widthCm ≤ lengthCm`; the form has a swap button.

### 4.7 Price normalisation and the retail suggestion (`money.ts`, pure, tested)

- Currency detection order: JSON-LD `offers.priceCurrency` → `product:price:currency` / `og:price:currency` →
  Shopify `.js` (cents in the shop's presentment currency; KV verified USD) → symbol heuristics (`$` → USD unless
  `CA$`/`C$`, `€` EUR, `£` GBP, `₺`/`TL` TRY).
- Amount parsing: keep digits and separators; if both `,` and `.` occur the last one is the decimal separator; a lone
  `,` followed by exactly two digits is decimal, otherwise thousands.
- `seenPrice` + `seenCurrency` are kept verbatim. `priceUsd = seenPrice` when USD; otherwise `seenPrice /
rate_to_base` from the Rates tab when the currency exists there (flagged in `warnings` as an estimate), else
  undefined (manual entry).
- `suggestedRetailUsd = roundUpToStep(priceUsd × markup, step)` (§7) where `markup` follows §3.2's lookup order;
  when unset the field stays blank and the form shows the mono hint _"Set retail_markup in Settings to derive retail
  prices"_. The legacy Apps Script formula is lost (not in the repo) — the owner must supply the multiplier (§11 Q1).

### 4.8 Manual-entry fallback

Any scrape failure (400/404/422/502/504) keeps the preview open and offers **Enter manually** (legacy behaviour):
`supplier` and `supplierRef` are derived from the pasted URL alone (`/(\d{4,})/` for ECG, the handle for KV), all other
fields are left blank, `sourceUrl` is kept, no photos are imported, and the message reads _"Manual entry — fill what you
need, then Add."_ A 422 `parse_failed` still returns whatever partial `data` was extracted.

### 4.9 Audit and limits

`scrape.fetch` audit row per call: `after = { url, supplier, via, ok, status, ms, seenPrice, seenCurrency }`; 10 / min
per session, 30 / 10 min global; 429 carries `Retry-After`.

---

## 5. Photo import to Google Drive (`src/lib/drive/`)

### 5.1 Scope change and re-consent (owner steps, documented in SHEET_SETUP)

The current refresh token holds only `spreadsheets`; per RFC 6749 §6 a refresh can never add a scope. Steps:

1. `scripts/google-auth.ts`: `SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file']`
   and `include_granted_scopes=true` in the consent URL; new flag `--no-drive` keeps a sheets-only token. The script
   already prints the granted scope.
2. Enable the Drive API in the Cloud project (`console.cloud.google.com/flows/enableapi?apiid=drive.googleapis.com`).
3. Run `npm run google:auth`, copy the new `GOOGLE_OAUTH_REFRESH_TOKEN` to the production environment as well (the old
   token keeps working until revoked; 100 live tokens per client max).
4. Publish the OAuth consent screen (a "Testing" screen issues refresh tokens that die after 7 days).
5. Photo import assumes `GOOGLE_AUTH_MODE=oauth_refresh`; in `service_account` mode uploads would land in the service
   account's own Drive, so the feature reports `drive_not_authorised` in that mode.

`drive.file` is Google's "non-sensitive" scope: the app sees only files it created. **[assumption]** the owner's
hand-made "Catalogue photos" folder (ADR D6) is not addressable under `drive.file`; the server therefore creates its own
folder once and remembers its id. Verified on first run (Phase 10) and recorded in the ADR.

### 5.2 Client (`src/lib/drive/client.ts`)

Shares the Sheets `TokenSource` (export `createTokenSource` from `client.ts`; one bearer token serves both APIs) and the
Sheets client's conventions (native fetch, 30 s timeout, retries on 429/503 only, writes never replayed).

- `ensureFolder()`: `GOOGLE_DRIVE_FOLDER_ID` when set; else `files.list` `q="name='Serio Ludere catalogue photos' and
mimeType='application/vnd.google-apps.folder' and trashed=false"` (under `drive.file` only app-created files are
  visible, so the name lookup is unambiguous); else `files.create` `{ name, mimeType: application/vnd.google-apps.folder }`
  then `permissions.create` `{ type: 'anyone', role: 'reader' }` (`allowFileDiscovery: false`) once on the folder —
  files inherit it, so no per-file permission call. The id is logged with the advice to set `GOOGLE_DRIVE_FOLDER_ID`.
- `uploadFromUrl(url, name, intoFolderId?)`: guarded undici download (host allow-list §4.5, `image/*`, ≤ 5 MB — the multipart cap;
  ECG full images are ~0.9 MB, KV `?width=1600` ~0.4 MB) → `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType`
  with `multipart/related` (metadata part `{ name: '<prefix>-<n>.jpg', parents: [folderId], mimeType }` + media part)
  → `HEAD https://lh3.googleusercontent.com/d/<id>=w800` with up to 3 retries × 2 s before the id is accepted
  (lh3 propagation delay for fresh files is unverified) → returns `{ id }` or `{ error }`.
  `intoFolderId` targets a rug's own folder; omitted, the photo lands in the flat root.
- `ensureProductFolders(productId, productName)` (brief §12): finds or creates `<root>/<id> — <name>` and its
  `All Images` child, scoping each lookup to its parent so two rugs with the same name cannot collide. No
  `permissions.create` on either — they are made inside the root, which is already shared with anyone holding the
  link, and folders inherit that. Idempotent, so a retry after a half-finished import reuses what is there.
  Returns `{ productId, allImagesId, name, url }`.
- `copyFile(fileId, name, intoFolderId)`: `files/{id}/copy`; used once per rug to duplicate the primary up out of
  `All Images` as `01-primary`.
- `listFolder(folderId)`: one page of 100 as `name → id`. Exists for the retry (§5.3): filenames are deterministic,
  so a name already in `All Images` is a photo that already landed.
- `getMedia(fileId)`: one un-retried `files/{id}?alt=media`, body handed back unconsumed for `/api/image/[fileId]`.
  Non-`image/*` is refused — the proxy serves from our own origin, so a stray HTML or SVG file in the photo folder
  must never come back as same-origin script.
- `scopeStatus()`: `OAuth2Client.getTokenInfo(accessToken)` (google-auth-library 11.0.2) → `driveScopeOk` cached 10 min;
  surfaced on `/api/health` and the dashboard.

### 5.3 Endpoint behaviour and fallback

`POST /api/admin/photos` imports ≤ 12 URLs sequentially, returns per-URL results, audits `photo.import`
(`target_tab: Drive`, `after: { ids, failed }`). Given a `productId` it runs the brief §12 commit
(`src/lib/drive/commit.ts`): folders first, then each photo into `All Images` as `01-primary` / `<prefix>-<n>`, with
the primary copied up into the rug's folder; it answers with `driveFolderId` / `driveFolderUrl` / `complete`, which
the add form writes onto the row alongside `Commit Status`. Without a `productId` it falls back to the flat
`<prefix>-<n>.jpg` upload into the root folder.

**Commit order (brief §12).** Validate the id → write the row `pending` → create the folders → upload one at a time
→ update the row `complete`. The old order uploaded first and wrote the row afterwards, so a failure part-way left
images in Drive that no row pointed at. Writing the row first inverts the failure: what is left is a visible row
marked `pending`, which the products list badges "photos pending". `commitPhotos` never throws — every outcome is
reported, because a half-finished import must leave something the admin can act on.

`POST /api/admin/rugs/[id]/retry` finishes such a row, behind the "Finish photo import" button on the card. It
re-scrapes `Source URL` for the photo list (the Products tab is the brief's fixed 42 columns, so the pending URLs are
stored nowhere; the scraper is cached and idempotent) and lists `All Images` for what already landed, uploading only
the difference. **Idempotent** — pressing it twice uploads nothing the second time. Refusals: `404` unknown id,
`409 drive_not_authorised`, `422 no_source` / `no_photos`, `502 scrape_failed`, `409` on a stale version. It audits
`photo.import` with `{ wanted, imported, reused, commitStatus }` and busts the catalogue snapshot, because the
primary is a catalogue-visible cell.

`GET /api/image/[fileId]?w=400|800|1600` serves every photo from our own origin, `immutable, max-age=31536000`.
Two upstreams: **lh3 anonymously first** (the folder is shared with anyone holding the link, so it needs no token and
downscales on demand), then the authenticated Drive API for a file that is not public. The width is a closed set and
the id is matched against `^[A-Za-z0-9_-]{10,200}$` before it reaches a URL; there is no parameter that accepts a URL.
`driveImageUrl()` returns this path — but `waitForLh3` and `scripts/check-photos.ts` still probe `lh3Url()`, since
they exist to check Drive, not us.

Fallback = store nothing: when `driveScopeOk` is false (scope missing, service-account mode, Drive API disabled) the
checkbox "Save photos to Drive" is disabled with the hint _"Drive is not authorised — see SHEET_SETUP §6"_, the scrape
still shows previews, and the rug is created with an empty `photos` cell; the owner can paste Drive ids/links later
(validated by `extractDriveId`). A partial failure creates the rug with the ids that succeeded and reports the rest.
Orphans (photos uploaded, then `rug.create` fails) are visible in the `photo.import` audit row.

Preview thumbnails on the add page need `img-src` for `https://cdn.shopify.com` and `https://images.ecarpetwholesale.com`:
`Astro.csp.insertDirective("img-src 'self' https://lh3.googleusercontent.com https://cdn.shopify.com https://images.ecarpetwholesale.com data:")`
in `/admin/rugs/new` frontmatter (merges into that page's directive only — verified). Optional hardening later: proxy
previews through the server so the admin's IP never reaches the suppliers.

---

## 6. Unique client links

### 6.1 Code format and generation (`src/lib/admin/clients.ts`, pure)

**Scrambled since 2026-09-13 (owner).** The code no longer reads as the customer's name. Half of the
name's slugified characters (rounded up, minimum 3, pool padded to 4) are shuffled with Fisher–Yates
and 3–4 fillers are woven into the **interior** gaps — digits three times out of four, otherwise `-`
or `_`. The first and last characters are always alphanumeric. `Gida Hussami` → e.g. `i6a-s_d2u`.

**The filler alphabet is `-` and `_` only, and that is a correctness constraint, not taste.** `~` and
`.` are equally unreserved in a URL path (RFC 3986 §2.3) and were the owner's preference, but the same
string is stored as `customer_slug` in `Customers` and as `client` on every `Reactions` row, both of
which parse against `/^[A-Za-z0-9_-]{1,64}$/`. A `~` there makes the customer's own row unparseable
and the buyer vanishes from the catalogue. The generator is constrained to the intersection of the two
alphabets; `CLIENT_CODE_RE` and the customer realm's `SLUG_RE` both encode it.

Randomness is uniform via rejection sampling over `crypto.randomBytes`; the source is injectable so
tests can pin the shuffle. Uniqueness is checked against the `Customers` tab under the admin lock, now
with **eight** attempts rather than two — the old scheme prefixed the full name, so a collision meant
two buyers with the same name _and_ the same six random characters; this one is shorter and drawn from
the name's own letters, so two buyers called "Ana Lee" collide far more often. A non-Latin name
slugifies to nothing and falls back to a fully random code of the same shape rather than throwing.

The code is a **locator, not a credential**: it leaks roughly half the buyer's letters by design and
carries on the order of 25 bits. That is acceptable only because §10 puts a password gate behind the
route — the URL alone opens nothing.

### 6.2 Link and site behaviour (no site change required)

`link = ${SITE_URL}/?c=${code}` (also valid on `/rugs/<slug>?c=<code>`). The site already reads `?c=` on every page
load, validates it, remembers it in `localStorage['sl-client']` (URL wins), sends it as `client` on `POST /api/vote`,
and the route cache drops the parameter from its key (verified, ADR D8/D12). Attribution = _the last link this browser
opened_; a forwarded link attributes to the forwarder — documented for the owner.

### 6.3 Report and audit

`GET /api/admin/clients/report` = §3.5 joined to `Clients`. UI: "Most saved" table (rug, saves, per-client filter chip),
then one block per client (`<name> — n saved`, list of rugs with status), unknown codes grouped under "unknown code",
`anon` under "anonymous". Audit: `client.create` (`after: { code, name, note }`), `client.status`
(`before/after: { status }`). Client rows are never deleted.

---

## 7. `roundUpTo5` semantics and where it applies

`src/lib/price.ts` already implements `roundUpTo5(price)` = ceil to the next multiple of 5 **whole currency units**,
guarded against binary noise (`cents = Math.round(price * 100); Math.ceil(cents / 500) * 5`), `undefined` for missing,
non-finite or non-positive input; `suggestRetail(supplier, markup)`. This spec generalises it to
`roundUpToStep(price, step = 5)` (`Math.ceil(cents / (step * 100)) * step`, `roundUpTo5 = (p) => roundUpToStep(p, 5)`
kept for the existing tests) with `step` read from `Settings.price_round_step`.

Examples (step 5): `700 → 700`, `701 → 705`, `1126 → 1130`, `1329.5 → 1330`, `1332 → 1335`, `1335 → 1335`,
`1332.4 → 1335`, `12.5 → 15`, `1335.0000000000002 → 1335`, `0.1 + 0.2 + 4.7 → 5`; step 50: `1126 → 1150`.

Reading of the owner's sentence _"round up product price to nearest five after comma (based on price)"_: **round UP to
the next multiple of five dollars, dropping whatever follows the decimal comma** — not five cents, and the "(based on
price)" clause is read as "derived from the supplier price". Both readings are flagged in §11 (Q2); the step is
configurable so a tiered rule (e.g. ≥ 1000 → 50) can be added without touching callers.

Applied:

1. To the scraped retail suggestion (`suggestedRetailUsd`), shown as _"supplier $700 → ×1.6 → $1,120 → rounded $1,120"_.
2. On **Add rug** the checkbox _"Round price to 5 on save"_ is checked by default; on **Edit** it is unchecked; the
   server applies `roundUpToStep` only when `roundPrice: true`. A **Round to 5** button beside `price_usd` rounds in
   the form immediately (client-side copy of the same pure function, unit-tested against the server one).
3. Never automatically on existing rows: an edit that does not touch `price_usd` writes it back unchanged; no bulk
   action (a future bulk re-round would be a separate audited action with a preview).
4. The public site never rounds (it displays `price_usd` as is).

---

## 8. UI spec (legacy idiom, Astro pages + bundled TS, hash CSP)

### 8.1 Shell — `src/components/admin/AdminLayout.astro`

- Head: charset, viewport, `<meta name="robots" content="noindex, nofollow">`, the same Google Fonts link as the site,
  `import '../../styles/tokens.css'` and `import '../../styles/admin.css'`. No rates JSON, no pre-paint script.
- Body: `<h1>Serio Ludere</h1><p class="sub">Admin — private</p>`, then `<nav class="tabs" aria-label="Admin">` of
  **links** (`Add rug · Catalogue · Collections · Clients · Audit log`, `aria-current="page"` on the active one, `.on`
  class) plus a right-aligned logout `<form method="post" action="/admin/logout"><button class="chip">Log out</button></form>`,
  then `<main>` slot. Tabs are links, so keyboard navigation is native (Tab/Enter); the legacy `.tabs button` styling
  applies to `.tabs a`.
- `src/styles/admin.css` ports `reference/admin.html` lines 16–71 onto the tokens (`--paper`, `--paper-deep`, `--ink`,
  `--ink-soft`, `--rule`, `--accent`, `--green`, `--body`, `--mono`; adds `--red: #a32020` locally — `tokens.css` is
  not edited): `.tabs`, `.panel`, `.row`, `.grow`, `input/select/textarea` with the accent focus ring, `button.go`,
  `button.go.alt`, `.hint`, `.msg.ok|err|busy`, `.fields` grid (`repeat(auto-fit, minmax(220px, 1fr))`), `.f label`
  (mono 10 px uppercase), `.preview`, `.thumb`, `.actions`, `label.chk`, `table/th/td`, `td.n`, `.stack h3`, `.grid`
  (`minmax(210px, 1fr)`), `.card .ph` (3:4, contain, drop-shadow, `.rot` rotate logic from `src/lib/rotate.ts`),
  `.card .nm/.mt/.pr/.cnt`, `.chip` and `.chip.on`. New: `.chip[aria-pressed=true]` = `.chip.on`, `.status-draft`,
  `.status-archived` (greyed card), `.kbd` hint, a `:focus-visible` ring on chips/cards, `prefers-reduced-motion`
  honoured.

### 8.2 Client scripts — `src/scripts/admin/*.ts` (vanilla TS, bundled by Astro, no inline handlers)

- Shared modules: `api.ts` (`post(path, body)` / `get(path)` with `credentials: 'same-origin'`,
  `headers: { 'content-type': 'application/json' }`, 10 s timeout, 401 → `location.assign('/admin/login?next=…')`,
  409 → returns the fresh row for the form to reload, `Retry-After` surfaced), `dom.ts` (`el(tag, attrs, children)` —
  `textContent` only, never `innerHTML`), `msg.ts` (`msg(el, text, 'ok'|'err'|'busy')`, `hide(el)`), `price.ts`
  (client copy of `roundUpToStep`, tested for parity), `chips.ts` (toggle chips with `aria-pressed`, roving arrow-key
  focus like `src/scripts/tabs.ts`).
- One entry per page: `rug-list.ts`, `rug-form.ts` (add + edit), `collections.ts`, `clients.ts`, `audit.ts`,
  `dashboard.ts`. Every entry imports a shared module, so it is emitted as an external `/_astro/*.js` chunk under
  `script-src 'self'` and no new hash lands in the public pages' CSP meta (verified: only import-free scripts < 4 KB
  are inlined and hashed).
- Initial data reaches scripts via `<script type="application/json" id="…">` blocks rendered with the existing
  `jsonForScript()` (escapes `<`, `>`, `&`, U+2028/9) or via `data-*` attributes — never by string-building JS.
- All listeners via `addEventListener`; Enter in the URL field triggers Fetch, Enter in "your name" moves focus to the
  URL field (legacy), Escape hides the current `.msg`, `Ctrl/⌘+S` on the form = Save, buttons are `disabled` while a
  request is in flight and the message shows the `busy` state.

### 8.3 Pages

**`/admin/rugs/new` (Add rug)** — `rug-form.ts` in add mode.

- Row 1: `#yourName` ("Your name for this rug — e.g. Khal Mohammadi"), collection `<select>` from Collections (first
  option "Collection…", **required**, legacy error _"Pick a collection first — without it the rug won't appear
  anywhere."_). Row 2: tag chips from Tags (multi-select) + "+ new tag" inline input (calls `tag.create`). Row 3:
  `#url` + **Fetch**. Hints: _"Your name is what clients see. The link only supplies size, material, age and price."_,
  `#supplierTitle` ("Supplier calls it: …"), `#m1` message.
- Preview (`.preview.on` after Fetch or manual entry): `.fields` grid — `Rug number (id)` (prefilled from
  `next-id`, editable), `Slug` (derived, regenerate button), `Name (what clients see)`, `Description` (textarea, spans
  the grid), `Width (cm)`, `Length (cm)` (+ swap button, `ftHint` "Supplier measurement: 4'3" × 7'5""), `Material`,
  `Method`, `Age`, `Origin`, `Retail price (USD)` (+ **Round to 5** button, `priceHint` "Supplier price $700 → ×1.6 →
  $1,120 → rounded $1,120" or the markup-unset hint), `Rotate` (select), `Featured` (checkbox), `Status` (select,
  default from Settings), `Supplier link` (readonly = normalised `sourceUrl`), `Supplier` / `Supplier ref` (readonly
  from the scrape, editable in manual mode), `Notes`. `tagHint` "Suggested tags: … · use these" adds chips
  (creating missing tags on Add, after confirmation).
- Photos strip: scraped thumbnails as `.card .ph` tiles with a checkbox each (all checked, max 12, drag-free order =
  page order; first = card image), `.cnt` badge with the count; disabled with hint when `driveScopeOk` is false.
  Below: a `photos` textarea (one Drive id/link per line) for manual ids.
- Actions: `label.chk` "Save photos to Drive" (checked when authorised), `label.chk` "Round price to 5 on save"
  (checked), **Add to sheet**, **Clear** (alt). `#m2` message: _"Added SL-030 at row 31. 5 photos saved to Drive."_ /
  partial-failure text / error with **Enter manually** link (in `m1`) on scrape failures.
- Flow on Add: validate → (photos checked) `POST /api/admin/photos` → `POST /api/admin/rugs` → success message with a
  link to `/admin/rugs/<id>` and the audit row → form reset (name/url cleared, collection kept).

**`/admin/rugs/[id]` (Edit)** — same grid in edit mode: id readonly, hidden `version`, Save (`POST /api/admin/rugs/[id]`),
**Archive** / **Restore** (`…/status`, confirm dialog via `<dialog>`), "Open on site" link (`/rugs/<slug>`, disabled
when not active), likes/dislikes/rating shown read-only in the `.mt` mono style, photos as thumbnails with the textarea
editor. 409 → message _"Someone changed this row — reloaded the latest values; re-apply your edit."_ and the form
re-renders from the fresh row.

**`/admin/rugs` (Catalogue)** — server-rendered chips (`All n`, one per collection with counts, `No collection n`) +
status chips (`Active`, `Draft`, `Archived`, default Active) + a search input (name/id/supplier_ref, client-side);
`.grid` of `.card`s (photo with rotate logic, `.cnt` badge, name, dims/material/age/origin in `.mt`, price in `.pr`,
status chip), each card is an `<a href="/admin/rugs/<id>">`. Keyboard: chips are buttons with `aria-pressed`, arrow keys
move between chips. Empty state in `.msg.busy` (_"No rugs yet."_).

**`/admin/collections`** — table of collections (`sort_order`, name, slug, description, cover, rugs count) with ▲/▼
buttons (reorder → `POST …/reorder`), inline edit (name, description, cover id/URL, Save), and an add form (`.fields`:
name, description, cover image id/URL). Tags section below: chips list with an edit popover (name, colour swatch
`<input type="color">`), add form. Renaming a collection does **not** rewrite rugs (they store display names, matched
case-insensitively) — a hint says so and shows the count of rugs that would detach.

**`/admin/clients`** — form (`name`, `note`) → **Generate link** → result block with the link in a readonly input,
**Copy** (`navigator.clipboard.writeText`, fallback: select the input), the code, and a QR-free note _"Send this link;
their ❤/👎 are recorded under <name>."_; table of clients (name, code, status, created, saves, link, Revoke/Restore);
report as in §6.3 with a **Refresh** button (`GET …/report`).

**`/admin/audit`** — table (`time`, `actor`, `action`, `target`, `before → after` (pretty JSON in `<details>`), `note`),
filter inputs (action select, target id text) applied client-side, **Load more** (offset paging). Rows from the sheet
are rendered as text only.

**`/admin/login`** — rebuilt on Figma A1 (47:3) / A2 (47:28) / A3 (47:51) on 2026-09-14. A 400-wide card:
wordmark + "preview admin", one password `Input` (`autocomplete="current-password"`, with the reveal eye),
and a full-width primary `Button`. The three states differ only in the field.

The failure copy is now Figma's, **superseding this section's earlier generic _"Login failed."_**: A2 says
_"That password is not correct."_ in `--danger`, A3 says _"Too many attempts — wait 60s. n s remaining."_ in
`--warning` with the whole control greyed and the button relabelled **Locked**. The generic wording existed to
prevent username enumeration; this form has no username — one shared password is the only secret — so the
specific message tells an attacker nothing the generic one did not. The throttle, which is the control that
actually matters, is unchanged, and `Retry-After` is still both a header and the visible hint.

A3 is _unavailable_, not _invalid_: the attempt was refused before the password was read, so the field does
**not** set `aria-invalid` and its message takes the warning tone. `/admin` dashboard as in §2.1.

---

## 9. Configuration and environment

### 9.1 `astro.config.mjs` env schema additions (all `context: 'server', access: 'secret'`)

| Variable                 | Type                                      | Notes                                                                                                           |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`    | string, `optional: true`, min 80 when set | `scrypt.<N>.<r>.<p>.<salt b64url>.<key b64url>`; when unset every `/admin*` route answers 404 (admin disabled). |
| `ADMIN_SESSION_SECRET`   | string, `optional: true`, min 32          | HMAC key for the session token; rotating it logs everyone out.                                                  |
| `ADMIN_USER`             | string, default `owner`                   | Audit `actor` label only.                                                                                       |
| `RETAIL_MARKUP`          | number, `optional: true`                  | Bootstrap/confidential markup; the Settings tab wins when set.                                                  |
| `GOOGLE_DRIVE_FOLDER_ID` | string, `optional: true`                  | The app-created photos folder (the brief's `DRIVE_FOLDER_ID`); discovered/created and logged when unset.        |
| `SCRAPE_JINA_FALLBACK`   | boolean, default `true`                   | Enable the keyless Jina Reader fallback.                                                                        |
| `SCRAPE_ECG_GRAPHQL`     | boolean, default `false`                  | Optional ECG GraphQL enrichment (§4.4, unverified via impit).                                                   |

`.env.example` additions:

```
# --- Admin panel (docs/ADMIN_SPEC.md §9). Leave ADMIN_PASSWORD_HASH empty to keep /admin disabled. ---
# Generate with: npm run admin:password   (prompts for the password, prints the hash; --write stores it here)
ADMIN_PASSWORD_HASH=
# Generate with: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
ADMIN_SESSION_SECRET=
ADMIN_USER=owner
# Optional retail multiplier used when the Settings tab has none (e.g. 1.6). Keep here if it is confidential.
RETAIL_MARKUP=
# Drive folder for imported photos (created and printed on first import when empty; needs the drive.file scope, SHEET_SETUP §6)
GOOGLE_DRIVE_FOLDER_ID=
# Scraper fallbacks
SCRAPE_JINA_FALLBACK=true
SCRAPE_ECG_GRAPHQL=false
```

The Dockerfile build stage gets placeholders only for the two required site secrets as today; the admin variables are
optional at build time.

### 9.2 Password hashing — `scripts/admin-password.ts` (`npm run admin:password`)

- Reads the password from stdin (interactive: `readline` with echo disabled via `setRawMode`; piped: whole stdin),
  requires ≥ 12 characters, derives `scryptSync(password, salt = randomBytes(16), 64, { N: 2 ** 17, r: 8, p: 1,
maxmem: 256 * 1024 * 1024 })` (OWASP parameters; the default `maxmem` throws at N = 2^17 — verified) and prints
  `ADMIN_PASSWORD_HASH=scrypt.131072.8.1.<salt>.<key>`. `--write` calls `upsertEnv` (the `.` separator was chosen because
  `scripts/lib/env.ts` only accepts `[A-Za-z0-9_\-./]` and `.` never occurs in base64url).
- `src/lib/admin/auth.ts` (pure, tested): `parseHash(str)`, `verifyPassword(hash, password)` re-derives with the
  parameters in the string and compares 64-byte keys with `timingSafeEqual` (equal lengths by construction);
  `makeToken({ sid, user, iat, exp, abs }, secret)` = `base64url(JSON) + '.' + base64url(HMAC-SHA256)`;
  `verifyToken(token, secret, now, revoked)` (length check, `timingSafeEqual` on the two 32-byte digests, `exp`/`abs`
  checks, revocation set); cookie helpers `adminCookieName(isSecureSite)`, `setSessionCookie`, `clearSessionCookie`
  (`httpOnly, secure, sameSite: 'lax', path: '/'`, `maxAge` = seconds to `exp`, no `domain`).

### 9.3 Login throttling (`src/lib/admin/login.ts`, pure)

`failLimiter` keys `admin-fail:<ip_hash>` (5 / 15 min) and `admin-fail:global` (20 / 15 min) checked with `wouldAllow`
**before** scrypt; on failure `allow()` consumes and the response carries `Retry-After` = `min(900, 2^(failures-3))`
for failures ≥ 3; on success the per-ip key is refunded. One `auth.lockout` audit row per (ip_hash, window).

---

## 10. Implementation plan (phases continue `docs/PLAN.md`; each ends with `npm run lint && npm run typecheck && npm test`)

### Phase 7 — Foundations: contract, auth, session, audit, write primitives

| File                                                                                                                                                                                                                                                                                                                                                                                        | Change                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/sheets/contract.ts`                                                                                                                                                                                                                                                                                                                                                                | `TABS`/`HEADERS` for Clients, AuditLog, Settings; `RUGS_ADMIN_HEADERS`, `RUGS_ADMIN_RANGE`, `RUGS_COLS`, `SETTINGS_SEED`.                                   |
| `scripts/init-sheet.ts`                                                                                                                                                                                                                                                                                                                                                                     | §3.3 steps 2–6.                                                                                                                                             |
| `scripts/lib/roundtrip.ts`, `scripts/roundtrip.ts`                                                                                                                                                                                                                                                                                                                                          | `--check-containment` probes `Rugs!Q2`.                                                                                                                     |
| `src/lib/sheets/write.ts`                                                                                                                                                                                                                                                                                                                                                                   | `buildInsertRows(sheetId, rowIndex, cells[][])` (generalised), `cellOrClear(v)` (`{}` for blank).                                                           |
| `src/lib/price.ts`                                                                                                                                                                                                                                                                                                                                                                          | `roundUpToStep`; `roundUpTo5` kept.                                                                                                                         |
| `src/lib/admin/auth.ts`, `login.ts`, `gate.ts`, `audit.ts` (row builder + truncation + refusal), `lock.ts` (`withAdminLock`), `settings.ts` (parse + markup lookup), `ids.ts` (`nextRugId`, `uniqueSlug`), `dto.ts` (§2.3), `http.ts` (§2.3 common rules), `read.ts` (admin read + version hash), `write.ts` (§3.4 request builders + `commit()`), `invalidate.ts` (`invalidateCatalogue`). |
| `src/lib/api.ts`                                                                                                                                                                                                                                                                                                                                                                            | `rejectCrossSite(request, maxBytes = 4096)`; export `ADMIN_MAX_JSON_BODY = 64 * 1024`.                                                                      |
| `src/middleware.ts`, `src/env.d.ts`                                                                                                                                                                                                                                                                                                                                                         | `sequence(securityHeaders, adminGate)`; `App.Locals`.                                                                                                       |
| `src/pages/admin/login.astro`, `logout.astro`, `index.astro` (dashboard skeleton)                                                                                                                                                                                                                                                                                                           | §2.1.                                                                                                                                                       |
| `src/components/admin/AdminLayout.astro`, `src/styles/admin.css`                                                                                                                                                                                                                                                                                                                            | §8.1.                                                                                                                                                       |
| `scripts/admin-password.ts`, `package.json` (`admin:password`), `astro.config.mjs` env schema, `.env.example`                                                                                                                                                                                                                                                                               | §9.                                                                                                                                                         |
| `src/pages/api/revalidate.ts`                                                                                                                                                                                                                                                                                                                                                               | Use `invalidateCatalogue`.                                                                                                                                  |
| `reference/admin.html`                                                                                                                                                                                                                                                                                                                                                                      | Redact the `SECRET` and the Apps Script URL **before the first commit** (the repo has no commits yet); `.prettierignore` keeps the file verbatim otherwise. |

Tests (Vitest): `auth.test.ts` (hash parse/verify incl. wrong length, token make/verify, expiry, revocation, tamper),
`login.test.ts` (limits before scrypt, Retry-After curve, refund), `gate.test.ts` (401 vs 303, `next` sanitising,
no-store/noindex headers, cache disabled, public paths), `price.test.ts` (+ step cases, FP noise), `ids.test.ts`
(`SL-029 → SL-030`, ignores `1389`/slug ids, `SL-999 → SL-1000`, audit reservations, `uniqueSlug`), `audit.test.ts`
(row shape, diff-only, truncation, refusal, never raw IP), `settings.test.ts`, `admin-write.test.ts` (update never
touches columns 16–19 or column 0; insert computes the target row, adds `appendDimension` only when needed, refuses a
non-blank target; mutation + audit in **one** batchUpdate; 409 on version mismatch with no batchUpdate; verify-read
mismatch logged; mutex serialises two writers), `contract.test.ts` (public `parseRugs` unaffected by W:Z values;
`assertAdminHeaders` with/without W:Z; `init-sheet` header step idempotent with a mocked client), `api.test.ts`
(`rejectCrossSite` with the 64 KiB cap). Integration (Astro container): `GET /admin` → 303, `GET /api/admin/rugs` → 401,
login form success sets the cookie and redirects 303, `X-Astro-Cache` never `HIT`, CSP meta intact.

### Phase 8 — Rugs CRUD, collections, tags (pages + API + UI)

`src/pages/api/admin/rugs/index.ts`, `[id]/index.ts`, `[id]/status.ts`, `next-id.ts`; `collections/index.ts`,
`collections/[id].ts`, `collections/reorder.ts`; `tags/index.ts`, `tags/[id].ts`; `settings.ts`;
`src/pages/admin/rugs/index.astro`, `rugs/[id].astro`, `collections.astro`; `src/scripts/admin/{api,dom,msg,chips,
price,rug-list,rug-form,collections}.ts`; `src/components/admin/{RugFields,RugCardAdmin,Chips}.astro`; `/api/health`
`adminConfigured` + `adminWriteFailures`.
Tests: handler tests with a mocked `SheetsClient` (create → row + audit; update 409; status archive/restore; collection
create/reorder; tag create; unknown collection 422; body > 64 KiB 413); happy-dom tests for `chips.ts`, `price.ts`
parity, `rug-form.ts` (Enter/Escape/Ctrl+S, disabled-while-busy, 409 reload); integration: pages render with mocked
data, no inline handlers in the HTML (`grep -c 'onclick' === 0`), every admin `<script>` is an external chunk.

### Phase 9 — Scraper + Add rug

`package.json` deps: `impit@0.14.4`, `undici@8.10.2` (direct, pinned), `cheerio@1.2.0`; `src/lib/scrape/{index,detect,
fetch,impit,guard,jina,generic,karavan,ecg,size,money,cache,types}.ts`; `src/pages/api/admin/scrape.ts`;
`src/pages/admin/rugs/new.astro` (+ `Astro.csp.insertDirective` for previews); `rug-form.ts` add mode;
`scripts/scrape-fixture.ts` (saves a supplier page/JS through the same fetch layer into `tests/fixtures/scrape/`).
Fixtures: `ecg-380114.html`, `ecg-412224.html`, `kv-60-years-old-vintage-rug….js.json`, `kv-…-runner….json`, the KV
product HTML (for JSON-LD), a Cloudflare challenge page. Docker: build once and assert `import('impit')` loads in the
runtime stage (**[assumption]** from §4.3).
Tests: `detect.test.ts` (allow-list, case, userinfo/port/IP-literal rejection, ECG store rewrite, KV handle), `size.test.ts`
(§4.6 examples, feet.inches trap, swap), `money.test.ts` (§4.7 cases, symbol heuristics, Rates conversion),
`karavan.test.ts` / `ecg.test.ts` on fixtures (every `ScrapedRug` field, tags, photos incl. `/cache/` stripping,
challenge detection), `guard.test.ts` (BlockList incl. the `::ffff:` unmapping and `0x7f000001`/`2130706433`/`127.1`
literals, redirect re-validation, size caps, content-type filter), `scrape-endpoint.test.ts` (rate limit, cache hit,
audit row, manual fallback payload). Live (opt-in `test:live`): one ECG and one KV fetch, skipped without network.

### Phase 10 — Drive photo import

`scripts/google-auth.ts` scopes + `--no-drive`; `src/lib/sheets/client.ts` exports `createTokenSource`;
`src/lib/drive/{client,folder,upload,scope}.ts`; `src/pages/api/admin/photos.ts`; `/api/health` `driveScopeOk`;
add-form photo strip + "Save photos to Drive". Owner steps §5.1 executed on the dev account first; the folder id and
the `drive.file` folder-visibility assumption are recorded in ADR D13.
Tests: multipart body builder (boundary, metadata part, parents, mimeType), `ensureFolder` decision tree (env → list →
create + permission, once), `uploadFromUrl` with a mocked fetch (size cap, content type, lh3 HEAD retries), endpoint
partial-failure shape, `drive_not_authorised` fallback. Live (opt-in): upload one fixture image and read it via lh3.

### Phase 11 — Clients, audit viewer, dashboard, e2e, docs

`src/lib/admin/{clients,saves}.ts`; `src/pages/api/admin/clients/{index,[code]/status,report}.ts`, `audit.ts`;
`src/pages/admin/{clients,audit,index}.astro`; `src/scripts/admin/{clients,audit,dashboard}.ts`.
Tests: `clients.test.ts` (code format, regex parity with `votes.ts` `CLIENT_RE`, collision retry), `saves.test.ts` (newest
wins, remove clears, per-visitor counting, unknown/anon buckets, ordering, ties), audit paging. **Playwright**
(`tests/e2e/admin.spec.ts`, `npm run test:e2e`, opt-in like `test:live`: needs `.env` with the dev sheet and the admin
secrets, runs against `astro preview`): login (wrong password → generic error; right → dashboard), create a draft rug
via the add form with manual entry, edit it, archive it, verify the audit rows and that `/rugs/<slug>` 404s, generate a
client link and open `/?c=<code>`, log out → `/admin` redirects. Cleanup by archiving (rows never deleted).
Docs: **ADR D13 "Admin panel"** (D13.1 auth & session, D13.2 audited atomic writes + containment amendment to D3/§5/§8.9,
D13.3 scraper sources and the no-browser rule, D13.4 Drive upload & scope change, D13.5 client links, D13.6 price rule)

- §6 "Decisions needed" refresh; `SHEET_SETUP.md` (§2.3 rewritten, new §6 "Drive scope and re-consent", the three tabs,
  `admin:password`); `README.md` ("Admin panel" section: setup, URL, what is audited; Layout tree); `PLAN.md` phases 7–11;
  `.env.example`.

---

## 11. Decisions needed from the owner

1. **Retail markup.** The legacy formula (supplier price → retail) lived in the Apps Script / Stock workbook and is not in
   the repo. Give the multiplier (e.g. ×1.6) and whether it differs per supplier; and whether it may live in the
   `Settings` tab (readable by every sheet Editor) or must stay in the `RETAIL_MARKUP` env variable.
2. **Rounding rule.** Confirm "round up to nearest five after comma" = **ceil to the next multiple of 5 USD** (1 332 →
   1 335), not 5 cents, and whether larger prices should use a larger step (e.g. ≥ 1 000 → 50).
3. **Supplier cost in the sheet?** This spec stores no `cost`/`supplier_price` column (confidential per ADR §3.2);
   the supplier price is kept only in the audit row. Say if you want a visible column after all.
4. **"Launch collection".** Drop it, or represent it as a tag (`Tags` row) — there is no column for it.
5. **Default status of a new rug**: `active` immediately (legacy "Add to sheet" published at once) or `draft` until you
   flip it.
6. **Drive scope and re-consent.** Approve re-running `npm run google:auth` with the `drive.file` scope, enabling the
   Drive API, publishing the OAuth consent screen, and a **new app-created photos folder** (your hand-made folder is
   probably not addressable under `drive.file`).
7. **Containment change.** Accept that the site's Google identity can now edit the content tabs (hard protection only on
   `Rugs!Q1:S` and the Votes header), replacing the ADR D3 "insert-only" posture.
8. **Legacy Apps Script.** Redeploy it without `preview_url/add_from_url/add_rug/list_rugs/list_saves` and rotate the
   secret the legacy shared secret (redacted) (leaked in `reference/admin.html`); confirm the file may be redacted before the first commit.
9. **Scraping posture.** ECG blocks non-browser clients and its robots.txt disallows everything; approve the
   "single product pages you intend to buy, via impit with a keyless Jina fallback" approach (or ask ECG for a feed).
10. **Client codes** readable (`nadia-k7m2pq`, name embedded) vs opaque (`k7m2pq9x`); and whether revoked codes should
    stop being accepted by the site (would need a site change) or only be hidden in the admin (this spec).
11. **Session lifetime** (12 h idle / 7 days absolute) and whether a second admin user is needed soon (this spec has one
    identity; adding users means a `Users` tab and per-user hashes).
12. **Photo previews**: allow `cdn.shopify.com` / `images.ecarpetwholesale.com` in the admin page's `img-src` (your IP
    reaches the suppliers when previewing) or proxy previews through the server (more code, no IP exposure).
