// Side-by-side screenshots: the reference page (reference/catalogue.html, which loads its data from
// the legacy Apps Script) and the new site, at the same viewport, plus the detail page and a mobile
// view of the index (docs/DESIGN.md §9 #26). Output in docs/screenshots/.
//
//   npm run shots                         (expects the site at http://localhost:4321; `npm run preview` first)
//   npm run shots -- --site=http://127.0.0.1:4399 --width=1280 --height=900
//
// Requires: npm i -D playwright && npx playwright install chromium
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { flag } from './lib/env.ts';

const OUT = resolve(process.cwd(), 'docs/screenshots');
const site = flag('site') ?? 'http://localhost:4321';
const width = Number(flag('width') ?? 1280);
const height = Number(flag('height') ?? 900);
const reference = pathToFileURL(resolve(process.cwd(), 'reference/catalogue.html')).toString();

async function shoot(
  url: string,
  file: string,
  waitFor: string,
  viewport = { width, height },
): Promise<string | null> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForSelector(waitFor, { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1500); // fonts + lazy images
    await page.screenshot({ path: resolve(OUT, file), fullPage: true });
    console.log(`saved docs/screenshots/${file}  (${url})`);
    return await page.evaluate(
      () => document.querySelector('.card:not([hidden]) a.nm-link')?.getAttribute('href') ?? null,
    );
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await shoot(reference, 'reference.png', '.card, .state');
  const detailHref = await shoot(site + '/', 'site.png', '.card, .state');
  await shoot(site + '/?collection=kilims', 'site-kilims.png', '.card, .state');
  if (detailHref) await shoot(site + detailHref, 'site-detail.png', '.hero, .state');
  await shoot(site + '/', 'site-mobile.png', '.card, .state', { width: 390, height: 844 });
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
