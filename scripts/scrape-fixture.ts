// Saves a supplier product page / Shopify payload through the scraper's own fetch layer into
// tests/fixtures/scrape/ (docs/ADMIN_SPEC.md Phase 9). Usage:
//   node scripts/scrape-fixture.ts <product url> [--jina] [--out <dir>]
// ECG → <out>/ecg-<sku>.html; KV → <out>/kv-<handle>.js.json, .json and .html.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { detectSupplier } from '../src/lib/scrape/detect.ts';
import { fetchText } from '../src/lib/scrape/fetch.ts';
import { fetchViaJina } from '../src/lib/scrape/jina.ts';
import { consoleLogger } from '../src/lib/sheets/errors.ts';
import type { FetchedText } from '../src/lib/scrape/types.ts';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function save(dir: string, name: string, res: FetchedText): void {
  const path = join(dir, name);
  writeFileSync(path, res.body, 'utf8');
  console.log(
    `${res.status} ${res.via.padEnd(6)} ${String(Buffer.byteLength(res.body)).padStart(8)} B  ${res.hops} hop(s)  → ${path}`,
  );
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    console.error('usage: node scripts/scrape-fixture.ts <product url> [--jina] [--out <dir>]');
    process.exit(2);
  }
  const useJina = process.argv.includes('--jina');
  const dir = resolve(arg('--out') ?? 'tests/fixtures/scrape');
  mkdirSync(dir, { recursive: true });
  const det = detectSupplier(url);
  if ('error' in det) {
    console.error(`cannot use that link: ${det.error}`);
    process.exit(1);
  }
  const opts = { logger: consoleLogger };
  if (det.supplier === 'ecarpetgallery') {
    const res = useJina
      ? await fetchViaJina(det.htmlUrl, opts)
      : await fetchText(det.htmlUrl, 'impit', { ...opts, kind: 'html' });
    save(dir, `ecg-${det.sku}.html`, res);
    return;
  }
  save(dir, `kv-${det.handle}.js.json`, await fetchText(det.jsUrl, 'impit', { ...opts, kind: 'json' }));
  save(dir, `kv-${det.handle}.json`, await fetchText(det.jsonUrl, 'impit', { ...opts, kind: 'json' }));
  save(dir, `kv-${det.handle}.html`, await fetchText(det.htmlUrl, 'impit', { ...opts, kind: 'html' }));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  process.exit(1);
});
