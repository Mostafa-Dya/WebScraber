// POST /api/admin/google/provision — create the catalogue spreadsheet from the admin.
//
// WHY THIS EXISTS. `npm run sheet:init` assumes a developer with a terminal, a checkout and a `.env`
// to write the new id into. The person setting this site up is usually the studio: they open
// /admin/google on the deployed site, connect their Google account, and expect a catalogue. This is
// that second half — the same seven provisioning phases the CLI runs (src/lib/sheets/provision.ts),
// against a spreadsheet created in their own Drive, with the id remembered in DATA_DIR because a
// running server cannot write its own environment.
//
// It is deliberately narrow. It creates ONE sheet, only when there is none, only with a live Google
// connection, and only when the id can be stored durably.
export const prerender = false;

import * as z from 'zod';
import { noStore } from '../../../../lib/api.ts';
import {
  adminPost,
  adminRuntime,
  auditBase,
  methodNotAllowed,
  recordAuditEvent,
} from '../../../../lib/admin/http.ts';
import { SheetsClient } from '../../../../lib/sheets/client.ts';
import { consoleLogger } from '../../../../lib/sheets/errors.ts';
import {
  ALL_TABS,
  assertPeriodDecimalLocale,
  provisionSheet,
} from '../../../../lib/sheets/provision.ts';
import {
  getGoogleConnection,
  getSheetIdStore,
  getTokens,
  resetSheetClient,
  sheetIdIfAny,
} from '../../../../lib/runtime.ts';

const Body = z.object({
  /** Shown on the spreadsheet in Drive. The studio sees it there, so it is worth getting right. */
  title: z.string().trim().min(1).max(120).default('Serio Ludere — Catalogue'),
});

export const POST = adminPost(Body, async ({ context, body }) => {
  // 1. There must not already be one. Creating a second would orphan the first WITH THE DATA IN IT,
  //    and the studio would have no way to tell which of two identical sheets the site is reading.
  const existing = sheetIdIfAny();
  if (existing) {
    return noStore(
      {
        ok: false,
        error: 'sheet exists',
        message: 'This site already has a catalogue sheet. Disconnect and reconnect only if you mean to replace it.',
        sheetId: existing,
      },
      409,
    );
  }

  // 2. A live connection, because the sheet is created in the STUDIO's Drive, not ours. A service
  //    account cannot own a Drive file at all, which is the error the CLI reports in the same case.
  const connection = getGoogleConnection();
  if (!connection?.health().connected) {
    return noStore(
      {
        ok: false,
        error: 'not connected',
        message: 'Connect a Google account first — the catalogue is created in that account’s Drive.',
      },
      409,
    );
  }

  // 3. The id must survive a restart. Without DATA_DIR it is remembered for this process only, so
  //    the next restart would show "no sheet yet" and invite the studio to create ANOTHER one,
  //    leaving this one orphaned. Refusing is kinder than the silent version of that.
  const store = getSheetIdStore();
  if (!store.durable) {
    return noStore(
      {
        ok: false,
        error: 'no data dir',
        message:
          'This server has no writable data directory, so a new sheet’s id would be forgotten on restart. Set DATA_DIR and try again.',
      },
      409,
    );
  }

  const auth = {
    mode: 'oauth_refresh' as const,
    clientId: '',
    clientSecret: '',
    refreshToken: '',
  };
  const spreadsheetId = await SheetsClient.createSpreadsheet(auth, body.title, ALL_TABS, {
    logger: consoleLogger,
    tokens: getTokens(),
  });

  const log: string[] = [];
  try {
    const client = new SheetsClient({ spreadsheetId, auth, logger: consoleLogger }, getTokens());
    const info = await client.getSpreadsheet();
    assertPeriodDecimalLocale(info);
    // 'none': nobody wants twenty demo rugs in a real catalogue. The badge tags the Signed /
    // Antique corner badge depends on are written either way — they are contract, not samples.
    await provisionSheet(client, info, { seed: 'none', log: (m) => log.push(m) });
  } catch (e) {
    // The sheet exists in Drive but is not usable. Say so, and say its id, so the studio is not left
    // with an invisible half-built spreadsheet they cannot find or finish.
    return noStore(
      {
        ok: false,
        error: 'provision failed',
        message:
          `The spreadsheet was created but could not be set up: ${e instanceof Error ? e.message : String(e)}. ` +
          'Delete it in Drive and try again.',
        sheetId: spreadsheetId,
        log,
      },
      502,
    );
  }

  // Stored LAST, so a failure above never points the site at a half-built sheet.
  store.write({
    id: spreadsheetId,
    createdAt: new Date().toISOString(),
    createdBy: connection.health().account,
  });
  // The Sheets client and the snapshot cache were built around "no sheet"; drop them so the very
  // next request reads the new one instead of a cached failure.
  resetSheetClient();

  await recordAuditEvent({
    ...auditBase(context),
    action: 'auth.google',
    targetTab: '-',
    targetId: 'sheet',
    after: { created: spreadsheetId, title: body.title },
  });

  return noStore({
    ok: true,
    sheetId: spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    siteUrl: adminRuntime.siteUrl,
    log,
  });
});

export const ALL = methodNotAllowed('POST');
