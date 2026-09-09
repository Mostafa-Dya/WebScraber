// The customer gate form (brief §10). Posts JSON to `/api/customers/{slug}/login` and reloads on
// success, so the session cookie the endpoint set is present for the next render.
//
// The form has a real `action` and `method="post"`, so it is not dead without JavaScript — but the
// endpoint answers JSON, so the fetch path is the good one and this module upgrades it. Failures
// are announced in a live region rather than an alert, and the field keeps focus so a mistyped
// password can be corrected without reaching for the mouse.
interface LoginResponse {
  ok: boolean;
  redirect?: string;
  error?: string;
  retryAfterSec?: number;
}

const MESSAGES: Record<string, string> = {
  'invalid credentials': 'That password did not match. Check the message the studio sent you.',
  'too many attempts': 'Too many attempts. Wait a moment and try again.',
  unavailable: 'The catalogue is not reachable right now. Try again in a minute.',
};

export interface GateBindings {
  doc?: Document;
  fetchImpl?: typeof fetch;
  reload?: (url: string) => void;
}

export function bindGate(opts: GateBindings = {}): () => void {
  const doc = opts.doc ?? document;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const reload = opts.reload ?? ((url: string) => location.assign(url));
  const form = doc.querySelector<HTMLFormElement>('form[data-gate]');
  if (!form) return () => {};
  const input = form.querySelector<HTMLInputElement>('input[name="password"]');
  const submit = form.querySelector<HTMLButtonElement>('[data-gate-submit]');
  const error = form.querySelector<HTMLElement>('[data-gate-error]');
  const reveal = form.querySelector<HTMLButtonElement>('[data-gate-reveal]');

  const fail = (message: string): void => {
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    input?.select();
    input?.focus();
  };

  const onSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    const password = input?.value ?? '';
    if (!password) return;
    if (error) error.hidden = true;
    submit?.setAttribute('aria-busy', 'true');
    try {
      const res = await fetchImpl(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as LoginResponse;
      if (res.ok && data.ok) {
        reload(data.redirect || location.pathname);
        return;
      }
      fail(MESSAGES[data.error ?? ''] ?? 'That did not work. Try again.');
    } catch {
      fail('The network dropped that request. Try again.');
    } finally {
      submit?.setAttribute('aria-busy', 'false');
    }
  };

  /**
   * The eye control (Figma 14:60). A password typed off a phone call is mistyped often enough that
   * being able to look at it matters more here than the shoulder-surfing risk on a private preview.
   * The button is `aria-pressed`, so a screen reader hears the state rather than a label that lies.
   */
  const onReveal = (): void => {
    if (!input || !reveal) return;
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    reveal.setAttribute('aria-pressed', shown ? 'false' : 'true');
    const label = reveal.querySelector('.sr-only');
    if (label) label.textContent = shown ? 'Show password' : 'Hide password';
    input.focus();
  };

  const handler = (e: Event): void => void onSubmit(e);
  form.addEventListener('submit', handler);
  reveal?.addEventListener('click', onReveal);
  return () => {
    form.removeEventListener('submit', handler);
    reveal?.removeEventListener('click', onReveal);
  };
}

export function initGate(): void {
  bindGate();
}
