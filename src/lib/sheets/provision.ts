// Structuring a catalogue spreadsheet — the seven phases that turn an empty Google Sheet into one
// this app can read and write.
//
// Extracted from `scripts/init-sheet.ts`, which is now a thin CLI over it, so that the ADMIN can run
// the same steps. That matters because the person setting the site up is usually the studio, not a
// developer: they connect Google on the deployed site and press one button. Two copies of this logic
// — one for the terminal, one for the button — would drift within a release, and the failure mode is
// a sheet that looks initialised and is not.
//
// Everything here is IDEMPOTENT. Tabs are created only when missing, headers only written where the
// row is blank, seeds only applied to empty tabs. Running it twice is how you repair a sheet whose
// first run failed halfway.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSeed, type LegacyRug } from '../../../scripts/lib/seed.ts';
import { BADGE_TAG_NAMES } from '../view.ts';
import { slugify } from '../text.ts';
import { columnLetter } from './parse.ts';
import { collectionsUpgradeRequests, isLegacyCollectionsHeader } from './upgrade.ts';
import type { SheetsClient, CellValue, SpreadsheetInfo } from './client.ts';
import {
  HEADERS,
  PRODUCT_COLS,
  PRODUCT_HEADER_LABELS,
  PRODUCT_WIDTH,
  RATES_SEED,
  SETTINGS_SEED,
  TABS,
  type TabName,
} from './contract.ts';

/** Every tab this app owns, including the admin's (docs/ADMIN_SPEC.md §3.2). */
export const ALL_TABS: TabName[] = [
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

/**
 * A comma-decimal locale changes Google Sheets' formula syntax, so the array formulas this app
 * installs would be written and silently not compute. Checked before anything is created.
 */
export function assertPeriodDecimalLocale(info: SpreadsheetInfo, allow = false): void {
  const locale = info.properties?.locale ?? 'unknown';
  if (allow || PERIOD_DECIMAL_LOCALES.test(locale)) return;
  throw new Error(
    `Sheet locale "${locale}" uses a comma decimal separator, which changes the formula syntax. ` +
      'Set File › Settings › Locale to "United States".',
  );
}

export interface ProvisionOptions {
  /** Overwrite a header row that does not match the contract. The CLI's `--force-headers`. */
  forceHeaders?: boolean;
  /**
   * 'live' imports the twenty reference rugs; 'none' builds the structure and imports nothing.
   *
   * The admin always passes 'none'. Nobody wants twenty demo rugs in a client's catalogue, and the
   * badge tags the corner badge depends on are written either way — they are contract, not samples.
   */
  seed?: 'live' | 'none';
  /** Progress, one line at a time. The CLI prints it; the endpoint collects it for the response. */
  log?: (message: string) => void;
}

/**
 * Brings `client`'s spreadsheet up to the contract. `info` is its `getSpreadsheet()` result, which
 * the caller has already read (to check the locale before committing to anything).
 *
 * Throws on a header mismatch, or on a Products header that does not read back correctly — a
 * half-structured sheet must fail loudly rather than be handed to the studio as ready.
 */
export async function provisionSheet(
  client: SheetsClient,
  info: SpreadsheetInfo,
  opts: ProvisionOptions = {},
): Promise<void> {
  const log = opts.log ?? ((): void => {});
  // 1. Tabs
  const existing = new Set((info.sheets ?? []).map((s) => s.properties.title));
  const missing = ALL_TABS.filter((t) => !existing.has(t));
  if (missing.length) {
    await client.batchUpdate(missing.map((title) => ({ addSheet: { properties: { title } } })));
    client.forgetSheetIds();
    log(`Created tab(s): ${missing.join(', ')}`);
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
    log(`Upgraded ${TABS.collections} to the brief layout (name/slug swapped, created_at inserted)`);
  }

  for (let i = 0; i < ALL_TABS.length; i++) {
    const tab = ALL_TABS[i]!;
    const expected = HEADERS[tab];
    const actual = normalise(headerRows[i]?.values?.[0]);
    const empty = actual.every((c) => c === '');
    const matches = expected.every((h, j) => actual[j] === h);
    if (matches) continue;
    if (!empty && !opts.forceHeaders) {
      throw new Error(
        `Tab "${tab}" has a header row that does not match the contract (got: ${actual.join(' | ')}). ` +
          'Fix the headers in the sheet or re-run with --force-headers to overwrite row 1.',
      );
    }
    const labels = LABELLED_HEADERS[tab] ?? expected;
    await client.valuesUpdate(headerRanges[i]!, [labels.slice()], 'RAW');
    log(`Wrote headers for ${tab}`);
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
    log(`Widened ${TABS.products} to ${PRODUCT_WIDTH} columns`);
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
  const [ratesData, rugsData, settingsData, tagsData] = await client.batchGet([
    `${TABS.rates}!A2:D`,
    `${TABS.products}!A2:A`,
    `${TABS.settings}!A2:D`,
    `${TABS.tags}!A2:D`,
  ]);
  const now = new Date().toISOString();
  if (!ratesData?.values?.length) {
    await client.valuesUpdate(
      `${TABS.rates}!A2:D${1 + RATES_SEED.length}`,
      RATES_SEED.map(([c, r, sym]) => [c, r, sym, now] as CellValue[]),
      'RAW',
    );
    log(`Seeded Rates with the reference values (${RATES_SEED.map(([c]) => c).join(', ')})`);
  }
  if (!settingsData?.values?.length) {
    await client.valuesUpdate(
      `${TABS.settings}!A2:D${1 + SETTINGS_SEED.length}`,
      SETTINGS_SEED.map(([k, v]) => [k, v, now, 'sheet:init'] as CellValue[]),
      'RAW',
    );
    log(`Seeded Settings (${SETTINGS_SEED.map(([k]) => k).join(', ')})`);
  }
  log(
    `Admin tabs: ${adminTabsFound.length ? `found ${adminTabsFound.join(', ')}` : 'none found'}` +
      `${adminTabsCreated.length ? `; created ${adminTabsCreated.join(', ')}` : ''}`,
  );

  // 6. Seed rugs/collections/tags when Rugs has no data rows
  const seedMode = opts.seed ?? 'live';
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
    log(
      `Seeded ${n} rugs, ${seed.collections.length} collections, ${seed.tags.length} tags from ${SEED_FILE}`,
    );
    for (const note of seed.notes) log(`  note: ${note}`);
  } else if (rugsData?.values?.length) {
    log(`Rugs already has ${rugsData.values.length} data row(s); seed skipped`);
  }

  /*
   * The badge tags are STRUCTURE, not sample data, so they are written whatever the seed mode.
   *
   * `badgesFor()` keys the Signed / Antique corner badge off a rug's TAGS (owner requirement,
   * 2026-09-13). `--seed=none` is the right flag for a real catalogue — nobody wants twenty demo
   * rugs in a client's sheet — but it skipped the Tags write with everything else, so the studio got
   * a sheet on which that feature could never work: no Tags row, no chip in the rug form, no way to
   * apply it, no badge. The tag set is a contract the code depends on; the rug set is not.
   *
   * Idempotent: existing Tags rows are read first and only the missing badge names are appended, so
   * re-running this never duplicates a tag or disturbs one the studio has coloured.
   */
  // A2:D, so these are data rows with no header; column C (index 2) is the tag NAME.
  const seededTags = seedMode !== 'none' && !rugsData?.values?.length;
  const tagRows = seededTags ? [] : (tagsData?.values ?? []);
  const haveTags = new Set(
    tagRows.map((row) => String(row?.[2] ?? '').trim().toLowerCase()).filter(Boolean),
  );
  // buildSeed already wrote them in the seeded case; only the --seed=none path needs this.
  const missingBadges = seededTags
    ? []
    : BADGE_TAG_NAMES.filter((n) => !haveTags.has(n.toLowerCase()));
  if (missingBadges.length) {
    const firstFree = tagRows.length + 2;
    await client.valuesUpdate(
      `${TABS.tags}!A${firstFree}:D${firstFree + missingBadges.length - 1}`,
      missingBadges.map((name) => [slugify(name), slugify(name), name, '']),
      'RAW',
    );
    log(`Added badge tag(s): ${missingBadges.join(', ')}`);
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
  log(`Products header OK (${PRODUCT_WIDTH} columns)`);
}
