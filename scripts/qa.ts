// Browser QA against the built server (docs/DESIGN.md §10.2). CSP is inert in `astro dev`, so run
// `npm run build && npm start` first, then `npm run qa -- --site=http://127.0.0.1:4321`.
// Checks: no CSP violations, no console errors, CLS < 0.02, route cache MISS→HIT, no inline styles in
// the served HTML, the reduced-motion path (no entrance animation, no GSAP chunk, no morph name),
// a view-transition navigation smoke, keyboard reach, and the plate/aria-busy hooks.
import { chromium, type Page } from 'playwright';
import { flag } from './lib/env.ts';

const site = (flag('site') ?? 'http://127.0.0.1:4321').replace(/\/$/, '');
const results: Array<{ name: string; ok: boolean; note: string }> = [];
const check = (name: string, ok: boolean, note = ''): void => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const INIT = `
  window.__qa = { csp: [], cls: 0 };
  document.addEventListener('securitypolicyviolation', (e) => window.__qa.csp.push(e.violatedDirective + ' ' + (e.blockedURI || e.sourceFile || '')));
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__qa.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
`;

interface Qa {
  csp: string[];
  cls: number;
}
const qa = (page: Page): Promise<Qa> => page.evaluate(() => (window as unknown as { __qa: Qa }).__qa);

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    // ---- 1–3, 5, 7: full motion path ----
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const requests: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    page.on('request', (r) => requests.push(r.url()));

    const first = await page.goto(site + '/', { waitUntil: 'networkidle' });
    const second = await page.request.get(site + '/');
    check(
      'route cache fills then HITs on /',
      ['MISS', 'STALE', 'HIT'].includes(first?.headers()['x-astro-cache'] ?? '') &&
        second.headers()['x-astro-cache'] === 'HIT',
      `${first?.headers()['x-astro-cache']} → ${second.headers()['x-astro-cache']}`,
    );
    const html = await second.text();
    check('served HTML has no inline styles', !/ style="/.test(html) && !/<meta http-equiv/.test(html));
    check('cross-document view transitions available', await page.evaluate(() => 'onpageswap' in window));

    await page.hover('#nav button');
    await page.waitForTimeout(600);
    const gsapLoaded = requests.some((u) => /gsap|Flip/i.test(u));
    const tabs = await page.$$('#nav button');
    if (tabs.length > 1) {
      await tabs[1]!.click();
      await page.waitForTimeout(700);
      const live = await page.textContent('#grid-live');
      check(
        'tab click announces and reflows',
        /rugs? shown/.test(live ?? ''),
        `${live} (gsap chunk loaded: ${gsapLoaded})`,
      );
      const inkOn = await page.$eval('#nav', (n) => n.classList.contains('has-ink'));
      check('ink bar enabled', inkOn);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const pendingSeen = await page.$$eval('[data-plate]', (els) =>
      els.some((e) => e.getAttribute('aria-busy') !== null),
    );
    check('plates carry aria-busy state', pendingSeen);
    const home = await qa(page);
    check('index: no CSP violations', home.csp.length === 0, home.csp.slice(0, 3).join(' | '));
    check('index: CLS < 0.02', home.cls < 0.02, home.cls.toFixed(4));

    // Fresh index (first tab) so a card with a photo is visible for the morph + lightbox checks.
    await page.goto(site + '/', { waitUntil: 'networkidle' });
    const link =
      (await page.$('.card:not([hidden]):has(.photo img) a.nm-link')) ??
      (await page.$('.card:not([hidden]) a.nm-link'));
    check('a visible card link exists', Boolean(link));
    if (link) {
      const name = (await link.textContent())?.trim();
      const href = await link.getAttribute('href');
      if (href) await page.request.get(site + href); // warm the route cache: a transition is skipped when the new page takes > 4 s
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), link.click()]);
      const h1 = (await page.textContent('h1.nm'))?.trim();
      check('detail page opens with the card name', h1 === name, `${name} → ${h1}`);
      const vt = await page.evaluate(() => document.documentElement.classList.contains('vt'));
      check('detail arrived through a view transition', vt);
      const detailHit = await page.request.get(page.url());
      check(
        'detail route cached after first render',
        detailHit.headers()['x-astro-cache'] === 'HIT',
        detailHit.headers()['x-astro-cache'],
      );
      if (await page.$('.hero-open')) {
        await page.click('.hero-open');
        await page.waitForTimeout(300);
        const open = await page.$eval('#lightbox', (d) => (d as HTMLDialogElement).open);
        check('lightbox opens', open);
        const focused = await page.evaluate(() => document.activeElement?.className ?? '');
        check('focus lands on the close button', focused === 'lb-close', focused);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const closed = await page.$eval('#lightbox', (d) => !(d as HTMLDialogElement).open);
        check('Escape closes the lightbox', closed);
      } else {
        check('lightbox skipped (rug without photo)', true);
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      const detail = await qa(page);
      check('detail: no CSP violations', detail.csp.length === 0, detail.csp.slice(0, 3).join(' | '));
      check('detail: CLS < 0.02', detail.cls < 0.02, detail.cls.toFixed(4));
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.goBack()]);
      const gridBack = await page.$('#grid');
      check('Back restores the index grid', Boolean(gridBack));
    }
    check(
      'no console errors on the motion path',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '),
    );

    // ---- 6: keyboard reach ----
    await page.goto(site + '/', { waitUntil: 'networkidle' });
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return a
            ? `${a.tagName.toLowerCase()}${a.className ? '.' + String(a.className).split(' ')[0] : ''}${a.id ? '#' + a.id : ''}`
            : '';
        }),
      );
    }
    check(
      'keyboard: wordmark → units → currency → active tab',
      order[0] === 'a.home' &&
        order[1]?.startsWith('button') === true &&
        order[3]?.startsWith('select.cur') === true &&
        order[4]?.startsWith('button') === true,
      order.join(' > '),
    );
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const activeAfterKey = await page.$eval('#nav button.on', (b) => b.getAttribute('data-collection'));
    check(
      'ArrowRight moves the active tab',
      activeAfterKey !== null &&
        activeAfterKey !== (await page.$eval('#nav button', (b) => b.getAttribute('data-collection'))),
      activeAfterKey ?? '',
    );
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    check('focus ring visible on the active tab', ring !== 'none', ring);
    await ctx.close();

    // ---- 4: reduced motion ----
    const ctx2 = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    await ctx2.addInitScript(INIT);
    const p2 = await ctx2.newPage();
    const reqs2: string[] = [];
    p2.on('request', (r) => reqs2.push(r.url()));
    await p2.goto(site + '/', { waitUntil: 'networkidle' });
    const anim = await p2.$eval('.card:not([hidden])', (c) => getComputedStyle(c).animationName);
    check('reduced motion: no card entrance animation', anim === 'none', anim);
    await p2.hover('#nav button');
    const t2 = await p2.$$('#nav button');
    if (t2.length > 1) await t2[1]!.click();
    await p2.waitForTimeout(600);
    check('reduced motion: GSAP never requested', !reqs2.some((u) => /gsap|Flip/i.test(u)));
    const named = await p2.$$eval(
      '[data-plate]',
      (els) => els.filter((e) => (e as HTMLElement).style.getPropertyValue('view-transition-name')).length,
    );
    check('reduced motion: no element named for a morph', named === 0);
    await ctx2.close();
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
