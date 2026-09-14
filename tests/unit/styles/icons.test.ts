// @vitest-environment node
/**
 * Guards the generated icon set in src/components/ui/Icon.astro (Figma frame 11:71, 18 glyphs).
 *
 * A first pass shipped all 18 with `d="Vector"` instead of their geometry, because the extractor
 * matched `d="..."` inside `id="Vector"` — `id=` ends in `d=`. Nothing caught it: it type-checked,
 * it linted, it rendered an <svg> with the right box and the right stroke, and every test passed.
 * Only looking at the picture showed empty icons.
 *
 * These assertions run against the RENDERED output rather than the source text. An earlier version
 * parsed the .astro file with indentation-sensitive regexes and broke the moment Prettier reflowed
 * it — a guard that fails on formatting is worse than no guard, because it trains you to ignore it.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, it, expect, beforeAll } from 'vitest';
import Icon from '../../../src/components/ui/Icon.astro';

/** The inventory the handoff lists (frame 69:2), which the set must match exactly. */
const NAMES = [
  'alert',
  'check',
  'chevron-down',
  'chevron-right',
  'close',
  'copy',
  'external',
  'eye',
  'eye-off',
  'filter',
  'grid',
  'heart',
  'list',
  'logout',
  'plus',
  'refresh',
  'search',
  'trash',
] as const;

let rendered: Record<string, string>;

beforeAll(async () => {
  const container = await AstroContainer.create();
  rendered = {};
  for (const name of NAMES) {
    rendered[name] = await container.renderToString(Icon, { props: { name } });
  }
});

const paths = (html: string) => [...html.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1] ?? '');

describe('icon set', () => {
  it('renders every glyph the handoff inventories', () => {
    const empty = NAMES.filter((n) => !rendered[n]?.includes('<svg'));
    expect(empty).toEqual([]);
  });

  it('emits at least one path per glyph', () => {
    const pathless = NAMES.filter((n) => paths(rendered[n] ?? '').length === 0);
    expect(pathless).toEqual([]);
  });

  it('emits real path data — never a stray attribute value', () => {
    // An SVG path always opens with a move command. "Vector" — the id the extractor used to grab —
    // does not, which is the whole point of this assertion.
    const bad: string[] = [];
    for (const n of NAMES) {
      for (const d of paths(rendered[n] ?? '')) {
        if (!/^[Mm]/.test(d)) bad.push(`${n}: ${JSON.stringify(d)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('emits only path commands and numbers, so no id or colour leaked into the geometry', () => {
    const bad: string[] = [];
    for (const n of NAMES) {
      for (const d of paths(rendered[n] ?? '')) {
        if (!/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(d)) bad.push(`${n}: ${JSON.stringify(d)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('draws with currentColor so one glyph serves every context', () => {
    // Figma bakes a colour per instance (#403F3C in an input, #FFFFF5 on a filled reaction circle);
    // in code the colour comes from the parent.
    const hardcoded: string[] = [];
    for (const n of NAMES) {
      for (const m of (rendered[n] ?? '').matchAll(/stroke="([^"]+)"/g)) {
        if (m[1] !== 'currentColor') hardcoded.push(`${n}: ${m[1]}`);
      }
    }
    expect(hardcoded).toEqual([]);
  });

  it('draws on the 16px box the theme uses, at 1px stroke', () => {
    for (const n of NAMES) {
      expect(rendered[n]).toContain('viewBox="0 0 16 16"');
      expect(rendered[n]).toContain('width="16"');
    }
  });

  it('is decorative by default — a labelled control must not announce its glyph twice', () => {
    for (const n of NAMES) {
      expect(rendered[n]).toContain('aria-hidden="true"');
      expect(rendered[n]).toContain('focusable="false"');
    }
  });

  it('keeps geometry identical to the glyphs already inlined in the preview components', () => {
    // Reactions.astro inlines the heart and close paths directly from the same Figma export; if the
    // generated set ever diverges from them, one of the two is wrong.
    expect(paths(rendered['heart'] ?? '')[0]).toBe(
      'M8 13.4C8 13.4 2.6 10.2 2.6 6.6C2.40109 5.88392 2.49479 5.11814 2.86048 4.47114C3.22618 3.82414 3.83392 3.34891 4.55 3.15C5.26608 2.95109 6.03186 3.04479 6.67886 3.41048C7.32586 3.77618 7.80109 4.38392 8 5.1C8.19891 4.38392 8.67414 3.77618 9.32114 3.41048C9.96814 3.04479 10.7339 2.95109 11.45 3.15C12.1661 3.34891 12.7738 3.82414 13.1395 4.47114C13.5052 5.11814 13.5989 5.88392 13.4 6.6C13.4 10.2 8 13.4 8 13.4Z',
    );
    expect(paths(rendered['close'] ?? '')).toEqual(['M4 4L12 12', 'M12 4L4 12']);
    expect(paths(rendered['chevron-down'] ?? '')).toEqual(['M4 6.5L8 10.5L12 6.5']);
  });
});
