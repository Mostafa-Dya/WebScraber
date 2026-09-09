/**
 * Serio Ludere catalogue — STANDALONE monitor script (docs/ADR.md D5.5, D5.7).
 *
 * Create it at script.google.com from the STUDIO OWNER's account as a standalone project (NOT bound
 * to the sheet, so sheet Editors cannot edit it). It needs wider scopes than the bound script:
 * mail (alerts) and Drive (weekly backup copy). Script Properties:
 *   SITE_URL             https://catalogue.example.com
 *   ALERT_EMAIL          hello@serioludere.com
 *   SHEET_ID             id of the catalogue spreadsheet
 *   BACKUP_FOLDER        (optional) Drive folder id for backups; created as "Catalogue backups" if empty
 *   RATES_AUTO_ENABLED   1 when the bound script's FX refresh is installed (adds a stale-rates check)
 * Run `installMonitorTriggers` once and authorise it.
 *
 * appsscript.json for this project:
 * {
 *   "timeZone": "America/Toronto", "runtimeVersion": "V8",
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/script.external_request",
 *     "https://www.googleapis.com/auth/script.send_mail",
 *     "https://www.googleapis.com/auth/drive",
 *     "https://www.googleapis.com/auth/script.scriptapp"
 *   ]
 * }
 */

var MAX_SNAPSHOT_AGE_SEC = 6 * 3600;
var MAX_RATES_AGE_MS = 2 * 24 * 3600 * 1000;
var VOTES_ROWS_WARN = 150000; // the site pauses voting at 200 000 (ADR D4): time to run votes:archive
var BACKUP_KEEP = 8;
var RETRY_DELAY_MS = 60 * 1000;

function installMonitorTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkHealth').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('backupSheet')
    .timeBased()
    .everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(4)
    .create();
  Logger.log('Installed checkHealth (6-hourly) and backupSheet (weekly) triggers.');
}

function fetchHealth_(url) {
  var res = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/api/health', {
    muteHttpExceptions: true,
    followRedirects: false,
    timeoutSeconds: 20,
  });
  var code = res.getResponseCode();
  var body = {};
  try {
    body = JSON.parse(res.getContentText());
  } catch (err) {
    body = { parseError: true };
  }
  return { code: code, body: body };
}

function problemsFor_(h, code, props) {
  var problems = [];
  if (h.parseError) problems.push('health endpoint returned non-JSON (HTTP ' + code + ')');
  if (code !== 200 || h.ok === false) problems.push('site reports not ok (HTTP ' + code + ')');
  if (h.lastRefreshOk === false)
    problems.push('last sheet refresh failed: ' + (h.lastError || 'unknown error'));
  if (typeof h.snapshotAgeSec === 'number' && h.snapshotAgeSec > MAX_SNAPSHOT_AGE_SEC) {
    problems.push('catalogue snapshot is ' + Math.round(h.snapshotAgeSec / 3600) + ' h old');
  }
  if (h.secretsOk === false) problems.push('site secrets are missing or too short');
  if (h.rowsDropped > 0) {
    var rows = (h.dropped || []).map(function (d) {
      return d.tab + ' row ' + d.row + ': ' + (d.issues || []).join('; ');
    });
    problems.push(h.rowsDropped + ' sheet row(s) are being skipped:\n    ' + rows.join('\n    '));
  }
  if (h.photosFailing > 0) {
    var rugs = (h.photosFailingRugs || []).map(function (p) {
      return p.id + ' "' + p.name + '" (HTTP ' + p.status + ')';
    });
    problems.push(
      h.photosFailing +
        ' photo(s) are not loading — check "Anyone with the link" sharing:\n    ' +
        rugs.join('\n    '),
    );
  }
  if (h.voteStateTruncated === true)
    problems.push('the Votes tab exceeds the 5000-row window: run `npm run votes:archive`');
  if (typeof h.votesRowsTotal === 'number' && h.votesRowsTotal > VOTES_ROWS_WARN) {
    problems.push(
      'Votes has ' + h.votesRowsTotal + ' rows; voting pauses at 200000 — run `npm run votes:archive`',
    );
  }
  // An unknown row count means the spreadsheet metadata read keeps failing (permissions, quota):
  // the growth breaker cannot arm. One unknown reading is tolerated (a restart, a transient error);
  // two consecutive checks apart by more than an hour are an incident.
  if (h.ok === true && h.votesRowsTotal === null) {
    var unknownSince = Number(props.getProperty('VOTES_TOTAL_UNKNOWN_SINCE') || 0);
    if (!unknownSince) props.setProperty('VOTES_TOTAL_UNKNOWN_SINCE', String(Date.now()));
    else if (Date.now() - unknownSince > 3600 * 1000)
      problems.push(
        'the Votes row count has been unknown since ' +
          new Date(unknownSince).toISOString() +
          ': the growth breaker is not armed (spreadsheets.get failing?) — check the site log',
      );
  } else if (typeof h.votesRowsTotal === 'number') {
    props.deleteProperty('VOTES_TOTAL_UNKNOWN_SINCE');
  }
  if (props.getProperty('RATES_AUTO_ENABLED') === '1' && h.ratesOldestUpdatedAt) {
    var age = Date.now() - new Date(h.ratesOldestUpdatedAt).getTime();
    if (age > MAX_RATES_AGE_MS) problems.push('FX rates have not refreshed since ' + h.ratesOldestUpdatedAt);
  }
  return problems;
}

/** Polls GET /api/health (retrying once after a minute) and e-mails the owner on a state change. */
function checkHealth() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SITE_URL');
  var email = props.getProperty('ALERT_EMAIL');
  if (!url || !email) {
    Logger.log('SITE_URL / ALERT_EMAIL missing');
    return;
  }
  var problems = [];
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var r = fetchHealth_(url);
      problems = problemsFor_(r.body, r.code, props);
    } catch (err) {
      problems = ['could not reach the site: ' + err];
    }
    if (!problems.length) break;
    if (attempt === 0) Utilities.sleep(RETRY_DELAY_MS); // a restart or a transient 502 is not an incident
  }
  var lastState = props.getProperty('HEALTH_LAST_STATE') || 'ok';
  var state = problems.length ? 'bad' : 'ok';
  if (state === 'bad' && lastState !== 'bad') {
    MailApp.sendEmail(
      email,
      'Catalogue needs attention',
      'The catalogue site reported:\n\n- ' + problems.join('\n- ') + '\n\nHealth: ' + url + '/api/health',
    );
  } else if (state === 'ok' && lastState === 'bad') {
    MailApp.sendEmail(
      email,
      'Catalogue is healthy again',
      'All checks pass.\n\nHealth: ' + url + '/api/health',
    );
  }
  props.setProperty('HEALTH_LAST_STATE', state);
  props.setProperty('HEALTH_LAST_PROBLEMS', problems.join(' | ').slice(0, 9000));
}

/** Weekly copy of the spreadsheet into a backup folder, keeping the newest BACKUP_KEEP copies of THIS sheet. */
function backupSheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    Logger.log('SHEET_ID missing');
    return;
  }
  var folderId = props.getProperty('BACKUP_FOLDER');
  var folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    var it = DriveApp.getRootFolder().getFoldersByName('Catalogue backups');
    folder = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('Catalogue backups');
    props.setProperty('BACKUP_FOLDER', folder.getId());
  }
  var file = DriveApp.getFileById(sheetId);
  var prefix = file.getName() + ' — backup ';
  var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  file.makeCopy(prefix + stamp, folder);

  var copies = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(prefix) === 0) copies.push(f); // only this spreadsheet's copies
  }
  copies.sort(function (a, b) {
    return b.getDateCreated() - a.getDateCreated();
  });
  for (var i = BACKUP_KEEP; i < copies.length; i++) copies[i].setTrashed(true);
  Logger.log('Backup done; ' + Math.min(copies.length, BACKUP_KEEP) + ' copies kept');
}
