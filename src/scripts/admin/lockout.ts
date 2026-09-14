// The login lockout countdown — Figma 63:487 (06 · States & Edge Cases).
//
//   "The counter ticks visibly. A static message reads as broken; a countdown reads as finite."
//
// That is the whole reason this file exists. The server already renders the remaining seconds and
// sends `Retry-After`, so the number is correct the moment the page loads and then immediately
// starts being wrong. A frozen "47s remaining" is indistinguishable from a page that has hung, and
// the natural response to a hung page is to reload it — which, on a throttled login, is the one
// action that makes things worse.
//
// Progressive: without JavaScript the server's number still renders and the form still posts. This
// only makes an already-correct message keep being correct.

/** Seconds remaining, parsed from the message the server rendered. */
function secondsIn(text: string): number | undefined {
  const m = /(\d+)\s*s\s*remaining/i.exec(text);
  const n = m ? Number(m[1]) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface LockoutBindings {
  doc?: Document;
  /** Injectable for tests. */
  now?: () => number;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export function bindLockout(opts: LockoutBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const every = opts.setIntervalImpl ?? setInterval;
  const stop = opts.clearIntervalImpl ?? clearInterval;

  const message = doc.querySelector<HTMLElement>('.field__message--warning');
  const field = doc.querySelector<HTMLInputElement>('input[type="password"]');
  const submit = doc.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!message || !field || !submit) return () => {};

  const template = message.textContent ?? '';
  let left = secondsIn(template);
  if (left === undefined) return () => {};

  const render = (n: number): void => {
    message.textContent = template.replace(/\d+\s*s\s*remaining/i, `${n}s remaining`);
  };

  const timer = every(() => {
    left = (left ?? 1) - 1;
    if (left > 0) {
      render(left);
      return;
    }
    stop(timer);
    // The wait is over: give the control back rather than making them reload. The button label
    // returns to the A1 wording because the field is no longer locked, only empty.
    message.textContent = 'You can try again now.';
    field.disabled = false;
    submit.disabled = false;
    submit.textContent = 'Enter';
    field.focus();
  }, 1000);

  return () => stop(timer);
}

export function initLockout(): void {
  if (typeof document === 'undefined') return;
  bindLockout();
}
