# Testing the brief build locally (2026-09-08)

Everything in `docs/BRIEF_GAP.md` marked ❌ or 🟡 has been built except the items listed under
[Still open](#still-open). This is the click-through of what to look at once the site is running.

For a first run on a new machine, follow [`docs/RUNNING.md`](RUNNING.md) instead: it covers the
Google OAuth client, the four secrets, the admin password, the sample data and every error this setup
can throw. Section 1 below is the short version of it.

## 1. One-time setup

```bash
npm install
cp .env.example .env
```

Fill `.env` in this order. The app refuses to start with a missing or short secret, on purpose.

| Variable                                                                | How to get it                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID` / `..._SECRET`                                 | The development OAuth client already in the project                                               |
| `GOOGLE_OAUTH_REFRESH_TOKEN`                                            | `npm run google:auth` (opens a browser once, writes it back)                                      |
| `GOOGLE_AUTH_MODE`                                                      | `oauth_refresh`                                                                                   |
| `REVALIDATE_SECRET`, `VOTE_SALT`, `ADMIN_SESSION_SECRET`, `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` — a different one each |
| `ADMIN_PASSWORD_HASH`                                                   | `npm run admin:password` (prompts, prints the hash; `--write` stores it)                          |
| `SITE_URL`                                                              | `http://localhost:4321`                                                                           |

Then create the spreadsheet:

```bash
npm run sheet:init
```

It creates every tab the brief names — `Products` (42 Shopify columns), `Collections`, `Customers`,
`Reactions`, `ReactionsArchive`, `Visits`, plus `Tags`, `Rates`, `AuditLog`, `Settings` — seeds a few
rows, protects the append-only logs, and writes `GOOGLE_SHEET_ID` into `.env` as its last step.

> **Stop `astro dev` before running it.** Two reasons. A running dev server reloads `.env`
> mid-script and the partially written file makes the next request 503 with a sheet-contract error.
> And `astro:env/server` is generated from `astro.config.mjs` when the server starts, so a process
> older than a newly added variable serves the old configuration until it is restarted.

Running it against a spreadsheet from before the brief is safe and is the intended path: it adds the
missing tabs, upgrades the `Collections` layout in place (`name` and `slug` swap, `created_at` is
inserted) so every row keeps its data, and leaves the superseded `Rugs`, `Votes` and `Clients` tabs
untouched for you to inspect and delete when you are satisfied. Any other header that does not match
the contract stops the script and asks you rather than guessing.

```bash
npm run dev
```

## 2. What to click, in order

### The admin

1. `http://localhost:4321/admin` → sign in with the password you hashed.
2. **Clients** → type a name → **Generate**. You get two things: the buyer's private link
   (`http://localhost:4321/{slug}`) and, once and only once, their password. Copy both.

   Leave the password field blank and one is generated for you — three words and two digits, e.g.
   `amber-loom-serai-47`, which is easy to read down a phone. Type your own instead if you prefer;
   the only rule is eight characters or more. **Reset password** on any row does the same thing for
   an existing buyer, generated or chosen.

   Neither the password nor its hash is ever written to the audit log — only whether it was chosen
   or generated.

3. The **Access log** below the table shows who has opened their link and when, with the device and
   the page they came from. The table's Visits and Last seen columns come from the same read. A buyer
   who has a link but has never used it shows zero visits, which is usually the row worth noticing.
4. **Add rug** → paste a supplier URL → **Fetch** → edit → **Save**. Nothing is written until you
   save; the fetch step writes nothing at all. Missing fields are flagged from the scraper's own
   `fieldStatus`, so you can see what it read, what it inferred, and what needs a human.

   > A Shopify supplier works with no adapter at all: the ladder tries the store's product JSON
   > first. **eCarpetGallery will answer `blocked`** — they publish `Disallow: /` and the scraper
   > now honours robots.txt (brief §11). Set `SCRAPE_RESPECT_ROBOTS=false` if the studio's
   > relationship with that supplier covers it; that is a decision to make deliberately, not a bug.

### The private preview

4. Open the buyer's link in a **private window** (so you are not carrying the admin cookie).
   You should see `Welcome, <name>.` and a single password field.
5. Wrong password → one message, no hint about whether that buyer exists. Five wrong tries in
   fifteen minutes → a throttle with a growing wait.
6. Right password → their catalog, rebuilt from the Figma handoff (ADR D18). Rendered screens for
   comparison are in `docs/screenshots/preview/`. Check:
   - cards offer **like only**; the detail page offers a heart and a dismiss circle;
   - card links stay inside the realm (`/{slug}/{productId}`), keyed by Product ID;
   - the strip of type chips filters the grid, and a "Liked" chip appears once you like something;
   - dimensions read "240 · 170 cm" with a middle dot, and the unit toggle rewrites every one at once;
   - the footer carries the studio email **and** "Prices are indicative and convert at an
     approximate rate.";
   - there is no enquiry action anywhere;
   - the collection description is clamped to one line with **See more**.
7. Tap several hearts quickly. Open the network tab: you should see **one** `POST /api/reactions`
   about 2.5 s after the last tap, carrying every reaction in one body. Switch tabs mid-burst and it
   flushes immediately through `sendBeacon`.

   While a tap is buffered the circle keeps its fill, the heart drops to 45% and a 4px dot appears
   beside it — "noted, not yet stored". Go offline and tap: the state is **held**, a small red alert
   glyph appears, and it retries on its own. Neither mark is announced to a screen reader, which is
   what the design asks for.

8. Open the sheet. `Reactions` has one row per reaction with `source` set to `card` or `detail`, and
   `Visits` has one row for the session (one per buyer per 30 minutes, not one per page).

### Cross-realm checks (the ones worth doing deliberately)

9. Signed in as buyer A, open buyer B's link. You get B's password gate, not B's catalogue.
10. Signed in as a buyer, open `/admin`. You get the admin login, not the panel.
11. Open `/definitely-not-a-customer` → 404 from the middleware, before any page runs.
12. Set `active` to `FALSE` on a customer row, wait 60 s for the cache, reload their link → 404.
    Their reaction history stays in the sheet.

### The rest

13. `GET /api/rates` → the table the pages render with, and `source` telling you whether it came
    from the API, the sheet, or the hardcoded fallback. Pull the network cable and reload a page:
    prices still render.
14. `GET /api/admin/export/shopify-csv` (signed in as admin) → a CSV that imports into Shopify.
15. `POST /api/admin/compact-reactions` → collapses superseded reaction rows into
    `ReactionsArchive`. Safe to run twice.

## 3. The gates

```bash
npx prettier --write .
npm run typecheck
npm run lint
npx vitest run
npm run build
```

`npm run qa` drives Playwright over the running dev server; `npm run shots` refreshes
`docs/screenshots/`.

## 4. Switching to the brief's posture

The site currently serves the public catalogue at `/` **and** the private realm at `/{slug}`, because
the public catalogue was the earlier brief and still works. To get exactly what brief v0.5 describes —
nothing public at all — set:

```
PUBLIC_CATALOGUE=false
```

`/`, `/rugs/*` and `/tags/*` then 404, and only `/{slug}` and `/admin` answer. Nothing else changes;
it is one flag, reversible.

## Still open

Tracked in `docs/BRIEF_GAP.md`, and not built:

- **The Figma design system.** §5's token values that the brief states in prose are now in
  `src/styles/modes.css` as three `[data-mode]` sets, but the component inventory, the frame specs
  and the decision log live in the Figma file, which is not in this repo.
- **Tailwind** (§4). The CSS-variable half is done; the utility framework is not. Under the
  hash-based CSP its CDN build is unusable, so adopting it means a build dependency and a rewrite of
  every component's styles for no behaviour the tokens do not already provide.
- **The admin IA rework** (§6): `/admin/products` as the default screen, the 480 px drawer, the
  fetch modal, inline row editing, and the mobile breakpoints. The admin works; it is the earlier
  shape.
- **The Drive folder tree and the `pending`/`complete` commit order** (§12). Photos still upload
  before the row is written, so a failure leaves orphaned uploads rather than a retryable row.
- **RTL/Arabic** (§8) is not drawn. Flag it before a Gulf buyer gets a link.
