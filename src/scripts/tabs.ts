// Collection tabs: the reference's buttons (lines 157-168) filtering client-side, with real tab
// semantics (aria-selected, roving tabindex, arrow keys), the active tab mirrored to
// ?collection=<slug> (docs/ADR.md D12), and the design pass (docs/DESIGN.md §3.4, §7 D–F): a sliding
// ink bar, the per-collection standfirst, a polite live region, and a GSAP Flip reflow of the grid
// on user activation (lazy-loaded on hover/focus, never under reduced motion, plain toggle otherwise).
import type { gsap as GsapType } from 'gsap';
import type { Flip as FlipType } from 'gsap/Flip';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

/**
 * Does this card belong to the tab? (owner requirement 2026-09-13: a rug can be in several.)
 *
 * `data-collections` is the space-separated membership list; `data-collection` is the primary and
 * stays for anything that needs the one canonical tab. Falling back to the primary keeps a card
 * rendered before this change — or by a test fixture — filtering correctly instead of vanishing.
 */
function inCollection(card: HTMLElement, slug: string): boolean {
  const list = card.dataset.collections;
  if (list === undefined) return card.dataset.collection === slug;
  return list.split(' ').includes(slug);
}

type Gsap = typeof GsapType;
type FlipPlugin = typeof FlipType;
interface Motion {
  gsap: Gsap;
  Flip: FlipPlugin;
}
interface Tween {
  kill(): unknown;
  progress(value: number): unknown;
}

let motion: Motion | null = null;
let loading: Promise<void> | null = null;
let tl: Tween | null = null;

const reduce = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fetches GSAP core + Flip once, only when a pointer/focus reaches the tabs and motion is welcome. */
export function warmMotion(): void {
  if (motion || loading || reduce()) return;
  loading = Promise.all([import('gsap'), import('gsap/Flip')])
    .then(([{ gsap }, { Flip }]) => {
      gsap.registerPlugin(Flip);
      motion = { gsap, Flip };
    })
    .catch(() => undefined) // stay on the plain toggle
    .finally(() => {
      loading = null;
    });
}

/** Applies `apply()` (which toggles `hidden` on cards) with a Flip reflow when GSAP is ready. */
function reflow(grid: HTMLElement, cards: HTMLElement[], apply: () => void): void {
  if (!motion || reduce()) {
    apply();
    return;
  }
  const { gsap, Flip } = motion;
  tl?.kill();
  const before = grid.offsetHeight;
  const state = Flip.getState(cards);
  grid.classList.add('is-flipping');
  apply();
  const after = grid.offsetHeight;
  grid.style.minHeight = `${before}px`; // CSSOM: allowed by the CSP
  gsap.to(grid, { minHeight: after, duration: 0.5, ease: 'power2.inOut', clearProps: 'minHeight' });
  tl = Flip.from(state, {
    duration: 0.5,
    ease: 'power2.inOut',
    absolute: true,
    scale: true,
    nested: false,
    prune: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.38, ease: 'power2.out', stagger: 0.03 },
      ),
    onLeave: (els) => gsap.to(els, { autoAlpha: 0, scale: 0.98, duration: 0.22, ease: 'power1.in' }),
    onComplete: () => {
      grid.classList.remove('is-flipping');
      gsap.set(cards, { clearProps: 'all' }); // Flip leaves inline display/position on leavers
      tl = null;
    },
  }) as unknown as Tween;
}

export function initTabs(doc: Document = document, win: Window = window): void {
  const nav = doc.getElementById('nav');
  if (!nav) return;
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>('button[data-collection]')];
  if (buttons.length === 0) return;
  const ink = nav.querySelector<HTMLElement>('.ink');
  const grid = doc.getElementById('grid');
  const live = doc.getElementById('grid-live');

  const placeInk = (b: HTMLButtonElement): void => {
    if (!ink) return;
    ink.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth / 100})`;
  };
  const labelOf = (b: HTMLButtonElement): string =>
    [...b.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
  const activeButton = (): HTMLButtonElement | undefined => buttons.find((b) => b.classList.contains('on'));

  const activate = (slug: string, push: boolean, animate = false): boolean => {
    const target = buttons.find((b) => b.dataset.collection === slug);
    if (!target) return false;
    for (const b of buttons) {
      const on = b === target;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
    doc.querySelectorAll<HTMLElement>('[data-standfirst]').forEach((s) => {
      s.hidden = s.dataset.collection !== slug;
    });
    const cards = [...doc.querySelectorAll<HTMLElement>('[data-card]')];
    const run = (): void => {
      for (const card of cards) card.hidden = !inCollection(card, slug);
    };
    if (animate && grid) reflow(grid, cards, run);
    else run();
    placeInk(target);
    if (push) {
      const url = new URL(win.location.href);
      url.searchParams.set('collection', slug);
      win.history.replaceState(win.history.state, '', url); // keeps the browser's scroll state intact
    }
    return true;
  };

  /** User activation only: announce the result and stop the entrance animation from re-firing. */
  const settle = (slug: string): void => {
    grid?.classList.add('is-settled');
    if (!live) return;
    const b = buttons.find((x) => x.dataset.collection === slug);
    const n = doc.querySelectorAll('[data-card]:not([hidden])').length;
    live.textContent = `${n} ${n === 1 ? 'rug' : 'rugs'} shown · ${b ? labelOf(b) : ''}`.trim();
  };

  nav.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-collection]');
    if (b?.dataset.collection === undefined) return;
    if (activate(b.dataset.collection, true, true)) settle(b.dataset.collection);
  });

  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const i = buttons.findIndex((b) => b.classList.contains('on'));
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % buttons.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + buttons.length) % buttons.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = buttons.length - 1;
    const b = buttons[next];
    if (b?.dataset.collection === undefined) return;
    e.preventDefault();
    if (activate(b.dataset.collection, true, true)) settle(b.dataset.collection);
    b.focus();
  });

  nav.addEventListener('pointerenter', warmMotion, { once: true });
  nav.addEventListener('focusin', warmMotion, { once: true });

  const wanted = new URLSearchParams(win.location.search).get('collection');
  let placed = false;
  if (wanted && SLUG_RE.test(wanted) && activate(wanted, false)) placed = true;
  if (!placed) {
    const first = activeButton() ?? buttons[0];
    if (first?.dataset.collection !== undefined) activate(first.dataset.collection, false);
    if (wanted) {
      // A renamed or deleted collection: fall back to the first tab and clean the address bar.
      const url = new URL(win.location.href);
      url.searchParams.delete('collection');
      win.history.replaceState(win.history.state, '', url);
    }
  }

  // The ink bar: place first, then enable its transition so it never slides in from the left.
  if (ink && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => nav.classList.add('has-ink'));
  }
  const replace = (): void => {
    const b = activeButton();
    if (b) placeInk(b);
  };
  if (typeof win.addEventListener === 'function') {
    let raf = 0;
    win.addEventListener(
      'resize',
      () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          replace();
          if (tl) tl.progress(1); // never mid-flip on a resize
        });
      },
      { passive: true },
    );
    win.addEventListener('pageshow', (e) => {
      if (e.persisted) replace();
    });
  }
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) void fonts.ready.then(replace, () => undefined);
}
