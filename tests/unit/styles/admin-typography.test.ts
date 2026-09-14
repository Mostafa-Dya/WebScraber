// The admin shares the app's type system — it is not a separate, older-looking product.
//
// admin.css began as a port of `reference/admin.html` and kept that file's habits long after the
// rest of the app moved onto the Figma tokens: 23 rules set `--mono` at hardcoded 9/10/11/12/13/22px,
// ten of them ALSO uppercase with 0.1-0.28em tracking. Labels, buttons, chips, table headers, help
// text and messages were all tiny uppercase monospace, which is why the panel read as a developer
// tool rather than as the same product as the customer preview.
//
// Two rules come out of that, and this file holds them:
//   1. Monospace is for MACHINE VALUES only — ids, prices, key names, raw JSON, bare numerals.
//   2. Type sizes are tokens. A literal px font-size cannot participate in the mode system, so it
//      silently ignores the admin/admin-dark scale and the mobile step-down.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// Comments are stripped first: the selector capture below runs from the previous `}`, so a rule
// preceded by a comment would otherwise carry that comment inside its selector string.
const CSS = fs.readFileSync('src/styles/admin.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** [selector, declarations] for every rule in the file. */
function rules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out.push([m[1]!.trim().replace(/\s+/g, ' '), m[2]!]);
  }
  return out;
}

/**
 * Selectors allowed to stay monospace, each because it renders a machine value rather than prose.
 * Adding one means arguing it is a value a person copies or compares character by character.
 */
const MONO_ALLOWED = new Set([
  'td.n', // the product ID column
  'td.mono, .mono', // copyable cells
  'td pre', // raw audit JSON
  '.card .pr', // price
  '.card .cnt', // the count badge — a bare numeral
  '.kbd', // key names
  '.stat .v', // a single large number
]);

describe('admin typography', () => {
  const all = rules(CSS);

  it('parses the stylesheet, so nothing below can pass vacuously', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('uses monospace only for machine values', () => {
    const mono = all.filter(([, body]) => body.includes('var(--mono)')).map(([sel]) => sel);
    expect(mono.length).toBeGreaterThan(0); // the allowed ones must still be there
    expect(mono.filter((sel) => !MONO_ALLOWED.has(sel))).toEqual([]);
  });

  it('sets no font-size as a raw px literal', () => {
    const literals = all
      .filter(([, body]) => /font-size:\s*\d+(\.\d+)?px/.test(body))
      .map(([sel, body]) => `${sel} { ${/font-size:\s*[^;]+/.exec(body)?.[0]} }`);
    expect(literals).toEqual([]);
  });

  it('gives inputs and buttons an explicit line-height, so they share a height', () => {
    // Omitting it let the control inherit the ambient value and land 4.4px shorter than the
    // canonical `.input` in controls.css — three control heights on one row instead of two.
    for (const sel of ['input,\nselect,\ntextarea', 'button.go', '.chip']) {
      const rule = all.find(([s]) => s === sel.replace(/\s+/g, ' '));
      expect(rule, sel).toBeDefined();
      expect(rule![1], sel).toMatch(/line-height:\s*var\(--leading-body\)/);
    }
  });
});
