// Page-to-page motion without a client router (docs/DESIGN.md §6.3, §8.3): the browser's own
// cross-document View Transitions. This module handles the departure side — the old document names
// the clicked card's plate (or its hero) `rug-hero` in `pageswap` and shows the loading state — and
// the bfcache cleanup. The arrival side (`pagereveal`) lives in the inline pre-paint script, because
// that event can fire before deferred modules execute. Every style write goes through the CSSOM,
// which the hash CSP permits. Browsers without the API simply navigate.
const KEY = 'sl-vt-slug';

interface ViewTransitionLike {
  finished: Promise<unknown>;
  ready: Promise<unknown>;
}
interface PageSwapLike extends Event {
  viewTransition: ViewTransitionLike | null;
  activation?: { entry?: { url?: string | null } | null } | null;
}

const reduce = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const slugOf = (href: string): string | undefined =>
  new URL(href, location.href).pathname.match(/^\/rugs\/([a-z0-9-]{1,80})$/)?.[1];
const plateForSlug = (slug: string): HTMLElement | null =>
  document
    .querySelector<HTMLElement>(`.card:not([hidden]) a.photo-link[href="/rugs/${CSS.escape(slug)}"]`)
    ?.closest<HTMLElement>('[data-plate]') ?? null;
const inViewport = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
};
let lastHref: string | undefined;

export function initTransitions(): void {
  const html = document.documentElement;
  const measureNav = (): void => {
    const nav = document.getElementById('nav');
    if (nav) html.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
  };
  measureNav();
  addEventListener('resize', measureNav, { passive: true });

  // Loading state in the old document: dim the siblings, show the 2 px progress bar after a grace.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || a.origin !== location.origin || a.hasAttribute('download')) return;
    if (a.target && a.target !== '_self') return;
    lastHref = a.href;
    html.classList.add('is-navigating');
    a.closest('.card')?.classList.add('is-leaving');
  });

  addEventListener('pageswap', (e) => {
    const ev = e as PageSwapLike;
    const hero = document.querySelector<HTMLElement>('.hero[data-plate]');
    // Return-morph handshake: the next index page looks this slug up (works in Safari too).
    if (hero?.dataset.slug) {
      try {
        sessionStorage.setItem(KEY, hero.dataset.slug);
      } catch {
        /* private mode */
      }
    }
    const vt = ev.viewTransition;
    if (!vt || reduce()) return;
    const to = ev.activation?.entry?.url ?? lastHref;
    const slug = to ? slugOf(to) : undefined;
    const el = (slug && plateForSlug(slug)) || hero; // the clicked card's plate, else this page's hero
    if (!el || !inViewport(el)) return;
    el.style.setProperty('view-transition-name', 'rug-hero');
    void vt.finished.finally(() => {
      el.style.removeProperty('view-transition-name');
    });
  });

  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    html.classList.remove('is-navigating');
    document.querySelectorAll('.is-leaving').forEach((c) => c.classList.remove('is-leaving'));
    document.querySelectorAll<HTMLElement>('[data-plate]').forEach((p) => {
      p.style.removeProperty('view-transition-name');
    });
  });
}
