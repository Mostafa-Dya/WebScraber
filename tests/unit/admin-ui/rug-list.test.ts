// @vitest-environment happy-dom
// /admin/rugs client filter (docs/ADMIN_SPEC.md §8.3): collection + status chips and the search box
// toggle `hidden` on the server-rendered cards; the count and the two empty states follow.
import { beforeEach, describe, expect, it } from 'vitest';
import { initRugList, matches } from '../../../src/scripts/admin/rug-list.ts';

const card = (id: string, collection: string, status: string, search: string): string =>
  `<a class="card" data-card data-id="${id}" data-collection="${collection}" data-status="${status}" data-search="${search}" href="/admin/rugs/${id}">${id}</a>`;

beforeEach(() => {
  document.body.innerHTML = `
    <input id="q" />
    <div id="collectionChips" class="chips">
      <button type="button" class="chip on" data-value="*" aria-pressed="true">All</button>
      <button type="button" class="chip" data-value="kilims" aria-pressed="false">Kilims</button>
      <button type="button" class="chip" data-value="__none" aria-pressed="false">No collection</button>
    </div>
    <div id="statusChips" class="chips">
      <button type="button" class="chip on" data-value="active" aria-pressed="true">Active</button>
      <button type="button" class="chip" data-value="draft" aria-pressed="false">Draft</button>
      <button type="button" class="chip" data-value="all" aria-pressed="false">Any</button>
    </div>
    <p id="count"></p>
    <div id="empty-first" hidden></div>
    <div id="empty-none" hidden></div>
    <div id="grid">
      ${card('SL-021', 'kilims', 'active', 'winks sl-021 1389 winks')}
      ${card('SL-022', 'kilims', 'draft', 'yellow sl-022  yellow')}
      ${card('SL-023', '', 'active', 'door sl-023  door')}
    </div>`;
});

describe('matches()', () => {
  it('applies status, collection (incl. none) and the search needle', () => {
    const c = { collection: 'kilims', status: 'active', search: 'winks sl-021 1389' };
    expect(matches(c, { collection: '*', status: 'active', q: '' })).toBe(true);
    expect(matches(c, { collection: '*', status: 'draft', q: '' })).toBe(false);
    expect(matches(c, { collection: 'kilims', status: 'all', q: '1389' })).toBe(true);
    expect(matches(c, { collection: 'tulu', status: 'all', q: '' })).toBe(false);
    expect(matches(c, { collection: '__none', status: 'all', q: '' })).toBe(false);
    expect(
      matches(
        { collection: '', status: 'active', search: '' },
        { collection: '__none', status: 'active', q: '' },
      ),
    ).toBe(true);
    expect(matches(c, { collection: '*', status: 'all', q: 'WINKS' })).toBe(true);
    expect(matches(c, { collection: '*', status: 'all', q: 'zzz' })).toBe(false);
  });
});

describe('initRugList()', () => {
  it('starts on Active, filters on chip clicks and typing, announces the count and the empty state', () => {
    const list = initRugList();
    const visible = (): string[] =>
      [...document.querySelectorAll<HTMLElement>('[data-card]')]
        .filter((c) => !c.hidden)
        .map((c) => c.dataset.id!);
    expect(visible()).toEqual(['SL-021', 'SL-023']);
    expect(document.getElementById('count')?.textContent).toBe('2 rugs shown');
    document.querySelector<HTMLButtonElement>('#statusChips [data-value="all"]')!.click();
    expect(visible()).toEqual(['SL-021', 'SL-022', 'SL-023']);
    document.querySelector<HTMLButtonElement>('#collectionChips [data-value="__none"]')!.click();
    expect(visible()).toEqual(['SL-023']);
    expect(document.getElementById('count')?.textContent).toBe('1 rug shown');
    const q = document.getElementById('q') as HTMLInputElement;
    q.value = 'yellow';
    q.dispatchEvent(new Event('input'));
    expect(visible()).toEqual([]);
    // Cards exist but none match: the no-results state, not the first-run one.
    expect(document.getElementById('empty-none')?.hidden).toBe(false);
    expect(document.getElementById('empty-first')?.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#collectionChips [data-value="*"]')!.click();
    expect(visible()).toEqual(['SL-022']);
    expect(document.getElementById('empty-none')?.hidden).toBe(true);
    expect(document.getElementById('empty-first')?.hidden).toBe(true);
    expect(list.filter()).toEqual({ collection: '*', status: 'all', q: 'yellow' });
  });
});
