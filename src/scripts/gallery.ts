// Detail-page gallery (docs/DESIGN.md §4.3): thumbnail strip, hero swap (a fresh base + full pair
// crossfades through the ordinary reveal), and a native <dialog> lightbox on a paper backdrop with
// buttons, arrow keys, a pointer swipe and a live counter. No inline handlers, no inline styles:
// everything is DOM creation and classes, which the hash CSP permits.
import { watchImage } from './photos.ts';

interface Source {
  w800: string;
  w1600: string;
}

export function initGallery(doc: Document = document): void {
  const stage = doc.querySelector<HTMLElement>('.stage');
  const hero = stage?.querySelector<HTMLElement>('.hero');
  if (!stage || !hero) return;
  const thumbs = [...stage.querySelectorAll<HTMLButtonElement>('.thumb')];
  const cap = stage.querySelector<HTMLElement>('.hero-cap');
  const dialog = doc.getElementById('lightbox') as HTMLDialogElement | null;
  const name = hero.dataset.name ?? '';
  const rot = hero.dataset.rot ?? '0';
  const sources: Source[] = thumbs.length
    ? thumbs.map((t) => ({ w800: t.dataset.src800 ?? '', w1600: t.dataset.src1600 ?? '' }))
    : hero.dataset.src800
      ? [{ w800: hero.dataset.src800, w1600: hero.dataset.src1600 ?? hero.dataset.src800 }]
      : [];
  if (sources.length === 0) return;
  let current = 0;

  const caption = (i: number): void => {
    if (!cap) return;
    cap.textContent = `Photo ${i + 1} of ${sources.length}${dialog ? ' · click to enlarge' : ''}`;
  };

  const makeImg = (cls: string, src: Source, full: boolean): HTMLImageElement => {
    const img = doc.createElement('img');
    img.className = cls;
    img.alt = full ? '' : name;
    img.decoding = 'async';
    img.dataset.rugImg = '';
    img.dataset.rot = rot;
    if (full) {
      img.srcset = `${src.w800} 800w, ${src.w1600} 1600w`;
      img.sizes = '(min-width: 900px) 55vw, 100vw';
      img.setAttribute('fetchpriority', 'low');
      img.src = src.w1600;
    } else {
      img.dataset.plateImg = '';
      img.src = src.w800;
    }
    return img;
  };

  const show = (i: number): void => {
    const src = sources[i];
    if (i === current || !src) return;
    const old = [...hero.querySelectorAll<HTMLImageElement>('img')];
    const base = makeImg('hero-base', src, false);
    const full = makeImg('hero-full', src, true);
    hero.append(base, full);
    watchImage(base);
    const done = (): void => {
      setTimeout(() => old.forEach((o) => o.remove()), 420);
    };
    if (base.complete) done();
    else {
      base.addEventListener('load', done, { once: true });
      base.addEventListener('error', done, { once: true });
    }
    current = i;
    thumbs.forEach((t, j) => t.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    caption(i);
  };

  thumbs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.i))));
  stage.querySelector('.thumbs')?.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
    let next = current;
    if (k === 'ArrowRight') next = (current + 1) % sources.length;
    if (k === 'ArrowLeft') next = (current - 1 + sources.length) % sources.length;
    if (k === 'Home') next = 0;
    if (k === 'End') next = sources.length - 1;
    e.preventDefault();
    show(next);
    thumbs[next]?.focus();
  });

  if (!dialog) return;
  const lbStage = dialog.querySelector<HTMLElement>('.lb-stage');
  const count = dialog.querySelector<HTMLElement>('.lb-count');
  if (!lbStage) return;
  let lbIndex = 0;

  const render = (i: number): void => {
    const src = sources[i];
    if (!src) return;
    lbIndex = i;
    lbStage.querySelector('.lb-img')?.remove();
    const img = doc.createElement('img');
    img.className = 'lb-img';
    img.alt = name;
    img.decoding = 'async';
    img.dataset.rugImg = '';
    img.dataset.plateImg = '';
    img.dataset.rot = rot;
    img.src = src.w1600;
    lbStage.append(img);
    watchImage(img);
    if (count) count.textContent = `${i + 1} / ${sources.length}`;
  };
  const move = (delta: number): void => render((lbIndex + delta + sources.length) % sources.length);
  const open = (): void => {
    render(current);
    dialog.showModal();
  };

  hero.querySelector('.hero-open')?.addEventListener('click', open);
  dialog.querySelector('.lb-close')?.addEventListener('click', () => dialog.close());
  dialog.querySelector('.lb-prev')?.addEventListener('click', () => move(-1));
  dialog.querySelector('.lb-next')?.addEventListener('click', () => move(1));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // backdrop click
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else return;
    e.preventDefault();
  });
  let downX: number | null = null;
  dialog.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
  });
  dialog.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 40 && sources.length > 1) move(dx < 0 ? 1 : -1);
  });
  dialog.addEventListener('close', () => {
    if (lbIndex !== current) show(lbIndex); // the hero follows the viewer
  });
}
