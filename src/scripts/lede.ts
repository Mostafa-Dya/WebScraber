// Collection standfirst clamp (brief §7): the description is shown on one line with a "See more"
// that expands it in place. The button ships hidden and is only revealed here, so a visitor without
// JavaScript sees the full text rather than a truncated one they cannot open — and it is only
// revealed at all when the text is actually clipped, so a two-word description has no dead control.
//
// The clamp itself is CSS (`-webkit-line-clamp`); this module toggles a class, never a style
// attribute, because the CSP forbids inline styles.
const CLAMPED = 'clamped';

export interface LedeBindings {
  doc?: Document;
}

/** True when the element's content is taller than the box the clamp gives it. */
function isClipped(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1;
}

export function bindLede(opts: LedeBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const ledes = [...doc.querySelectorAll<HTMLElement>('[data-lede]')];
  for (const lede of ledes) {
    const body = lede.querySelector<HTMLElement>('.lede-body');
    const more = lede.querySelector<HTMLButtonElement>('[data-lede-more]');
    if (!body || !more) continue;
    lede.classList.add(CLAMPED);
    // A hidden tab (`hidden` on the standfirst) measures as 0×0, so treat it as clipped and let
    // the first click sort it out rather than silently dropping the control.
    const hiddenTab = lede.closest<HTMLElement>('[data-standfirst]')?.hidden === true;
    if (!hiddenTab && !isClipped(body)) {
      lede.classList.remove(CLAMPED);
      continue;
    }
    more.hidden = false;
    more.setAttribute('aria-expanded', 'false');
  }

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lede-more]');
    if (!btn) return;
    e.preventDefault();
    const lede = btn.closest<HTMLElement>('[data-lede]');
    if (!lede) return;
    const expanded = !lede.classList.contains(CLAMPED);
    lede.classList.toggle(CLAMPED, expanded);
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    btn.textContent = expanded ? 'See more' : 'See less';
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

export function initLede(): void {
  bindLede();
}
