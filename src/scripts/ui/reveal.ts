// The password reveal toggle on Input (Figma Icon / Eye 14:14, Icon / Eye Off 14:18).
//
// The same control gate.ts already binds for the customer gate, generalised so every password field
// gets it: a password typed off a phone call is mistyped often enough that being able to look at it
// matters more than the shoulder-surfing risk on a private tool. The button is `aria-pressed`, so a
// screen reader hears the state rather than a label that lies, and the visible glyph swaps with it.

export interface RevealBindings {
  doc?: Document;
}

/**
 * Binds every `[data-reveal]` button to the field named by its value. Returns a teardown that
 * removes the listeners, matching the convention the other scripts in this repo follow.
 */
export function bindReveal(opts: RevealBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>('button[data-reveal]'));
  const bound: { button: HTMLButtonElement; handler: () => void }[] = [];

  for (const button of buttons) {
    const id = button.getAttribute('data-reveal');
    if (!id) continue;
    const input = doc.getElementById(id);
    if (!(input instanceof HTMLInputElement)) continue;

    const handler = (): void => {
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      button.setAttribute('aria-pressed', shown ? 'false' : 'true');
      const label = button.querySelector('.sr-only');
      if (label) label.textContent = shown ? 'Show password' : 'Hide password';
      // Swap the glyph with the state: Figma draws both Eye (14:14) and Eye Off (14:18).
      const eye = button.querySelector<SVGElement>('[data-glyph="eye"]');
      const eyeOff = button.querySelector<SVGElement>('[data-glyph="eye-off"]');
      if (eye) eye.toggleAttribute('hidden', !shown);
      if (eyeOff) eyeOff.toggleAttribute('hidden', shown);
      // Keep the caret where it was: re-focusing without this jumps to the start in some browsers.
      const end = input.value.length;
      input.focus();
      if (input.type === 'text') input.setSelectionRange(end, end);
    };

    button.addEventListener('click', handler);
    bound.push({ button, handler });
  }

  return () => {
    for (const { button, handler } of bound) button.removeEventListener('click', handler);
  };
}

export function initReveal(): void {
  if (typeof document === 'undefined') return;
  bindReveal();
}
