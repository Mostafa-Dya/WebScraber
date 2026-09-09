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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SheetsClient, type CellValue } from '../src/lib/sheets/client.ts';
import { authFromEnv } from '../src/lib/sheets/config.ts';
import {
  HEADERS,
  PRODUCT_COLS,
  PRODUCT_HEADER_LABELS,
  PRODUCT_WIDTH,
  RATES_SEED,
  SETTINGS_SEED,
  TABS,
  type TabName,
} from '../src/lib/sheets/contract.ts';
import { collectionsUpgradeRequests, isLegacyCollectionsHeader } from '../src/lib/sheets/upgrade.ts';
import { columnLetter } from '../src/lib/sheets/parse.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import { buildSeed, type LegacyRug } from './lib/seed.ts';
import { flag, upsertEnv } from './lib/env.ts';

// The admin tabs (docs/ADMIN_SPEC.md §3.2) are created and headed by the same idempotent steps.
const ALL_TABS: TabName[] = [
  TABS.products,
  TABS.collections,
  TABS.customers,
  TABS.reactions,
  TABS.reactionsArchive,
  TABS.visits,
  TABS.tags,
  TABS.rates,
  TABS.auditLog,
  TABS.settings,
];

/** Tabs the admin owns; reported separately so the owner sees what a re-run added. */
const ADMIN_TABS: TabName[] = [TABS.customers, TABS.auditLog, TABS.settings];

/** Tabs whose header row is written with the brief's own casing rather than the lowercase contract. */
const LABELLED_HEADERS: Partial<Record<TabName, readonly string[]>> = {
  [TABS.products]: PRODUCT_HEADER_LABELS,
};

const SEED_FILE = resolve(process.cwd(), 'reference/live_catalogue.2026-09-05.json');
// Period-decimal locales (the API returns bare language codes such as "en" as well as "en_US").
const PERIOD_DECIMAL_LOCALES = /^(en(?!_ZA)|ja|zh|ko|th|ar|he|hi|ms|fil|es_(MX|US))(_[A-Za-z0-9]+)?$/;

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
  if (!PERIOD_DECIMAL_LOCALES.test(locale) && flag('allow-locale') !== 'true') {
    throw new Error(
      `Sheet locale "${locale}" uses a comma decimal separator, which changes the formula syntax. ` +
        'Set File › Settings › Locale to "United States" (or pass --allow-locale if you know it is period-decimal).',
    );
  }

  // 1. Tabs
  const existing = new Set((info.sheets ?? []).map((s) => s.properties.title));
  const missing = ALL_TABS.filter((t) => !existing.has(t));
  if (missing.length) {
    await client.batchUpdate(missing.map((title) => ({ addSheet: { properties: { title } } })));
    client.forgetSheetIds();
    console.log(`Created tab(s): ${missing.join(', ')}`);
  }
  const adminTabsCreated = missing.filter((t) => ADMIN_TABS.includes(t));
  const adminTabsFound = ADMIN_TABS.filter((t) => existing.has(t));

  // 2. Headers (only written where the header row is empty; mismatches abort unless --force-headers)
  const headerRanges = ALL_TABS.map((t) => `${t}!A1:${columnLetter(HEADERS[t].length - 1)}1`);
  const headerRows = await client.batchGet(headerRanges);
  const normalise = (row: CellValue[] | undefined): string[] =>
    (row ?? []).map((c) =>
      String(c ?? '')
        .trim()
        .toLowerCase(),
    );
  // 2a. One legacy layout can be repaired with its data intact: Collections gained `created_at`
  // and swapped name/slug. Moving and inserting columns carries every row along, so this is safe
  // where a header rewrite would not be. Everything else still aborts below and asks a human.
  const collectionsIndex = ALL_TABS.indexOf(TABS.collections);
  if (
    collectionsIndex >= 0 &&
    isLegacyCollectionsHeader(normalise(headerRows[collectionsIndex]?.values?.[0]))
  ) {
    await client.batchUpdate(collectionsUpgradeRequests(await client.sheetIdByTitle(TABS.collections)));
    headerRows[collectionsIndex] = { range: headerRanges[collectionsIndex]!, values: [[]] };
    console.log(`Upgraded ${TABS.collections} to the brief layout (name/slug swapped, created_at inserted)`);
  }

  for (let i = 0; i < ALL_TABS.length; i++) {
    const tab = ALL_TABS[i]!;
    const expected = HEADERS[tab];
    const actual = normalise(headerRows[i]?.values?.[0]);
    const empty = actual.every((c) => c === '');
    const matches = expected.every((h, j) => actual[j] === h);
    if (matches) continue;
    if (!empty && flag('force-headers') !== 'true') {
      throw new Error(
        `Tab "${tab}" has a header row that does not match the contract (got: ${actual.join(' | ')}). ` +
          'Fix the headers in the sheet or re-run with --force-headers to overwrite row 1.',
      );
    }
    const labels = LABELLED_HEADERS[tab] ?? expected;
    await client.valuesUpdate(headerRanges[i]!, [labels.slice()], 'RAW');
    console.log(`Wrote headers for ${tab}`);
  }
  // 3. Products needs 42 columns; a new tab defaults to 26 (brief §9)
  const grid = await client.getSpreadsheet('sheets.properties');
  const productsSheet = (grid.sheets ?? []).find((sh) => sh.properties.title === TABS.products);
  const columnCount = productsSheet?.properties.gridProperties?.columnCount ?? 26;
  if (columnCount < PRODUCT_WIDTH) {
    await client.batchUpdate([
      {
        appendDimension: {
          sheetId: productsSheet!.properties.sheetId,
          dimension: 'COLUMNS',
          length: PRODUCT_WIDTH - columnCount,
        },
      },
    ]);
    console.log(`Widened ${TABS.products} to ${PRODUCT_WIDTH} columns`);
  }

  // 4. Formats, freezes and protections
  const sheetId = async (t: TabName): Promise<number> => client.sheetIdByTitle(t);
  const requests: unknown[] = [];
  for (const t of ALL_TABS) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: await sheetId(t), gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });
  }
  const textFormat = {
    cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
    fields: 'userEnteredFormat.numberFormat',
  };
  /** Ids and slugs must never be read back as numbers or dates. */
  const asText: Array<[TabName, number]> = [
    [TABS.products, PRODUCT_COLS.productId],
    [TABS.products, PRODUCT_COLS.variantSku],
    [TABS.reactions, 2], // product_id
    [TABS.reactionsArchive, 2],
    [TABS.customers, 0], // slug
    [TABS.auditLog, 4], // target_id
  ];
  for (const [tab, column] of asText) {
    requests.push({
      repeatCell: {
        range: { sheetId: await sheetId(tab), startColumnIndex: column, endColumnIndex: column + 1 },
        ...textFormat,
      },
    });
  }
  await client.batchUpdate(requests);

  const protections = await client.getSpreadsheet('sheets.properties,sheets.protectedRanges');
  const protectedDescriptions = new Set(
    (protections.sheets ?? []).flatMap((sh) =>
      ((sh as { protectedRanges?: Array<{ description?: string }> }).protectedRanges ?? []).map(
        (p) => p.description ?? '',
      ),
    ),
  );
  const wanted: Array<{ description: string; range: Record<string, number> }> = [
    {
      description: 'Reactions is append-only — the site writes here; never edit or sort it',
      range: { sheetId: await sheetId(TABS.reactions), startRowIndex: 0, endRowIndex: 1 },
    },
    {
      description: 'Visits is append-only — the site writes here',
      range: { sheetId: await sheetId(TABS.visits), startRowIndex: 0, endRowIndex: 1 },
    },
    {
      description: 'AuditLog is append-only; written by the admin',
      range: { sheetId: await sheetId(TABS.auditLog) },
    },
    {
      description: 'Customers: password hashes — never edit by hand',
      range: { sheetId: await sheetId(TABS.customers), startRowIndex: 0, endRowIndex: 1 },
    },
    {
      description: 'Settings header (keys are read by the admin)',
      range: { sheetId: await sheetId(TABS.settings), startRowIndex: 0, endRowIndex: 1 },
    },
  ];
  const protReq = wanted
    .filter((w) => !protectedDescriptions.has(w.description))
    .map((w) => ({
      addProtectedRange: {
        protectedRange: { range: w.range, description: w.description, warningOnly: true },
      },
    }));
  if (protReq.length) await client.batchUpdate(protReq);

  // 5. Seed Rates and Settings when empty
  const [ratesData, rugsData, settingsData] = await client.batchGet([
    `${TABS.rates}!A2:D`,
    `${TABS.products}!A2:A`,
    `${TABS.settings}!A2:D`,
  ]);
  const now = new Date().toISOString();
  if (!ratesData?.values?.length) {
    await client.valuesUpdate(
      `${TABS.rates}!A2:D${1 + RATES_SEED.length}`,
      RATES_SEED.map(([c, r, sym]) => [c, r, sym, now] as CellValue[]),
      'RAW',
    );
    console.log(`Seeded Rates with the reference values (${RATES_SEED.map(([c]) => c).join(', ')})`);
  }
  if (!settingsData?.values?.length) {
    await client.valuesUpdate(
      `${TABS.settings}!A2:D${1 + SETTINGS_SEED.length}`,
      SETTINGS_SEED.map(([k, v]) => [k, v, now, 'sheet:init'] as CellValue[]),
      'RAW',
    );
    console.log(`Seeded Settings (${SETTINGS_SEED.map(([k]) => k).join(', ')})`);
  }
  console.log(
    `Admin tabs: ${adminTabsFound.length ? `found ${adminTabsFound.join(', ')}` : 'none found'}` +
      `${adminTabsCreated.length ? `; created ${adminTabsCreated.join(', ')}` : ''}`,
  );

  // 6. Seed rugs/collections/tags when Rugs has no data rows
  const seedMode = flag('seed') ?? 'live';
  if (!rugsData?.values?.length && seedMode !== 'none') {
    const legacy = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as { rugs?: LegacyRug[] };
    const seed = buildSeed(legacy.rugs ?? [], now);
    const n = seed.products.length;
    await client.valuesUpdate(`${TABS.products}!A2:AP${n + 1}`, seed.products, 'RAW');
    await client.valuesUpdate(
      `${TABS.collections}!A2:G${seed.collections.length + 1}`,
      seed.collections,
      'RAW',
    );
    await client.valuesUpdate(`${TABS.tags}!A2:D${seed.tags.length + 1}`, seed.tags, 'RAW');
    console.log(
      `Seeded ${n} rugs, ${seed.collections.length} collections, ${seed.tags.length} tags from ${SEED_FILE}`,
    );
    for (const note of seed.notes) console.log(`  note: ${note}`);
  } else if (rugsData?.values?.length) {
    console.log(`Rugs already has ${rugsData.values.length} data row(s); seed skipped`);
  }

  // 7. Verify the header row reads back exactly as the contract expects
  const [check] = await client.batchGet([`${TABS.products}!A1:AP1`]);
  const header = (check?.values?.[0] ?? []).map((c) =>
    String(c ?? '')
      .trim()
      .toLowerCase(),
  );
  const bad = HEADERS.Products.map((h, i) =>
    header[i] === h ? null : `${columnLetter(i)}: "${header[i] ?? ''}" ≠ "${h}"`,
  ).filter(Boolean);
  if (bad.length) throw new Error(`Products header mismatch: ${bad.slice(0, 5).join('; ')}`);
  console.log(`Products header OK (${PRODUCT_WIDTH} columns)`);

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
