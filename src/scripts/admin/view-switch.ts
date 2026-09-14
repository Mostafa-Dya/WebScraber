// The Products view switch — Figma Filter Bar 23:183, the 36x36 square pair at the far end.
//
// "Cards and rows show the same catalogue. Cards are for judging a collection visually; rows are for
// correcting data fast." (P1 footnote 79:1343)
//
// P1 draws Grid active and P2 draws List active; the file's own Filter Bar description says "table
// is the default". Both are true — the default is the table, and P1 is simply the gallery screen. So
// the resting state here is list, and the choice persists per browser: a preference about how you
// read your own catalogue should not reset on every navigation.
//
// The switch only toggles which view is shown. Filtering stays in rug-list.ts and runs over BOTH
// views at once, because every row and every card carries the same data-* contract — so switching
// view never silently changes what you are looking at.

const KEY = 'sl.admin.products.view';

export type ProductsView = 'list' | 'grid';

function read(store: Storage | undefined): ProductsView | null {
  try {
    const v = store?.getItem(KEY);
    return v === 'list' || v === 'grid' ? v : null;
  } catch {
    // Private mode, or site data blocked. The default view is still correct.
    return null;
  }
}

function write(store: Storage | undefined, view: ProductsView): void {
  try {
    store?.setItem(KEY, view);
  } catch {
    /* a remembered preference is a convenience, never a requirement */
  }
}

export interface ViewSwitchBindings {
  doc?: Document;
  store?: Storage;
}

export function bindViewSwitch(opts: ViewSwitchBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const store = opts.store ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-view]'));
  const grid = doc.getElementById('grid');
  const table = doc.getElementById('table');
  if (!buttons.length) return () => {};

  const apply = (view: ProductsView): void => {
    for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false');
    if (grid) grid.hidden = view !== 'grid';
    if (table) table.hidden = view !== 'list';
  };

  const onClick = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-view]');
    const view = b?.dataset.view;
    if (view !== 'list' && view !== 'grid') return;
    apply(view);
    write(store, view);
  };

  apply(read(store) ?? 'list');
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

export function initViewSwitch(): void {
  if (typeof document === 'undefined') return;
  bindViewSwitch();
}
