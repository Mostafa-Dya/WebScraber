// @vitest-environment happy-dom
// The inline pre-paint step (src/scripts/prepaint.js) is plain JS inlined by Layout.astro; it must
// make deep links, saved votes and the saved unit/currency correct before the deferred modules run.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/scripts/prepaint.js'), 'utf8');
const run = (): void => {
  new Function(source)();
};

const dom = `
  <script type="application/json" id="sl-rates">{"rates":{"USD":1,"MXN":17.5},"symbols":{"USD":"$","MXN":"$"}}</script>
  <div class="toggle" id="unitTog"><button data-u="cm" class="on" aria-pressed="true">cm</button><button data-u="ft" aria-pressed="false">ft</button></div>
  <select class="cur" id="cur"><option>USD</option><option>MXN</option></select>
  <nav id="nav"><button data-collection="classics" class="on" aria-selected="true" tabindex="0">Classics</button>
  <button data-collection="kilims" class="" aria-selected="false" tabindex="-1">Kilims</button></nav>
  <div data-card data-collection="classics">
    <button data-vote="like" data-rug="SL-1" aria-pressed="false"></button>
    <button data-vote="dislike" data-rug="SL-1" aria-pressed="false"></button>
    <li data-dims data-w="135" data-l="190">135 × 190 cm</li>
    <div class="price" data-price data-usd="576">$576</div>
  </div>
  <div data-card data-collection="kilims" hidden>
    <li data-dims data-w="" data-l="" hidden></li>
    <div class="price" data-price data-usd="" hidden></div>
  </div>`;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = dom;
});

describe('prepaint.js', () => {
  it('leaves the server render untouched for a first-time visitor (cm, USD, no votes)', () => {
    run();
    expect(document.querySelector('[data-dims]')?.textContent).toBe('135 × 190 cm');
    expect(document.querySelector('[data-price]')?.textContent).toBe('$576');
    expect(document.querySelector('button[data-u="cm"]')?.classList.contains('on')).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#cur')?.value).toBe('USD');
    expect(document.querySelector('button[data-vote="like"]')?.getAttribute('aria-pressed')).toBe('false');
  });
  it('restores the saved unit, currency and votes before first paint, exactly as prefs.ts renders them', () => {
    localStorage.setItem('sl-unit', 'ft');
    localStorage.setItem('sl-cur', 'MXN');
    localStorage.setItem('sl-saved', JSON.stringify({ 'SL-1': 'disliked' }));
    run();
    expect(document.querySelector('[data-dims]')?.textContent).toBe(`4' 5" × 6' 3"`);
    expect(document.querySelector('[data-price]')?.textContent).toMatch(/^\$10[,.\s]?080$/);
    expect(document.querySelector('button[data-u="ft"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-u="cm"]')?.classList.contains('on')).toBe(false);
    expect(document.querySelector<HTMLSelectElement>('#cur')?.value).toBe('MXN');
    expect(document.querySelector('button[data-vote="dislike"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-vote="like"]')?.getAttribute('aria-pressed')).toBe('false');
    // Cards without dims or price stay hidden.
    const hidden = document.querySelectorAll('[data-card]')[1]!;
    expect(hidden.querySelector<HTMLElement>('[data-dims]')?.hidden).toBe(true);
    expect(hidden.querySelector<HTMLElement>('[data-price]')?.hidden).toBe(true);
  });
  it('falls back to USD when the saved currency is not offered or has no rate', () => {
    localStorage.setItem('sl-cur', 'EUR');
    run();
    expect(document.querySelector<HTMLSelectElement>('#cur')?.value).toBe('USD');
    expect(document.querySelector('[data-price]')?.textContent).toBe('$576');
  });
  it('survives corrupt storage and a missing rates block', () => {
    localStorage.setItem('sl-saved', '{not json');
    localStorage.setItem('sl-unit', 'ft');
    document.getElementById('sl-rates')?.remove();
    expect(run).not.toThrow();
    expect(document.querySelector('[data-dims]')?.textContent).toBe(`4' 5" × 6' 3"`); // USD default still renders
    expect(document.querySelector('[data-price]')?.textContent).toBe('$576');
  });
});
