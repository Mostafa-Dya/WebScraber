// Astro's container API resolves `.astro` imports through Node's SSR conditions, so a test that
// *renders a component* and *drives its client script* cannot use the happy-dom test environment
// (there the import resolves to the client build and the default export is empty). Such tests run in
// the node environment and install a happy-dom window on globalThis with this helper instead.
import { Window } from 'happy-dom';

const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLDialogElement',
  'DOMParser',
  'CSS',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;

export interface InstalledDom {
  window: Window;
  /** Restores whatever globalThis held before (call in afterAll). */
  restore: () => void;
}

/** Puts a fresh happy-dom window's globals on globalThis; returns the window and an undo function. */
export function installDom(url = 'http://localhost/'): InstalledDom {
  const win = new Window({ url });
  const source = win as unknown as Record<string, unknown>;
  const target = globalThis as unknown as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of GLOBALS) {
    const value = source[key];
    if (value === undefined) continue;
    previous.set(key, Object.getOwnPropertyDescriptor(target, key));
    try {
      Object.defineProperty(target, key, { value, writable: true, configurable: true });
    } catch {
      /* a non-configurable node global (rare): the test can still use win.document directly */
    }
  }
  return {
    window: win,
    restore: () => {
      for (const [key, descriptor] of previous) {
        try {
          if (descriptor) Object.defineProperty(target, key, descriptor);
          else delete target[key];
        } catch {
          /* ignore */
        }
      }
    },
  };
}
