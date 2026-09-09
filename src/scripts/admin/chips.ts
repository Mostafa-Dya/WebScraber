// Toggle chips (docs/ADMIN_SPEC.md §8.2): `button.chip[data-value][aria-pressed]` inside a container,
// single- or multi-select, roving tabindex with arrow keys like src/scripts/tabs.ts. Chips can be
// server-rendered (src/components/admin/Chips.astro) or added at runtime (`add`).
import { el } from './dom.ts';

export interface ChipsOptions {
  multi?: boolean;
  /** Single mode: whether the pressed chip may be unpressed by clicking it again (default false). */
  allowNone?: boolean;
  onChange?: (values: string[]) => void;
}

export interface ChipGroup {
  el: HTMLElement;
  buttons(): HTMLButtonElement[];
  values(): string[];
  set(values: readonly string[]): void;
  add(value: string, label: string, pressed?: boolean): HTMLButtonElement;
  has(value: string): boolean;
}

const chipSelector = 'button.chip[data-value]';

export function initChips(container: HTMLElement, opts: ChipsOptions = {}): ChipGroup {
  const multi = opts.multi ?? container.dataset.multi === 'true';
  const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>(chipSelector)];
  const values = (): string[] =>
    buttons()
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.dataset.value ?? '');

  const roving = (): void => {
    const all = buttons();
    const pressed = all.find((b) => b.getAttribute('aria-pressed') === 'true');
    const focusable = pressed ?? all[0];
    for (const b of all) b.tabIndex = b === focusable ? 0 : -1;
  };

  const paint = (b: HTMLButtonElement, on: boolean): void => {
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('on', on);
  };

  const set = (wanted: readonly string[], notify = false): void => {
    const set = new Set(wanted);
    for (const b of buttons()) paint(b, set.has(b.dataset.value ?? ''));
    roving();
    if (notify) opts.onChange?.(values());
  };

  const toggle = (b: HTMLButtonElement): void => {
    const on = b.getAttribute('aria-pressed') === 'true';
    if (multi) paint(b, !on);
    else if (on && opts.allowNone) paint(b, false);
    else for (const other of buttons()) paint(other, other === b);
    roving();
    opts.onChange?.(values());
  };

  container.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(chipSelector);
    if (!b || !container.contains(b)) return;
    e.preventDefault();
    toggle(b);
  });

  container.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const all = buttons();
    if (all.length === 0) return;
    const current = all.indexOf(e.target as HTMLButtonElement);
    const i = current < 0 ? 0 : current;
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % all.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + all.length) % all.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = all.length - 1;
    e.preventDefault();
    for (const b of all) b.tabIndex = -1;
    const target = all[next]!;
    target.tabIndex = 0;
    target.focus();
  });

  const add = (value: string, label: string, pressed = false): HTMLButtonElement => {
    const b = el(
      'button',
      {
        type: 'button',
        class: pressed ? 'chip on' : 'chip',
        'data-value': value,
        'aria-pressed': pressed ? 'true' : 'false',
      },
      label,
      container.ownerDocument,
    );
    container.appendChild(b);
    roving();
    return b;
  };

  for (const b of buttons())
    paint(b, b.getAttribute('aria-pressed') === 'true' || b.classList.contains('on'));
  roving();
  return {
    el: container,
    buttons,
    values,
    set: (v) => set(v, false),
    add,
    has: (value) => buttons().some((b) => b.dataset.value === value),
  };
}
