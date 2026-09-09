// Live read/write round-trip against the development sheet (Phase 2 checkpoint evidence).
//   npm run sheet:roundtrip                     read → insert vote → recount → undo
//   npm run sheet:roundtrip -- --check-containment   also probe that a content write is refused
import { SheetsClient } from '../src/lib/sheets/client.ts';
import { authFromEnv, sheetIdFromEnv } from '../src/lib/sheets/config.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import { flag } from './lib/env.ts';
import { runRoundTrip } from './lib/roundtrip.ts';

async function main(): Promise<void> {
  const client = new SheetsClient({
    spreadsheetId: sheetIdFromEnv(process.env),
    auth: authFromEnv(process.env),
    logger: consoleLogger,
  });
  const result = await runRoundTrip(client, {
    log: (l) => console.log(l),
    checkContainment: flag('check-containment') === 'true',
  });
  process.exit(result.ok ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
