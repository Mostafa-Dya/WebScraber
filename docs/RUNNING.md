# Running this project from scratch

The one document to follow on a new machine, or when something stops working. It covers Google
access, the secrets, the admin password, the sample data, and every error this setup can throw at
you.

Once it is running, [`docs/TESTING.md`](TESTING.md) is the click-through of what to actually look at.

**Read this first, because "mock data" means something specific here.** A Google Sheet _is_ the
database. There is no fixture mode that invents a catalogue. What you get instead is a spreadsheet of
your own that `sheet:init` fills with twenty real rugs from a snapshot in the repo. That is the
sample data, and section 4 sets it up.

Two things do run without a Google account:

- **the test suite**, which mocks the Sheets API end to end: `npx vitest run`;
- **the site itself, read-only, after one successful online run** — see
  [section 9](#9-running-the-site-with-no-google-connection).

---

## 0. Prerequisites

Node 24. `.nvmrc` pins 24.20.0 and the toolchain needs 24.16 or newer.

```bash
node --version
npm install
cp .env.example .env
```

Everything below fills in that `.env`. Nothing is committed: `.env` is git-ignored, and `.env.example`
is the annotated template.

---

## 1. Google access

The site needs an identity that can read and write one spreadsheet. There are two modes and for
local development you want the second.

| Mode              | When                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `service_account` | Production. A key file, no browser step, but a service account has no Drive of its own |
| `oauth_refresh`   | Development. One browser consent, and the spreadsheet lives in a real Drive            |

Set `GOOGLE_AUTH_MODE=oauth_refresh` in `.env`.

### 1a. Create the OAuth client

In the [Google Cloud console](https://console.cloud.google.com/):

1. Create or pick a project.
2. Enable the **Google Sheets API** and the **Google Drive API**.
3. Under **APIs & Services → Credentials**, create an **OAuth client ID** of type **Web
   application**.
4. Add this exact **Authorised redirect URI**:

   ```
   http://localhost:53682/oauth2/callback
   ```

5. On the consent screen, add the Google account you will consent with as a **Test user**, unless
   the app is published.

Copy the client id and secret into `.env`:

```
GOOGLE_OAUTH_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-…
```

> **Use a dedicated Google account, not the studio owner's.** The scope granted covers every
> spreadsheet that account can open. A separate account keeps the blast radius to the catalogue.

### 1b. Consent once

Two ways. **From the admin** is the one to use once the site is running anywhere but your laptop:

1. Add `{SITE_URL}/api/admin/google/callback` to the OAuth client's authorised redirect URIs. The
   exact address is printed on `/admin/google`, with a Copy button, so paste it from there.
2. Open `/admin/google` and press **Connect Google account**.
3. Approve both permissions.

The refresh token is stored by the site itself, in `DATA_DIR/google-oauth.json` with owner-only
permissions, and takes effect on the next request — no restart and no editing `.env`. Set
`DATA_DIR`, or the connection is held in memory and lost when the process restarts; the page warns
you when that is the case.

**From a terminal**, which still works and is convenient during first setup on a laptop:

```bash
npm run google:auth
```

It starts a small local server on port 53682, prints a URL, and waits. Open the URL in a browser
signed in as the development account, approve **both** permissions, and the refresh token is written
to `.env` as `GOOGLE_OAUTH_REFRESH_TOKEN`.

Two scopes are requested:

| Scope                   | Why                                                           |
| ----------------------- | ------------------------------------------------------------- |
| `.../auth/spreadsheets` | Read and write the catalogue                                  |
| `.../auth/drive.file`   | Upload supplier photos, limited to files this app itself made |

`npm run google:auth -- --no-drive` asks for the first only. Photo import then stays disabled, which
is a fine choice if you are not testing that part.

A refresh token can never gain a scope it was not granted, so widening the scope means authorising
again.

### 1c. Staying connected

Access tokens last an hour and are renewed automatically from the refresh token, so once you have
connected there is nothing to keep alive. A connection ends in only three ways:

| Why                                        | What to do                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| The consent screen is still in **Testing** | Google expires the grant after **seven days**. Publish the app in the Google Cloud console. This is the usual cause. |
| Access was revoked                         | Connect again.                                                                                                       |
| Unused for six months                      | Connect again.                                                                                                       |

`/admin/google` shows the connected account, the granted permissions, when the connection was last
actually used, and the last failure if there was one. `/api/health` reports the same in
`googleConnected`, `googleAccount`, `googleLastRefreshAt` and `googleLastError`. When a grant dies
the message says so in those words rather than repeating Google's `invalid_grant`.

---

## 2. Secrets

Four random values, all different, all at least 32 characters. Generate each one separately:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

| Variable               | What it protects                                                          |
| ---------------------- | ------------------------------------------------------------------------- |
| `REVALIDATE_SECRET`    | The cache-busting endpoint the sheet's notifier script calls              |
| `VOTE_SALT`            | Hashes visitor cookies and IP addresses so neither is stored in the clear |
| `ADMIN_SESSION_SECRET` | Signs the admin session cookie                                            |
| `AUTH_SECRET`          | Signs each customer's session cookie                                      |

`AUTH_SECRET` is the switch for the private preview. Leave it empty and every customer path answers
404; the admin and the public catalogue still work.

Also set the site origin, which decides whether cookies are marked secure:

```
SITE_URL=http://localhost:4321
```

---

## 3. The admin password

There is no username and no account, just one password. It is never stored, only its scrypt hash.

```bash
npm run admin:password -- --write
```

It prompts with the echo off and writes `ADMIN_PASSWORD_HASH` into `.env`. Drop `--write` to print
the hash without storing it. A password shorter than 12 characters is refused. You can also pipe one
in:

```bash
echo 'correct-horse-battery-staple' | npm run admin:password -- --write
```

Then set the session secret from step 2 and the audit name:

```
ADMIN_SESSION_SECRET=…
ADMIN_USER=owner
```

`ADMIN_USER` is only the name stamped on audit-log rows. You never type it.

> **The admin hides itself when it is not fully configured.** With either the hash or the session
> secret missing, every path under `/admin` answers **404**, not a login page. That is deliberate, so
> a deployment that forgets a variable does not publish a login form. It is also the single most
> common reason people think the route is broken.

---

## 4. The spreadsheet and the sample data

Leave `GOOGLE_SHEET_ID` empty and the script creates a spreadsheet for you. Then:

```bash
npm run sheet:init
```

> **Stop the dev server first.** Two reasons, and both have bitten this project. The script writes
> `.env` at the end, and a running server reloading a half-written file starts failing every request.
> And the environment module is generated from `astro.config.mjs` when the server starts, so a
> process older than a newly added variable serves stale configuration until it restarts.

What it does:

- creates the tabs: `Products` with the 42 Shopify product-CSV columns, plus `Collections`,
  `Customers`, `Reactions`, `ReactionsArchive`, `Visits`, `Tags`, `Rates`, `AuditLog`, `Settings`;
- formats id columns as text so a code like `1389` is not read as a number;
- freezes header rows and protects the append-only logs;
- seeds exchange rates and the `Settings` defaults;
- **imports twenty rugs, eight collections and thirty tags** from
  `reference/live_catalogue.2026-09-05.json`, which is the snapshot of the real catalogue taken
  before the rebuild. This is the sample data;
- writes `GOOGLE_SHEET_ID` back into `.env`, last, so a failed run never leaves a half-built sheet
  wired up.

Useful flags:

| Flag                 | Effect                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| `-- --seed=none`     | Create the structure, import nothing. Use this against a real catalogue      |
| `-- --title="…"`     | Name the spreadsheet it creates                                              |
| `-- --force-headers` | Overwrite a header row that does not match. **Read the warning below first** |

The seed only runs when `Products` has no data rows, so re-running the script will not duplicate
anything. To start over, delete the spreadsheet in Drive and blank `GOOGLE_SHEET_ID`.

### Running it against a spreadsheet from before the brief

This is safe and is the intended upgrade path. The script adds the tabs that are missing, upgrades
the `Collections` layout in place so that `name` and `slug` swap and `created_at` is inserted, and
every row keeps its data because columns are moved rather than relabelled. The superseded `Rugs`,
`Votes` and `Clients` tabs are left alone for you to inspect and delete when you are satisfied.

Any other header that does not match stops the script and asks you. `--force-headers` rewrites row 1
and nothing else, so if the columns underneath are in a different order it will silently mis-file
every value. Only use it on a tab you know is empty.

---

## 5. Run it

```bash
npm run dev          # http://localhost:4321
```

Three things are now served:

| Where                     | What                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `/`, `/rugs/…`, `/tags/…` | The public catalogue                                            |
| `/admin`                  | The panel: products, collections, customers, scraper, audit log |
| `/<customer-slug>`        | One buyer's private preview, behind their own password          |

`PUBLIC_CATALOGUE=false` switches the first one off, leaving only the private previews and the admin.

Check it came up cleanly:

```bash
curl -s http://localhost:4321/api/health
```

`ok: true` with a rug count means the sheet is being read. The same response reports whether the
admin is configured, whether the customer realm is on, and whether prices are coming from the live
rates API or the hardcoded fallback table.

---

## 6. Make a customer and see the private preview

1. Open `/admin` and sign in.
2. Go to **Clients**, enter a name, press **Generate**.
3. You get two things, and the password is shown **once**: the buyer's link, and their generated
   password, three words and two digits. Copy both. If it is lost, **Reset password** on that row
   mints a new one.
4. Open the link in a private window so you are not carrying the admin cookie.

---

## 7. Quality gates

```bash
npx prettier --write .
npm run typecheck
npm run lint
npx vitest run          # no network, no Google account needed
npm run build
```

`npm run qa` drives Playwright against a running dev server. `npm run shots` refreshes the
screenshots in `docs/screenshots/`.

---

## 8. When something goes wrong

**`/admin` returns 404.** `ADMIN_PASSWORD_HASH` or `ADMIN_SESSION_SECRET` is missing, or the dev
server started before you added them. Set both, restart.

**A page 503s with `Sheet contract violated in tab "…"`.** The tab's header row does not match what
the code expects. The message names every column that is wrong. Run `sheet:init` with the dev server
stopped; it repairs the one legacy layout it knows and reports anything else.

**A page 503s with `Unable to parse range: Products!A1:AP`.** The `Products` tab does not exist yet.
Run `sheet:init`.

**`Cannot read properties of undefined`, from the runtime.** A variable was added to
`astro.config.mjs` after the dev server started. Restart it.

**`EADDRINUSE 127.0.0.1:53682` during `npm run google:auth`.** A previous consent server is still
running. Find and stop it, or set `OAUTH_CALLBACK_PORT` to another port and add the matching redirect
URI in the Google console.

**Photo import says `drive_not_authorised`.** The token has no `drive.file` scope. Reconnect from
`/admin/google`, or run `npm run google:auth` again, and tick both permissions.

**`redirect_uri_mismatch` when connecting from the admin.** The callback address is not listed on the
OAuth client. Copy it from `/admin/google` and paste it into the Google Cloud console verbatim; it
must match character for character, including the scheme and the port.

**A scrape returns `blocked`.** The supplier's `robots.txt` disallows it, which the scraper honours.
eCarpetGallery is the known case. `SCRAPE_RESPECT_ROBOTS=false` overrides it; that is a
supplier-relationship decision, so make it deliberately.

**Prices all render as the same fallback numbers.** The exchange-rate API is unreachable. Check
`ratesSource` on `/api/health`. The site keeps working on a hardcoded table by design; the footer
already tells buyers the rates are approximate.

---

## 9. Running the site with no Google connection

Useful when you are working on the front end, on a train, or with a token that has expired and you do
not want to stop.

Set a directory for the snapshot cache:

```
DATA_DIR=.data
```

Start the site **once** with working credentials and load a page. The refresh writes
`.data/catalogue.json`, which is the raw sheet content it just read.

From then on the site boots from that file. When a refresh fails, the last good snapshot is served
rather than an error, with no time limit. Verified: with the refresh token deliberately corrupted,
the catalogue and a rug detail page both still render.

| Path           | With a broken token |
| -------------- | ------------------- |
| `/`            | 200                 |
| `/rugs/<slug>` | 200                 |
| `/api/health`  | 503                 |

Health answering 503 is correct, not a bug: pages stay up for visitors while monitoring tells the
truth about the refresh failing. The log line to look for is `refresh failed; serving the last good
snapshot`.

What does **not** work offline: anything that writes. Reactions, every admin save, the scraper and
photo import all need the live API. Two things are also deliberately left out of the snapshot file
and come back empty, so the first successful refresh repopulates them: the reaction log, which is
per-visitor state read fresh anyway, and the customer list, because it holds password hashes that
must not sit in a cache file. That means **the private previews do not work offline** either.
