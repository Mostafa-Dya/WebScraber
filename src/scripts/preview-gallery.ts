// The detail page's thumbnail strip (Figma 57:242).
//
// Six 96×120 thumbnails; the selected one carries a 2px ink border where the rest carry a hairline.
// Clicking one swaps the hero image. That is the whole behaviour — the design draws no lightbox, no
// zoom and nothing that suggests the hero itself is clickable, so none of that is invented here.
//
// The thumbnails are real buttons in a toolbar, so the strip is reachable by keyboard and the
// current one is announced through `aria-current` rather than by colour alone.
export interface GalleryBindings {
  doc?: Document;
}

export function bindPreviewGallery(opts: GalleryBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const strip = doc.querySelector<HTMLElement>('[data-thumbs]');
  const hero = doc.querySelector<HTMLImageElement>('[data-hero-img]');
  if (!strip || !hero) return () => {};

  const select = (btn: HTMLButtonElement): void => {
    const src = btn.dataset.full;
    if (!src) return;
    hero.src = src;
    const alt = btn.dataset.alt;
    if (alt) hero.alt = alt;
    strip.querySelectorAll<HTMLButtonElement>('button[data-full]').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  };

  const onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-full]');
    if (btn) select(btn);
  };

  strip.addEventListener('click', onClick);
  return () => strip.removeEventListener('click', onClick);
}

export function initPreviewGallery(): void {
  bindPreviewGallery();
}
