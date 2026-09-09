// Photo load / error / rotate behaviour (reference lines 183-185 and 199-212) plus the plate state
// machine of docs/DESIGN.md §5.4: a plate ([data-plate]) is `is-pending` while its driving image
// (data-plate-img) is arriving and near the viewport, `is-loaded` once decoded, `is-empty` when there
// is no photo or it failed. `load`/`error` do not bubble but do capture, so one pair of listeners
// covers the images rendered by the server and the ones gallery.ts inserts later.
import { shouldRotate } from '../lib/rotate.ts';

type PlateState = 'pending' | 'loaded' | 'empty';

const plateOf = (img: Element): HTMLElement | null => img.closest<HTMLElement>('[data-plate]');

function setState(plate: HTMLElement | null, s: PlateState): void {
  if (!plate) return;
  plate.classList.toggle('is-pending', s === 'pending');
  plate.classList.toggle('is-loaded', s === 'loaded');
  plate.classList.toggle('is-empty', s === 'empty');
  plate.setAttribute('aria-busy', s === 'pending' ? 'true' : 'false');
}

function onReady(img: HTMLImageElement): void {
  // `rot` before `loaded`: the 90° turn happens while the image is still transparent.
  if (shouldRotate(img.dataset.rot, img.naturalWidth, img.naturalHeight)) img.classList.add('rot');
  img.classList.add('loaded'); // keeps catalogue.css's `img.loaded ~ .ph` rule working
  if ('plateImg' in img.dataset) setState(plateOf(img), 'loaded');
}

function onFail(img: HTMLImageElement): void {
  const plate = plateOf(img);
  const drives = 'plateImg' in img.dataset;
  img.remove();
  if (drives && plate && !plate.querySelector('img[data-plate-img]')) setState(plate, 'empty');
}

const isRug = (t: EventTarget | null): t is HTMLImageElement =>
  t instanceof HTMLImageElement && t.matches('img[data-rug-img]');

let io: IntersectionObserver | null = null;

/** Marks the plate pending when `img` is near the viewport and still loading (or right away without IO). */
export function watchImage(img: HTMLImageElement): void {
  if (img.complete) {
    if (img.naturalWidth > 0) onReady(img);
    else if (img.src) onFail(img);
    return;
  }
  if (!('plateImg' in img.dataset)) return;
  if (io) io.observe(img);
  else setState(plateOf(img), 'pending');
}

export function initPhotos(doc: Document = document): void {
  doc.addEventListener(
    'load',
    (e) => {
      if (isRug(e.target)) onReady(e.target);
    },
    true,
  );
  doc.addEventListener(
    'error',
    (e) => {
      if (isRug(e.target)) onFail(e.target);
    },
    true,
  );
  io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io?.unobserve(en.target);
              const img = en.target as HTMLImageElement;
              if (!img.complete) setState(plateOf(img), 'pending');
            }
          },
          { rootMargin: '100% 0px' },
        )
      : null;
  doc.querySelectorAll<HTMLImageElement>('img[data-rug-img]').forEach(watchImage);
}
