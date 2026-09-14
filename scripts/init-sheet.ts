// Creates/validates the sheet contract (docs/ADR.md §5) and seeds it.
//
//   npm run sheet:init                    create tabs + headers if missing, install formulas, seed Rates,
//                                         seed the 20 published rugs when Rugs is empty
//   npm run sheet:init -- --seed=none     skip the rug/collection/tag seed
//   npm run sheet:init -- --title="…"     title for a newly created development spreadsheet
//
// When GOOGLE_SHEET_ID is empty a new development spreadsheet is created in the consenting
// account's Drive and its id is written back to .env (development stays local, ADR §3.3) — only
// after the tabs, headers, formulas and seed are in place, so a running `astro dev` (which reloads
// .env) never reads a half-built sheet and answers 503 while this script is still working.

import { SheetsClient } from '../src/lib/sheets/client.ts';
import { authFromEnv } from '../src/lib/sheets/config.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import { flag, upsertEnv } from './lib/env.ts';
import {
  ALL_TABS,
  assertPeriodDecimalLocale,
  provisionSheet,
} from '../src/lib/sheets/provision.ts';





let createdId: string | undefined; // set when this run created the spreadsheet; written to .env at the end

async function main(): Promise<void> {
  const auth = authFromEnv(process.env);
  let spreadsheetId = (process.env.GOOGLE_SHEET_ID ?? '').trim();

  if (!spreadsheetId) {
    if (auth.mode === 'service_account') {
      throw new Error(
        'GOOGLE_SHEET_ID is empty and GOOGLE_AUTH_MODE=service_account: service accounts have no Drive storage and cannot own ' +
          'a spreadsheet. Create the sheet in a Google account, share it with the service account as Editor, and set GOOGLE_SHEET_ID.',
      );
    }
    const title = flag('title') ?? 'Serio Ludere — Catalog Database (dev)';
    spreadsheetId = await SheetsClient.createSpreadsheet(auth, title, ALL_TABS, { logger: consoleLogger });
    createdId = spreadsheetId;
    console.log(`Created development spreadsheet "${title}"`);
    console.log(
      `  id  : ${spreadsheetId}  (written to .env as GOOGLE_SHEET_ID when initialisation completes)`,
    );
    console.log(`  url : https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  }

  const client = new SheetsClient({ spreadsheetId, auth, logger: consoleLogger });
  const info = await client.getSpreadsheet();
  const locale = info.properties?.locale ?? 'unknown';
  console.log(`Spreadsheet "${info.properties?.title ?? '?'}" locale=${locale}`);
  assertPeriodDecimalLocale(info, flag('allow-locale') === 'true');

  // Phases 1-7 live in src/lib/sheets/provision.ts so the ADMIN can run exactly the same steps:
  // the studio connects Google on the deployed site and presses one button, and two copies of this
  // logic would drift within a release.
  await provisionSheet(client, info, {
    forceHeaders: flag('force-headers') === 'true',
    seed: flag('seed') === 'none' ? 'none' : 'live',
    log: (m: string) => console.log(m),
  });
  // The id is written last, so a watching `astro dev` never reloads onto a half-built sheet.
  if (createdId) {
    upsertEnv('GOOGLE_SHEET_ID', createdId);
    console.log('Wrote GOOGLE_SHEET_ID to .env');
  }
  console.log('Done.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  if (createdId) {
    console.error(
      `The spreadsheet ${createdId} was created but initialisation did not finish. Set GOOGLE_SHEET_ID=${createdId} ` +
        'in .env and re-run npm run sheet:init to complete it (the script is idempotent), or delete it in Drive to start over.',
    );
  }
  process.exit(1);
});
