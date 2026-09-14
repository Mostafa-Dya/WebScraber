// @vitest-environment happy-dom
// Sorting the preview grid by like count (owner, 2026-09-13).
//
// The two things worth guarding are the ones a naive sort gets wrong: "Featured" must mean the order
// the SERVER rendered — not "whatever the previous sort left behind" — and ties must not reshuffle,
// because a grid that rearranges itself every time two rugs draw level looks broken.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindSort } from '../../src/scripts/customer/sort.ts';

const off: Array<() => void> = [];
afterEach(() => {
  while (off.length) off.pop()?.();
});

// `{ store: undefined }` means "use the default", which IS real localStorage — not "no storage".
// Without this, a test that chooses "liked" leaves that choice behind for every later test in the
// file, and the next bind silently re-applies it before the assertion runs.
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* private mode in some environments; the tests that care pass their own store */
  }
});

/** The grid as [slug]/index.astro renders it: a wrapper per rug carrying its like count. */
function mount(rows: Array<[string, number]>): void {
  document.body.innerHTML = `
    <select id="sortBy">
      <option value="featured">Featured</option>
      <option value="liked">Most liked</option>
    </select>
    <div class="pv-grid">
      ${rows.map(([id, likes]) => `<div data-card data-rug="${id}" data-likes="${likes}"></div>`).join('')}
    </div>`;
}

const order = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('.pv-grid [data-card]')].map((el) => el.dataset.rug!);

const choose = (value: string): void => {
  const sel = document.getElementById('sortBy') as HTMLSelectElement;
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
};

/** A storage that actually stores, so the "remembered" tests exercise the real path. */
function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  } as unknown as Storage;
}

describe('sorting', () => {
  beforeEach(() => {
    // Server order is A, B, C, D — deliberately NOT like-descending.
    mount([
      ['A', 2],
      ['B', 9],
      ['C', 5],
      ['D', 9],
    ]);
  });

  it('leaves the served order alone until asked', () => {
    off.push(bindSort({ store: undefined }));
    expect(order()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('puts the most-liked first', () => {
    off.push(bindSort({ store: undefined }));
    choose('liked');
    expect(order()).toEqual(['B', 'D', 'C', 'A']);
  });

  it('breaks ties by the served order, so equal counts never reshuffle', () => {
    off.push(bindSort({ store: undefined }));
    choose('liked');
    // B and D both have 9. B was served first, so B stays ahead of D.
    expect(order().indexOf('B')).toBeLessThan(order().indexOf('D'));
    choose('featured');
    choose('liked');
    expect(order().indexOf('B')).toBeLessThan(order().indexOf('D'));
  });

  it('restores the SERVER order, not the previous sort, when Featured comes back', () => {
    off.push(bindSort({ store: undefined }));
    choose('liked');
    expect(order()).toEqual(['B', 'D', 'C', 'A']);
    choose('featured');
    expect(order()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('treats a missing or malformed count as zero rather than dropping the card', () => {
    document.querySelector<HTMLElement>('[data-rug="C"]')!.removeAttribute('data-likes');
    document.querySelector<HTMLElement>('[data-rug="A"]')!.dataset.likes = 'lots';
    off.push(bindSort({ store: undefined }));
    choose('liked');
    // Every card is still present; the two unknown counts sink to the bottom in served order.
    expect(order()).toHaveLength(4);
    expect(order().slice(0, 2)).toEqual(['B', 'D']);
    expect(order().slice(2)).toEqual(['A', 'C']);
  });
});

describe('remembering the choice', () => {
  beforeEach(() => {
    mount([
      ['A', 2],
      ['B', 9],
    ]);
  });

  it('applies the remembered sort on load, with the select showing it', () => {
    const store = fakeStore();
    off.push(bindSort({ store }));
    choose('liked');

    mount([
      ['A', 2],
      ['B', 9],
    ]);
    off.push(bindSort({ store }));
    expect(order()).toEqual(['B', 'A']);
    expect((document.getElementById('sortBy') as HTMLSelectElement).value).toBe('liked');
  });

  it('survives storage that throws — a remembered preference is never a requirement', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => off.push(bindSort({ store: hostile }))).not.toThrow();
    expect(order()).toEqual(['A', 'B']);
    expect(() => choose('liked')).not.toThrow();
    expect(order()).toEqual(['B', 'A']);
  });
});

describe('when there is nothing to sort', () => {
  it('does nothing on a page with no grid (the detail page renders the same control strip)', () => {
    document.body.innerHTML = `<select id="sortBy"><option value="liked">Most liked</option></select>`;
    expect(() => off.push(bindSort({ store: undefined }))).not.toThrow();
  });

  it('does nothing when the control is absent', () => {
    document.body.innerHTML = `<div class="pv-grid"></div>`;
    expect(() => off.push(bindSort({ store: undefined }))).not.toThrow();
  });
});

describe('teardown', () => {
  it('stops listening once unbound', () => {
    mount([
      ['A', 2],
      ['B', 9],
    ]);
    const stop = bindSort({ store: undefined });
    stop();
    choose('liked');
    expect(order()).toEqual(['A', 'B']);
  });
});
