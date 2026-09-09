// @vitest-environment happy-dom
// Client behaviour added by the design pass (docs/DESIGN.md §10.1): plate states, tab feedback,
// vote feedback classes, bfcache repaint, and the pre-paint standfirst toggle.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPhotos } from '../../src/scripts/photos.ts';
import { initTabs } from '../../src/scripts/tabs.ts';
import { bindVotes, paintCounts } from '../../src/scripts/votes.ts';

const prepaint = readFileSync(resolve(process.cwd(), 'src/scripts/prepaint.js'), 'utf8');

function page(html: string): void {
  document.body.innerHTML = html;
}
function sized(img: HTMLImageElement, w: number, h: number): HTMLImageElement {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
  return img;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('photos.ts plate states', () => {
  it('turns a landscape file of a portrait rug, reveals the plate, and empties it on error', () => {
    page(`
      <div class="photo" data-plate id="p1"><img data-rug-img data-plate-img data-rot="1"><div class="ph">photo to come</div></div>
      <div class="photo" data-plate id="p2"><img data-rug-img data-plate-img data-rot="0"><div class="ph">photo to come</div></div>`);
    initPhotos(document);
    const p1 = document.getElementById('p1')!;
    const img1 = sized(p1.querySelector('img')!, 800, 600);
    img1.dispatchEvent(new Event('load'));
    expect(img1.classList.contains('rot')).toBe(true);
    expect(img1.classList.contains('loaded')).toBe(true);
    expect(p1.classList.contains('is-loaded')).toBe(true);
    expect(p1.getAttribute('aria-busy')).toBe('false');
    const p2 = document.getElementById('p2')!;
    p2.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(p2.querySelector('img')).toBeNull();
    expect(p2.classList.contains('is-empty')).toBe(true);
  });
  it('handles images inserted after init (delegation) and ignores non-driving layers', () => {
    page(`<div class="hero" data-plate id="h"></div>`);
    initPhotos(document);
    const h = document.getElementById('h')!;
    const alt = document.createElement('img');
    alt.dataset.rugImg = '';
    alt.dataset.rot = '0';
    h.append(alt);
    sized(alt, 600, 800).dispatchEvent(new Event('load'));
    expect(alt.classList.contains('loaded')).toBe(true);
    expect(h.classList.contains('is-loaded')).toBe(false); // no data-plate-img: never drives the plate
    const base = document.createElement('img');
    base.dataset.rugImg = '';
    base.dataset.plateImg = '';
    base.dataset.rot = '0';
    h.append(base);
    sized(base, 600, 800).dispatchEvent(new Event('load'));
    expect(h.classList.contains('is-loaded')).toBe(true);
  });
});

describe('tabs.ts design feedback', () => {
  const dom = `
    <nav id="nav"><button data-collection="classics" class="on" aria-selected="true" tabindex="0">Classics<span class="n">1</span></button>
    <button data-collection="kilims" class="" aria-selected="false" tabindex="-1">Kilims<span class="n">1</span></button><span class="ink"></span></nav>
    <section class="lede"><div data-standfirst data-collection="classics"></div><div data-standfirst data-collection="kilims" hidden></div></section>
    <p id="grid-live"></p>
    <div id="grid"><div data-card data-collection="classics"></div><div data-card data-collection="kilims" hidden></div></div>`;
  it('announces the result, settles the grid, swaps the standfirst and keeps history.state', () => {
    page(dom);
    const replaceState = vi.fn();
    const win = {
      location: { href: 'http://localhost/', search: '' },
      history: { replaceState, state: { scroll: 1 } },
    } as unknown as Window;
    initTabs(document, win);
    expect(document.getElementById('grid')?.classList.contains('is-settled')).toBe(false);
    document.querySelectorAll<HTMLButtonElement>('#nav button')[1]!.click();
    expect(document.getElementById('grid-live')?.textContent).toBe('1 rug shown · Kilims');
    expect(document.getElementById('grid')?.classList.contains('is-settled')).toBe(true);
    const firsts = document.querySelectorAll<HTMLElement>('[data-standfirst]');
    expect(firsts[0]?.hidden).toBe(true);
    expect(firsts[1]?.hidden).toBe(false);
    expect(replaceState.mock.calls.at(-1)?.[0]).toEqual({ scroll: 1 });
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain('collection=kilims');
  });
});

describe('votes.ts design feedback', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => {
    unbind?.();
    unbind = undefined;
  });
  it('marks the clicked button for the pop/nod animation and ticks the rating line', async () => {
    page(
      `<button data-vote="like" data-rug="SL-1" aria-pressed="false"></button><div class="rating" data-rating-for="SL-1" hidden></div>`,
    );
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          results: [{ productId: 'SL-1', state: 'liked', likes: 1, dislikes: 0, rating: 5 }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    // Flush immediately instead of waiting out the 2.5 s buffer window.
    unbind = bindVotes({ fetchImpl, setTimer: (fn) => (fn(), 1), clearTimer: () => {} });
    const like = document.querySelector<HTMLButtonElement>('button')!;
    like.click();
    expect(like.classList.contains('just')).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('.rating')?.textContent).toBe('5.0 · 1 vote'));
    expect(document.querySelector('.rating')?.classList.contains('tick')).toBe(true);
    paintCounts('SL-1', 0, 0, 0);
    expect(document.querySelector<HTMLElement>('.rating')?.hidden).toBe(true);
  });
  it('repaints saved votes after a bfcache restore', () => {
    page(
      `<button data-vote="like" data-rug="SL-1" aria-pressed="false"></button><button data-vote="dislike" data-rug="SL-2" aria-pressed="true"></button>`,
    );
    unbind = bindVotes({ fetchImpl: fetch });
    localStorage.setItem('sl-saved', JSON.stringify({ 'SL-1': 'liked' })); // voted on the detail page meanwhile
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    const [like, dislike] = document.querySelectorAll('button');
    expect(like?.getAttribute('aria-pressed')).toBe('true');
    expect(dislike?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('prepaint.js standfirst toggle', () => {
  it('shows the standfirst of the deep-linked collection before first paint', () => {
    page(`
      <nav id="nav"><button data-collection="classics" class="on"></button><button data-collection="kilims"></button></nav>
      <div data-standfirst data-collection="classics"></div><div data-standfirst data-collection="kilims" hidden></div>
      <div data-card data-collection="classics"></div><div data-card data-collection="kilims" hidden></div>`);
    history.replaceState(null, '', '/?collection=kilims');
    new Function(prepaint)();
    const firsts = document.querySelectorAll<HTMLElement>('[data-standfirst]');
    expect(firsts[0]?.hidden).toBe(true);
    expect(firsts[1]?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-card][data-collection="kilims"]')?.hidden).toBe(false);
    history.replaceState(null, '', '/');
  });
});
