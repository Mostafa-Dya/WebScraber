# Apps Script write backend, LockService, quotas, installable onEdit -> /api/revalidate

Research brief for the Serio Ludere ADR (Astro site, Google Sheet as CMS/database, two-way like/dislike sync, server-side-only Google access, TTL cache + `/api/revalidate` from an Apps Script trigger; host undecided among Vercel / Netlify / Cloudflare / self-hosted Node). Date 2026-09-05. Consolidated from one research report and two independent verifications; refuted claims are corrected inline and listed at the end.

## Versions

Checked against the npm registry on 2026-09-05 by at least one verifier.

| package                   | version | registry URL                                                |
| ------------------------- | ------- | ----------------------------------------------------------- |
| @google/clasp             | 3.4.1   | https://registry.npmjs.org/@google/clasp/latest             |
| googleapis                | 178.0.0 | https://registry.npmjs.org/googleapis/latest                |
| @googleapis/sheets        | 14.0.0  | https://registry.npmjs.org/@googleapis/sheets/latest        |
| googleapis-common         | 9.0.4   | https://registry.npmjs.org/googleapis-common/latest         |
| google-auth-library       | 11.0.2  | https://registry.npmjs.org/google-auth-library/latest       |
| google-spreadsheet        | 5.3.0   | https://registry.npmjs.org/google-spreadsheet/latest        |
| @types/google-apps-script | 2.0.13  | https://registry.npmjs.org/@types/google-apps-script/latest |
| astro                     | 7.3.1   | https://registry.npmjs.org/astro/latest                     |
| @astrojs/node             | 11.1.5  | https://registry.npmjs.org/@astrojs/node/latest             |
| @astrojs/vercel           | 11.0.10 | https://registry.npmjs.org/@astrojs/vercel/latest           |
| @astrojs/netlify          | 8.2.5   | https://registry.npmjs.org/@astrojs/netlify/latest          |
| @astrojs/cloudflare       | 14.3.0  | https://registry.npmjs.org/@astrojs/cloudflare/latest       |
| zod                       | 4.5.4   | https://registry.npmjs.org/zod/latest                       |
| vitest                    | 5.0.0   | https://registry.npmjs.org/vitest/latest                    |

Dependency caveat (corrected): googleapis 178.0.0 pins google-auth-library to exactly 10.5.0 (googleapis-common ^8); google-auth-library 11 is consumed only by googleapis-common 9.0.4, which googleapis does not use yet. Do not add google-auth-library@11 next to googleapis@178 (two majors side by side, instanceof/type mismatch when passing an auth client to `google.sheets({auth})`); use the transitive copy via `google.auth.GoogleAuth` from `googleapis`, or google-auth-library 11 alone with plain fetch. https://registry.npmjs.org/googleapis/178.0.0

## Key facts

### Web app mechanics (doPost)

- A script is deployable as a web app only if it has `doGet`/`doPost` returning an HtmlService `HtmlOutput` or ContentService `TextOutput`. `doPost(e)` receives `e.parameter`, `e.parameters`, `e.postData.contents` (raw body), `e.postData.type`, `e.postData.length`, `e.contentLength` (-1 for GET), `e.queryString`, `e.pathInfo`. Parameter names `c` and `sid` are reserved and yield HTTP 405 "Sorry, the file you have requested does not exist." https://developers.google.com/apps-script/guides/web
- Return JSON with `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)`; output is redirected to a one-time URL on script.googleusercontent.com, so HTTP clients must follow redirects (`curl -L`). https://developers.google.com/apps-script/guides/content
- The redirect is a 302; the follow-up to the redirect URL is a GET (the script already ran on the POST). Node's global fetch (undici, stable since Node 21) follows automatically (`redirect: 'follow'` default). https://dev.to/googleworkspace/google-apps-script-googlescriptrun-vs-dogetdopost-endpoints-50p2
- `TextOutput` has exactly 8 methods (append, clear, downloadAsFile, getContent, getFileName, getMimeType, setContent, setMimeType): no HTTP status or header control, so errors must be signalled in the JSON body and custom CORS headers are impossible (CORS is browser-only and irrelevant for server-to-server calls). https://developers.google.com/apps-script/reference/content/text-output
- An exception inside `doPost` produces an HTML error page with HTTP 200, so the Node caller must guard `res.json()` with try/catch rather than trusting `res.ok`; a bogus deployment ID returns HTTP 404 with no redirect (live probe). https://dev.to/jpoehnelt/youre-probably-using-curl-wrong-with-your-google-apps-script-web-app-1ed8
- Latency is not documented by Google; the community figure of 400-1500 ms concerns `google.script.run`, not `doPost` over HTTP with the extra 302 hop (low confidence; measure before committing to synchronous vote responses). https://groups.google.com/g/google-apps-script-community/c/M0UHwkNKYUE

### Deployment, manifest, platform changes

- Manifest `webapp.access`: MYSELF | DOMAIN | ANYONE (any logged-in user) | ANYONE_ANONYMOUS (any user, even if not logged in); `webapp.executeAs`: USER_ACCESSING | USER_DEPLOYING. An unauthenticated server-to-server POST needs ANYONE_ANONYMOUS + USER_DEPLOYING. The UI label mapping ("Anyone" / "Anyone with Google account") rests on a community table, not the official guide (medium confidence; rely on the manifest enums). https://developers.google.com/apps-script/manifest/web-app-api-executable
- "Execute the app as me" runs every request as the script owner regardless of caller. Web apps cease to function if ownership moves to a shared drive or an account in a different domain, and installable triggers always run as their creator, so create the bound script, deployment and trigger from the studio owner's account. Never transmit tokens from `ScriptApp.getOAuthToken()` to the client. https://developers.google.com/apps-script/guides/web
- A versioned deployment serves a fixed version: after code changes, Deploy > Manage deployments > Edit > new version. The head deployment (`/dev`) syncs with the latest saved code but is for testing only and reachable only by script editors, so it cannot be called anonymously from a server. https://developers.google.com/apps-script/concepts/deployments
- URL shape `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`; the Deployment ID (Deploy > Manage deployments, shown only on active deployments) is distinct from the Script ID (Project Settings). https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments
- 200 versions per script; every "New version" redeploy and every `clasp create-deployment` consumes one. https://developers.google.com/apps-script/guides/services/quotas
- Rhino was deprecated 2025-02-20 and stopped executing 2026-01-31: set `runtimeVersion: "V8"` explicitly (the manifest reference still documents STABLE as the default). 2026-06-22: Apps Script became a Workspace core service; admins can turn it off per organisational unit (Admin console > Apps > Google Workspace > Drive and Docs > Google Apps Script), which would kill both the web app and the trigger. 2025-01-08: granular OAuth consent lets the owner grant only some scopes, so a partially authorised script fails at runtime on UrlFetchApp/ScriptApp; use `ScriptApp.requireAllScopes()` / `requireScopes()` / `getAuthorizationInfo()`. https://developers.google.com/apps-script/releases
- Workspace admins can turn Apps Script on/off and (Business Plus/Enterprise/Education) restrict external domains reachable through it; no official page documents removal of the "Anyone" web-app option, though a community thread reports it (low confidence). https://developers.google.com/apps-script/guides/admin/monitor-use

### LockService

- `LockService.getScriptLock()` is the correct mutex for a web app; `getDocumentLock()` returns null from a standalone script or webapp context. https://developers.google.com/apps-script/reference/lock/lock-service
- `waitLock(ms)` throws on timeout; `tryLock(ms)` returns false; the lock is auto-released at script termination. Call `SpreadsheetApp.flush()` before `releaseLock()` so pending Sheets writes commit while you still hold exclusive access. Google's own sample is the read-increment-write ticket counter this design needs. https://developers.google.com/apps-script/reference/lock/lock

### Quotas

- Consumer vs Workspace, per user, reset 24 h after first request: URL Fetch calls 20,000 vs 100,000/day; triggers total runtime 90 min vs 6 hr/day; Properties read/write 50,000 vs 500,000/day. Identical for both: script runtime 6 min/execution; simultaneous executions 30/user and 1,000/script; triggers 20/user/script; Properties 9 KB/value, 500 KB/store; URL Fetch POST and response 50 MB, URL 2 KB, 100 headers. There is no web-app-requests-per-day row. https://developers.google.com/apps-script/guides/services/quotas
- (unverified) A web app executing "as me" counts against the owner's 30 simultaneous executions: not stated on any Google page; only a community measurement that simultaneous connections to one web app are "under 30". https://raw.githubusercontent.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/master/README.md
- Sheets API: 300 read and 300 write requests/min/project, 60 read and 60 write/min/user/project, no daily limit, HTTP 429 with exponential backoff, 180 s processing timeout, keep payloads under 2 MB. A service account counts as one user. https://developers.google.com/sheets/api/limits

### Triggers (onEdit -> HTTP POST)

- Simple `onEdit(e)` cannot call UrlFetchApp (no services requiring authorization), cannot run longer than 30 s, queues at most 2 events, and does not fire on script/API edits. `UrlFetchApp.fetch` requires the `https://www.googleapis.com/auth/script.external_request` scope (verbatim). https://developers.google.com/apps-script/guides/triggers
- Installable triggers can call authorized services, can be created programmatically, always run as their creator, cannot be seen from another account, do not run for view/comment-only opens, and "Script executions and API requests don't cause triggers to run" (only exception `Form.submitGrades()`). Consequence: site writes never fire the onEdit revalidate trigger; the site must invalidate its own cache after a vote. When a trigger throws, no UI error appears; Apps Script emails the owner from noreply-apps-scripts-notifications@google.com with links to deactivate/reconfigure (the only built-in alerting). https://developers.google.com/apps-script/guides/triggers/installable
- DISAGREEMENT (both community sources): the fact-checker cites a Google Groups thread (2022-07-12) stating "The onChange and onEdit triggers will not fire off" for `spreadsheets.values.update` (https://groups.google.com/g/google-apps-script-community/c/Hjhhe1NtWYQ); the breakage-hunter cites tanaikech showing installable onChange DOES fire for Sheets API edits (user email present with a user token, absent with a service-account token). Both agree on the design: revalidate from onEdit only, filtered by sheet name; never from onChange, which if it fires would turn every API vote append into a revalidate storm. https://gist.github.com/tanaikech/5388797761cb92cf1fe325e939c10b25
- Create with `ScriptApp.newTrigger('fn').forSpreadsheet(ss).onEdit().create()` (`forSpreadsheet` also accepts a spreadsheet ID string); manual path: Triggers > Add Trigger. https://developers.google.com/apps-script/reference/script/spreadsheet-trigger-builder
- onEdit event: `e.range`, `e.source`, `e.value`/`e.oldValue` (single-cell edits only; oldValue undefined if the cell was empty), `e.user`, `e.authMode`, `e.triggerUid` (installable only). onChange carries `changeType` in {EDIT, INSERT_ROW, INSERT_COLUMN, REMOVE_ROW, REMOVE_COLUMN, INSERT_GRID, REMOVE_GRID, FORMAT, OTHER}. https://developers.google.com/apps-script/guides/triggers/events
- `timeBased().after(ms)` guarantees only a minimum delay ("The actual duration might vary, but won't be less than your specified minimum"), so a 20 s debounced one-shot may miss a ~1-minute freshness target. More predictable: POST directly from the installable onEdit with a Script Properties timestamp throttle; documented fallback: `everyMinutes(n)` with n in {1, 5, 10, 15, 30}, start slightly randomized. (unverified) Fired one-shot triggers persist and count toward the 20/user/script limit: Google docs are silent, community consensus says delete them with `ScriptApp.deleteTrigger()` matching `trigger.getUniqueId() === e.triggerUid`. https://developers.google.com/apps-script/reference/script/clock-trigger-builder
- `ScriptApp.getProjectTriggers()` returns triggers for "the current project and current user" only, so `installTriggers()`/cleanup must be run by the account that created them. https://developers.google.com/apps-script/reference/script/script-app
- `UrlFetchApp.fetch(url, params)`: `method`, `contentType` (default application/x-www-form-urlencoded), `headers`, `payload`, `followRedirects` (default true), `muteHttpExceptions` (default false), `validateHttpsCertificates`, `escaping`, `timeoutSeconds` (default 360); URL up to 2,082 characters. https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app

### Secrets, access, tooling

- Script Properties are the documented home for app-wide config such as external credentials; all values are strings; settable in Project Settings > Script Properties (up to fifty manually; more via `setProperty`/`setProperties`). https://developers.google.com/apps-script/guides/properties
- Bound scripts share the container's owner/viewer/editor list: editors can open and edit the script (and, by inference, read Script Properties via Project Settings); viewers can read code but not run it; whoever copies the file owns the copy's script. Keep the editor list minimal; never put secrets in code. https://developers.google.com/apps-script/guides/bound
- First run shows an authorization dialog; the "unverified app" warning applies only to sensitive/restricted scopes; re-authorization is needed whenever code adds services. Pin `oauthScopes` in `appsscript.json` (Project Settings > "Show appsscript.json manifest file in editor"), least-privilege. https://developers.google.com/apps-script/guides/services/authorization
- Unverified apps are capped at 100 new users after the warning screen; verification is not required when owner and users share a Workspace domain; for a web app executing as the owner only the owner authorizes, so the cap is irrelevant. (unverified) The "Advanced > Go to ... (unsafe)" click path is not described on any Google page. https://developers.google.com/apps-script/guides/client-verification
- clasp 3.x: enable the Apps Script API at script.google.com/home/usersettings; v3 flattened commands (`create-script`, `clone-script`, `open-script`, `create-deployment`, `update-deployment`, `create-version`, `list-versions`, `enable-api`); TypeScript is no longer transpiled by clasp; 3.4.0 added PKCE and path-traversal fixes; `clasp login --creds <file>` with a self-created Desktop OAuth client is the workaround if Workspace restricts third-party OAuth apps. Node requirement is a three-way discrepancy: README ">= 22.0.0", package.json engines ">=20.0.0", Google guide "20.0.0 or later" with mixed old/new command names; Node 22+ satisfies all. https://raw.githubusercontent.com/google/clasp/master/CHANGELOG.md

### Sheets API via service account (comparison path)

- Append: `POST .../v4/spreadsheets/{id}/values/{range}:append` with `valueInputOption` (scopes drive, drive.file, spreadsheets); read: `GET .../values:batchGet?ranges=...` (spreadsheets.readonly suffices). Live probes without credentials return structured 401/403 errors, confirming the URL shapes. https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
- No atomic increment or compare-and-swap exists; `batchUpdate` only guarantees that requests inside one call apply together atomically. Counter updates from the site are read-modify-write races. https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
- Service-account setup: Keys > Add key > Create new key > JSON (the download is the only copy), then share the sheet with the service account email (Editor for writes, Viewer for reads). https://developers.google.com/workspace/guides/create-credentials
- GCP organisations created on or after 2024-05-03 enforce `iam.managed.disableServiceAccountKeyCreation` by default; consumer gmail.com projects have no organisation and are unaffected. A Workspace-owned account may need an org-admin exemption, or keep all writes on the Apps Script path. https://docs.cloud.google.com/resource-manager/docs/secure-by-default-organizations
- googleapis: `new google.auth.GoogleAuth({ keyFile | credentials, scopes })`, `google.sheets({ version: 'v4', auth })`, then `sheets.spreadsheets.values.append({ spreadsheetId, range: 'Votes!A:C', valueInputOption: 'USER_ENTERED', requestBody: { values: [[...]] } })` (official sample https://raw.githubusercontent.com/googleapis/google-api-nodejs-client/main/samples/sheets/append.js) and `values.batchGet({ spreadsheetId, ranges, valueRenderOption: 'UNFORMATTED_VALUE' })`; never commit the key file. googleapis 178.0.0 is a BREAKING release ("Update apiary to minimum Node version of 22") although its engines field still says >=18; 172-177 also carried breaking changes; pin exact versions. https://raw.githubusercontent.com/googleapis/google-api-nodejs-client/main/CHANGELOG.md
- google-auth-library 11.0.0 (2026-07-29): only breaking change is the Node 22 floor; source moved to the google-cloud-node monorepo (the old repo's changelog stops at 10.5.0). google-spreadsheet 5.3.0 is ESM-only with google-auth-library >=8.8.0 as a peer, so it pairs with v11 without googleapis. https://raw.githubusercontent.com/googleapis/google-cloud-node/main/core/packages/google-auth-library-nodejs/CHANGELOG.md
- A spreadsheet holds at most 10 million cells: a 3-column Votes tab tolerates roughly 3.3M votes before the whole workbook stops accepting data, and COUNTIFS over it slows as it grows; plan an archive/rollup routine. https://support.google.com/drive/answer/37603

### Astro, Node and hosting constraints

- Node floor for the stack is 22.12+ (astro 7.3.1 ">=22.12.0"; vitest 5.0.0 "^22.12.0 || ^24.0.0 || >=26.0.0"; google-auth-library 11 and gaxios 8 ">=22"). Node 20 reached EOL 2026-04-30; Node 22 is in maintenance until 2027-04-30; Node 24 is Active LTS (EOL 2028-04-30); pin `engines.node` to 24.x. https://endoflife.date/api/nodejs.json
- Since Astro 6 `import.meta.env` values are always inlined at build time, so a secret read that way is baked into the server bundle and cannot be rotated without a rebuild (corrected: use `astro:env` with `envField.string({ context: 'server', access: 'secret' })` or `getSecret('NAME')` from `astro:env/server`, whose implementation comes from the adapter; only `PUBLIC_` vars reach the client). https://docs.astro.build/en/guides/upgrade-to/v6/
- `output: 'hybrid'` was removed in Astro 5; `output` is `'static' | 'server'`. Use static with `export const prerender = false` on `/api/revalidate`, the vote endpoint and any live pages; an adapter is still required. Endpoint shape: `export const POST = (async ({ request }) => { const body = await request.json(); return new Response(JSON.stringify(...), { status: 200 }); }) satisfies APIRoute`. https://docs.astro.build/en/guides/upgrade-to/v5/
- Astro 7 ships a route cache that replaces a hand-rolled TTL cache: `cache: { provider: memoryCache() }` (from `astro/config`), `Astro.cache.set({ maxAge, swr, tags })` / `context.cache.set(...)`, `await context.cache.invalidate({ tags: [...] })` or `{ path }`, declarative `routeRules`. Adapter CDN providers are experimental and opt-in: `cacheVercel()` (@astrojs/vercel/cache), `cacheNetlify()` (@astrojs/netlify/cache), `cacheCloudflare()` (@astrojs/cloudflare/cache); on Vercel tag invalidation is soft (stale, revalidated in background); no caching occurs in dev. https://docs.astro.build/en/guides/caching/
- An in-process cache plus `POST /api/revalidate` is only correct with exactly one process: Vercel Fluid compute shares instances but still scales out, so a revalidate clears only the instance that received it; Cloudflare gives "no guarantee that any two user requests will be routed to the same ... instance" and recommends not mutating global state. (corrected: self-host with `@astrojs/node` `mode: 'standalone'` + `memoryCache()`, or use the adapter CDN providers with tag invalidation, or back the cache with a shared store.) https://vercel.com/docs/fluid-compute
- Astro 7 breaking changes: Vite 8; the Rust compiler is the only compiler (unclosed tags error, invalid HTML no longer auto-corrected); `compressHTML` default is now `'jsx'`; `src/fetch.ts` is reserved; Sätteri replaces remark/rehype by default; `@astrojs/db` removed; old experimental flags must be deleted. Astro 6: Node 22, Vite 7, Zod 4 internally, legacy content collections and `Astro.glob()` removed, CJS config removed, endpoints with a file extension reject trailing slashes. https://docs.astro.build/en/guides/upgrade-to/v7/
- Vercel: Node 24.x default (22.x, 20.x; 20 disabled 2026-10-01). Hobby is restricted to non-commercial personal use; a paid catalogue site needs Pro ($20/user/month). Preview deployments are protected by default (send `x-vercel-protection-bypass`); if Bot Protection challenge mode is enabled it blocks UrlFetchApp, so add a WAF bypass rule for the revalidate path and point SITE_URL at production only. https://vercel.com/docs/limits/fair-use-guidelines
- Netlify Free explicitly permits commercial projects (300 credits/month, 125,000 function invocations, 100 GB bandwidth); Functions: 60 s synchronous limit, 1024 MB, 6 MB buffered payload, region cmh (US East) unless Pro; Node follows the build version or falls back to 24 (`AWS_LAMBDA_JS_RUNTIME=nodejs24.x`). https://docs.netlify.com/build/functions/configuration.md
- Cloudflare: compatibility_date >= 2026-08-04 enables nodejs_compat by default (Crypto, HTTP, HTTPS, Net, Stream, Buffer listed as supported; unsupported APIs throw "[unenv] ... is not implemented yet!"). The verifiers differ in degree: the fact-checker calls googleapis/google-auth-library on Workers "untested", the breakage-hunter says they "do not run" (community guides fall back to a WebCrypto RS256 JWT signer). @astrojs/cloudflare 14 runs `astro dev` in workerd (CJS deps may throw), removed `Astro.locals.runtime` (use `import { env } from 'cloudflare:workers'`), dropped Pages, requires wrangler ^4.125.0; Workers Free gives 10 ms CPU per invocation (Paid $5/month, 30 s). https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Vitest 5.0.0 (2026-09-03): Vite >= 6.4, Node >= 22.12; `clearMocks` defaults to true; `vi.mock`/`vi.hoisted` outside top level now throw. Zod 4: `message` -> `error`, `z.email()`/`z.iso.datetime()`, `z.strictObject()`/`z.looseObject()`, `z.coerce.*` input is unknown, `.default()` must match the output type (`.prefault()` for pre-parse), `z.treeifyError()` replaces `.format()`/`.flatten()`. https://zod.dev/v4/changelog

## Snippets

Apps Script `doPost` write endpoint plus locked append + counter increment (deploy as web app: Execute as Me, access Anyone). Confirmed; corrected with a header-only guard (`getRange(2, c, 0, 1)` throws). https://developers.google.com/apps-script/reference/lock/lock

```js
function doPost(e) {
  let body = null;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {}
  const secret = PropertiesService.getScriptProperties().getProperty('WRITE_SECRET');
  if (!body || !secret || body.secret !== secret) {
    // no HTTP status control: signal errors in the JSON body
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' })).setMimeType(
      ContentService.MimeType.JSON,
    );
  }
  const result = recordVote_(String(body.rugId), body.vote === 'like' ? 'like' : 'dislike');
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
const VOTES_SHEET = 'Votes',
  RUGS_SHEET = 'Rugs',
  ID_COL = 1,
  LIKES_COL = 8,
  DISLIKES_COL = 9;
function recordVote_(rugId, vote) {
  const lock = LockService.getScriptLock(); // getDocumentLock() returns null in a webapp context
  lock.waitLock(30000); // throws if not acquired within 30 s
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet(); // bound script; or SpreadsheetApp.openById(ID)
    ss.getSheetByName(VOTES_SHEET).appendRow([new Date(), rugId, vote]);
    const rugs = ss.getSheetByName(RUGS_SHEET);
    if (rugs.getLastRow() < 2) return { ok: false, error: 'unknown rug' }; // corrected: header-only guard
    const ids = rugs
      .getRange(2, ID_COL, rugs.getLastRow() - 1, 1)
      .getValues()
      .map((r) => String(r[0]));
    const idx = ids.indexOf(rugId);
    if (idx === -1) return { ok: false, error: 'unknown rug' };
    const cell = rugs.getRange(idx + 2, vote === 'like' ? LIKES_COL : DISLIKES_COL);
    const next = Number(cell.getValue() || 0) + 1;
    cell.setValue(next);
    SpreadsheetApp.flush(); // commit while the lock is still held
    return { ok: true, rugId: rugId, vote: vote, count: next };
  } finally {
    lock.releaseLock();
  }
}
```

Installable onEdit -> debounced one-shot clock trigger -> `UrlFetchApp` POST to `/api/revalidate`. Confirmed; corrected so the pending flag and fired trigger are always cleaned up (otherwise one failed fetch swallows every later edit). `after()` is a minimum delay. https://developers.google.com/apps-script/guides/triggers/installable

```js
const WATCHED_SHEETS = ['Rugs', 'Collections', 'Tags', 'FX'],
  DEBOUNCE_MS = 20 * 1000;
function installTriggers() {
  // run once, as the sheet owner; getProjectTriggers() sees only the running user's triggers
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}
function onSheetEdit(e) {
  if (WATCHED_SHEETS.indexOf(e.range.getSheet().getName()) === -1) return;
  const props = PropertiesService.getScriptProperties(),
    lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // another edit is already scheduling
  try {
    if (props.getProperty('REVALIDATE_PENDING') === '1') return; // debounce
    props.setProperty('REVALIDATE_PENDING', '1');
    ScriptApp.newTrigger('sendRevalidate').timeBased().after(DEBOUNCE_MS).create();
  } finally {
    lock.releaseLock();
  }
}
function sendRevalidate(e) {
  const props = PropertiesService.getScriptProperties();
  try {
    const res = UrlFetchApp.fetch(props.getProperty('SITE_URL') + '/api/revalidate', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + props.getProperty('REVALIDATE_SECRET') },
      payload: JSON.stringify({ source: 'sheet', at: new Date().toISOString() }),
      muteHttpExceptions: true,
      timeoutSeconds: 30,
    });
    console.log('revalidate -> ' + res.getResponseCode() + ' ' + res.getContentText());
  } finally {
    // corrected: always clear the flag and delete the fired one-shot trigger (20/user/script limit)
    props.deleteProperty('REVALIDATE_PENDING');
    ScriptApp.getProjectTriggers().forEach((t) => {
      if (e && t.getUniqueId() === e.triggerUid) ScriptApp.deleteTrigger(t);
    });
  }
}
```

`appsscript.json`: least-privilege scopes (all three strings confirmed verbatim), explicit V8, anonymous web app executing as the deployer. https://developers.google.com/apps-script/manifest

```json
{
  "timeZone": "Asia/Riyadh",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ],
  "webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" }
}
```

Astro server-side call to the `/exec` URL. Corrected: secrets via `astro:env/server` instead of `import.meta.env` (inlined at build since Astro 6), and the JSON parse is guarded because script errors arrive as HTML with HTTP 200. https://docs.astro.build/en/reference/modules/astro-env/

```ts
// src/lib/votes.ts (server only)
import { getSecret } from 'astro:env/server';
export async function submitVote(rugId: string, vote: 'like' | 'dislike') {
  const res = await fetch(getSecret('APPS_SCRIPT_EXEC_URL')!, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: getSecret('APPS_SCRIPT_WRITE_SECRET'), rugId, vote }),
    redirect: 'follow', // default; the 302 to script.googleusercontent.com is re-requested with GET
  });
  try {
    return (await res.json()) as { ok: boolean; count?: number; error?: string };
  } catch {
    throw new Error(`Apps Script returned non-JSON (HTTP ${res.status})`);
  }
}
```

## Recommendation

Both verifiers uphold the researcher's hybrid design; the corrections change how it is implemented, not what it is.

1. Reads: Sheets API via a service account with `spreadsheets.readonly`, wrapped in Astro 7's route cache (`context.cache.set({ maxAge: 60, tags: ['catalogue'] })`), not a hand-rolled in-process TTL map. `/api/revalidate` calls `context.cache.invalidate({ tags: ['catalogue'] })`. On self-hosted Node standalone use `memoryCache()`; on Vercel/Netlify/Cloudflare use the adapter CDN provider so invalidation reaches every instance (corrected).
2. Writes: the bound Apps Script (created, deployed and trigger-installed from the studio owner's account, source in git via clasp 3) hosts `doPost` guarded by a shared secret in Script Properties and `getScriptLock` + `flush()`. Deploy ANYONE_ANONYMOUS + USER_DEPLOYING; call it only from the server; treat every response as untrusted JSON (HTTP 200 even on failure). Pin googleapis 178.0.0 exactly and do not add google-auth-library 11 beside it (corrected); alternatives are google-auth-library 11 + plain fetch, or google-spreadsheet 5.3 without googleapis.
3. Make Likes/Dislikes formula-owned (COUNTIFS over the Votes tab) so the only write is an append; then `doPost` stays trivial or can be replaced by `values.append` from the server, and the counter race disappears. Plan a Votes rollup before the 10M-cell ceiling.
4. After any site-side write, invalidate the cache locally: API writes are documented not to fire onEdit. Revalidate from installable onEdit only, filtered by sheet name; never onChange (contested whether it fires on API writes; either way it is the wrong hook).
5. Prefer POSTing straight from the installable onEdit with a Script Properties timestamp throttle over the one-shot `after()` debounce, whose delay is unbounded; keep `everyMinutes(1)` as fallback. Always clean the pending flag and fired trigger in `finally`.
6. Runtime: Node 24 (engines.node 24.x), Astro 7 with `output: 'static'` + `prerender = false` on live routes, secrets via `astro:env/server`, `runtimeVersion: "V8"`, `ScriptApp.requireAllScopes()` at the top of `doPost`/triggers to defeat partial consent.
7. Host: self-hosted Node standalone or Netlify are the low-friction targets (Node-native, commercial use allowed on Free). Vercel requires Pro for a commercial site and needs a WAF bypass for the revalidate POST. Cloudflare is highest-risk for the googleapis path (verifiers disagree between "untested" and "does not run"); if chosen, use a WebCrypto JWT signer or route all Google traffic through Apps Script.
8. Before committing: confirm the owner's account type (consumer vs Workspace), that the "Anyone" web-app option is visible, that Apps Script is enabled for their OU, and whether their GCP org blocks service-account key creation; if keys are blocked, keep all writes on Apps Script.

## Open questions

- Real `doPost` latency (incl. the 302 hop) for the owner's account/region; the 400-1500 ms figure is about `google.script.run`, as is the "under 30 simultaneous connections" measurement. Andrew Roberts' Dec 2024 latency article still fails to fetch (TLS error).
- Does installable onChange fire for Sheets API writes? The two verifiers hold opposite community evidence; official docs say API requests do not fire triggers. Not decision-critical because the design uses onEdit.
- Is the owner's account consumer Gmail or Workspace, and does the Workspace admin allow Apps Script, anonymous web-app deployment, and service-account key creation (post-2024-05-03 org policy)?
- Concurrency safety of Sheets API `values.append` under simultaneous callers is undocumented (medium confidence).
- Whether googleapis 178 / google-auth-library 11 actually run on Cloudflare Workers with nodejs_compat (untested by both verifiers); and googleapis' unreleased 178.1.0 ("upgrade dependencies ... to Node 22") may move the google-auth-library pin, so recheck before locking dependencies.

## Verification notes

Fact-check verifier: 49 verdicts - 46 confirmed, 0 refuted, 3 unverifiable (web app counts against the owner's 30 simultaneous executions; fired one-shot clock triggers persist; the "Advanced > Go to (unsafe)" click path). Confirmed all 9 original package versions plus 5 adapter/undici versions; added 15 findings (Node floor, Vercel/Netlify Node versions, Cloudflare nodejs_compat, Astro 5 output change, endpoint shape, astro:env secrets, onChange community thread, clasp engines discrepancy, after() minimum delay, per-user getProjectTriggers, unverified-app cap, admin controls, 50-property UI limit, runtimeVersion default). All merged above.

Breakage-hunt verifier: 12 verdicts - 9 confirmed, 3 refuted, 0 unverifiable; added 21 findings (Node LTS timeline, google-auth-library 11 and googleapis 178 breaking releases, Astro 7 route cache, Astro 6/7 breaking changes, Vitest 5 and Zod 4 migrations, Vercel fair-use and deployment protection, Netlify limits, Cloudflare adapter 14 and Workers state model, GCP secure-by-default org policy, Apps Script release notes, tanaikech onChange gist, google-spreadsheet 5.3, clasp 3.x changelog, Votes tab growth, OAuth-token warning, debounce flag hazard). All merged above.

Refuted claims and their corrections:

1. "Direct Sheets API path uses googleapis 178.0.0 together with google-auth-library 11.0.2" - googleapis 178 pins google-auth-library 10.5.0; installing both yields two majors side by side. Use the transitive copy, or google-auth-library 11 alone with fetch. https://registry.npmjs.org/googleapis/178.0.0
2. "Secrets read via `import.meta.env` come from server env only" - since Astro 6 `import.meta.env` is always inlined at build time; use `astro:env` (`envField.string({ context: 'server', access: 'secret' })`) or `getSecret()` from `astro:env/server`. https://docs.astro.build/en/guides/upgrade-to/v6/
3. "In-process 60 s cache invalidated by POST /api/revalidate, hosted on Vercel/Netlify functions or self-hosted Node" - only correct for a single process; Vercel Fluid scales to multiple instances and Cloudflare guarantees no instance affinity. Use Astro 7 route cache with `memoryCache()` on standalone Node or the adapter CDN providers with `context.cache.invalidate({ tags })` elsewhere. https://vercel.com/docs/fluid-compute

Verifier disagreements: (a) onChange on Sheets API writes - fact-check: does not fire (Google Groups 2022); breakage-hunt: does fire (tanaikech gist); both community-sourced, both recommend onEdit only. (b) googleapis on Cloudflare Workers - fact-check: untested with nodejs_compat now default; breakage-hunt: does not run per community guides. (c) The fact-check marked the Astro fetch snippet "confirmed" while noting the astro:env preference; the breakage-hunt refuted its `import.meta.env` usage outright - the corrected snippet above satisfies both.
