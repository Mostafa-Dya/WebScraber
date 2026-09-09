// /admin/rugs (docs/ADMIN_SPEC.md §8.3): collection chips + status chips + search filter the
// server-rendered cards client-side (`hidden`), the photo rotate logic from the legacy page runs on
// load, and a polite count announces the result.
import { shouldRotate } from '../../lib/rotate.ts';
import { initChips } from './chips.ts';
import { byId, maybe } from './dom.ts';
import { hide, msg } from './msg.ts';

export interface ListFilter {
  /** '*' = every collection, '__none' = rugs without one, else a collection slug. */
  collection: string;
  /** 'all' or a status. */
  status: string;
  q: string;
}

export interface CardData {
  collection?: string;
  status?: string;
  search?: string;
}

/** Pure: does a card's data-* set pass the filter? */
export function matches(card: CardData, f: ListFilter): boolean {
  if (f.status !== 'all' && (card.status ?? '') !== f.status) return false;
  if (f.collection === '__none') {
    if (card.collection) return false;
  } else if (f.collection !== '*' && (card.collection ?? '') !== f.collection) return false;
  const needle = f.q.trim().toLowerCase();
  if (needle && !(card.search ?? '').includes(needle)) return false;
  return true;
}

/** Adds `.rot` to loaded photos per the sheet's rotate flag (legacy onPhoto()). */
export function bindRotate(doc: Document = document): void {
  doc.querySelectorAll<HTMLImageElement>('img[data-rot]').forEach((img) => {
    const apply = (): void => {
      if (shouldRotate(img.dataset.rot, img.naturalWidth, img.naturalHeight)) img.classList.add('rot');
    };
    if (img.complete && img.naturalWidth > 0) apply();
    else img.addEventListener('load', apply, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  });
}

export interface RugList {
  apply(): void;
  filter(): ListFilter;
}

export function initRugList(doc: Document = document): RugList {
  const q = byId<HTMLInputElement>('q', doc);
  const count = maybe('count', doc);
  const empty = maybe('empty', doc);
  const cards = [...doc.querySelectorAll<HTMLElement>('[data-card]')];

  const filter = (): ListFilter => ({
    collection: collectionChips.values()[0] ?? '*',
    status: statusChips.values()[0] ?? 'active',
    q: q.value,
  });

  const apply = (): void => {
    const f = filter();
    let shown = 0;
    for (const card of cards) {
      const on = matches(card.dataset as CardData, f);
      card.hidden = !on;
      if (on) shown++;
    }
    if (count) count.textContent = `${shown} ${shown === 1 ? 'rug' : 'rugs'} shown`;
    if (empty) {
      if (cards.length === 0) msg(empty, 'No rugs yet.', 'busy');
      else if (shown === 0) msg(empty, 'No rugs match — change the chips or the search.', 'busy');
      else hide(empty);
    }
  };

  const collectionChips = initChips(byId('collectionChips', doc), { onChange: apply });
  const statusChips = initChips(byId('statusChips', doc), { onChange: apply });
  q.addEventListener('input', apply);
  bindRotate(doc);
  apply();
  return { apply, filter };
}
