// Copy to Clipboard — Figma set 22:160, and the copy affordances inside the Credential Panel (20:91).
//
// Binds every `[data-copy]` control. The copied state holds for 2s, matching the component, and the
// label swaps with it so the confirmation is readable rather than only a colour change — a colour-only
// confirmation is invisible to anyone who cannot distinguish the green.
//
// The result is announced through a polite live region: a copy that silently succeeds is
// indistinguishable from one that silently failed.

const HOLD_MS = 2000;

export interface CopyBindings {
  doc?: Document;
  /** Injectable for tests; falls back to the async clipboard API. */
  write?: (text: string) => Promise<void>;
}

function ensureLiveRegion(doc: Document): HTMLElement {
  const existing = doc.getElementById('sl-copy-status');
  if (existing) return existing;
  const el = doc.createElement('p');
  el.id = 'sl-copy-status';
  el.className = 'sr-only';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  doc.body.appendChild(el);
  return el;
}

export function bindCopy(opts: CopyBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const write =
    opts.write ??
    ((text: string) => {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        return Promise.reject(new Error('clipboard unavailable'));
      }
      return navigator.clipboard.writeText(text);
    });

  const buttons = Array.from(doc.querySelectorAll<HTMLElement>('[data-copy]'));
  const bound: { el: HTMLElement; handler: () => void }[] = [];
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  for (const el of buttons) {
    const handler = (): void => {
      const value = el.getAttribute('data-copy') ?? '';
      if (!value) return;
      void write(value).then(
        () => {
          const status = ensureLiveRegion(doc);
          const label = el.querySelector('[data-copy-label]');
          const copied = el.getAttribute('data-copied-label') ?? 'Copied';
          const original = el.getAttribute('data-label') ?? label?.textContent ?? '';

          el.classList.add('is-copied');
          if (label) label.textContent = copied;
          status.textContent = 'Copied to clipboard';

          const prior = timers.get(el);
          if (prior) clearTimeout(prior);
          timers.set(
            el,
            setTimeout(() => {
              el.classList.remove('is-copied');
              if (label) label.textContent = original;
              timers.delete(el);
            }, HOLD_MS),
          );
        },
        () => {
          ensureLiveRegion(doc).textContent = 'Could not copy — select the text and copy manually.';
        },
      );
    };
    el.addEventListener('click', handler);
    bound.push({ el, handler });
  }

  return () => {
    for (const { el, handler } of bound) el.removeEventListener('click', handler);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}

export function initCopy(): void {
  if (typeof document === 'undefined') return;
  bindCopy();
}
