/**
 * Serio Ludere catalogue — bound Apps Script (docs/ADR.md D5.6, D7).
 *
 * Install from the STUDIO OWNER's account (triggers run as their creator):
 *   Extensions › Apps Script › paste this file and appsscript.json (enable "Show appsscript.json"
 *   in Project Settings) › Project Settings › Script Properties:
 *     SITE_URL           https://catalogue.example.com      (https required; no trailing slash)
 *     REVALIDATE_SECRET  the same value as the site's .env
 *     RATES_AUTO         MXN,CAD,EUR                        (optional; which rates the FX refresh may update)
 *     LOCAL_DEV          1                                  (optional; allows an http:// SITE_URL for testing)
 *   Run `installTriggers` once and authorise it.
 *
 * Never install an onChange trigger: it can fire for the site's own API writes and would turn every
 * vote into a revalidate (an onChange event has no `range`, so the guard below ignores it anyway).
 * Scopes are pinned to this spreadsheet plus URL fetch; backup and alerting live in monitor.gs, a
 * SEPARATE standalone script. The LockService lock is held only around the tiny decide-and-stamp
 * step, never across the network call.
 */

var WATCHED_SHEETS = ['Rugs', 'Collections', 'Tags', 'Rates'];
var THROTTLE_MS = 15 * 1000; // at most one direct POST per 15 s
var TRAILING_MS = 20 * 1000; // one more notification after the last edit of a burst
var SERVER_COALESCE_MS = 4 * 1000; // the site acknowledges (202) busts closer together than this
var PENDING_STALE_MS = 10 * 60 * 1000;
var FETCH_TIMEOUT_S = 20;
var OWN_HANDLERS = ['onSheetEdit', 'trailingRevalidate'];

function installTriggers() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (OWN_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty('TRAILING_PENDING');
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  Logger.log('Installed the onEdit trigger. Set SITE_URL and REVALIDATE_SECRET in Script Properties.');
}

/** Installable onEdit: decide under the lock, notify outside it, guarantee a trailing notification. */
function onSheetEdit(e) {
  if (!e || !e.range) return; // also excludes a mis-installed onChange event
  var sheetName = e.range.getSheet().getName();
  if (WATCHED_SHEETS.indexOf(sheetName) === -1) return;

  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  var shouldPost = false;
  if (!lock.tryLock(5000)) return; // another edit is deciding; its trailing trigger covers us
  try {
    var now = Date.now();
    var last = Number(props.getProperty('LAST_REVALIDATE_AT') || 0);
    if (now - last >= THROTTLE_MS) {
      props.setProperty('LAST_REVALIDATE_AT', String(now));
      shouldPost = true;
    }
    ensureTrailing_(props, now);
  } finally {
    lock.releaseLock();
  }
  if (shouldPost) {
    if (!sendRevalidate_('edit:' + sheetName)) {
      props.setProperty('LAST_REVALIDATE_AT', '0'); // failed: let the next edit try again at once
    }
  }
}

/** Arms one trailing one-shot trigger per burst; the flag carries the trigger id and a timestamp. */
function ensureTrailing_(props, now) {
  var pending = props.getProperty('TRAILING_PENDING') || '';
  var parts = pending.split(':');
  var stamped = Number(parts[1] || 0);
  if (pending && now - stamped < PENDING_STALE_MS) return; // a live trigger is already armed
  var id = ScriptApp.newTrigger('trailingRevalidate').timeBased().after(TRAILING_MS).create().getUniqueId();
  props.setProperty('TRAILING_PENDING', id + ':' + now);
}

/** One-shot trigger created by ensureTrailing_; clears its flag FIRST so edits during the send re-arm. */
function trailingRevalidate(e) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('TRAILING_PENDING');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (e && t.getUniqueId && t.getUniqueId() === e.triggerUid) ScriptApp.deleteTrigger(t);
  });
  var last = Number(props.getProperty('LAST_REVALIDATE_AT') || 0);
  var since = Date.now() - last;
  if (since < SERVER_COALESCE_MS + 2000) {
    // The site would coalesce this one (202, no re-read): fire again just outside its window.
    var id = ScriptApp.newTrigger('trailingRevalidate')
      .timeBased()
      .after(SERVER_COALESCE_MS + 2000 - since)
      .create()
      .getUniqueId();
    props.setProperty('TRAILING_PENDING', id + ':' + Date.now());
    return;
  }
  props.setProperty('LAST_REVALIDATE_AT', String(Date.now()));
  sendRevalidate_('edit:trailing');
}

/** POSTs to the site; returns true only for a 2xx answer. Never follows redirects with the secret. */
function sendRevalidate_(source) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SITE_URL');
  var secret = props.getProperty('REVALIDATE_SECRET');
  if (!url || !secret) {
    console.warn('SITE_URL / REVALIDATE_SECRET missing in Script Properties');
    return false;
  }
  if (!/^https:\/\//.test(url) && props.getProperty('LOCAL_DEV') !== '1') {
    console.warn('SITE_URL must be https:// (set LOCAL_DEV=1 for local testing)');
    return false;
  }
  try {
    var res = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/api/revalidate', {
      method: 'post',
      contentType: 'application/json', // Astro's CSRF check 403s form-encoded POSTs
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ source: source }),
      muteHttpExceptions: true,
      followRedirects: false,
      timeoutSeconds: FETCH_TIMEOUT_S,
    });
    var code = res.getResponseCode();
    var body = res.getContentText().slice(0, 200);
    if (code >= 300 && code < 400) {
      console.warn('revalidate (' + source + ') -> redirect ' + code + ': SITE_URL is misconfigured');
      return false;
    }
    if (code < 200 || code >= 300) {
      console.warn(
        'revalidate (' +
          source +
          ') -> ' +
          code +
          ' ' +
          body +
          (code === 401 ? ' (REVALIDATE_SECRET wrong or rotated?)' : ''),
      );
      return false;
    }
    Logger.log('revalidate (' + source + ') -> ' + code + ' ' + body);
    return true;
  } catch (err) {
    console.warn('revalidate (' + source + ') failed: ' + err);
    return false;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Optional FX refresh (docs/ADR.md D7). OFF by default: run `installRatesTrigger` once to enable a
 * 6-hourly refresh of the currencies listed in the RATES_AUTO Script Property (default MXN,CAD,EUR).
 * AED and SAR are pegs and are never touched. Writes only rate_to_base and updated_at.
 * ---------------------------------------------------------------------------------------------- */

var FRANKFURTER = 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=';
var FRANKFURTER_CURRENCIES = 'https://api.frankfurter.dev/v2/currencies';
var MAX_RATE_AGE_DAYS = 5;

function ratesAutoCodes_(props) {
  return (props.getProperty('RATES_AUTO') || 'MXN,CAD,EUR')
    .split(',')
    .map(function (c) {
      return c.trim().toUpperCase();
    })
    .filter(function (c) {
      return /^[A-Z]{3}$/.test(c) && c !== 'USD' && c !== 'AED' && c !== 'SAR';
    });
}

function installRatesTrigger() {
  var props = PropertiesService.getScriptProperties();
  var codes = ratesAutoCodes_(props);
  // Refuse to install with a code Frankfurter does not know: one bad code fails the whole request.
  var res = UrlFetchApp.fetch(FRANKFURTER_CURRENCIES, {
    muteHttpExceptions: true,
    timeoutSeconds: FETCH_TIMEOUT_S,
  });
  if (res.getResponseCode() === 200) {
    var known = JSON.parse(res.getContentText());
    var bad = codes.filter(function (c) {
      return !known[c];
    });
    if (bad.length)
      throw new Error('RATES_AUTO contains codes Frankfurter does not serve: ' + bad.join(', '));
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshRates') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshRates').timeBased().everyHours(6).create();
  props.setProperty('RATES_AUTO_ENABLED', '1');
  Logger.log('Installed the 6-hourly refreshRates trigger for ' + codes.join(', '));
}

function refreshRates() {
  var props = PropertiesService.getScriptProperties();
  var codes = ratesAutoCodes_(props);
  if (!codes.length) return;

  var res;
  try {
    res = UrlFetchApp.fetch(FRANKFURTER + codes.join(','), {
      muteHttpExceptions: true,
      timeoutSeconds: FETCH_TIMEOUT_S,
    });
  } catch (err) {
    console.warn('Frankfurter unreachable: ' + err + '; keeping last-good rates');
    return;
  }
  if (res.getResponseCode() !== 200) {
    console.warn('Frankfurter returned ' + res.getResponseCode() + '; keeping last-good rates');
    return;
  }
  var rows;
  try {
    rows = JSON.parse(res.getContentText());
  } catch (err) {
    console.warn('Frankfurter returned non-JSON; keeping last-good rates');
    return;
  }
  if (!Array.isArray(rows)) return;

  var today = new Date();
  var fresh = {};
  rows.forEach(function (r) {
    var d = new Date(r.date + 'T00:00:00Z');
    var ageDays = (today - d) / 86400000;
    if (
      r.base === 'USD' &&
      typeof r.rate === 'number' &&
      r.rate > 0 &&
      ageDays <= MAX_RATE_AGE_DAYS &&
      ageDays >= -1
    ) {
      fresh[r.quote] = r.rate;
    }
  });

  var sheet = SpreadsheetApp.getActive().getSheetByName('Rates');
  if (!sheet || sheet.getLastRow() < 2) return;
  var n = sheet.getLastRow() - 1;
  var currencies = sheet.getRange(2, 1, n, 1).getValues();
  var stamp = new Date().toISOString();
  var changed = 0;
  for (var i = 0; i < n; i++) {
    var code = String(currencies[i][0] || '')
      .trim()
      .toUpperCase();
    if (codes.indexOf(code) !== -1 && fresh[code]) {
      sheet.getRange(i + 2, 2).setValue(fresh[code]); // rate_to_base
      sheet.getRange(i + 2, 4).setValue(stamp); // updated_at
      changed++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log('refreshRates updated ' + changed + ' row(s)');
  if (changed) sendRevalidate_('rates'); // script writes never fire onEdit
}
