// Phase 4 · geometry verification for the admin screens built on 2026-09-14.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It checks that the geometry-bearing declarations carry the
// numbers the Figma frames draw, at the selector that owns them. It does NOT lay anything out — a
// pixel sweep needs the app running against the real sheet, which needs Google credentials. So this
// catches the failure that actually happened repeatedly during this build (a drawn number quietly
// replaced by a different one, or a token that resolves elsewhere) and not a layout bug.
//
// Every number below is cited to the node it came from, so a future change can be checked against
// the file rather than against this test.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (p: string): string => fs.readFileSync(p, 'utf8');

/** The body of the first `@media (max-width: 767px)` block in `css`, brace-matched. */
function mobileBlock(css: string, from = 0): string {
  const at = css.indexOf('@media (max-width: 767px)', from);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return css.slice(open + 1, i - 1);
}

/** The declarations of the first rule whose selector list contains `selector`. */
function rule(css: string, selector: string): string {
  const re = new RegExp(
    `(^|[},])\\s*([^{}]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*)\\{([^}]*)\\}`,
    'm',
  );
  return re.exec(css)?.[3] ?? '';
}

describe('A1 · Login card (Figma 47:3 / 47:4)', () => {
  const css = read('src/pages/admin/login.astro');

  it('is the drawn 400 wide and never wider than the viewport', () => {
    const r = rule(css, '.alogin');
    expect(r).toMatch(/width:\s*400px/);
    // 47:4 sits at x=520 in a 1440 frame — centred, not positioned.
    expect(r).toMatch(/margin-inline:\s*auto/);
    expect(r).toMatch(/max-width:\s*100%/);
  });

  it('uses the drawn gaps as tokens, not literals', () => {
    const r = rule(css, '.alogin');
    // 47:4 gap is --fieldset-gap (12), which this repo already carries as --stack-md; padding is
    // --section-stack-gap (16), which is --section-gap in admin mode.
    expect(r).toMatch(/gap:\s*var\(--stack-md\)/);
    expect(r).toMatch(/padding:\s*var\(--section-gap\)/);
    expect(r).not.toMatch(/(padding|gap):\s*\d+px/);
  });

  it('sets the wordmark at H3 — 15 in admin, which is what 47:6 draws', () => {
    expect(rule(css, '.alogin__wordmark')).toMatch(/font-size:\s*var\(--h3\)/);
    expect(rule(css, '.alogin__realm')).toMatch(/font-size:\s*var\(--text-xs\)/);
  });
});

describe('F5 · Customer detail (Figma 52:1207)', () => {
  const css = read('src/pages/admin/clients/[code].astro');

  it('gives each Stat Block the drawn 200, on the consumer rather than the component', () => {
    // 52:1265…52:1277 are each 200 wide. The width lives here because MF4 puts the same component
    // on a 2-column grid, and a component carrying one screen's layout cannot do both.
    expect(css).toMatch(/\.cust__stats\s*>\s*\*\s*\{[^}]*width:\s*200px/);
    expect(read('src/styles/components.css')).not.toMatch(/\.statblock\s*\{[^}]*width:\s*200px/);
  });

  it('lays the gallery out in the drawn 240 columns', () => {
    // 52:1292 wraps 240-wide cards with a 16 gap.
    expect(rule(css, '.cust__grid')).toMatch(/repeat\(auto-fill,\s*240px\)/);
    expect(rule(css, '.cust__grid')).toMatch(/gap:\s*var\(--stack-lg\)/);
  });

  it('keeps the plate 300 tall, as drawn', () => {
    expect(rule(css, '.gcard__image')).toMatch(/height:\s*300px/);
  });
});

describe('MF4 · Customer detail at 390 (Figma 111:2947)', () => {
  const css = read('src/pages/admin/clients/[code].astro');
  const m = mobileBlock(css);

  it('puts the four Stat Blocks on a strict 2x2, not a wrap-at-whatever-fits', () => {
    // 111:2955…111:2964: 175 wide at x=0 and x=183, rows at y=0 and y=66. Two columns of 1fr inside
    // the 358 of content is 175 + 8 + 175 exactly, so the fraction IS the drawn width.
    expect(rule(m, '.cust__stats')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(rule(m, '.cust__stats')).toMatch(/gap:\s*var\(--stack-sm\)/);
    // The desktop 200 has to be released or it overflows the column.
    expect(m).toMatch(/\.cust__stats\s*>\s*\*\s*\{[^}]*width:\s*auto/);
  });

  it('drops the gallery to two columns at the same 8 gutter', () => {
    expect(rule(m, '.cust__grid')).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('shortens the meta line and the section qualifier rather than wrapping them', () => {
    // 111:2953 carries only the dates: the URL wraps to three lines at 390 and the session count is
    // already the first Stat Block a thumb-width below.
    expect(m).toMatch(/\.cust__meta-long\s*\{[^}]*display:\s*none/);
    expect(m).toMatch(/\.cust__meta-short\s*\{[^}]*display:\s*inline/);
    expect(m).toMatch(/\.cust__sec-long\s*\{[^}]*display:\s*none/);
    // …and the short copy is the default-hidden one, so desktop pays for no query.
    expect(rule(css, '.cust__meta-short')).toMatch(/display:\s*none/);
  });
});

describe('MF1 · Customers at 390 (Figma 111:2865)', () => {
  const m = mobileBlock(read('src/styles/admin.css'));

  it('turns the table into cards over the same markup', () => {
    expect(m).toMatch(/#clientTable[\s\S]*?display:\s*block/);
    expect(m).toMatch(/#clientTable thead\s*\{[^}]*display:\s*none/);
  });

  it('drops only Created — never a control', () => {
    // 111:2877 draws name + badge, the link, then last-seen beside a copy control. The Active switch
    // and the row buttons are not drawn, but they are the only way to revoke a link or reset a
    // password, so they are kept: a control that exists at one width and silently not at another is
    // a worse failure than a taller card.
    expect(m).toMatch(/#clientTable td:nth-child\(3\)\s*\{[^}]*display:\s*none/);
    for (const n of [1, 2, 4, 5, 6, 7]) {
      expect(m).not.toMatch(new RegExp(`#clientTable td:nth-child\\(${n}\\)\\s*\\{[^}]*display:\\s*none`));
    }
  });
});

describe('the admin mobile shell (Figma 114:3247)', () => {
  const css = read('src/styles/components.css');
  const m = mobileBlock(css, css.indexOf('.shell {'));

  it('reserves room for the 76-tall tab bar so the last row is never under it', () => {
    expect(m).toMatch(/padding-bottom:\s*calc\(76px \+ var\(--inset-tab-bar-bottom\)\)/);
  });
});
