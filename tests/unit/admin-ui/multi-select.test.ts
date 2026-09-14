// @vitest-environment happy-dom
// The collections multi-select (src/components/ui/MultiSelect.astro + scripts/ui/multi-select.ts).
//
// <details> and real checkboxes carry open/close, keyboard activation and the accessible name, so
// there is nothing to test there — the platform owns it. What IS worth guarding is the handful of
// behaviours this module adds, and the one it deliberately declines to add: closing on select.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindMultiSelects, multiSelectValues, setMultiSelect } from '../../../src/scripts/ui/multi-select.ts';

const off: Array<() => void> = [];
afterEach(() => {
  while (off.length) off.pop()?.();
});

/** The markup MultiSelect.astro renders, trimmed to what the script touches. */
function option(id: string, value: string, checked = false): string {
  return `<label class="check msel__opt" for="${id}">
    <input class="check__box" type="checkbox" id="${id}" name="collection" value="${value}"${checked ? ' checked' : ''}>
    <span>${value}</span>
  </label>`;
}

beforeEach(() => {
  document.body.innerHTML = `
    <div class="msel" id="f_collection" data-multi-select data-placeholder="Collections…">
      <details class="msel__wrap">
        <summary class="msel__trigger">
          <span class="msel__value is-empty" data-msel-value>Collections…</span>
        </summary>
        <div class="msel__panel" role="group" aria-label="Collections">
          ${option('o_kilims', 'Kilims')}${option('o_tulu', 'Tulu')}${option('o_antique', 'Antique')}
        </div>
      </details>
    </div>
    <button type="button" id="outside">elsewhere</button>`;
});

const root = (): HTMLElement => document.getElementById('f_collection')!;
const details = (): HTMLDetailsElement => root().querySelector('details')!;
const summaryText = (): string => root().querySelector('[data-msel-value]')!.textContent!.trim();
const moreText = (): string | null => root().querySelector('[data-msel-more]')?.textContent?.trim() ?? null;
const box = (value: string): HTMLInputElement =>
  root().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
const tick = (value: string, on = true): void => {
  const b = box(value);
  b.checked = on;
  b.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('the summary line', () => {
  it('shows the placeholder while nothing is chosen', () => {
    off.push(bindMultiSelects());
    expect(summaryText()).toBe('Collections…');
    expect(moreText()).toBeNull();
  });

  it('names the single choice, with no count beside it', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    expect(summaryText()).toBe('Kilims');
    expect(moreText()).toBeNull();
  });

  it('names the first and counts the rest — the trigger has room for one label', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    tick('Antique');
    expect(summaryText()).toBe('Kilims');
    expect(moreText()).toBe('+1');
  });

  it('drops the count back to nothing when the extras are unticked', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    tick('Tulu');
    expect(moreText()).toBe('+1');
    tick('Tulu', false);
    expect(moreText()).toBeNull();
    expect(summaryText()).toBe('Kilims');
  });

  it('returns to the placeholder when the last choice is removed', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    tick('Kilims', false);
    expect(summaryText()).toBe('Collections…');
    expect(root().querySelector('[data-msel-value]')!.classList.contains('is-empty')).toBe(true);
  });

  it('corrects a stale server-rendered summary on bind', () => {
    // The page was rendered with a choice already made; the summary must not say "Collections…".
    box('Tulu').checked = true;
    off.push(bindMultiSelects());
    expect(summaryText()).toBe('Tulu');
  });
});

describe('closing', () => {
  it('stays open after a choice — a multi-select that shuts costs a second open for the second pick', () => {
    off.push(bindMultiSelects());
    details().open = true;
    tick('Kilims');
    expect(details().open).toBe(true);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    off.push(bindMultiSelects());
    details().open = true;
    box('Kilims').focus();
    box('Kilims').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(details().open).toBe(false);
    expect(document.activeElement).toBe(root().querySelector('summary'));
  });

  it('closes when a pointer lands outside it', () => {
    off.push(bindMultiSelects());
    details().open = true;
    document.getElementById('outside')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details().open).toBe(false);
  });

  it('does not close when the pointer lands on its own panel', () => {
    off.push(bindMultiSelects());
    details().open = true;
    box('Kilims').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details().open).toBe(true);
  });
});

describe('reading and writing the value', () => {
  it('reports the ticked values in DOM order, not click order', () => {
    off.push(bindMultiSelects());
    tick('Antique');
    tick('Kilims');
    // Kilims is first in the panel, so it is first in the value — the cell order is stable.
    expect(multiSelectValues(root())).toEqual(['Kilims', 'Antique']);
  });

  it('setMultiSelect ticks exactly the named values and refreshes the summary', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    setMultiSelect(root(), ['Tulu', 'Antique']);
    expect(multiSelectValues(root())).toEqual(['Tulu', 'Antique']);
    expect(summaryText()).toBe('Tulu');
    expect(moreText()).toBe('+1');
  });

  it('setMultiSelect matches case-insensitively, because the sheet spelling may differ', () => {
    off.push(bindMultiSelects());
    setMultiSelect(root(), ['kilims']);
    expect(multiSelectValues(root())).toEqual(['Kilims']);
  });

  it('setMultiSelect([]) clears everything back to the placeholder', () => {
    off.push(bindMultiSelects());
    tick('Kilims');
    setMultiSelect(root(), []);
    expect(multiSelectValues(root())).toEqual([]);
    expect(summaryText()).toBe('Collections…');
  });
});

describe('teardown', () => {
  it('stops listening once unbound', () => {
    const stop = bindMultiSelects();
    stop();
    details().open = true;
    document.getElementById('outside')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(details().open).toBe(true);
  });
});
