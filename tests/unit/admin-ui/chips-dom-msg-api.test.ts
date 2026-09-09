// @vitest-environment happy-dom
// The shared admin client modules (docs/ADMIN_SPEC.md §8.2): chips (aria-pressed toggle, single /
// multi, roving arrow keys), the text-only element builder, the banner, and the JSON client's
// 401 / 409 / Retry-After handling.
import { beforeEach, describe, expect, it } from 'vitest';
import { describe as describeError, get, issuesText, post } from '../../../src/scripts/admin/api.ts';
import { initChips } from '../../../src/scripts/admin/chips.ts';
import { append, byId, el, money, readJson } from '../../../src/scripts/admin/dom.ts';
import { hide, hideVisible, isShown, msg } from '../../../src/scripts/admin/msg.ts';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('chips.ts', () => {
  const html = `
    <div id="c" class="chips">
      <button type="button" class="chip on" data-value="*" aria-pressed="true">All</button>
      <button type="button" class="chip" data-value="kilims" aria-pressed="false">Kilims</button>
      <button type="button" class="chip" data-value="tulu" aria-pressed="false">Tulu</button>
    </div>`;
  it('single mode: one pressed chip, click selects, roving tabindex, arrow keys move focus', () => {
    document.body.innerHTML = html;
    const changes: string[][] = [];
    const group = initChips(byId('c'), { onChange: (v) => changes.push(v) });
    const [all, kilims, tulu] = group.buttons() as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    expect(group.values()).toEqual(['*']);
    expect(all.tabIndex).toBe(0);
    expect(kilims.tabIndex).toBe(-1);
    kilims.click();
    expect(group.values()).toEqual(['kilims']);
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(all.classList.contains('on')).toBe(false);
    expect(kilims.classList.contains('on')).toBe(true);
    expect(kilims.tabIndex).toBe(0);
    kilims.click(); // no allowNone: stays pressed
    expect(group.values()).toEqual(['kilims']);
    expect(changes).toEqual([['kilims'], ['kilims']]);
    kilims.focus();
    kilims.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tulu);
    tulu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(all);
    all.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(tulu);
    expect(group.values()).toEqual(['kilims']); // focus moves, selection does not
    group.set(['tulu']);
    expect(group.values()).toEqual(['tulu']);
    expect(group.has('tulu')).toBe(true);
    expect(group.has('nope')).toBe(false);
  });
  it('multi mode toggles independently and `add` appends a chip', () => {
    document.body.innerHTML = html.replace('class="chips"', 'class="chips" data-multi="true"');
    const group = initChips(byId('c'));
    const [, kilims, tulu] = group.buttons() as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    kilims.click();
    tulu.click();
    expect(group.values()).toEqual(['*', 'kilims', 'tulu']);
    kilims.click();
    expect(group.values()).toEqual(['*', 'tulu']);
    const added = group.add('Plant Dyes', 'Plant Dyes', true);
    expect(added.textContent).toBe('Plant Dyes');
    expect(added.getAttribute('aria-pressed')).toBe('true');
    expect(group.values()).toEqual(['*', 'tulu', 'Plant Dyes']);
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('dom.ts / msg.ts', () => {
  it('el() sets text through textContent (never markup) and boolean / data attributes', () => {
    const node = el('a', { href: '/x', class: 'chip', 'data-id': 'SL-1', hidden: false, disabled: true }, [
      '<b>not html</b>',
      el('span', { text: 'inner' }),
    ]);
    expect(node.outerHTML).toBe(
      '<a href="/x" class="chip" data-id="SL-1" disabled="">&lt;b&gt;not html&lt;/b&gt;<span>inner</span></a>',
    );
    const parent = el('div');
    append(parent, ['a', null, undefined, false, el('i')]);
    expect(parent.childNodes).toHaveLength(2);
    expect(money(1120)).toBe('$1,120');
    expect(money(1335.5)).toBe('$1,335.5');
    expect(money(undefined)).toBe('');
    document.body.innerHTML = '<script type="application/json" id="d">{"a":"\\u003c/script\\u003e"}</script>';
    expect(readJson<{ a: string }>('d')).toEqual({ a: '</script>' });
    expect(() => byId('missing')).toThrow(/missing #missing/);
  });
  it('msg() shows a kind with text nodes, hide() clears, Escape helper hides every visible banner', () => {
    document.body.innerHTML = '<div id="m1" class="msg"></div><div id="m2" class="msg"></div>';
    const m1 = byId('m1');
    const m2 = byId('m2');
    msg(m1, ['Failed  |  ', el('a', { href: '#' }, 'Enter manually')], 'err');
    expect(m1.className).toBe('msg on err');
    expect(m1.getAttribute('role')).toBe('alert');
    expect(m1.textContent).toBe('Failed  |  Enter manually');
    expect(m1.querySelector('a')).not.toBeNull();
    msg(m2, 'Saved.', 'ok');
    expect(isShown(m2)).toBe(true);
    expect(hideVisible()).toBe(2);
    expect(m1.className).toBe('msg');
    expect(m1.textContent).toBe('');
    msg(m2, 'busy…', 'busy');
    hide(m2);
    expect(isShown(m2)).toBe(false);
  });
});

describe('api.ts', () => {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  it('POSTs JSON with same-origin credentials and unwraps ok bodies', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json(201, { ok: true, rug: { id: 'SL-030' } });
    }) as unknown as typeof fetch;
    const r = await post<{ rug: { id: string } }>('/api/admin/rugs', { name: 'x' }, { fetchImpl });
    expect(r).toMatchObject({ ok: true, status: 201, data: { rug: { id: 'SL-030' } } });
    expect(calls[0]?.url).toBe('/api/admin/rugs');
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"name":"x"}',
    });
    expect((calls[0]?.init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    const g = await get('/api/admin/tags', {
      fetchImpl: (async () => json(200, { ok: true, tags: [] })) as unknown as typeof fetch,
    });
    expect(g).toMatchObject({ ok: true, data: { tags: [] } });
  });
  it('401 → login redirect with next; 409 keeps the body; Retry-After surfaced; network / timeout mapped', async () => {
    const assigned: string[] = [];
    const location = { pathname: '/admin/rugs/SL-021', assign: (u: string) => void assigned.push(u) };
    const unauth = await post(
      '/api/admin/rugs',
      {},
      {
        fetchImpl: (async () => json(401, { ok: false, error: 'unauthorized' })) as unknown as typeof fetch,
        location,
      },
    );
    expect(unauth).toMatchObject({ ok: false, status: 401, error: 'unauthorized' });
    expect(assigned).toEqual(['/admin/login?next=%2Fadmin%2Frugs%2FSL-021']);
    const conflict = await post(
      '/api/admin/rugs/SL-021',
      {},
      {
        fetchImpl: (async () =>
          json(409, {
            ok: false,
            error: 'version mismatch',
            rug: { id: 'SL-021', version: 'f'.repeat(16) },
          })) as unknown as typeof fetch,
      },
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.status).toBe(409);
      expect(conflict.body?.rug).toEqual({ id: 'SL-021', version: 'f'.repeat(16) });
      expect(conflict.message).toMatch(/Someone changed this row/);
    }
    const limited = await post(
      '/api/admin/scrape',
      {},
      {
        fetchImpl: (async () =>
          json(
            429,
            { ok: false, error: 'too many requests' },
            { 'retry-after': '42' },
          )) as unknown as typeof fetch,
      },
    );
    expect(limited).toMatchObject({
      ok: false,
      status: 429,
      retryAfterSec: 42,
      message: 'Too many requests — try again in 42 s.',
    });
    const down = await post(
      '/api/admin/rugs',
      {},
      {
        fetchImpl: (async () => {
          throw new TypeError('fetch failed');
        }) as unknown as typeof fetch,
      },
    );
    expect(down).toMatchObject({ ok: false, status: 0, error: 'network' });
    const slow = await post(
      '/api/admin/rugs',
      {},
      {
        fetchImpl: (async () => {
          throw new DOMException('t', 'TimeoutError');
        }) as unknown as typeof fetch,
      },
    );
    expect(slow).toMatchObject({ ok: false, error: 'timeout' });
    const invalid = await post(
      '/api/admin/rugs',
      {},
      {
        fetchImpl: (async () =>
          json(400, {
            ok: false,
            error: 'invalid body',
            issues: [{ path: 'name', message: 'Too small' }],
          })) as unknown as typeof fetch,
      },
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(issuesText(invalid)).toBe('name: Too small');
    expect(describeError('x', 503, 30)).toBe('The sheet is unavailable — retry in 30 s.');
    expect(describeError('unknown_collection', 422)).toBe('unknown collection');
  });
});
