# Sheet setup — Serio Ludere catalogue

This guide covers the two ways the site can talk to Google Sheets, the development flow that keeps
everything local until you publish the real sheet, and the owner's Google-side checklist.
Decisions behind it: `docs/ADR.md` D3 (auth), D4 (votes), D5 (revalidation), D9 (secrets).

## 1. Development flow (what we use now)

Development uses a **development spreadsheet in your own Drive** and an OAuth client marked as
development. Nothing touches the studio's "Catalog Database" sheet until you decide to publish.

1. **Google Cloud console** (project `poised-beach-484215-e5`, or whichever project owns the OAuth client):
   - APIs & Services › Library › **Google Sheets API** › Enable.
   - APIs & Services › Credentials › your OAuth 2.0 client (type _Web application_) › **Authorized
     redirect URIs** › add `http://localhost:53682/oauth2/callback`.
   - APIs & Services › OAuth consent screen: if the app is _External_ and in _Testing_, add the Google
     account you will consent with as a **test user**. Testing-mode refresh tokens expire after 7 days;
     re-run step 3 when that happens (an _Internal_ app has no such expiry).
2. Copy `.env.example` to `.env`, set `GOOGLE_AUTH_MODE=oauth_refresh`, paste the client id and secret,
   and generate `REVALIDATE_SECRET`, `VOTE_SALT`, `ADMIN_SESSION_SECRET` and `AUTH_SECRET`
   (32+ characters each, all different). `AUTH_SECRET` signs the per-customer session cookies; with it
   empty the `/{slug}` preview realm stays off and every such path answers 404.
3. `npm run google:auth` — opens a local callback server and prints a consent URL. Open it in a browser
   signed in to the **development** Google account (never the studio owner's main account: the granted
   scope covers every spreadsheet that account can open). Approve; the refresh token is written to `.env`.
4. `npm run sheet:init` — with `GOOGLE_SHEET_ID` empty it creates _"Serio Ludere — Catalog Database (dev)"_
   in that account's Drive, creates every tab the brief names — `Products` (the 42 Shopify product-CSV
   columns, A..AP), `Collections`, `Customers`, `Reactions`, `ReactionsArchive`, `Visits`, `Tags`,
   `Rates`, `AuditLog`, `Settings` — formats id columns as text, freezes header rows, protects the
   append-only logs, seeds the `Rates` tab, imports the sample rugs from
   `reference/live_catalogue.2026-09-05.json`, and only then writes the id back to
   `.env` (a running `astro dev` reloads `.env`, so it must never see a half-built sheet). If the run
   fails midway it prints the id to set by hand; re-running the script finishes the job.
5. `npm run sheet:roundtrip` — reads every tab, inserts one reaction atomically, reads the derived
   count back, then undoes it. This is the Phase-2 acceptance check.
6. `npm run dev` — the site reads the development sheet.

To start over, delete the development spreadsheet in Drive and blank `GOOGLE_SHEET_ID` in `.env`.

## 2. Publishing to the real sheet (later)

When the catalogue is ready, point the site at the studio's sheet instead of the development copy:

1. In the studio's "Catalog Database" spreadsheet, run `npm run sheet:init -- --seed=none` against it
   (set `GOOGLE_SHEET_ID` to its id) to create the tabs, headers and formulas without seeding, then copy the
   rows from the development sheet — or seed it the same way and edit from there.
2. Set File › Settings › **Locale** to _United States_ (the formulas assume a period decimal separator).
3. Share the sheet with the site's identity (§3) as **Editor**, then protect `Products`,
   `Collections`, `Tags`, `Rates`, `Customers` and the header rows of `Reactions` and `Visits` for the
   owner only (Data › Protect sheets and ranges), so the site can only append event rows.
   `Customers` holds password hashes: keep its sharing as tight as the sheet itself.
4. Install the two Apps Scripts (§5) from the owner's account. Never install an `onChange` trigger.
5. Rotate the leaked legacy secret and remove the legacy `save` action (ADR D9) if not done already.

## 5. Apps Scripts (edit notifier, FX refresh, monitoring, backups)

Both scripts are installed from the **studio owner's** Google account, because triggers run as the account
that created them.

**Bound script — `google-apps-script/onEdit.gs` + `appsscript.json`** (notifier and optional FX refresh)

1. Open the catalogue spreadsheet › Extensions › Apps Script. Project Settings › tick _Show "appsscript.json"
   manifest file in editor_. Replace the manifest with `google-apps-script/appsscript.json` (scopes pinned to
   this spreadsheet + URL fetch) and paste `onEdit.gs` as the only code file.
2. Project Settings › Script Properties: `SITE_URL` (e.g. `https://catalogue.serioludere.com`),
   `REVALIDATE_SECRET` (the value from the site's `.env`), optionally `RATES_AUTO` (`MXN,CAD,EUR`).
3. Run `installTriggers` once and approve the authorisation. Edits to Rugs, Collections, Tags or Rates now
   reach the site within about 15 seconds (`POST /api/revalidate`).
4. Optional: run `installRatesTrigger` once to refresh MXN/CAD/EUR from Frankfurter every 6 hours
   (AED and SAR are never touched). Remove a code from `RATES_AUTO` to pin it for manual editing.

**Standalone script — `google-apps-script/monitor.gs`** (health alerts and weekly backups)

1. Go to script.google.com › New project (standalone, not bound to the sheet, so sheet editors cannot open
   it). Paste `monitor.gs`; set the manifest scopes listed in its header comment.
2. Script Properties: `SITE_URL`, `ALERT_EMAIL`, `SHEET_ID`.
3. Run `installMonitorTriggers` once. You receive an e-mail when the site's `/api/health` reports a failed
   refresh, a snapshot older than 6 hours, skipped rows or failing photos, and a "healthy again" e-mail when
   it recovers. A copy of the spreadsheet lands in a "Catalogue backups" Drive folder every Monday
   (8 kept). Google Sheets' own version history remains the quickest undo.

**Legacy web app** — archive its deployment (Deploy › Manage deployments) once the new site is live.

## 3. Production identity — two options

### 3a. Service account (default)

1. Google Cloud console › IAM & Admin › Service Accounts › Create (`catalogue-site`), no roles needed.
2. Keys › Add key › JSON. If the option is missing, your organisation blocks key creation
   (`iam.managed.disableServiceAccountKeyCreation`, default for organisations created after 2024-05-03);
   an organisation policy administrator can override it for this project, or use 3b.
3. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in `GOOGLE_PRIVATE_KEY`
   (keep the `\n` sequences; the site normalises them). Set `GOOGLE_AUTH_MODE=service_account`.
4. Share the sheet with the service-account e-mail as Editor. Never share the operations workbook with it.

### 3b. Refresh token from a dedicated account

1. Create a least-privilege Google account for the site (for example `catalogue-bot@serioludere.com`) and
   invite it as Editor on the catalogue sheet **only**.
2. Make the OAuth consent screen _Internal_ (project inside the Workspace organisation) so the refresh token
   never expires on the 7-day Testing rule. It can still be revoked if unused for 6 months, if the client
   accumulates more than 100 tokens, or if an admin marks Sheets _Restricted_ without trusting the app.
3. Run `npm run google:auth` signed in as that account; keep the resulting `.env` values in the host's
   secret store. A refresh failure (`invalid_grant`) makes the site serve the last good catalogue and flags
   `/api/health`; re-consent to fix it.

## 4. Owner checklist for the Google side

- Drive photos: keep them in one folder shared "Anyone with the link"; paste each file's share link into
  the rug's `photos` cell, `|` between photos, first photo is the card. `npm run check:photos` lists broken ones.
- Editors of the sheet can open the bound script and read its Script Properties; add staff as _commenters_
  unless they need to add rugs.
- Workspace admin switches that would break the notifier: Drive and Docs › Google Apps Script (must stay
  on) and the URL Fetch allow-list (must permit the site's domain) on editions that have it.
- Backups: Google Sheets version history is the undo; the standalone script's weekly copy (Phase 5) lands
  in a "Catalogue backups" folder.

## 6. Drive scope and re-consent (photo import)

The admin's **Save photos to Drive** feature (ADMIN_SPEC §5) uploads supplier photos into a Drive folder
the app creates itself, using the same Google identity as the sheet. The refresh token you made in §1
only carries the `spreadsheets` scope, and a refresh can never add a scope (RFC 6749 §6), so photo
import needs a one-time re-consent. Until then the admin shows _"Drive is not authorised — see
SHEET_SETUP §6"_, still scrapes and previews photos, and creates rugs with an empty `photos` cell that
you can fill by pasting Drive links later.

1. **Enable the Drive API** on the Cloud project that owns the OAuth client:
   <https://console.cloud.google.com/flows/enableapi?apiid=drive.googleapis.com> (or APIs & Services ›
   Library › _Google Drive API_ › Enable). Without it the token has the scope but every call fails and
   `/api/health` reports `driveScopeOk: false` with reason `api_disabled`.
2. **Publish the OAuth consent screen** (APIs & Services › OAuth consent screen › _Publish app_) if it
   is still in _Testing_: testing-mode refresh tokens expire after 7 days. An _Internal_ app (Workspace
   organisation) has no such expiry. The requested scopes are `spreadsheets` and `drive.file` — both
   are "non-sensitive", so publishing needs no verification review.
3. **Re-consent**: `npm run google:auth`, signed in as the same account that owns the sheet token
   (§1 development account, or the dedicated site account of §3b). The consent screen now lists two
   permissions — _See, edit, create and delete only the specific Google Drive files you use with this
   app_ is the `drive.file` one; keep both ticked. The script prints the granted scope and writes the
   new `GOOGLE_OAUTH_REFRESH_TOKEN` to `.env`. To deliberately keep a sheets-only token, run
   `npm run google:auth -- --no-drive`.
4. **Copy the new refresh token to production** (the host's secret store). The old token keeps
   working until it is revoked, and a client may hold at most 100 live refresh tokens, so revoke the
   old one at <https://myaccount.google.com/permissions> once the new one is deployed.
5. **First import creates the folder.** With `GOOGLE_DRIVE_FOLDER_ID` empty, the first photo import
   looks for a folder named _"Serio Ludere catalogue photos"_ among the files the app created, creates
   it if missing, shares it once as _Anyone with the link → Viewer_ (files inherit that, which is what
   the site's `lh3` image URLs need) and logs its id with the advice to set `GOOGLE_DRIVE_FOLDER_ID`
   to skip the lookup. Set it, restart, and the lookup disappears. Your hand-made "Catalogue photos"
   folder (§4) is probably **not** addressable under `drive.file` (the app only sees files it created),
   so pasted links keep pointing at the old folder while imported photos land in the new one — both
   render the same way.
6. **Check**: `/api/health` reports `driveScopeOk: true`; the admin dashboard health strip shows the
   Drive status and the add-rug form enables **Save photos to Drive**. Reasons shown when it is false:
   `scope_missing` (re-run step 3), `api_disabled` (step 1), `token_error` (re-consent; the sheet
   reader is failing too), `tokeninfo_failed` / `probe_failed` (transient; checked again after a minute).

`GOOGLE_AUTH_MODE=service_account` never qualifies: uploads would land in the service account's own
Drive, invisible to you, so photo import reports `drive_not_authorised` in that mode by design. Use the
§3b refresh-token identity in production if you want photo import there.
