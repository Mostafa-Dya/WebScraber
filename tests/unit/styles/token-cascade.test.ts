// @vitest-environment happy-dom
/**
 * Guards the token layer in src/styles/modes.css against two bug classes that no other test in this
 * repo can see, because both are invisible to `astro check`, to eslint, and to rendering a page.
 *
 * 1. A semantic resolving to the WRONG VALUE in one mode — an override missing from
 *    [data-mode='admin'], or present but pointing at the wrong primitive.
 * 2. A @media block whose selector list LEAKS ACROSS MODES. `data-mode` sits on <html>, which is
 *    also `:root`, so a rule written `:root, [data-mode='preview']` inside a media query matches
 *    the admin root too — at identical specificity (0,1,0), winning on source order. This shipped
 *    once: admin resolved --section-gap to 36px at 900px wide instead of the specified 16px.
 *
 * Part A covers (1) with happy-dom. Part B covers (2) structurally with postcss, because happy-dom
 * does NOT evaluate @media when resolving custom properties — it returns the base value at every
 * viewport, so it cannot see a media-query leak at all. Part A is therefore the DESKTOP contract
 * only; Part B is what keeps the breakpoints honest.
 *
 * Every expected value below is quoted from Figma `07 · Handoff` frame 66:367 ("02 Semantic"),
 * whose columns are Token / Preview / Admin / Admin Dark.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import postcss from 'postcss';

const MODES_CSS = fs.readFileSync('src/styles/modes.css', 'utf8');

/* ── Part A ─────────────────────────────────────────────────────────────────────────────────────
   The 02 Semantic table, transposed. A blank cell means "same as Preview" in the handoff, so it is
   written out explicitly here — an inherited value and a correctly-overridden one must both be
   asserted, or a missing override reads as a pass. */
const EXPECTED: Record<string, [preview: string, admin: string, dark: string]> = {
  // background
  '--canvas': ['#fefcf0', '#f8f7f5', '#141413'],
  '--surface': ['#fffff5', '#ffffff', '#1c1c1c'],
  '--surface-raised': ['#ffffff', '#ffffff', '#403f3c'],
  '--bg-inset': ['#fffff5', '#fefcf0', '#000000'],
  '--subtle': ['#efefef', '#efefef', '#403f3c'],
  // text
  '--ink': ['#000000', '#000000', '#fefcf0'],
  '--ink-soft': ['#403f3c', '#403f3c', '#d8d6cc'],
  '--ink-muted': ['#8c8b84', '#8c8b84', '#8c8b84'],
  '--text-on-action': ['#fffff5', '#fffff5', '#000000'],
  '--text-on-brand': ['#fffff5', '#fffff5', '#fffff5'],
  // action
  '--action-primary': ['#000000', '#000000', '#fffff5'],
  '--action-primary-hover': ['#b80d09', '#b80d09', '#b80d09'],
  '--action-danger': ['#b80d09', '#b80d09', '#b80d09'],
  '--action-danger-hover': ['#9c0b08', '#9c0b08', '#9c0b08'],
  '--brand': ['#b80d09', '#b80d09', '#b80d09'],
  // border — focus is ink in every mode, deliberately NOT the brand red: red is the error colour,
  // and a red focus ring on a red-bordered invalid field is unreadable (handoff 66:440).
  '--rule': ['#d8d6cc', '#d8d6cc', '#403f3c'],
  '--border-strong': ['#1c1c1c', '#1c1c1c', '#8c8b84'],
  '--border-focus': ['#000000', '#000000', '#fffff5'],
  // feedback — dark mode falls back to surface and carries meaning on the hue alone
  '--success': ['#307a07', '#307a07', '#307a07'],
  '--success-bg': ['#d4e3cb', '#d4e3cb', '#1c1c1c'],
  '--warning': ['#ed8a00', '#ed8a00', '#ed8a00'],
  '--warning-bg': ['#fdf1e0', '#fdf1e0', '#1c1c1c'],
  '--danger': ['#cb2b2b', '#cb2b2b', '#cb2b2b'],
  '--danger-bg': ['#f3cccc', '#f3cccc', '#1c1c1c'],
  '--info': ['#1c1c1c', '#1c1c1c', '#d8d6cc'],
  '--info-bg': ['#efefef', '#efefef', '#1c1c1c'],
  // type — Preview labels take the heading Bold the theme uses for buttons; Admin drops to Medium,
  // legible at 12px without shouting across a dense table (handoff 66:542).
  '--weight-label': ['700', '500', '500'],
  '--h1': ['28.8px', '19.8px', '19.8px'],
  '--h2': ['25.2px', '16.2px', '16.2px'],
  '--h3': ['19.8px', '15px', '15px'],
  '--h4': ['16.2px', '13px', '13px'],
  '--text-base': ['13px', '13px', '13px'],
  '--text-lg': ['15px', '13px', '13px'],
  '--size-label': ['12px', '12px', '12px'],
  '--size-mono': ['12px', '12px', '12px'],
  // space — "Admin compresses to 24: this single alias is what makes the tool dense" (66:740)
  '--space-section': ['112px', '24px', '24px'],
  '--section-gap': ['64px', '16px', '16px'],
  '--gutter': ['48px', '24px', '24px'],
  '--space-inline': ['20px', '8px', '8px'],
  '--tight': ['12px', '4px', '4px'],
  '--space-field': ['16px', '12px', '12px'],
  '--space-form': ['20px', '16px', '16px'],
  '--control-x': ['24px', '16px', '16px'],
  // off-grid, carried not rounded (handoff 67:6) — mode-invariant
  '--input-y': ['10.4px', '10.4px', '10.4px'],
  '--input-x': ['12.8px', '12.8px', '12.8px'],
  '--control-gap': ['10px', '10px', '10px'],
  '--checkbox': ['14px', '14px', '14px'],
  // intra-component steps — mode-invariant by design (handoff 161:4583)
  '--stack-xs': ['4px', '4px', '4px'],
  '--stack-sm': ['8px', '8px', '8px'],
  '--stack-md': ['12px', '12px', '12px'],
  '--stack-lg': ['16px', '16px', '16px'],
  '--stack-xl': ['24px', '24px', '24px'],
  '--stack-2xl': ['48px', '48px', '48px'],
  // iOS chrome — "identical in all three modes: the device does not care which mode the app is in"
  '--inset-status-bar': ['44px', '44px', '44px'],
  '--inset-home-indicator': ['34px', '34px', '34px'],
  '--inset-tab-bar-y': ['10px', '10px', '10px'],
  '--inset-tab-bar-bottom': ['20px', '20px', '20px'],
  // shape — the storefront is square-cornered in every mode
  '--radius': ['0', '0', '0'],
  '--radius-pill': ['9999px', '9999px', '9999px'],
  // motion — Preview gets the storefront's real 600ms image reveal; Admin is functional at 150ms
  '--motion-transition': ['0.6s', '0.15s', '0.15s'],
  '--motion-quick': ['0.15s', '0.15s', '0.15s'],
};

const MODES = ['preview', 'admin', 'admin-dark'] as const;
type Mode = (typeof MODES)[number];

/** Column of the 02 Semantic table for a mode. Indexed by name so the tuple access stays total. */
function column(cols: [string, string, string], mode: Mode): string {
  return mode === 'preview' ? cols[0] : mode === 'admin' ? cols[1] : cols[2];
}

function resolveAll(mode: string): Record<string, string> {
  document.head.innerHTML = '';
  document.documentElement.setAttribute('data-mode', mode);
  const style = document.createElement('style');
  style.textContent = MODES_CSS;
  document.head.appendChild(style);
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const token of Object.keys(EXPECTED)) {
    out[token] = cs.getPropertyValue(token).trim().toLowerCase();
  }
  return out;
}

describe('token cascade · resolved semantics per mode (desktop)', () => {
  for (const mode of MODES) {
    it(`${mode} resolves every semantic to its handoff value`, () => {
      const resolved = resolveAll(mode);
      const actual: Record<string, string> = {};
      const want: Record<string, string> = {};
      for (const [token, cols] of Object.entries(EXPECTED)) {
        actual[token] = resolved[token] ?? '<undeclared>';
        want[token] = column(cols, mode);
      }
      expect(actual).toEqual(want);
    });
  }

  it('no semantic resolves to empty — a typo in a var() name fails silently otherwise', () => {
    const empty: string[] = [];
    for (const mode of MODES) {
      for (const [token, value] of Object.entries(resolveAll(mode))) {
        if (value === '') empty.push(`${mode} ${token}`);
      }
    }
    expect(empty).toEqual([]);
  });
});

/* ── Part B ─────────────────────────────────────────────────────────────────────────────────────
   Structural invariants on the @media blocks. happy-dom cannot evaluate these, so they are asserted
   against the parsed stylesheet instead of a rendered one. */

/** Selectors that reach <html data-mode="admin"> / "admin-dark". */
function matchesAdminRoot(selector: string): boolean {
  const s = selector.trim();
  if (s.startsWith('[data-mode=')) {
    return s.includes("'admin'") || s.includes("'admin-dark'");
  }
  if (!s.startsWith(':root')) return false;
  // a bare `:root` matches every root, whatever its data-mode
  const excludesAdmin = s.includes(":not([data-mode='admin'])");
  const excludesDark = s.includes(":not([data-mode='admin-dark'])");
  return !(excludesAdmin && excludesDark);
}

describe('token cascade · @media blocks must not leak across modes', () => {
  const mediaRules: { media: string; selector: string; props: string[] }[] = [];
  beforeAll(() => {
    postcss.parse(MODES_CSS).walkAtRules('media', (at) => {
      at.walkRules((rule) => {
        const props: string[] = [];
        rule.walkDecls((d) => {
          props.push(d.prop);
        });
        for (const selector of rule.selectors) {
          mediaRules.push({ media: at.params, selector, props });
        }
      });
    });
  });

  it('has breakpoints at all — the handoff specifies 1440 / 810 / 390', () => {
    expect(mediaRules.length).toBeGreaterThan(0);
  });

  it('every admin-reaching selector inside @media declares only admin-intended tokens', () => {
    // Tokens the handoff gives a single admin value at EVERY width. Its responsive table (67:87)
    // changes which columns drop and how navigation works at 810/390 — it never restates the admin
    // spacing table or heading ladder. So none of these may be re-declared for an admin root inside
    // a media block, whether deliberately or by a `:root` that forgot to exclude admin.
    const ADMIN_WIDTH_INVARIANT = [
      '--space-section',
      '--section-gap',
      '--gutter',
      '--space-inline',
      '--tight',
      '--space-field',
      '--space-form',
      '--control-x',
      '--h1',
      '--h2',
      '--h3',
      '--h4',
      '--text-lg',
      '--weight-label',
    ];
    const leaks: string[] = [];
    for (const { media, selector, props } of mediaRules) {
      if (!matchesAdminRoot(selector)) continue;
      for (const prop of props) {
        if (ADMIN_WIDTH_INVARIANT.includes(prop)) {
          leaks.push(`@media ${media} { ${selector} { ${prop} } }`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('no @media rule uses a bare :root — it also matches the admin roots', () => {
    const bare = mediaRules
      .filter((r) => r.selector.trim() === ':root')
      .map((r) => `@media ${r.media} { :root }`);
    expect(bare).toEqual([]);
  });
});

/* ── Part C ─────────────────────────────────────────────────────────────────────────────────────
   "Components read SEMANTICS only, never a primitive" (handoff, and the file's own header). A
   component reaching past the semantic layer silently opts out of mode switching.

   The two sets are DERIVED from modes.css rather than hand-listed, because a prefix rule cannot
   separate them: --size-body-base is a primitive while --size-icon, --size-label and --size-mono
   are semantics, and both start "--size-". Everything declared in the first top-level :root rule
   (the 01 PRIMITIVES block) is a primitive; anything declared anywhere else is a semantic and is
   fair game even if it shares a prefix. */
describe('token cascade · the primitive layer stays private', () => {
  let primitives: Set<string>;
  let semantics: Set<string>;

  beforeAll(() => {
    primitives = new Set<string>();
    semantics = new Set<string>();
    const root = postcss.parse(MODES_CSS);
    let seenPrimitiveBlock = false;
    root.walkRules((rule) => {
      // Only top-level rules; rules nested in @media are semantic overrides by construction.
      const isTopLevel = rule.parent?.type === 'root';
      const isPrimitiveBlock = isTopLevel && !seenPrimitiveBlock && rule.selector.trim() === ':root';
      if (isPrimitiveBlock) seenPrimitiveBlock = true;
      rule.walkDecls((decl) => {
        if (!decl.prop.startsWith('--')) return;
        (isPrimitiveBlock ? primitives : semantics).add(decl.prop);
      });
    });
    // A name declared in both layers is reachable as a semantic, so it is not a leak.
    for (const name of semantics) primitives.delete(name);
  });

  it('derives a non-trivial primitive and semantic set from modes.css', () => {
    expect(primitives.size).toBeGreaterThan(50);
    expect(semantics.size).toBeGreaterThan(40);
    // Spot-check the distinction a prefix rule gets wrong.
    expect(primitives.has('--size-body-base')).toBe(true);
    expect(semantics.has('--size-icon')).toBe(true);
    expect(semantics.has('--size-label')).toBe(true);
  });

  it('no stylesheet or component outside modes.css reads a primitive', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/\.(css|astro|ts)$/.test(entry.name)) files.push(full);
      }
    };
    walk('src');

    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('src/styles/modes.css')) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const name = match[1];
        if (name === undefined) continue;
        if (primitives.has(name)) offenders.push(`${file}: ${name}`);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe('token cascade · every token a component reads actually exists', () => {
  /**
   * The sibling test above proves components do not read PRIVATE tokens. It says nothing about
   * whether the tokens they do read are DEFINED anywhere — and an undefined `var(--x)` with no
   * fallback is silent: the declaration is simply dropped, the element renders unstyled, and no
   * tool complains.
   *
   * This caught four real ones on 2026-09-14 (`--display`, `--font-weight-bold`, `--leading-tight`,
   * `--inset`) that had been written into two pages from the Figma handoff's names rather than this
   * repo's. Every one of them would have shipped as a missing font, weight, line-height and
   * background.
   */
  it('no stylesheet or component reads a var() that modes.css never defines', () => {
    const defined = new Set<string>();
    for (const m of MODES_CSS.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) defined.add(m[1]!);
    // tokens.css carries the @font-face layer and any bootstrap values modes.css builds on.
    const tokensCss = fs.existsSync('src/styles/tokens.css')
      ? fs.readFileSync('src/styles/tokens.css', 'utf8')
      : '';
    for (const m of tokensCss.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) defined.add(m[1]!);

    const files = [
      ...fs.readdirSync('src/styles').map((f) => `src/styles/${f}`),
      ...walk('src/components'),
      ...walk('src/pages'),
    ].filter((f) => /\.(css|astro)$/.test(f));

    const offenders: string[] = [];
    for (const file of files) {
      const css = fs.readFileSync(file, 'utf8');
      // Locally declared names are fine — a component may define its own custom property.
      const local = new Set<string>();
      for (const m of css.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)) local.add(m[1]!);
      // `var(--x, fallback)` is deliberate and safe; only the bare form can vanish.
      for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
        const name = m[1]!;
        if (defined.has(name) || local.has(name)) continue;
        offenders.push(`${file}: var(${name})`);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });
});

/** Every file under `dir`, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
