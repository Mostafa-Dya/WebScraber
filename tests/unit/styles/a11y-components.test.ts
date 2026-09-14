// @vitest-environment node
/**
 * The accessibility contracts the Figma handoff states explicitly, asserted against rendered markup.
 *
 * From `07 · Handoff`, "Accessibility notes carried into the components":
 *   - Focus is ink at 2px, NEVER the brand red — red is the error colour, and a red ring on a
 *     red-bordered invalid field is unreadable.
 *   - Like/dislike are real focusable buttons with text labels, never icon-only, with pressed state
 *     mapped to aria-pressed; the buffered pending state is deliberately NOT announced.
 *   - Fetch and commit stages announce as they become active.
 *   - The 32px reaction circles are below the 44px touch minimum, so on mobile the hit area is
 *     enlarged to 44 while the visual stays 32.
 *
 * These are the contracts most likely to rot silently: nothing visually breaks when an aria-label
 * disappears or a live region stops being polite.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import Button from '../../../src/components/ui/Button.astro';
import Input from '../../../src/components/ui/Input.astro';
import Toast from '../../../src/components/ui/Toast.astro';
import SteppedProgress from '../../../src/components/ui/SteppedProgress.astro';
import ProgressStep from '../../../src/components/ui/ProgressStep.astro';
import PreviewControls from '../../../src/components/customer/PreviewControls.astro';
import Checkbox from '../../../src/components/ui/Checkbox.astro';
import Toggle from '../../../src/components/ui/Toggle.astro';
import Modal from '../../../src/components/ui/Modal.astro';

const CSS = ['controls', 'components'].map((f) => fs.readFileSync(`src/styles/${f}.css`, 'utf8')).join('\n');

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('focus is ink, never the brand red', () => {
  it('every focus rule uses the focus token, and none names a brand or danger colour', () => {
    const focusRules = CSS.split('}')
      .filter((block) => /:focus(-visible)?/.test(block))
      .map((block) => block + '}');
    expect(focusRules.length).toBeGreaterThan(8);

    const offenders = focusRules.filter((r) => /outline:/.test(r) && !/var\(--border-focus\)/.test(r));
    expect(offenders).toEqual([]);

    // The specific regression this guards: --accent resolves to --brand, which is #B80D09.
    for (const bad of ['var(--accent)', 'var(--brand)', 'var(--danger)', '#b80d09', '#B80D09']) {
      const hits = focusRules.filter((r) => r.includes(bad));
      expect(hits).toEqual([]);
    }
  });
});

describe('every interactive control is labelled and reachable', () => {
  it('an icon-only button carries a visually-hidden text label', async () => {
    const html = await container.renderToString(Modal, { props: { id: 'm', title: 'Regenerate password' } });
    // The close control is a glyph; without the sr-only span it announces as "button".
    expect(html).toMatch(/<button[^>]*class="modal__close"[\s\S]*?<span class="sr-only">Close<\/span>/);
    // And the glyph itself must not be announced twice.
    expect(html).toContain('aria-hidden="true"');
  });

  it('an input is always associated with a real label', async () => {
    const html = await container.renderToString(Input, { props: { name: 'title', label: 'Title' } });
    expect(html).toMatch(/<label class="field__label" for="title">Title<\/label>/);
    expect(html).toMatch(/id="title"/);
  });

  it('an errored input is marked invalid and points at its message', async () => {
    const html = await container.renderToString(Input, {
      props: { name: 'pid', label: 'Product ID', error: 'SL-0412 already exists.' },
    });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="pid-error"');
    expect(html).toMatch(/id="pid-error"/);
  });

  it('a hint is wired as the description when there is no error', async () => {
    const html = await container.renderToString(Input, {
      props: { name: 'pid', label: 'Product ID', hint: 'Must be unique.' },
    });
    expect(html).toContain('aria-describedby="pid-hint"');
  });

  it('a busy button is marked busy and cannot be activated', async () => {
    const html = await container.renderToString(Button, { props: { loading: true } });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
  });
});

describe('state is announced where the handoff says it should be, and not where it says it should not', () => {
  it('commit stages announce politely — not assertively, since a commit takes 5-20s', async () => {
    const html = await container.renderToString(SteppedProgress, {
      props: { label: 'Saving SL-0412' },
      slots: {
        default: await container.renderToString(ProgressStep, {
          props: { state: 'active', label: 'Uploading images' },
        }),
      },
    });
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('aria-live="assertive"');
    expect(html).toContain('aria-label="Saving SL-0412"');
    // The active step is marked, so a reader landing mid-list knows where it is.
    expect(html).toContain('aria-current="step"');
  });

  it('a danger toast interrupts, a success toast does not', async () => {
    const danger = await container.renderToString(Toast, { props: { tone: 'danger' } });
    const success = await container.renderToString(Toast, { props: { tone: 'success' } });
    expect(danger).toContain('aria-live="assertive"');
    expect(danger).toContain('role="alert"');
    expect(success).toContain('aria-live="polite"');
    expect(success).toContain('role="status"');
  });
});

describe('composite widgets expose the keyboard contract the handoff specifies', () => {
  /**
   * The preview's own control strip is the one that ships. It deliberately uses native <select>
   * elements rather than the hand-built listbox the file draws — PreviewControls.astro documents
   * why at length — so the contract to hold it to is "every control is labelled and operable",
   * not "it reproduces the drawn ARIA pattern".
   */
  const controls = async (props: Record<string, unknown> = {}): Promise<string> =>
    container.renderToString(PreviewControls, {
      props: { rates: { rates: { USD: 1, EUR: 0.9 }, symbols: { USD: '$', EUR: '€' } }, ...props },
    });

  it('the unit toggle is a labelled group whose active half is announced', async () => {
    const html = await controls();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Units"');
    // aria-pressed, not aria-checked: these are toggle buttons, not radios.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('the currency picker is a labelled native select, not an unlabelled combobox', async () => {
    const html = await controls();
    expect(html).toMatch(/<select[^>]*id="cur"[^>]*aria-label="Currency"/);
    expect(html).toContain('>USD</option>');
  });

  it('the sort control is labelled, and absent where there is no grid to sort', async () => {
    const withSort = await controls({ sort: true });
    expect(withSort).toMatch(/<select[^>]*id="sortBy"[^>]*aria-label="Sort rugs"/);
    // The detail page renders the same strip; a dead control there would be worse than none.
    expect(await controls()).not.toContain('id="sortBy"');
  });

  it('the toggle is a real switch, so revoking a link survives a page without JS', async () => {
    const html = await container.renderToString(Toggle, { props: { name: 'active', label: 'Link active' } });
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('role="switch"');
  });

  it('a checkbox is a real checkbox wrapped in its label', async () => {
    const html = await container.renderToString(Checkbox, {
      props: { name: 'feat', label: 'Show on preview' },
    });
    expect(html).toMatch(/<label class="check" for="feat">/);
    expect(html).toContain('type="checkbox"');
  });
});

describe('touch targets clear the platform minimum', () => {
  it('the controls that draw smaller than 44px carry a 44px row', () => {
    // Checkbox box is 14px and the radio ring 14px; the ROW is what the finger hits.
    for (const sel of ['.check,', '.radio,', '.toggle {']) {
      expect(CSS).toContain(sel);
    }
    expect(CSS).toMatch(/\.check,\s*\.radio,\s*\.toggle \{[^}]*min-height: 44px/);
  });
});
