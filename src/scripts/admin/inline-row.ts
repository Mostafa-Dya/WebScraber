// Inline row editing — Figma Inline Row 78:325, used on P2 (79:1344).
//
// "Correcting a scraped title is a two-second edit. Opening a page to make it is the expensive
// part. Enter commits, Esc reverts, Tab moves on." (revision 161:335)
//
// The four drawn states map to classes on the row, not to replacement markup, because the row must
// keep its position throughout — a saving row DIMS rather than being swapped for a spinner, which
// is the promise the P2 footnote makes. Replacing the node would also lose the scroll anchor and
// the focus ring.
//
// Only the Title cell is editable here. Figma draws exactly one editable cell per row (the Title on
// the editing state, the ID on the error state), and the error state's ID input is the duplicate-ID
// recovery path rather than a general-purpose field — so widening this to "any cell" would be
// inventing an interaction the file does not draw.
import { post, type ApiOptions } from './api.ts';

const SAVED_HOLD_MS = 1200;

interface RugPatchResponse {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** The row's four drawn states. `read` is the server-rendered resting state. */
type RowState = 'read' | 'editing' | 'saving' | 'error';

function setState(row: HTMLElement, state: RowState): void {
  for (const s of ['editing', 'saving', 'error'] as const) {
    row.classList.toggle(`irow--${s}`, s === state);
  }
}

function showMessage(row: HTMLElement, text: string | null): void {
  const el = row.querySelector<HTMLElement>('.irow__message');
  if (!el) return;
  if (text === null) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = text;
  el.hidden = false;
}

export interface InlineRowBindings {
  doc?: Document;
  api?: ApiOptions;
}

export function bindInlineRows(opts: InlineRowBindings = {}): () => void {
  const doc = opts.doc ?? document;

  /** Turn the Title cell into an input, preserving the row's height contract. */
  const beginEdit = (row: HTMLElement): void => {
    if (row.classList.contains('irow--editing') || row.classList.contains('irow--saving')) return;
    const cell = row.querySelector<HTMLElement>('[data-cell="name"]');
    const action = row.querySelector<HTMLElement>('.irow__action');
    if (!cell || !action) return;

    // textContent, not a mirrored attribute: the cell already holds the value it is showing.
    const original = (cell.textContent ?? '').trim();
    const input = doc.createElement('input');
    input.type = 'text';
    input.className = 'input irow__input';
    input.value = original;
    input.setAttribute('aria-label', 'Title');
    cell.replaceChildren(input);

    const priorAction = action.innerHTML;
    action.innerHTML = '';
    const save = doc.createElement('button');
    save.type = 'button';
    save.className = 'btn btn--primary';
    save.textContent = 'Save';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost';
    cancel.textContent = 'Cancel';
    action.append(save, cancel);

    setState(row, 'editing');
    showMessage(row, null);
    input.focus();
    input.select();

    const restore = (value: string): void => {
      cell.replaceChildren(doc.createTextNode(value));
      action.innerHTML = priorAction;
      setState(row, 'read');
    };

    const commit = async (): Promise<void> => {
      const next = input.value.trim();
      if (!next || next === original) {
        restore(original);
        return;
      }
      setState(row, 'saving');
      const id = row.dataset.id ?? '';
      const res = await post<RugPatchResponse>(
        `/api/admin/rugs/${encodeURIComponent(id)}`,
        { name: next },
        opts.api,
      );
      if (res.ok) {
        restore(next);
        showMessage(row, null);
        // A brief confirmation, then back to rest: the row never leaves the list.
        row.classList.add('irow--saved');
        setTimeout(() => row.classList.remove('irow--saved'), SAVED_HOLD_MS);
      } else {
        setState(row, 'error');
        showMessage(row, res.message ?? res.error ?? 'That change was not saved.');
        input.focus();
      }
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        restore(original);
      }
      // Tab is deliberately left alone: the browser already moves to the next control, and the
      // blur handler commits, which is exactly "Tab moves on".
    };

    const onBlur = (): void => {
      // Blur can fire because Cancel was pressed; let the click land first.
      setTimeout(() => {
        if (row.classList.contains('irow--editing') && doc.activeElement !== input) void commit();
      }, 0);
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', onBlur);
    save.addEventListener('click', () => void commit());
    cancel.addEventListener('click', () => restore(original));
  };

  const onClick = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const trigger = target.closest<HTMLElement>('[data-edit]');
    const cell = target.closest<HTMLElement>('[data-cell]');
    const row = (trigger ?? cell)?.closest<HTMLElement>('[data-row]');
    if (row && (trigger || cell)) beginEdit(row);
  };

  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

export function initInlineRows(): void {
  if (typeof document === 'undefined') return;
  bindInlineRows();
}
