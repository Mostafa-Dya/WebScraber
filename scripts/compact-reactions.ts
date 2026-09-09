// Compacts the Reactions tab (brief §3 rule 3): rewrites it keeping only the latest event per
// (customer_slug, product_id). Superseded rows are copied to ReactionsArchive first, so nothing is
// lost, then the tab is rewritten from the survivors.
//
//   npm run reactions:compact                 compact now
//   npm run reactions:compact -- --dry-run    report only
//
// Manual, never automatic, never while a buyer is active: the tab is rewritten in place, so a write
// landing mid-compaction would be lost. Run it when the log is large or reads feel slow.
//
// The compaction itself lives in src/lib/sheets/compact.ts, shared with the admin action
// `POST /api/admin/compact-reactions` (brief §14). This file is the CLI wrapper: env, flags, output.
import { SheetsClient } from '../src/lib/sheets/client.ts';
import { compactReactions } from '../src/lib/sheets/compact.ts';
import { authFromEnv, sheetIdFromEnv } from '../src/lib/sheets/config.ts';
import { PRODUCT_HEADER_LABELS } from '../src/lib/sheets/contract.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import { flag } from './lib/env.ts';

export { planCompaction, type CompactPlan } from '../src/lib/sheets/compact.ts';

async function main(): Promise<void> {
  const dryRun = flag('dry-run') === 'true';
  const client = new SheetsClient({
    spreadsheetId: sheetIdFromEnv(process.env),
    auth: authFromEnv(process.env),
    logger: consoleLogger,
  });

  const result = await compactReactions(client, { dryRun });
  if (result.read === 0) {
    console.log('Reactions has no data rows; nothing to compact');
    return;
  }
  console.log(
    `${result.read} rows → ${result.kept} current, ${result.read - result.kept} superseded` +
      ` (${PRODUCT_HEADER_LABELS.length} product columns unaffected)`,
  );
  if (result.alreadyCompact) {
    console.log('Already compact.');
    return;
  }
  if (dryRun) {
    console.log('--dry-run: nothing written');
    return;
  }
  console.log(`Archived ${result.archived} superseded rows; Reactions now holds ${result.kept}.`);
}

if (process.argv[1]?.endsWith('compact-reactions.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
