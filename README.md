# Serio Ludere — catalogue

Astro 7 site for the Serio Ludere rug catalogue. A Google Sheet is the CMS and the database:
products, collections, tags, customers and currency rates are read from it; likes and dislikes are
appended as rows and the current state is the newest event per buyer and product.

It serves two things:

- **`/{customer-slug}`** — a private, per-buyer preview behind that buyer's own generated password.
  This is what the client brief describes; the buyer sees a catalog, likes rugs from the grid, likes
  or rejects them on a detail page, and the studio reads the result back in the admin.
- **`/`, `/rugs/*`, `/tags/*`** — the public catalogue, from the earlier brief. Still supported;
  set `PUBLIC_CATALOGUE=false` to switch it off and serve only the private realm and the admin.

Plus **`/admin`**, password-gated: products, collections, tags, customers, the scraper and the audit
log.

Setting it up from scratch, including Google access, the admin password and the sample data:
[`docs/RUNNING.md`](docs/RUNNING.md). What to click once it is up:
[`docs/TESTING.md`](docs/TESTING.md). Design decisions:
[`docs/ADR.md`](docs/ADR.md). What the client brief asks for and what is built:
[`docs/BRIEF_GAP.md`](docs/BRIEF_GAP.md). Sheet setup and Google credentials:
[`docs/SHEET_SETUP.md`](docs/SHEET_SETUP.md). Progress: [`docs/PLAN.md`](docs/PLAN.md).

## Requirements

- Node 24 LTS (`.nvmrc` says 24.20.0; the toolchain wants ≥ 24.16).
- A Google identity that can reach the sheet: a service-account key (production) or, for development,
  an OAuth client plus a one-time browser consent (`npm run google:auth`).

## Run locally

```bash
npm install
cp .env.example .env            # fill in the Google credentials and generate the two secrets
npm run google:auth             # development only: browser consent → refresh token into .env
npm run sheet:init              # creates the development spreadsheet (when GOOGLE_SHEET_ID is empty),
                                # every tab and header, protections, seeds Rates and the sample rugs
npm run sheet:roundtrip         # proves read → atomic reaction insert → recount → undo
npm run dev                     # http://localhost:4321
```

## Quality gates

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
npm run test:live               # opt-in: exercises the real development sheet
npm run check:photos            # lists rugs whose Drive photos do not answer 200
npm run votes:archive           # moves superseded Votes rows older than 12 months to VotesArchive (counts unchanged)
npm run shots                   # Playwright screenshots of the reference page and the site (docs/screenshots/)
npm run qa -- --site=http://127.0.0.1:4321   # browser QA on the built server: CSP, CLS, transitions, reduced motion, keyboard
```

## Deploy

`Dockerfile` builds a Node 24 standalone image (`docker build -t sl-catalogue .`, then
`docker run --env-file .env -p 4321:4321 sl-catalogue`). On DigitalOcean App Platform point the app at
this repository, keep one instance, set the `.env` values as app-level environment variables (mark the
secrets as encrypted), and set `CLIENT_IP_HEADER=do-connecting-ip`. Then install the two Apps Scripts
(`docs/SHEET_SETUP.md` §5) so sheet edits reach the site within seconds and the owner gets health e-mails.

## Add a product from the sheet (owner)

1. Open the catalogue spreadsheet and add a row to **Rugs**: `id` (unique, letters/digits/`-`/`_`),
   `name`, `collection`, `price_usd`, and optionally `description`, `tags` (`a|b|c`),
   `photos` (Drive share links, `|` between them, first is the card), `width_cm`, `length_cm`,
   `material`, `age`, `origin`, `method`, `rotate` (`force`, `true` or `false`).
   Leave `slug`, `status`, `featured`, `likes`, `dislikes`, `rating` and the timestamps alone:
   they default sensibly and the last three are formulas.
2. Make sure the photo files (or their folder) are shared "Anyone with the link".
3. Wait up to a minute (or edit any cell again to trigger the notifier once it is installed): the row
   appears on the site. A row that fails validation is skipped and reported on `/api/health`.

## Layout

```
src/lib/sheets/    contract, client (REST + auth), parse, read, write (atomic insert), cache, compact
src/lib/customer/  the private realm: gate (default-deny), auth (per-slug cookies), visits
src/lib/admin/     session, read/write, audit, clients, settings, the Shopify CSV export
src/lib/scrape/    the extraction ladder, SSRF guard, robots.txt, per-host throttle
src/lib/drive/     upload, media proxy for /api/image/[fileId]
src/lib/           rates (FX), text, images, units, currency, size, price, rotate
src/pages/[slug]/  the buyer's catalog and detail page (the last routes in the tree)
scripts/           google-auth, init-sheet, roundtrip, check-photos, compact-reactions, qa, shots
tests/             unit, integration (mocked Sheets), live (opt-in)
docs/              TESTING, ADR, BRIEF_GAP, PLAN, ADMIN_SPEC, DESIGN, SHEET_SETUP, research briefs
reference/         the original catalogue page and its live data snapshot
```
