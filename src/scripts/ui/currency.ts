// Currency Picker behaviour — Figma set 123:402, keyboard contract from handoff 161:546.
//
// A listbox: Enter or Space opens, arrows move, Enter selects, Escape closes and returns focus to
// the trigger. A click outside closes, and the trigger keeps focus either way (161:526).
//
// ADR D18 recorded the earlier decision to leave this as a native <select> precisely because a
// hand-rolled listbox has to re-earn keyboard handling and screen-reader support. That trade is
// reversed here: the drawn Open panel is now built, so the keyboard contract is implemented in full
// rather than approximated. The panel is a real button list, so it stays operable without pointer.

export interface CurrencyBindings {
  doc?: Document;
  /** Called with the chosen code so the page can reconvert every price at once. */
  onSelect?: (code: string) => void;
}

export function bindCurrency(opts: CurrencyBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const roots = Array.from(doc.querySelectorAll<HTMLElement>('[data-currency]'));
  const teardown: (() => void)[] = [];

  for (const root of roots) {
    const trigger = root.querySelector<HTMLButtonElement>('[data-currency-trigger]');
    const menu = root.querySelector<HTMLElement>('[data-currency-menu]');
    if (!trigger || !menu) continue;

    const options = (): HTMLButtonElement[] =>
      Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-currency-option]'));

    const close = (focusTrigger: boolean): void => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (focusTrigger) trigger.focus();
    };

    const open = (): void => {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      const current = options().find((o) => o.getAttribute('aria-selected') === 'true');
      (current ?? options()[0])?.focus();
    };

    const onTrigger = (): void => {
      if (menu.hidden) open();
      else close(true);
    };

    const select = (code: string): void => {
      const value = root.querySelector('[data-currency-value]');
      if (value) value.textContent = code;
      trigger.setAttribute('aria-label', `Currency, ${code}`);
      for (const o of options()) {
        o.setAttribute('aria-selected', o.getAttribute('data-currency-option') === code ? 'true' : 'false');
      }
      close(true);
      opts.onSelect?.(code);
    };

    const onMenuClick = (e: Event): void => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-currency-option]');
      const code = target?.getAttribute('data-currency-option');
      if (code) select(code);
    };

    const onMenuKey = (e: KeyboardEvent): void => {
      const items = options();
      const i = items.indexOf(doc.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[Math.min(i + 1, items.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[Math.max(i - 1, 0)]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    const onTriggerKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open();
      }
    };

    const onDocClick = (e: Event): void => {
      if (menu.hidden) return;
      if (!root.contains(e.target as Node)) close(false);
    };

    trigger.addEventListener('click', onTrigger);
    trigger.addEventListener('keydown', onTriggerKey);
    menu.addEventListener('click', onMenuClick);
    menu.addEventListener('keydown', onMenuKey);
    doc.addEventListener('click', onDocClick);

    teardown.push(() => {
      trigger.removeEventListener('click', onTrigger);
      trigger.removeEventListener('keydown', onTriggerKey);
      menu.removeEventListener('click', onMenuClick);
      menu.removeEventListener('keydown', onMenuKey);
      doc.removeEventListener('click', onDocClick);
    });
  }

  return () => {
    for (const fn of teardown) fn();
  };
}

export function initCurrency(): void {
  if (typeof document === 'undefined') return;
  bindCurrency();
}
