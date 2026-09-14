// Phase 4 · live geometry verification against the Figma frames.
//
// Loads the REAL stylesheets into Chromium and measures the admin surfaces at 1440 and 390. This is
// the pixel sweep the static test in tests/unit/styles/admin-geometry.test.ts cannot do: that one
// proves a declaration carries the drawn number, this one proves the number survives the cascade and
// the layout engine.
//
// Motion is disabled on every page. The overlays animate in from translateY(100%) and `@starting-style`
// means a rect read on the first frame is the ENTRY position, not the resting one — which is exactly
// the false failure this script produced before the flag was added.
//
// Deliberately does NOT need the server, Google credentials or the sheet. The markup below is the
// shape each page renders, not a mock of its data — geometry is a property of the CSS, and coupling
// this to a live sheet would make it something nobody can run.
//
//   node scripts/verify-geometry.ts
//
// Exits non-zero on any mismatch, so it can gate a release.
import { chromium } from 'playwright';
import fs from 'node:fs';

const CSS = ['tokens', 'modes', 'controls', 'components', 'admin']
  .map((f) => fs.readFileSync(`src/styles/${f}.css`, 'utf8'))
  .join('\n');

/** One assertion: a measured number against the Figma node that draws it. */
interface Check {
  what: string;
  node: string;
  got: number;
  want: number;
  /** Half-pixel rounding and the 0.8-derived type scale make exact equality the wrong test. */
  tol?: number;
}

const page1440 = `
<div data-mode="admin" class="probe">
  <form class="alogin">
    <div class="alogin__brand"><p class="alogin__wordmark">Serio Ludere</p></div>
    <div class="field"><label class="field__label" for="p">Password</label>
      <div class="input-wrap"><input class="input input--password" id="p" type="password"></div></div>
    <button type="submit" class="btn btn--primary alogin__go">Enter</button>
  </form>

  <div class="cust__stats">
    <div class="statblock"><span class="statblock__label">Sessions</span><span class="statblock__value">7</span></div>
    <div class="statblock"><span class="statblock__label">Liked</span><span class="statblock__value">38</span></div>
    <div class="statblock"><span class="statblock__label">Disliked</span><span class="statblock__value">12</span></div>
    <div class="statblock"><span class="statblock__label">Not yet reviewed</span><span class="statblock__value">362</span></div>
  </div>

  <div class="cust__grid">
    <article class="gcard"><div class="gcard__image"></div><p class="gcard__id">SL-0412</p></article>
    <article class="gcard"><div class="gcard__image"></div><p class="gcard__id">SL-0409</p></article>
  </div>
</div>`;

/** The page styles live in the .astro files, so the two scoped blocks are extracted and inlined. */
function scopedCss(file: string): string {
  const m = /<style>([\s\S]*?)<\/style>/.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1]! : '';
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const checks: Check[] = [];

  const pageCss = [
    scopedCss('src/pages/admin/login.astro'),
    scopedCss('src/pages/admin/clients/[code].astro'),
  ].join('\n');

  const html = (body: string): string =>
    `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}\n${pageCss}\n
     .probe{display:flex;flex-direction:column;gap:40px;padding:0}</style></head>
     <body data-mode="admin">${body}</body></html>`;

  // ---------- 1440 ----------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.setContent(html(page1440));
    const box = async (sel: string): Promise<{ w: number; h: number }> => {
      const b = await page.locator(sel).first().boundingBox();
      return { w: b?.width ?? -1, h: b?.height ?? -1 };
    };

    // A1 · 47:4 — the card is 400 wide.
    checks.push({ what: 'login card width', node: '47:4', got: (await box('.alogin')).w, want: 400 });

    // …and 400 INSIDE its real container. The probe above renders `.alogin` standalone, so it never
    // saw that `.bare` was `max-width: var(--container-xxs)` (440) with two 24px gutters under
    // border-box — which clamped the drawn 400 to 392 on the actual page while this check passed.
    // The same rule had no height, so the card sat at the top of an otherwise empty viewport.
    await page.setContent(
      html(`<div class="bare"><main><form class="alogin"><p class="alogin__wordmark">Serio Ludere</p>
            </form></main></div>`),
    );
    const inBare = await page.locator('.alogin').boundingBox();
    checks.push({ what: 'login card width in .bare', node: '47:4', got: inBare?.width ?? -1, want: 400 });
    // Centred, not top-aligned: the card's middle should sit near the middle of the 1000-tall probe.
    checks.push({
      what: 'login card is centred',
      node: '47:3',
      got: Math.round((inBare?.y ?? 0) + (inBare?.height ?? 0) / 2),
      want: 500,
      tol: 40,
    });
    await page.setContent(html(page1440));

    // F5 · 52:1265 — each Stat Block is 200 wide.
    checks.push({ what: 'stat block width', node: '52:1265', got: (await box('.statblock')).w, want: 200 });

    // F5 · 52:1303 — gallery cards are 240 wide with a 300 plate.
    checks.push({ what: 'gallery card width', node: '52:1303', got: (await box('.gcard')).w, want: 240 });
    checks.push({
      what: 'gallery plate height',
      node: '52:1303',
      got: (await box('.gcard__image')).h,
      want: 300,
    });

    // P2 — the `hidden` attribute must actually hide. `[hidden] { display: none }` is a USER-AGENT
    // rule, so `.grid { display: grid }` silently beat it and view-switch.ts's `grid.hidden = true`
    // did nothing: the default list view rendered every rug twice, once as a row and once as a card.
    // Only a real cascade can prove this — the unit test read the `.hidden` PROPERTY, which was
    // correctly `true` the whole time.
    await page.setContent(
      html(`<div id="table"><table class="rugtable"><tbody><tr><td>x</td></tr></tbody></table></div>
            <div id="grid" class="grid" hidden><article class="card">x</article></div>`),
    );
    const gridDisplay = await page.locator('#grid').evaluate((e) => getComputedStyle(e).display);
    checks.push({
      what: 'hidden grid is really hidden',
      node: 'P2 79:1344',
      got: gridDisplay === 'none' ? 1 : 0,
      want: 1,
    });
    await page.setContent(html(page1440));

    // F5 · 52:1261 — the four blocks sit on one row 16 apart.
    const b0 = await page.locator('.statblock').nth(0).boundingBox();
    const b1 = await page.locator('.statblock').nth(1).boundingBox();
    checks.push({
      what: 'stat block gap',
      node: '52:1261',
      got: (b1?.x ?? 0) - ((b0?.x ?? 0) + (b0?.width ?? 0)),
      want: 16,
    });
    await page.close();
  }

  // ---------- 390 ----------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.setContent(html(page1440));

    // MF4 · 111:2955 — the four blocks go 2x2, 175 wide with an 8 gutter inside the 358 of content.
    // The probe has no page gutter, so the column is 391/2 rather than 175; what is verified is the
    // SHAPE (two per row, equal, 8 apart), which is what the frame actually constrains.
    const a = await page.locator('.statblock').nth(0).boundingBox();
    const b = await page.locator('.statblock').nth(1).boundingBox();
    const c = await page.locator('.statblock').nth(2).boundingBox();
    checks.push({ what: 'MF4 stats are two per row', node: '111:2955', got: b?.y ?? -1, want: a?.y ?? -2 });
    checks.push({ what: 'MF4 stats wrap after two', node: '111:2961', got: c?.x ?? -1, want: a?.x ?? -2 });
    checks.push({
      what: 'MF4 stat gutter',
      node: '111:2958',
      got: (b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0)),
      want: 8,
    });
    checks.push({
      what: 'MF4 stats equal width',
      node: '111:2955',
      got: b?.width ?? -1,
      want: a?.width ?? -2,
    });

    // MF4 · 111:2977 — the gallery is two columns.
    const g0 = await page.locator('.gcard').nth(0).boundingBox();
    const g1 = await page.locator('.gcard').nth(1).boundingBox();
    checks.push({
      what: 'MF4 gallery is two columns',
      node: '111:2977',
      got: g1?.y ?? -1,
      want: g0?.y ?? -2,
    });

    // MC2/MF2/MF3 — the modal becomes a bottom sheet.
    await page.setContent(
      html(`<dialog class="modal" open style="position:fixed"><div class="modal__body">x</div></dialog>`),
    );
    const sheet = await page.locator('.modal').boundingBox();
    checks.push({ what: 'modal is full width at 390', node: '112:3200', got: sheet?.width ?? -1, want: 390 });
    checks.push({
      what: 'modal is anchored to the bottom',
      node: '112:3200',
      got: Math.round((sheet?.y ?? 0) + (sheet?.height ?? 0)),
      want: 844,
      tol: 2,
    });
    await page.close();
  }

  await browser.close();

  let failed = 0;
  for (const c of checks) {
    const tol = c.tol ?? 0.6;
    const ok = Math.abs(c.got - c.want) <= tol;
    if (!ok) failed += 1;
    const mark = ok ? 'ok  ' : 'FAIL';
    console.log(`${mark} ${c.what.padEnd(32)} ${String(c.got).padStart(8)}  want ${c.want}   (${c.node})`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} geometry checks passed`);
  if (failed) process.exitCode = 1;
}

void main();
