// The preview header's two variants (Figma 53:35 catalog, 57:226 detail) and their 390 behaviour.
//
// One component serves both screens and three of the fidelity findings live here, so the things
// worth guarding are the ones a shared component gets wrong: that the detail header steps its
// wordmark DOWN (which is what makes it 148 tall, not 152), that the 390 exceptions are scoped to
// the detail variant so the catalog header keeps its hairline and wordmark, and that shipping two
// copies of the back-link label does not change what a screen reader announces.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import PreviewHeader from '../../src/components/customer/PreviewHeader.astro';

const CSS = fs.readFileSync('src/styles/preview.css', 'utf8');

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const catalog = (): Promise<string> =>
  container.renderToString(PreviewHeader, { props: { home: '/abc', displayName: 'Hala' } });

const detail = (): Promise<string> =>
  container.renderToString(PreviewHeader, {
    props: {
      home: '/abc',
      back: { href: '/abc', label: 'Back to the collection', shortLabel: 'Back' },
    },
  });

/** The body of the first `@media (max-width: 767px)` block in preview.css. */
function mobileBlock(): string {
  const at = CSS.indexOf('@media (max-width: 767px)');
  expect(at).toBeGreaterThan(-1);
  return CSS.slice(at, at + 4000);
}

describe('the catalog header (53:35)', () => {
  it('leads with the wordmark at H3 and never names the buyer', async () => {
    const html = await catalog();
    expect(html).toMatch(/class="[^"]*pv-wordmark[^"]*pv-h3/);
    // Figma 53:37 puts the buyer's name on the right of this header. The owner removed it on
    // 2026-09-14 along with the gate greeting; the right-hand slot is now simply empty here.
    expect(html).not.toContain('Hala');
    expect(html).not.toContain('pv-who');
    expect(html).not.toContain('pv-back');
  });

  it('is NOT the detail variant, so the 390 exceptions cannot reach it', async () => {
    expect(await catalog()).not.toContain('pv-header--detail');
  });
});

describe('the detail header (57:226)', () => {
  it('steps the wordmark down to H4 — this is what makes it 148 tall, not 152', async () => {
    const html = await detail();
    expect(html).toMatch(/class="[^"]*pv-wordmark[^"]*pv-h4/);
    expect(html).not.toMatch(/pv-wordmark[^"]*pv-h3/);
  });

  it('marks itself as the detail variant so 390 can drop the hairline and the wordmark', async () => {
    expect(await detail()).toContain('pv-header--detail');
  });

  it('gives the trailing wordmark its own hook, separate from the catalog wordmark', async () => {
    // M3 (58:327) has no wordmark at all; M2 (58:233) keeps one. Hiding `.pv-wordmark` wholesale at
    // 390 would take the catalog's with it.
    expect(await detail()).toContain('pv-wordmark-trailing');
  });
});

describe('the back link at 390 (58:328)', () => {
  it('ships both copies and lets the breakpoint choose', async () => {
    const html = await detail();
    expect(html).toContain('Back to the collection');
    expect(html).toMatch(/class="pv-back-short"[^>]*>\s*Back\s*</);
  });

  it('announces the FULL copy at every width, whichever span is painted', async () => {
    const html = await detail();
    // Both spans are aria-hidden, so the anchor's own label is the only accessible name — the
    // screen reader never hears the truncated "Back".
    expect(html).toMatch(/<a[^>]*class="pv-back"[^>]*aria-label="Back to the collection"/);
    expect(html).toMatch(/class="pv-back-long" aria-hidden="true"/);
    expect(html).toMatch(/class="pv-back-short" aria-hidden="true"/);
  });

  it('omits the short span entirely when no shortLabel is given', async () => {
    const html = await container.renderToString(PreviewHeader, {
      props: { home: '/abc', back: { href: '/abc', label: 'Back to the collection' } },
    });
    expect(html).not.toContain('pv-back-short');
    expect(html).toContain('Back to the collection');
  });
});

describe('the 390 exceptions are scoped to the detail variant', () => {
  it('drops the hairline only for the detail header', () => {
    const m = mobileBlock();
    expect(m).toMatch(/\.pv-header--detail\s*\{[^}]*border-bottom:\s*0/);
    // A bare `.pv-header { border-bottom: 0 }` would take the catalog header's rule with it.
    expect(m).not.toMatch(/\.pv-header\s*\{[^}]*border-bottom:\s*0/);
  });

  it('drops only the trailing wordmark, never the catalog one', () => {
    const m = mobileBlock();
    expect(m).toMatch(/\.pv-header--detail \.pv-wordmark-trailing\s*\{[^}]*display:\s*none/);
    expect(m).not.toMatch(/\.pv-header \.pv-wordmark\s*\{[^}]*display:\s*none/);
  });
});
