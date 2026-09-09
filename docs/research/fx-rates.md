# FX rates: free USD→MXN/CAD/EUR/AED/SAR APIs and the manual `Rates` tab

Key: `fx-rates` · Researched and verified live 2026-09-05 · Status: recommendation stands after two verification passes (2 claims corrected, 1 unverifiable).

## Versions

| package                   | version                                                                                                                        | registry URL                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| zod                       | 4.5.4 (published 2026-08-29)                                                                                                   | https://registry.npmjs.org/zod/latest                                            |
| @fawazahmed0/currency-api | 2026.9.5 (4.8 MB unpacked, 686 files)                                                                                          | https://registry.npmjs.org/@fawazahmed0/currency-api/latest                      |
| lineofflight/frankfurter  | GitHub release v2.3.5 (2026-06-25); Docker tags `latest`/`main` rebuilt from unreleased main 2026-09-01 — pin `2.3` or `2.3.5` | https://hub.docker.com/v2/repositories/lineofflight/frankfurter/tags?page_size=5 |
| astro                     | 7.3.1 (engines node >=22.12.0)                                                                                                 | https://registry.npmjs.org/astro/latest                                          |
| vitest                    | 5.0.0 (node ^22.12.0, ^24.0.0 or >=26.0.0)                                                                                     | https://registry.npmjs.org/vitest/latest                                         |
| @astrojs/node             | 11.1.5 (peer astro ^7.2.1)                                                                                                     | https://registry.npmjs.org/@astrojs/node/latest                                  |
| @astrojs/vercel           | 11.0.10 (peer astro ^7.0.0)                                                                                                    | https://registry.npmjs.org/@astrojs/vercel/latest                                |
| @astrojs/netlify          | 8.2.5 (peer astro ^7.0.0)                                                                                                      | https://registry.npmjs.org/@astrojs/netlify/latest                               |
| @astrojs/cloudflare       | 14.3.0 (peer astro ^7.2.0)                                                                                                     | https://registry.npmjs.org/@astrojs/cloudflare/latest                            |

## Key facts

### Frankfurter v2 (chosen primary)

- Public API at api.frankfurter.dev, no key: "84 central banks, covering 201 currencies back to 1948"; live `/v2/currencies` returns 165 current currencies and `/v2/providers` 84 (201 includes retired currencies). https://frankfurter.dev/
- v2 shipped 2026-05-18 (CHANGELOG 2.0.0) and is under active change (2.0.1→2.3.5 by 2026-06-25 plus an `[Unreleased]` section). Migration: `/v1/latest`→`/v2/rates`, `symbols`→`quotes`, rates are an array of `{date,base,quote,rate}`, no JSONP. https://raw.githubusercontent.com/lineofflight/frankfurter/main/CHANGELOG.md
- Live `base=USD&quotes=MXN,CAD,EUR,AED,SAR`: AED 3.6725, CAD 1.3807, EUR 0.86006, MXN 16.9187, SAR 3.75; `symbols=` → HTTP 422 `unknown parameter: symbols`; lowercase codes accepted; headers `cache-control: public, max-age=25878, stale-if-error=86400`, `cf-cache-status: HIT`. https://api.frankfurter.dev/v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR
- AED/SAR are static pegs (`db/seeds/pegs/aed.json` 3.6725 "Central Bank of the UAE", `sar.json` 3.75 "Saudi Central Bank") applied by `PegAnchor` after blending; a peg change needs a Frankfurter code release, not a data update. https://raw.githubusercontent.com/lineofflight/frankfurter/main/lib/peg.rb
- Trap: `providers=ECB` returns HTTP 200 with only CAD/EUR/MXN — AED and SAR are silently dropped because peg anchoring applies to the blended series only. Never pin a provider for the AED/SAR rows. https://api.frankfurter.dev/v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR&providers=ECB
- Trap: one unknown/retired quote code fails the whole request: HTTP 422 `{"status":422,"message":"invalid currency: XXX"}` (`cache-control: no-store`). Treat 422 as keep-last-good. https://api.frankfurter.dev/v2/rates?base=USD&quotes=MXN,XXX
- The blend is undocumented on the site: rebase to a common base, cross-provider outlier filter, recency-weighted average, carry-forward, then peg anchor. The row `date` is the anchor date (2026-09-05, a Saturday), not an observation date; live MXN blend 16.9187 vs ECB 16.8991 vs BANXICO FIX 16.8748 (~0.25% spread), and the blend still ingested a FRED row dated 2026-08-28. https://raw.githubusercontent.com/lineofflight/frankfurter/main/lib/blender.rb
- `[Unreleased]`: date-relative v2 responses "now expire from CDN caches at UTC midnight instead of after 24 hours" (hence max-age=25878 at ~17:00 UTC) and "latest rates now include provider observations dated one day ahead of the service date". https://raw.githubusercontent.com/lineofflight/frankfurter/main/CHANGELOG.md
- FAQ: "There are no quotas. Requests are rate-limited to prevent abuse"; "free for commercial use? Yes, absolutely"; no attribution obligation anywhere on the site. No numeric limit, 429 body or rate-limit header is documented and the app has no in-process throttle, so throttling is a Cloudflare-edge 429 or HTML challenge — never `JSON.parse` blindly. https://frankfurter.dev/
- Suitability FAQ: "works well for SaaS billing, e-commerce in major currencies ... It is not for live trading, nor for businesses dealing with exotic currencies subject to wild swings." https://frankfurter.dev/
- Release notes record providers that "silently stopped updating" (v2.3.3 RBV TLS issue; v2.3.2 future-dated rows froze incremental updates) — reject rows dated in the future or older than N days rather than trusting HTTP 200. https://api.github.com/repos/lineofflight/frankfurter/releases?per_page=4
- Other shapes: CSV (`.csv` suffix or `Accept: text/csv`), NDJSON (`Accept: application/x-ndjson`), singular `/v2/rate/USD/MXN` → `{date,base,quote,rate}`. https://frankfurter.dev/google-sheets/
- Official Google Sheets page exists (corrected: the report's guessed `/integrations/google-sheets/` 404 was the wrong URL) with the IMPORTDATA recipe, "The date column arrives as a serial number", a `=FRANKFURTER()` custom function, and "A pinned provider ... can trail the blended latest by a day." https://frankfurter.dev/google-sheets/
- Self-host: `docker run -d -p 8080:8080 lineofflight/frankfurter`; production adds `-e DATABASE_URL="sqlite:///data/db.sqlite3" -v ./data:/data --pull always`; provider keys "All are free and optional" (BCCH uses `BCCH_USER`/`BCCH_PASS`); MIT; multi-arch since 2.3.0. https://frankfurter.dev/deploy/
- v1: 30 ECB currencies, updated ~16:00 CET, drops AED/SAR silently with HTTP 200 (`{"rates":{"CAD":1.38,"EUR":0.86044,"MXN":16.8991}}`); "superseded by v2 but will continue to work". Do not use. https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN,CAD,EUR,AED,SAR

### ExchangeRate-API open endpoint (fallback)

- No key; 166 `rates` keys incl. `USD:1`; live AED 3.6725, SAR 3.75, MXN 16.894736, CAD 1.382855, EUR 0.861117; fields `result, provider, documentation, terms_of_use, time_last_update_unix/utc, time_next_update_unix/utc, time_eol_unix (0), base_code, rates`; `Cache-Control: public, max-age=3600`. https://open.er-api.com/v6/latest/USD
- Updates once a day shortly after 00:00 UTC (last 00:02:32, next 00:26:22 — exact time varies); hourly requests "never get rate limited"; limited IPs get 429 for 20 minutes; `time_eol_unix` becomes the deprecation timestamp when the endpoint is sunset — alert when it is non-zero. https://www.exchangerate-api.com/docs/free
- Attribution required on pages showing the rates (`<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>`, may be discreet); caching and commercial use allowed, redistribution not. The keyed Free plan (1.5k req/month, key kept server-side) is "No Attribution". https://www.exchangerate-api.com/docs/free
- Terms: no warranties; Free Plans "can be discontinued by ExchangeRate-API without notice"; not for products offering programmatic access to rate data. https://www.exchangerate-api.com/terms

### Rejected providers

- exchangerate.host (APILayer GmbH, Vienna): `access_key` mandatory — keyless calls return HTTP 200 with `{"success":false,"error":{"code":101,"type":"missing_access_key"}}`, so check `success`, not status. Free: 100 req/month, daily, USD default source, no source switching or conversion (paid from BASIC $14.99/mo). Live docs redirect to a SwaggerHub login; the 2024 Wayback docs confirm the `/live` shape `{"source":"USD","quotes":{"USDAED":3.672982}}`. https://web.archive.org/web/20240913135335id_/https://exchangerate.host/documentation
- Stale-memory trap: the Formicka/exchangerate.host GitHub README still advertises a keyless ECB API with no migration notice — ignore old tutorials for this host. https://raw.githubusercontent.com/Formicka/exchangerate.host/master/README.md
- currencyapi.com Free: 300 req/month, 10/min, daily, `apikey` header, USD default — and labelled "Private Use", so not licensed for a commercial catalogue regardless of quota. https://currencyapi.com/pricing
- openexchangerates.org Free: 1,000 req/month, hourly, `app_id` required, "Changing the `base` currency is available for all clients of paid plans." https://docs.openexchangerates.org/reference/latest-json
- fawazahmed0 currency-api (jsDelivr): no key, 339 lowercase codes with the base as object key (`{"date":"2026-09-05","usd":{"aed":3.6725,...}}`); CC0 per repo LICENSE (npm `license` field is null); one maintainer's daily npm release ~04:00 UTC, no data-source statement; jsDelivr caches `@latest` up to 7 days and calls requesting latest "dangerous" — pin `@YYYY-MM-DD` (kept even if unpublished) and use the README-mandated `https://latest.currency-api.pages.dev/...` fallback. https://raw.githubusercontent.com/fawazahmed0/exchange-api/main/README.md · https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/README.md

### Pegs

- CBUAE: "USD/AED rate of 3.672 when buying US dollars. USD/AED 3.673 when selling" (mid 3.6725). Page needs browser UA plus `Accept`/`Accept-Language` headers and lives at centralbank.ae (no www) — cite SAMA or Frankfurter's `/v2/currency/AED` peg metadata in the UI instead. https://centralbank.ae/en/our-operations/monetary-policy-and-domestic-markets/domestic-market-operations/
- SAMA: "committed to maintaining the exchange rate at the official rate of 3.75 riyals to the dollar" — a policy statement dated 2020-04-05, not a current-year notice. https://www.sama.gov.sa/en-US/MediaCenter/News/Pages/news-557.aspx

### Google Sheets, Sheets API and Apps Script

- Sheets API `values.get` defaults to `valueRenderOption=FORMATTED_VALUE` (locale-formatted strings, e.g. `16,9187`); `UNFORMATTED_VALUE` returns numbers but date cells as serial doubles unless `dateTimeRenderOption=FORMATTED_STRING`; blank cells are `''` and trailing empty rows/columns are omitted. https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
- Writes from the site (Votes) must use `valueInputOption=RAW`; `USER_ENTERED` parses like typing, and Apps Script `setValues`: "If a value begins with =, it's interpreted as a formula" — visitor strings starting with `=`, `+`, `-`, `@` are formula injection. https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption
- Apps Script writing `'2026-09-05'` via `setValues` is likely coerced to a date cell (unverified — inferred from USER_ENTERED semantics and Frankfurter's serial-number note); set `setNumberFormat('@')` on columns C/H or write a JS `Date` and read with `FORMATTED_STRING`. https://developers.google.com/apps-script/reference/spreadsheet/range#setValues(Object)
- "Script executions and API requests don't cause triggers to run" — a script-written Rates tab never fires the installable onEdit; "Installable triggers always run under the account of the person who created them"; a recurring 9 AM trigger fires "between 9 AM and 10 AM". https://developers.google.com/apps-script/guides/triggers/installable
- `everyMinutes(n)` requires n ∈ {1,5,10,15,30}; `everyHours(n)` has no stated constraint; `nearMinute()` is ±15 min. https://developers.google.com/apps-script/reference/script/clock-trigger-builder
- Quotas (consumer / Workspace): URL Fetch 20,000 / 100,000 per day, URL length 2 KB, response 50 MB; trigger runtime 90 min / 6 h per day; 20 triggers per user per script; 6 min per execution; 30 simultaneous. https://developers.google.com/apps-script/guides/services/quotas
- Refresh cadence: IMPORTDATA/HTML/XML/FEED ~1 hour, IMPORTRANGE 30 min, GOOGLEFINANCE delayed up to 20 min; no per-spreadsheet IMPORT-function cap is documented (absence of evidence). https://support.google.com/docs/answer/58515 · https://support.google.com/docs/answer/3093335?hl=en
- GOOGLEFINANCE is "not for trading purposes"; historical data is inaccessible via Sheets API/Apps Script (`#N/A`); the `"CURRENCY:USDMXN"` ticker form appears in no Google help page — only third-party guides (unverified). https://support.google.com/docs/answer/3093281?hl=en
- Zod 4: `z.record()` needs two arguments (type-level only — the 4.5.4 runtime accepts one and validates values); `.default()` short-circuits only on `undefined` and returns the unparsed default (`.prefault()` for Zod-3 behaviour). https://zod.dev/v4/changelog

### Platform notes (only if the refresh ever leaves Apps Script)

- Astro 7.3.1 requires Node >=22.12.0; `output: 'hybrid'` no longer exists (use `static` + `export const prerender = false`); Node 20 is EOL, 22/24 LTS, 26 Current. https://docs.astro.build/en/guides/upgrade-to/v5/ · https://nodejs.org/en/about/previous-releases
- Vercel Hobby cron runs once per day with per-hour (±59 min) precision — 6-hourly needs Pro; Vercel Bot Protection (inactive by default) in Challenge mode would JS-challenge the Apps Script POST to `/api/revalidate` unless a WAF bypass rule exists. https://vercel.com/docs/cron-jobs/usage-and-pricing · https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets
- Netlify scheduled functions: all plans, 30 s limit, no POST payload, published deploys only. https://docs.netlify.com/build/functions/scheduled-functions/
- Cloudflare Workers Free: 5 cron triggers, 10 ms CPU per invocation, 100k req/day, 50 subrequests/request — SSR plus Sheets JSON parsing in 10 ms is a real risk. https://developers.cloudflare.com/workers/platform/limits/
- Vitest 5.0.0: `clearMocks` defaults to true, `vi.mock()` inside describe/test throws, `vitest/coverage|reporters|environments|snapshot` entry points removed. https://vitest.dev/guide/migration.html

## Snippets

Frankfurter v2 exact shapes (byte-identical on re-fetch). https://api.frankfurter.dev/v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR

```text
GET /v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR            -> 200, JSON array
[{"date":"2026-09-05","base":"USD","quote":"AED","rate":3.6725},
 {"date":"2026-09-05","base":"USD","quote":"CAD","rate":1.3807},
 {"date":"2026-09-05","base":"USD","quote":"EUR","rate":0.86006},
 {"date":"2026-09-05","base":"USD","quote":"MXN","rate":16.9187},
 {"date":"2026-09-05","base":"USD","quote":"SAR","rate":3.75}]
GET /v2/rates.csv?base=USD&quotes=...                         -> 200, text/csv: date,base,quote,rate / 2026-09-05,USD,AED,3.6725 / ...
GET /v2/rates?base=USD&symbols=...                            -> 422 {"status":422,"message":"unknown parameter: symbols"}
GET /v2/rates?base=USD&quotes=MXN,XXX                         -> 422 {"status":422,"message":"invalid currency: XXX"}
```

ExchangeRate-API open endpoint (trimmed to the five codes; real `rates` has 166 keys). https://open.er-api.com/v6/latest/USD

```json
{
  "result": "success",
  "provider": "https://www.exchangerate-api.com",
  "time_last_update_unix": 1788566552,
  "time_last_update_utc": "Sat, 05 Sep 2026 00:02:32 +0000",
  "time_next_update_unix": 1788654382,
  "time_eol_unix": 0,
  "base_code": "USD",
  "rates": { "USD": 1, "AED": 3.6725, "CAD": 1.382855, "EUR": 0.861117, "MXN": 16.894736, "SAR": 3.75 }
}
```

Zod 4.5.4 schemas, `src/lib/fx/schemas.ts` (API schemas executed against the live payloads; `RatesRow` corrected per the Sheets API read contract, not executed). https://zod.dev/api · https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get

```ts
import { z } from 'zod';
export const SUPPORTED = ['MXN', 'CAD', 'EUR', 'AED', 'SAR'] as const;
export const CurrencyCode = z.enum(SUPPORTED);
export const FrankfurterV2Rates = z.array(
  z.object({
    date: z.string(),
    base: z.literal('USD'),
    quote: z.string(),
    rate: z.number().positive(),
  }),
);
export const OpenErApiLatest = z.object({
  result: z.literal('success'),
  base_code: z.literal('USD'),
  time_last_update_unix: z.number(),
  time_next_update_unix: z.number(),
  time_eol_unix: z.number(),
  rates: z.record(z.string(), z.number()), // Zod 4: keep the two-argument form (enforced by tsc only)
});
// Read Rates!A2:H with valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING.
// (corrected: blank cells arrive as '' and trailing cells are omitted; .default() fires only on undefined)
const blank = (v: unknown) => (v === '' ? undefined : v);
export const RatesRow = z.object({
  code: CurrencyCode,
  rate_used: z.preprocess(blank, z.number().positive()), // = manual_override if set, else api_rate
  markup_pct: z.preprocess(blank, z.number().min(0).default(0)),
  source: z.string(),
  api_date: z.preprocess(blank, z.string().optional()),
});
```

`Rates` tab layout (owner edits E and G only; the script writes B, C, D, H; the site reads F and G). https://frankfurter.dev/google-sheets/

```text
A code | B api_rate | C api_date  | D source        | E manual_override | F rate_used        | G markup_pct | H updated_at
MXN    | 16.9187    | 2026-09-05  | frankfurter-v2  |                   | =IF(E2<>"",E2,B2)  | 0            | 2026-09-05T04:10Z
CAD    | 1.3807     | 2026-09-05  | frankfurter-v2  |                   | =IF(E3<>"",E3,B3)  | 0            |
EUR    | 0.86006    | 2026-09-05  | frankfurter-v2  |                   | =IF(E4<>"",E4,B4)  | 0            |
AED    | 3.6725     | 2026-09-05  | peg CBUAE       | 3.6725            | =IF(E5<>"",E5,B5)  | 0            |
SAR    | 3.75       | 2026-09-05  | peg SAMA        | 3.75              | =IF(E6<>"",E6,B6)  | 0            |
price_local = round(price_usd * rate_used * (1 + markup_pct/100)); format C and H as plain text ('@') before the first write.
```

Bound Apps Script refresh (all primitives documented; corrected: fallback date normalised to YYYY-MM-DD, non-JSON bodies tolerated). https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app · https://developers.google.com/apps-script/guides/triggers/installable

```js
const CODES = ['MXN', 'CAD', 'EUR', 'AED', 'SAR'];
const PRIMARY = 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=' + CODES.join(',');
const FALLBACK = 'https://open.er-api.com/v6/latest/USD';
function parseJson_(res) {
  // 422 / edge 429 / HTML challenge -> null -> keep last-good values
  if (res.getResponseCode() !== 200) return null;
  try {
    return JSON.parse(res.getContentText());
  } catch (e) {
    return null;
  }
}
function fetchRates_() {
  const rows = parseJson_(UrlFetchApp.fetch(PRIMARY, { muteHttpExceptions: true }));
  if (Array.isArray(rows)) {
    const out = {};
    rows.forEach((r) => {
      out[r.quote] = { rate: r.rate, date: r.date, source: 'frankfurter-v2' };
    });
    return out;
  }
  const d = parseJson_(UrlFetchApp.fetch(FALLBACK, { muteHttpExceptions: true }));
  if (!d || d.result !== 'success') return null;
  const date = new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10); // same shape as primary
  const out = {};
  CODES.forEach((c) => {
    if (d.rates[c]) out[c] = { rate: d.rates[c], date, source: 'open.er-api (attribution required)' };
  });
  return out;
}
function refreshRates() {
  const rates = fetchRates_();
  if (!rates) return;
  const sheet = SpreadsheetApp.getActive().getSheetByName('Rates');
  const codes = sheet
    .getRange(2, 1, CODES.length, 1)
    .getValues()
    .map((r) => String(r[0]).toUpperCase());
  const existing = sheet.getRange(2, 2, CODES.length, 3).getValues(); // B:D
  const values = codes.map((c, i) =>
    rates[c] ? [rates[c].rate, rates[c].date, rates[c].source] : existing[i],
  );
  sheet.getRange(2, 2, values.length, 3).setValues(values); // writes B, C, D only
  sheet.getRange(2, 8, 1, 1).setValue(new Date().toISOString()); // H2 updated_at
  const secret = PropertiesService.getScriptProperties().getProperty('REVALIDATE_SECRET');
  UrlFetchApp.fetch('https://YOUR-SITE/api/revalidate', {
    // script writes never fire onEdit
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({ tabs: ['Rates'] }),
    muteHttpExceptions: true,
  });
}
function installRatesTrigger() {
  // run once, signed in as the studio account (triggers run as creator)
  ScriptApp.newTrigger('refreshRates').timeBased().everyHours(6).create();
}
```

Zero-code alternative, Frankfurter's own recipe (refreshes ~hourly on Google's schedule; date column becomes a serial number; `#N/A` on failure). https://frankfurter.dev/google-sheets/

```text
=IMPORTDATA("https://api.frankfurter.dev/v2/rates.csv?base=USD&quotes=MXN,CAD,EUR,AED,SAR")   -> 6x4 block date,base,quote,rate
```

## Recommendation

1. The sheet's `Rates` tab is the single source of truth. The site reads only `rate_used`/`markup_pct` through the same cached Sheets path as the rugs, with `UNFORMATTED_VALUE` + `FORMATTED_STRING` and a fixed `A2:H` range, normalising `''`/missing before Zod (corrected from the report's bare `z.number()`/`z.string()` schema). No FX API is called at request time; no secret reaches the client.
2. Seed AED = 3.6725 and SAR = 3.75 in `manual_override` (CBUAE and SAMA pegs). The owner can override any rate or add a per-currency markup; prices follow the sheet, not the market.
3. Primary feed: Frankfurter v2 `/v2/rates?base=USD&quotes=MXN,CAD,EUR,AED,SAR` — no key, no quotas, commercial use allowed, no attribution, covers all five, MIT and self-hostable (pin Docker `2.3.x`). Never use v1 and never pin `providers=` (both drop AED/SAR silently); validate the code list against `/v2/currencies` at deploy time; treat 422, 429 and non-JSON bodies as keep-last-good; reject rows dated in the future or older than a few days; surface a "stale" flag when `api_date` lags today (edge cache ~7 h plus a 6-h trigger can add up to ~13 h).
4. Fallback: `open.er-api.com/v6/latest/USD` — once daily, all five, but the attribution link is required on price pages and the free tier can end without notice; alert when `time_eol_unix` is non-zero. If the studio rejects the link, the keyed ExchangeRate-API Free plan (1.5k req/month, no attribution, key server-side) is the alternative.
5. Skip exchangerate.host (key, 100/month, docs behind login), openexchangerates (key, 1,000/month, USD-only base) and currencyapi ("Private Use" free tier). fawazahmed0 is a CC0 last resort only with a pinned `@YYYY-MM-DD` and the pages.dev fallback.
6. Refresh via a bound Apps Script on `everyHours(6)`, installed from the studio's own Google account, writing only `api_rate`/`api_date`/`source`/`updated_at` and logging each run so a dead trigger is visible. The script must POST `/api/revalidate` itself. If Vercel is chosen, add a WAF bypass for that route before enabling Bot Protection; platform cron is a poor substitute (Vercel Hobby once/day, Netlify 30 s/no payload, Cloudflare Free 10 ms CPU) and would require Sheets write scope for the site.
7. Validate both API shapes with Zod 4.5.4 (`z.record(z.string(), z.number())`) in server code only; unit-test with the captured payloads above under Vitest 5 (`clearMocks` now defaults to true; no `vi.mock` inside `describe`).
8. Disagreements to note: (a) the `RatesRow` Zod schema — fact-check confirmed it (executed against the live API payloads and a synthetic row), breakage-hunt refuted it (fails on real Sheets API output); both hold for their inputs, the corrected schema above is the resolution. (b) `GOOGLEFINANCE("CURRENCY:USDMXN")` — fact-check rated the snippet unverifiable, breakage-hunt confirmed only that the syntax is absent from Google's docs; in substance they agree, so it is kept as an unverified owner-side convenience, not part of the design.

## Open questions

- Frankfurter v2 is ~3.5 months old and its `[Unreleased]` changes (UTC-midnight expiry, observations dated one day ahead) affect any "is `api_date` today?" stale check — decide the tolerance (likely 2–3 days incl. weekends) and re-read the changelog before launch.
- Blend vs official reference: the blend diverges ~0.25% from ECB/BANXICO. If the owner wants a citable official rate, pin `providers=ECB` for MXN/CAD/EUR only (peg rows must stay unpinned) — not tested as a two-request design.
- Business decisions: per-currency `markup_pct` (mid-rates are not card rates) and rounding to "pretty" local prices.
- Apps Script string-date coercion in `setValues` is inferred, not documented — test in the real sheet before relying on plain-text columns.
- exchangerate.host docs are now behind a SwaggerHub login and currencyapi's free-plan base switching is unstated — both moot given the rejections.
- If the refresh is ever moved to platform cron, the Sheets write scope for the `Rates` tab was not researched.

## Verification notes

- Fact-check (a0dcfb5f): 44 verdicts — 43 confirmed, 0 refuted, 1 unverifiable (`GOOGLEFINANCE("CURRENCY:USDMXN")` snippet). 12 additional findings merged (v2 age and changelog, UTC-midnight expiry, official Sheets page, suitability FAQ, llms.txt/MCP, exchangerate.host docs login and Wayback shape, Formicka stale README, keyed Free plan without attribution, open.er-api refresh window, Zod single-arg `z.record` runtime behaviour, currencyapi "Convert Rates" paid-only, CBUAE header requirements).
- Breakage-hunt (af7a206d): 19 verdicts — 17 confirmed, 2 refuted, 0 unverifiable. 21 additional findings merged (422 on unknown code, blend internals, edge cache lag, silently frozen providers, NDJSON and singular endpoint, formula injection, Sheets API read contract, `setValues` date coercion, Astro 7/adapters/Vitest 5/Node EOL, Vercel cron and Bot Protection, Netlify and Cloudflare limits, trigger ownership, currencyapi "Private Use", Zod `.default()` semantics, jsDelivr size terms, no IMPORT-function cap).
- Refuted 1 (breakage-hunt): "Frankfurter's Google Sheets page URL returned 404, no official Sheets recipe verified" — corrected: the page is https://frankfurter.dev/google-sheets/ and documents the exact IMPORTDATA recipe (fact-check independently found the same page).
- Refuted 2 (breakage-hunt): `RatesRow` schema with bare `z.number()`, `z.string()` `api_date` and `.default(0)` — fails on real Sheets API reads (FORMATTED_VALUE strings, serial-number dates, `''` blanks, dropped trailing cells); corrected to `UNFORMATTED_VALUE` + `FORMATTED_STRING` reads with a `''`→`undefined` preprocess, per https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get. Fact-check had confirmed the same schema against API payloads only — disagreement flagged in Recommendation 8.
- Fact-check corrections applied without a refuted verdict: Apps Script fallback wrote an RFC-1123 string into `api_date` (normalised); CBUAE page needs `Accept` headers and the no-www host; SAMA quote is a 2020 policy statement; `OpenErApiLatest` gained `time_eol_unix` so the deprecation signal is parsed.
