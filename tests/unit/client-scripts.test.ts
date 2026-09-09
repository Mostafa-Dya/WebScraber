// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPrefs, readTable, render } from '../../src/scripts/prefs.ts';
import { initTabs } from '../../src/scripts/tabs.ts';
import { ReactionBuffer, bindVotes, paint, readSaved } from '../../src/scripts/votes.ts';

function page(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('votes.ts', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => {
    unbind?.();
    unbind = undefined;
  });

  /** Runs the buffer timer synchronously so a test never waits 2.5 s. */
  const timers = () => {
    const queue: Array<() => void> = [];
    return {
      setTimer: (fn: () => void) => {
        queue.push(fn);
        return queue.length;
      },
      clearTimer: (h: number) => {
        queue[h - 1] = () => {};
      },
      run: () => {
        const pending = queue.splice(0);
        for (const fn of pending) fn();
      },
    };
  };

  const okResponse = (results: unknown[]) =>
    new Response(JSON.stringify({ ok: true, results }), { status: 200 });

  it('migrates the legacy sl-saved format and reads states', () => {
    localStorage.setItem(
      'sl-saved',
      JSON.stringify({ 'SL-1': true, 'SL-2': false, 'SL-3': 'disliked', 'SL-4': 'liked' }),
    );
    expect(readSaved()).toEqual({ 'SL-1': 'liked', 'SL-3': 'disliked', 'SL-4': 'liked' });
    localStorage.setItem('sl-saved', '{not json');
    expect(readSaved()).toEqual({});
  });

  it('keeps only the newest intent per product and the state the burst started from', () => {
    const buffer = new ReactionBuffer();
    buffer.add({ productId: 'SL-1', reaction: 'like', source: 'card', previous: 'none' });
    buffer.add({ productId: 'SL-1', reaction: 'none', source: 'card', previous: 'liked' });
    buffer.add({ productId: 'SL-2', reaction: 'dislike', source: 'detail', previous: 'none' });
    expect(buffer.size).toBe(2);
    const items = buffer.take();
    expect(buffer.size).toBe(0);
    expect(items).toEqual([
      // The newest reaction wins, but `previous` is still the pre-burst state, so a failed flush
      // reverts to what the visitor saw before their first tap.
      { productId: 'SL-1', reaction: 'none', source: 'card', previous: 'none' },
      { productId: 'SL-2', reaction: 'dislike', source: 'detail', previous: 'none' },
    ]);
  });

  it('buffers a burst into ONE request and reconciles state and counts from the response', async () => {
    page(`
      <div class="like" >
        <button data-vote="like" data-rug="SL-1" data-source="card" aria-pressed="false"></button>
      </div>
      <button data-vote="dislike" data-rug="SL-2" data-source="detail" aria-pressed="false"></button>
      <div class="rating" data-rating-for="SL-1" hidden></div>`);
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return okResponse([
        { productId: 'SL-1', state: 'liked', likes: 3, dislikes: 1, rating: 3.75 },
        { productId: 'SL-2', state: 'disliked', likes: 0, dislikes: 1, rating: 0 },
      ]);
    }) as unknown as typeof fetch;
    const t = timers();
    unbind = bindVotes({ fetchImpl, ...t });
    const like = document.querySelector<HTMLButtonElement>('[data-vote="like"]')!;
    const dislike = document.querySelector<HTMLButtonElement>('[data-vote="dislike"]')!;
    like.click();
    like.click(); // changed their mind…
    like.click(); // …and back again, still one row
    dislike.click();
    expect(like.getAttribute('aria-pressed')).toBe('true'); // painted with no request yet
    expect(fetchImpl).not.toHaveBeenCalled(); // nothing leaves before the window closes
    t.run();
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      items: [
        { productId: 'SL-1', reaction: 'like', source: 'card' },
        { productId: 'SL-2', reaction: 'dislike', source: 'detail' },
      ],
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-rating-for="SL-1"]')?.textContent).toBe('3.8 · 4 votes'),
    );
    expect(readSaved()).toEqual({ 'SL-1': 'liked', 'SL-2': 'disliked' });
  });

  it('holds the optimistic state and retries when the flush fails transiently', async () => {
    // The Figma component documentation is explicit: "the optimistic state is HELD and a 12px alert
    // glyph appears. Retry is automatic." A rate limit or a dropped network must not silently undo
    // what the buyer tapped.
    page(`<div class="pv-react" data-react data-rug="SL-1">
      <button data-vote="like" data-rug="SL-1" aria-pressed="false"></button>
    </div>`);
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1)
        return new Response(JSON.stringify({ ok: false, error: 'too many reactions' }), { status: 429 });
      return new Response(
        JSON.stringify({
          ok: true,
          results: [{ productId: 'SL-1', state: 'liked', likes: 1, dislikes: 0, rating: 5 }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const t = timers();
    unbind = bindVotes({ fetchImpl, ...t });
    const like = document.querySelector<HTMLButtonElement>('button')!;
    const group = document.querySelector<HTMLElement>('[data-react]')!;
    like.click();
    expect(like.getAttribute('aria-pressed')).toBe('true');
    // Buffered but not stored: marked, and never announced.
    expect(like.dataset.sync).toBe('');
    expect(group.dataset.syncing).toBe('');
    t.run();
    await vi.waitFor(() => expect(group.dataset.failed).toBe(''));
    // Held, not reverted.
    expect(like.getAttribute('aria-pressed')).toBe('true');
    expect(readSaved()).toEqual({ 'SL-1': 'liked' });
    // The retry was scheduled; running it clears both marks.
    t.run();
    await vi.waitFor(() => expect(group.dataset.failed).toBeUndefined());
    expect(calls).toBe(2);
    expect(like.dataset.sync).toBeUndefined();
  });

  it('undoes the batch only when the server rejects it outright', async () => {
    page(`<div class="pv-react" data-react data-rug="SL-1">
      <button data-vote="like" data-rug="SL-1" aria-pressed="false"></button>
    </div>`);
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: false, error: 'bad request' }), { status: 400 }),
    ) as unknown as typeof fetch;
    const t = timers();
    unbind = bindVotes({ fetchImpl, ...t });
    const like = document.querySelector<HTMLButtonElement>('button')!;
    like.click();
    t.run();
    await vi.waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('false'));
    expect(readSaved()).toEqual({});
    // A permanent rejection is not retried.
    t.run();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('flushes through sendBeacon when the tab is hidden, so an unload never drops a reaction', () => {
    page(`<button data-vote="like" data-rug="SL-1" aria-pressed="false"></button>`);
    const beacon = vi.fn((_url: string, _body: BodyInit) => true);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const t = timers();
    unbind = bindVotes({ fetchImpl, beacon, ...t });
    document.querySelector<HTMLButtonElement>('button')!.click();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]?.[0]).toBe('/api/reactions');
    expect(fetchImpl).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    // The buffer was emptied by the beacon: the idle timer has nothing left to send.
    t.run();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('defaults the source to card and maps a cleared state to a `none` event', async () => {
    localStorage.setItem('sl-saved', JSON.stringify({ 'SL-1': 'liked' }));
    page(`<button data-vote="like" data-rug="SL-1" aria-pressed="true"></button>`);
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return okResponse([{ productId: 'SL-1', state: 'none', likes: 0, dislikes: 0, rating: 0 }]);
    }) as unknown as typeof fetch;
    const t = timers();
    unbind = bindVotes({ fetchImpl, ...t });
    document.querySelector<HTMLButtonElement>('button')!.click();
    t.run();
    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ items: [{ productId: 'SL-1', reaction: 'none', source: 'card' }] });
    expect(readSaved()).toEqual({});
  });

  it('paint() only touches the matching rug', () => {
    page(`<button data-vote="like" data-rug="a"></button><button data-vote="like" data-rug="b"></button>`);
    paint('a', 'liked');
    const [a, b] = document.querySelectorAll('button');
    expect(a?.getAttribute('aria-pressed')).toBe('true');
    expect(b?.getAttribute('aria-pressed')).toBeNull();
  });
});

describe('tabs.ts', () => {
  const nav = `
    <nav id="nav"><button data-collection="classics" class="on" aria-selected="true" tabindex="0">Classics</button>
    <button data-collection="kilims" class="" aria-selected="false" tabindex="-1">Kilims</button></nav>
    <div data-card data-collection="classics"></div><div data-card data-collection="kilims" hidden></div>`;
  it('activates the tab from ?collection= and filters cards', () => {
    page(nav);
    const win = {
      location: { href: 'http://localhost/?collection=kilims', search: '?collection=kilims' },
      history: { replaceState: vi.fn() },
    } as unknown as Window;
    initTabs(document, win);
    const [c, k] = document.querySelectorAll('#nav button');
    expect(k?.classList.contains('on')).toBe(true);
    expect(k?.getAttribute('aria-selected')).toBe('true');
    expect(c?.classList.contains('on')).toBe(false);
    const cards = document.querySelectorAll<HTMLElement>('[data-card]');
    expect(cards[0]?.hidden).toBe(true);
    expect(cards[1]?.hidden).toBe(false);
  });
  it('drops an unknown ?collection= from the address bar and shows the first tab', () => {
    page(nav);
    const replaceState = vi.fn();
    const win = {
      location: { href: 'http://localhost/?collection=gone', search: '?collection=gone' },
      history: { replaceState },
    } as unknown as Window;
    initTabs(document, win);
    expect(document.querySelector('#nav button')?.classList.contains('on')).toBe(true);
    expect(replaceState).toHaveBeenCalled();
    expect(String(replaceState.mock.calls[0]?.[2])).not.toContain('collection=');
  });
  it('clicking a tab updates the URL and hides the other cards', () => {
    page(nav);
    const replaceState = vi.fn();
    const win = {
      location: { href: 'http://localhost/', search: '' },
      history: { replaceState },
    } as unknown as Window;
    initTabs(document, win);
    document.querySelectorAll<HTMLButtonElement>('#nav button')[1]!.click();
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain('collection=kilims');
    expect(document.querySelector<HTMLElement>('[data-card][data-collection="classics"]')?.hidden).toBe(true);
  });
});

describe('prefs.ts', () => {
  const dom = `
    <script type="application/json" id="sl-rates">{"rates":{"USD":1,"MXN":17.5},"symbols":{"USD":"$","MXN":"$"}}</script>
    <div class="toggle" id="unitTog"><button data-u="cm" class="on" aria-pressed="true">cm</button><button data-u="ft" aria-pressed="false">ft</button></div>
    <select class="cur" id="cur"><option>USD</option><option>MXN</option><option>EUR</option></select>
    <li data-dims data-w="135" data-l="190">135 × 190 cm</li>
    <div class="price" data-price data-usd="576">$576</div>`;
  it('readTable falls back to USD and render() switches units and currencies', () => {
    page(dom);
    const table = readTable();
    expect(table.rates.MXN).toBe(17.5);
    render('ft', 'MXN', table);
    expect(document.querySelector('[data-dims]')?.textContent).toBe(`4' 5" × 6' 3"`);
    expect(document.querySelector('[data-price]')?.textContent).toMatch(/^\$10[,.\s]?080$/);
    page('');
    expect(readTable()).toEqual({ rates: { USD: 1 }, symbols: { USD: '$' } });
  });
  it('restores stored preferences, disables currencies the sheet lacks, falls back to USD', () => {
    page(dom);
    localStorage.setItem('sl-unit', 'ft');
    localStorage.setItem('sl-cur', 'EUR'); // not in the table
    initPrefs();
    const select = document.getElementById('cur') as HTMLSelectElement;
    expect(select.value).toBe('USD');
    expect([...select.options].find((o) => o.value === 'EUR')?.disabled).toBe(true);
    expect(document.querySelector('button[data-u="ft"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-dims]')?.textContent).toContain(`4' 5"`);
    select.value = 'MXN';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem('sl-cur')).toBe('MXN');
    expect(document.querySelector('[data-price]')?.textContent).toMatch(/10[,.\s]?080/);
  });
});
