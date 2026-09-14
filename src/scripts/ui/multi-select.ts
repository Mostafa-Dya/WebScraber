// Multi-select dropdown behaviour (src/components/ui/MultiSelect.astro).
//
// <details> already gives open/close, Space/Enter and the disclosure semantics, and the options are
// real checkboxes, so this file adds only the three things the platform does not:
//
//   1. the summary line — "Kilims", "Kilims +2", or the placeholder;
//   2. Esc closes and returns focus to the trigger, because a dropdown that traps you is worse than
//      no dropdown;
//   3. a click outside closes it, which is the one behaviour every user already expects from a
//      dropdown and the only one <details> genuinely lacks.
//
// Deliberately NOT here: closing on select. The whole point of a multi-select is choosing several
// things, and a panel that shuts after the first tick makes the second choice cost a second open.

/** Reads the checked options in DOM order. */
function chosen(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((b) => b.checked);
}

/** "Kilims" / "Kilims +2" / the placeholder — the closed control's whole content. */
function summarise(root: HTMLElement): void {
  const value = root.querySelector<HTMLElement>('[data-msel-value]');
  if (!value) return;
  const picked = chosen(root);
  const placeholder = root.dataset.placeholder ?? 'Select…';
  const first = picked[0];
  // textContent, never innerHTML: these labels are sheet text the owner typed.
  value.textContent = first ? (first.closest('label')?.textContent ?? '').trim() || first.value : placeholder;
  value.classList.toggle('is-empty', picked.length === 0);

  let more = root.querySelector<HTMLElement>('[data-msel-more]');
  const extra = picked.length > 1 ? `+${picked.length - 1}` : '';
  if (!extra) {
    more?.remove();
    return;
  }
  if (!more) {
    more = root.ownerDocument.createElement('span');
    more.className = 'msel__more';
    more.dataset.mselMore = '';
    value.after(more);
  }
  more.textContent = extra;
}

/** The values currently chosen in a multi-select, for a form serialiser. */
export function multiSelectValues(root: HTMLElement): string[] {
  return chosen(root).map((b) => b.value);
}

/** Ticks exactly `values`, then refreshes the summary. Used when a form loads or resets. */
export function setMultiSelect(root: HTMLElement, values: readonly string[]): void {
  const wanted = new Set(values.map((v) => v.trim().toLowerCase()));
  for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    box.checked = wanted.has(box.value.trim().toLowerCase());
  }
  summarise(root);
}

export function bindMultiSelects(doc: Document = document): () => void {
  const onChange = (e: Event): void => {
    const root = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-multi-select]');
    if (root) summarise(root);
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    const root = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-multi-select]');
    const details = root?.querySelector<HTMLDetailsElement>('details');
    if (!details?.open) return;
    e.preventDefault();
    details.open = false;
    details.querySelector<HTMLElement>('summary')?.focus();
  };

  const onPointerDown = (e: Event): void => {
    const target = e.target as HTMLElement | null;
    const inside = target?.closest<HTMLElement>('[data-multi-select]');
    for (const root of doc.querySelectorAll<HTMLElement>('[data-multi-select]')) {
      if (root === inside) continue;
      const details = root.querySelector<HTMLDetailsElement>('details');
      if (details?.open) details.open = false;
    }
  };

  doc.addEventListener('change', onChange);
  doc.addEventListener('keydown', onKeydown);
  doc.addEventListener('pointerdown', onPointerDown);
  for (const root of doc.querySelectorAll<HTMLElement>('[data-multi-select]')) summarise(root);

  return () => {
    doc.removeEventListener('change', onChange);
    doc.removeEventListener('keydown', onKeydown);
    doc.removeEventListener('pointerdown', onPointerDown);
  };
}

export function initMultiSelects(): void {
  if (typeof document === 'undefined') return;
  bindMultiSelects();
}
