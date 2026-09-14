// Every component in src/components/ui is either used, or declared as built-ahead-of-its-screen.
//
// This project built the whole Figma component set before the screens that consume it, so "unused"
// is a normal and temporary state — but silently unused is how a parallel system starts. Two of them
// (UnitToggle, CurrencyPicker) had already become duplicates of a shipping control before anyone
// noticed, and were removed on 2026-09-14.
//
// So the rule is not "everything must be used". It is "nothing is unused by accident": a component
// with no consumer has to be listed below, with the Figma node it implements and the screen that
// will consume it. A new orphan fails this test and has to be justified in one line.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * Components with no consumer yet, each with the node it implements and what will use it.
 *
 * Removing an entry means the component is now used. Adding one means accepting that it ships
 * unreferenced — which is only reasonable while the screen it belongs to is genuinely still to come.
 */
const AWAITING_SCREEN: Record<string, string> = {
  ImageGallery:
    'Figma 24:261 — the ADMIN rug gallery (520x640 primary + 72x90 thumbs). Not the customer strip, ' +
    'which is 96x120 in the preview realm (57:243). Consumed by the admin rug detail screen, unbuilt.',
  ProgressStep:
    'Figma 25:100 — one stage row. The fetch modal builds these rows in JS (scripts/admin/fetch-modal.ts) ' +
    'because its five states are constructed, not server-rendered; the CSS this component owns IS what ' +
    'renders there. The component stays for the first server-rendered use (the commit progress of 59:140).',
  SteppedProgress:
    'Figma 25:118 — the stage list wrapper. Same situation as ProgressStep: its CSS renders in the fetch ' +
    'modal today, the component itself awaits a server-rendered consumer.',
  Tag:
    'Figma 17:53 — the chip. Its CSS renders in the fetch modal tag list and the admin chips; the ' +
    'component awaits a server-rendered consumer.',
  Toast:
    'Figma 22:186 — used through its CSS classes by the JS row-builders (scripts/admin/clients.ts, ' +
    'collections.ts). The component awaits a server-rendered consumer.',
  Toggle:
    'Figma 16:88 — the switch. Rendered through its CSS by clientRow() in scripts/admin/clients.ts; the ' +
    'component awaits a server-rendered consumer.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe('the ui component inventory', () => {
  const components = fs
    .readdirSync('src/components/ui')
    .filter((f) => f.endsWith('.astro'))
    .map((f) => f.replace(/\.astro$/, ''));

  const sources = [...walk('src/components'), ...walk('src/pages')].filter((f) => f.endsWith('.astro'));

  /** Components imported by anything other than themselves. */
  const used = new Set<string>();
  for (const file of sources) {
    const css = fs.readFileSync(file, 'utf8');
    for (const name of components) {
      if (file.endsWith(`/ui/${name}.astro`)) continue;
      if (css.includes(`/${name}.astro'`)) used.add(name);
    }
  }

  it('has no component that is unused by accident', () => {
    const orphans = components.filter((c) => !used.has(c) && !(c in AWAITING_SCREEN));
    expect(orphans).toEqual([]);
  });

  it('does not list a component as awaiting a screen once it is actually used', () => {
    // Keeps the list honest in the other direction: a stale entry hides a real orphan behind it.
    const stale = Object.keys(AWAITING_SCREEN).filter((c) => used.has(c));
    expect(stale).toEqual([]);
  });

  it('has no entry naming a component that no longer exists', () => {
    const gone = Object.keys(AWAITING_SCREEN).filter((c) => !components.includes(c));
    expect(gone).toEqual([]);
  });

  it('gives every awaiting component a Figma node and a reason', () => {
    for (const [name, why] of Object.entries(AWAITING_SCREEN)) {
      expect(why, name).toMatch(/Figma \d+:\d+/);
      expect(why.length, name).toBeGreaterThan(60);
    }
  });
});
