// Lists rugs whose Drive photos do not answer 200 (ADR D6): forgotten "Anyone with the link"
// sharing, deleted files or pasted junk. `npm run check:photos`.
import { SheetsClient } from '../src/lib/sheets/client.ts';
import { authFromEnv, sheetIdFromEnv } from '../src/lib/sheets/config.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import { fetchSnapshot } from '../src/lib/sheets/read.ts';
import { driveImageUrl } from '../src/lib/images.ts';

async function head(url: string): Promise<{ status: number; type: string }> {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    return { status: r.status, type: r.headers.get('content-type') ?? '' };
  } catch (e) {
    return { status: 0, type: e instanceof Error ? e.name : 'error' };
  }
}

async function main(): Promise<void> {
  const client = new SheetsClient({
    spreadsheetId: sheetIdFromEnv(process.env),
    auth: authFromEnv(process.env),
    logger: consoleLogger,
  });
  const snap = await fetchSnapshot(client);
  let checked = 0;
  let failing = 0;
  for (const rug of snap.catalogue.rugs) {
    if (rug.status !== 'active') continue;
    if (rug.photos.length === 0) {
      console.log(`no photo   ${rug.id}  ${rug.name}`);
      continue;
    }
    for (const id of rug.photos) {
      checked++;
      const { status, type } = await head(driveImageUrl(id, 800));
      const ok = status === 200 && type.startsWith('image/');
      if (!ok) {
        failing++;
        console.log(
          `FAIL ${String(status).padStart(3)} ${rug.id}  ${rug.name}  ${id}  (${type || 'no content-type'})`,
        );
      }
    }
  }
  for (const w of snap.report.warnings.filter((x) => x.issues.some((i) => i.startsWith('photos:')))) {
    console.log(`warning row ${w.row}: ${w.issues.filter((i) => i.startsWith('photos:')).join('; ')}`);
  }
  console.log(`${checked} photo(s) checked, ${failing} failing`);
  process.exit(failing ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
