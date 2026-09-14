// Sorting the preview grid (owner, 2026-09-13: "the customer should be able to sort the products
// from the highest like count").
//
// The grid is reordered in the DOM rather than re-fetched, because the page is already filtered
// client-side by src/scripts/filters.ts and a round trip would lose that. Reordering nodes also
// keeps every card's reaction state, loaded image and scroll anchor exactly as they were.
//
// "Featured" is the order the server rendered — lead-first, collection by collection (DESIGN §3.5).
// It is restored by index, not by re-sorting, so it survives whatever the server decides that order
// should be without this file needing to know the rule.

const KEY = 'sl.preview.sort';

export type SortMode = 'featured' | 'liked';

function isMode(v: string | null): v is SortMode {
  return v === 'featured' || v === 'liked';
}

function read(store: Storage | undefined): SortMode | null {
  try {
    const v = store?.getItem(KEY) ?? null;
    return isMode(v) ? v : null;
  } catch {
    // Private mode, or site data blocked. The default order is still correct.
    return null;
  }
}

function write(store: Storage | undefined, mode: SortMode): void {
  try {
    store?.setItem(KEY, mode);
  } catch {
    /* a remembered preference is a convenience, never a requirement */
  }
}

/**
 * The like count a card carries, as the server rendered it; 0 when absent or malformed.
 *
 * "Absent" is the load-bearing case. `[slug]/index.astro` emits `data-likes` through `visibleLikes`,
 * so a rug below MIN_VISIBLE_LIKES carries no attribute at all — the browser is never told its
 * count. Reading that as 0 is what makes "Most liked" rank within the VISIBLE set and leave every
 * hidden-count rug in the server's order beneath it.
 *
 * That is the deliberate resolution of the conflict between the sort and the threshold: a sort over
 * the true counts would have published the hidden ranking ordinally, so the number stayed secret
 * while the order gave it away.
 */
function likesOf(card: HTMLElement): number {
  const n = Number(card.dataset.likes);
  return Number.isFinite(n) ? n : 0;
}

export interface SortBindings {
  doc?: Document;
  store?: Storage;
}

export function bindSort(opts: SortBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const store = opts.store ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const select = doc.getElementById('sortBy') as HTMLSelectElement | null;
  const grid = doc.querySelector<HTMLElement>('.pv-grid');
  if (!select || !grid) return () => {};

  // The server's order, captured once before anything moves. Re-reading it later would capture
  // whatever the last sort left behind, and "Featured" would then mean "the previous sort".
  const original = [...grid.children] as HTMLElement[];

  const apply = (mode: SortMode): void => {
    const next =
      mode === 'liked'
        ? [...original].sort((a, b) => {
            const d = likesOf(b) - likesOf(a);
            // Ties keep the server's order rather than falling into whatever sort() decides, so the
            // grid does not reshuffle every time two rugs happen to have the same count.
            return d !== 0 ? d : original.indexOf(a) - original.indexOf(b);
          })
        : original;
    // One fragment, one reflow — appending 40 cards individually thrashes layout.
    const frag = doc.createDocumentFragment();
    for (const card of next) frag.append(card);
    grid.append(frag);
  };

  const onChange = (): void => {
    const mode = isMode(select.value) ? select.value : 'featured';
    apply(mode);
    write(store, mode);
  };

  const saved = read(store) ?? 'featured';
  select.value = saved;
  if (saved !== 'featured') apply(saved);
  select.addEventListener('change', onChange);
  return () => select.removeEventListener('change', onChange);
}

export function initSort(): void {
  if (typeof document === 'undefined') return;
  bindSort();
}
