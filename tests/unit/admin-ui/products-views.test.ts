// @vitest-environment happy-dom
// The Products screen's two views (Figma P1 cards / P2 inline rows) and the switch between them.
//
// The thing worth guarding is that ONE filter drives BOTH views: every rug is in the DOM twice, as a
// row and as a card, sharing the same data-* contract. That is what makes switching view safe — it
// cannot silently change what you are looking at — but it also means anything that counts elements
// instead of rugs reports double.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindViewSwitch } from '../../../src/scripts/admin/view-switch.ts';
import { bindInlineRows } from '../../../src/scripts/admin/inline-row.ts';
import { initRugList } from '../../../src/scripts/admin/rug-list.ts';
import { RugUpdate } from '../../../src/lib/admin/dto.ts';

/** One rug rendered the way the page renders it: once as a row, once as a card. */
function rug(id: string, name: string, collection: string, status: string): string {
  const data = `data-card data-id="${id}" data-collection="${collection}" data-status="${status}" data-search="${name.toLowerCase()} ${id.toLowerCase()}"`;
  return `
    <div class="irow" data-row ${data}>
      <div class="irow__line">
        <span class="irow__id">${id}</span>
        <span class="irow__title" data-cell="name">${name}</span>
        <span class="irow__spacer"></span>
        <span class="irow__action"><button type="button" data-edit="${id}">Edit</button></span>
      </div>
      <p class="irow__message" hidden></p>
    </div>`;
}
function card(id: string, name: string, collection: string, status: string): string {
  return `<a class="card" data-card data-id="${id}" data-collection="${collection}" data-status="${status}" data-search="${name.toLowerCase()} ${id.toLowerCase()}">${name}</a>`;
}

/** Teardowns for anything bound during a test; document-level listeners outlive innerHTML. */
const bound: Array<() => void> = [];
function track(off: () => void): () => void {
  bound.push(off);
  return off;
}
afterEach(() => {
  while (bound.length) bound.pop()?.();
});

const ROWS = [
  ['SL-021', 'Winks', 'kilims', 'active'],
  ['SL-022', 'Yellow', 'tulu', 'active'],
] as const;

function mount(): void {
  document.body.innerHTML = `
    <input id="q" type="search" />
    <button type="button" class="filterbar__view" data-view="list" aria-pressed="false"></button>
    <button type="button" class="filterbar__view" data-view="grid" aria-pressed="false"></button>
    <select id="f_collection_filter">
      <option value="*">All collections</option>
      <option value="kilims">Kilims (1)</option>
    </select>
    <div class="chips" id="statusChips" data-multi="false">
      <button type="button" class="chip on" data-value="active" aria-pressed="true">Active</button>
      <button type="button" class="chip" data-value="all" aria-pressed="false">Any</button>
    </div>
    <p id="count"></p>
    <div id="empty-first" hidden></div>
    <div id="empty-none" hidden></div>
    <div id="table">${ROWS.map((r) => rug(r[0], r[1], r[2], r[3])).join('')}</div>
    <div id="grid">${ROWS.map((r) => card(r[0], r[1], r[2], r[3])).join('')}</div>`;
}

describe('view switch', () => {
  beforeEach(mount);

  it('defaults to the table — the file calls it the default view', () => {
    track(bindViewSwitch({ store: undefined }));
    expect(document.getElementById('table')?.hidden).toBe(false);
    expect(document.getElementById('grid')?.hidden).toBe(true);
    expect(document.querySelector('[data-view="list"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  /** A fake MediaQueryList whose `matches` this test controls, plus a way to fire `change`. */
  function fakeMedia(matches: boolean): { mm: (q: string) => MediaQueryList; set(v: boolean): void } {
    const listeners: Array<() => void> = [];
    const mql = {
      matches,
      addEventListener: (_: string, fn: () => void) => void listeners.push(fn),
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
    return {
      mm: () => mql,
      set(v: boolean) {
        (mql as { matches: boolean }).matches = v;
        for (const fn of listeners) fn();
      },
    };
  }

  it('shows the CARDS on a phone, whatever the stored preference says', () => {
    // Below 768px the table is `display: none` in CSS, so the cards are the only view that can
    // render. This has to be decided here rather than in a stylesheet, because the page sets
    // `[hidden] { display: none !important }` so that `grid.hidden` actually works — and once that
    // started being honoured, a phone rendered the header, the filters and then NO products at all.
    const { mm } = fakeMedia(true);
    track(bindViewSwitch({ store: undefined, matchMedia: mm }));
    expect(document.getElementById('grid')?.hidden).toBe(false);
    expect(document.getElementById('table')?.hidden).toBe(true);
    // The switch still reports the CHOICE, not the override, so pressing it is never a no-op visually.
    expect(document.querySelector('[data-view="list"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('re-evaluates when the viewport crosses the breakpoint', () => {
    // Rotating a phone, or dragging a window narrow, must not leave a blank catalogue behind.
    const media = fakeMedia(false);
    track(bindViewSwitch({ store: undefined, matchMedia: media.mm }));
    expect(document.getElementById('table')?.hidden).toBe(false);
    media.set(true);
    expect(document.getElementById('grid')?.hidden).toBe(false);
    expect(document.getElementById('table')?.hidden).toBe(true);
    media.set(false);
    expect(document.getElementById('table')?.hidden).toBe(false);
  });

  it('switches to cards and marks exactly one control pressed', () => {
    track(bindViewSwitch({ store: undefined }));
    document.querySelector<HTMLButtonElement>('[data-view="grid"]')!.click();
    expect(document.getElementById('grid')?.hidden).toBe(false);
    expect(document.getElementById('table')?.hidden).toBe(true);
    const pressed = [...document.querySelectorAll('[data-view]')].filter(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1);
  });

  it('remembers the choice — how you read your own catalogue should not reset on navigation', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage;

    track(bindViewSwitch({ store: fake }));
    document.querySelector<HTMLButtonElement>('[data-view="grid"]')!.click();

    mount();
    track(bindViewSwitch({ store: fake }));
    expect(document.getElementById('grid')?.hidden).toBe(false);
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
    expect(() => track(bindViewSwitch({ store: hostile }))).not.toThrow();
    expect(document.getElementById('table')?.hidden).toBe(false);
  });
});

describe('one filter drives both views', () => {
  beforeEach(mount);

  it('counts rugs, not elements — each rug is in the DOM twice', () => {
    initRugList();
    // Two rugs, four elements. The count must say two.
    expect(document.getElementById('count')?.textContent).toBe('2 rugs shown');
  });

  it('hides the row AND the card for a filtered-out rug, so switching view cannot change the result', () => {
    initRugList();
    const sel = document.getElementById('f_collection_filter') as HTMLSelectElement;
    sel.value = 'kilims';
    sel.dispatchEvent(new Event('change'));
    const shown = [...document.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => !el.hidden);
    expect(shown.map((el) => el.dataset.id)).toEqual(['SL-021', 'SL-021']);
    expect(document.getElementById('count')?.textContent).toBe('1 rug shown');
  });

  it('shows the no-results state, not the first-run one, when cards exist but none match', () => {
    initRugList();
    const q = document.getElementById('q') as HTMLInputElement;
    q.value = 'nothing-matches-this';
    q.dispatchEvent(new Event('input'));
    expect(document.getElementById('empty-none')?.hidden).toBe(false);
    expect(document.getElementById('empty-first')?.hidden).toBe(true);
  });
});

describe('inline row editing', () => {
  beforeEach(mount);

  it('turns the title cell into an input in place — the row keeps its position', () => {
    track(bindInlineRows());
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    const before = [...document.querySelectorAll('[data-row]')].indexOf(row);
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();

    expect(row.classList.contains('irow--editing')).toBe(true);
    expect(row.querySelector('input')).not.toBeNull();
    expect([...document.querySelectorAll('[data-row]')].indexOf(row)).toBe(before);
    // Save and Cancel replace the Edit affordance while editing.
    expect(row.querySelector('.irow__action')?.textContent).toContain('Save');
    expect(row.querySelector('.irow__action')?.textContent).toContain('Cancel');
  });

  it('Esc reverts without calling the API', () => {
    const post = vi.fn();
    track(bindInlineRows({ api: { fetchImpl: post as unknown as typeof fetch } }));
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    const input = row.querySelector('input')!;
    input.value = 'Changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(row.classList.contains('irow--editing')).toBe(false);
    expect(row.querySelector('[data-cell="name"]')?.textContent).toBe('Winks');
    expect(post).not.toHaveBeenCalled();
  });

  /** A rug as `GET /api/admin/rugs/:id` returns it — the read the rename now builds its body from. */
  const RUG_FOR_RENAME = {
    version: 'a1b2c3d4e5f60718',
    slug: 'winks',
    description: 'A rug.',
    collections: ['Kilims', 'Antique'],
    tags: ['Signed'],
    photos: [],
    widthCm: 240,
    lengthCm: 170,
    material: 'Wool',
    method: 'Handknotted',
    age: 'Vintage',
    origin: 'Turkey',
    priceUsd: 1200,
    rotate: 'false',
    featured: false,
    status: 'active',
    sourceUrl: '',
    supplier: 'karavanrug',
    supplierRef: '',
    notes: '',
  };

  /** Answers the rename's GET with a real rug, and records what the follow-up POST sent. */
  function renameFetch(): { impl: ReturnType<typeof vi.fn>; posted: () => Record<string, unknown> } {
    let body: Record<string, unknown> = {};
    const impl = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ ok: true, rug: RUG_FOR_RENAME }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    return { impl, posted: () => body };
  }

  it('Enter commits and the row returns to rest', async () => {
    const { impl } = renameFetch();
    track(bindInlineRows({ api: { fetchImpl: impl as unknown as typeof fetch } }));
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    const input = row.querySelector('input')!;
    input.value = 'Winks II';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Wait for the OUTCOME, not for the editing class: setState(row, 'saving') already clears
    // editing, so waiting on that resolves while the request is still in flight.
    await vi.waitFor(() => expect(row.querySelector('[data-cell="name"]')?.textContent).toBe('Winks II'));

    expect(impl).toHaveBeenCalled();
    expect(row.classList.contains('irow--editing')).toBe(false);
    expect(row.classList.contains('irow--error')).toBe(false);
  });

  it('sends a body the update route actually accepts — the 400 regression', async () => {
    // Until 2026-09-14 this posted `{ name }` alone. `POST /api/admin/rugs/:id` validates with
    // RugUpdate, which is the WHOLE rug plus a version, so EVERY inline rename 400'd. Asserting
    // against the real schema is the only check that cannot drift from the route.
    const { impl, posted } = renameFetch();
    track(bindInlineRows({ api: { fetchImpl: impl as unknown as typeof fetch } }));
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    const input = row.querySelector('input')!;
    input.value = 'Winks II';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(row.querySelector('[data-cell="name"]')?.textContent).toBe('Winks II'));

    const parsed = RugUpdate.safeParse(posted());
    expect(parsed.success ? null : parsed.error.issues.map((i) => i.path.join('.'))).toBeNull();
    // The rename must carry the rest of the rug through untouched, not blank it.
    expect(posted().name).toBe('Winks II');
    expect(posted().collections).toEqual(['Kilims', 'Antique']);
    expect(posted().priceUsd).toBe(1200);
    expect(posted().version).toBe(RUG_FOR_RENAME.version);
    // A rename is not a repricing.
    expect(posted().roundPrice).toBe(false);
    // `sourceUrl` is optional-not-nullable on the DTO: sending '' fails validation outright.
    expect(posted()).not.toHaveProperty('sourceUrl');
  });

  it('a rejected save keeps the row in place and says why', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, message: 'SL-021 is already used by another product.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    );
    track(bindInlineRows({ api: { fetchImpl: fetchImpl as unknown as typeof fetch } }));
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    const input = row.querySelector('input')!;
    input.value = 'Clash';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() => expect(row.classList.contains('irow--error')).toBe(true));
    const msg = row.querySelector<HTMLElement>('.irow__message')!;
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toContain('already used');
    // The row is still in the list, not replaced.
    expect(document.querySelectorAll('[data-row]')).toHaveLength(2);
  });

  it('an unchanged value does not hit the API', () => {
    const fetchImpl = vi.fn();
    track(bindInlineRows({ api: { fetchImpl: fetchImpl as unknown as typeof fetch } }));
    const row = document.querySelector<HTMLElement>('[data-row]')!;
    row.querySelector<HTMLButtonElement>('[data-edit]')!.click();
    row.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(row.classList.contains('irow--editing')).toBe(false);
  });
});
