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
  /** Injectable so a test can drive the breakpoint without a real viewport. */
  matchMedia?: (query: string) => MediaQueryList;
}

/**
 * Below 768px the table is `display: none` (components.css) because a six-column grid cannot be read
 * on a phone — so at that width the CARDS are the only view that can render, whatever the stored
 * preference says.
 *
 * This has to be decided in JS rather than CSS: the page sets `[hidden] { display: none !important }`
 * so that `grid.hidden = true` actually works, and no stylesheet can outrank it. Before that reset
 * existed the grid leaked through the hidden attribute and mobile worked by accident; once `hidden`
 * started being honoured, a phone got the header, the filter bar, two rows of chips and then nothing
 * at all — the whole catalogue gone.
 */
const NARROW = '(max-width: 767px)';

export function bindViewSwitch(opts: ViewSwitchBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const store = opts.store ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  const mm = opts.matchMedia ?? (typeof matchMedia === 'undefined' ? undefined : matchMedia);
  const narrow = mm?.(NARROW);
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-view]'));
  const grid = doc.getElementById('grid');
  const table = doc.getElementById('table');
  if (!buttons.length) return () => {};

  /** The view that can actually render at this width; the stored choice only applies when wide. */
  const effective = (view: ProductsView): ProductsView => (narrow?.matches ? 'grid' : view);

  const apply = (view: ProductsView): void => {
    const shown = effective(view);
    // The buttons keep showing the CHOICE, not the override: on a phone the switch is inert (the
    // table cannot render there) and pressing "cards" must not look like it did nothing.
    for (const b of buttons) b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false');
    if (grid) grid.hidden = shown !== 'grid';
    if (table) table.hidden = shown !== 'list';
  };

  let chosen: ProductsView = read(store) ?? 'list';

  const onClick = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-view]');
    const view = b?.dataset.view;
    if (view !== 'list' && view !== 'grid') return;
    chosen = view;
    apply(chosen);
    write(store, view);
  };

  // Re-evaluate on rotation or resize, so crossing the breakpoint does not leave a blank catalogue.
  const onBreakpoint = (): void => apply(chosen);

  apply(chosen);
  doc.addEventListener('click', onClick);
  narrow?.addEventListener?.('change', onBreakpoint);
  return () => {
    doc.removeEventListener('click', onClick);
    narrow?.removeEventListener?.('change', onBreakpoint);
  };
}

export function initViewSwitch(): void {
  if (typeof document === 'undefined') return;
  bindViewSwitch();
}
