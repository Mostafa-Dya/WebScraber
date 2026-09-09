// The preview's filter strip (Figma 53:42). Client-side, like the public catalogue's collection
// tabs: the whole grid is already in the document, so filtering is showing and hiding rather than a
// round trip.
//
// Three kinds of chip:
//   * `all`   — everything;
//   * a tag slug — the cards carrying that tag;
//   * `liked` — the visitor's own shortlist, read from the same `sl-saved` key the reaction buffer
//     writes. It is per-visitor and the page is cached, so its count is rendered as a placeholder on
//     the server and corrected here on load, then kept live as the visitor reacts.
//
// The chosen filter is written to `?tag=` so a reload and the Back button keep it, which is what the
// collection tabs already do with `?collection=`.
import { readSaved } from './votes.ts';

const PARAM = 'tag';
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export interface FilterBindings {
  doc?: Document;
  win?: Window;
  storage?: Storage;
}

function likedIds(storage: Storage): Set<string> {
  return new Set(
    Object.entries(readSaved(storage))
      .filter(([, state]) => state === 'liked')
      .map(([id]) => id),
  );
}

/** Cards carry their tag slugs space-separated; a card with no tags matches only `all`. */
function tagsOf(card: HTMLElement): string[] {
  return (card.dataset.tags ?? '').split(/\s+/).filter(Boolean);
}

export function bindFilters(opts: FilterBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const nav = doc.querySelector<HTMLElement>('.pv-filters');
  if (!nav) return () => {};
  const chips = [...nav.querySelectorAll<HTMLButtonElement>('button[data-filter]')];
  const cards = [...doc.querySelectorAll<HTMLElement>('[data-card]')];
  const countEl = nav.querySelector<HTMLElement>('[data-liked-count]');
  const likedChip = nav.querySelector<HTMLButtonElement>('button[data-filter="liked"]');

  let active = 'all';

  const liked = (): Set<string> => (storage ? likedIds(storage) : new Set<string>());

  const apply = (): void => {
    const shortlist = active === 'liked' ? liked() : undefined;
    for (const card of cards) {
      const show =
        active === 'all'
          ? true
          : shortlist
            ? shortlist.has(card.dataset.rug ?? '')
            : tagsOf(card).includes(active);
      card.hidden = !show;
    }
    for (const chip of chips) {
      const on = chip.dataset.filter === active;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const empty = doc.querySelector<HTMLElement>('[data-grid-empty]');
    if (empty) empty.hidden = cards.some((c) => !c.hidden);
  };

  /** The shortlist count, and the chip itself, only exist when the visitor has liked something. */
  const refreshCount = (): void => {
    const n = liked().size;
    if (countEl) countEl.textContent = String(n);
    if (likedChip) likedChip.hidden = n === 0;
    // Standing on an empty shortlist would show a blank grid with no way back.
    if (n === 0 && active === 'liked') {
      active = 'all';
      apply();
    }
  };

  const setActive = (next: string): void => {
    active = next;
    apply();
    if (!win) return;
    try {
      const url = new URL(win.location.href);
      if (next === 'all') url.searchParams.delete(PARAM);
      else url.searchParams.set(PARAM, next);
      win.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  };

  const onClick = (e: Event): void => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
    if (!chip?.dataset.filter) return;
    setActive(chip.dataset.filter);
  };

  const onReaction = (): void => {
    refreshCount();
    if (active === 'liked') apply();
  };

  nav.addEventListener('click', onClick);
  doc.addEventListener('sl:reaction', onReaction);

  // A deep link wins over the default, but only if that chip is actually on the page.
  const wanted = win ? new URLSearchParams(win.location.search).get(PARAM) : null;
  refreshCount();
  if (wanted && SLUG_RE.test(wanted) && chips.some((c) => c.dataset.filter === wanted)) {
    if (wanted !== 'liked' || liked().size > 0) active = wanted;
  }
  apply();

  return () => {
    nav.removeEventListener('click', onClick);
    doc.removeEventListener('sl:reaction', onReaction);
  };
}

export function initFilters(): void {
  bindFilters();
}
