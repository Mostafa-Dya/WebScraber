// @vitest-environment happy-dom
// The two client modules the private preview adds: the password form (brief §10) and the collection
// description clamp (brief §7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindGate } from '../../src/scripts/gate.ts';
import { bindLede } from '../../src/scripts/lede.ts';

function page(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

const GATE = `
  <form data-gate="hala" method="post" action="/api/customers/hala/login">
    <input name="password" type="password" />
    <button type="submit" data-gate-submit>Open my preview</button>
    <p data-gate-error role="alert" hidden></p>
  </form>`;

describe('gate.ts', () => {
  it('posts the password as JSON and follows the redirect on success', async () => {
    page(GATE);
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true, redirect: '/hala' }), { status: 200 });
    }) as unknown as typeof fetch;
    const reload = vi.fn();
    const unbind = bindGate({ fetchImpl, reload });
    document.querySelector<HTMLInputElement>('input')!.value = 'amber-loom-serai-47';
    document.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.url).toContain('/api/customers/hala/login');
    expect(calls[0]?.body).toEqual({ password: 'amber-loom-serai-47' });
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/hala'));
    unbind();
  });

  it('shows a readable message for a wrong password and puts focus back in the field', async () => {
    page(GATE);
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'invalid credentials' }), {
        status: 401,
      })) as unknown as typeof fetch;
    const reload = vi.fn();
    const unbind = bindGate({ fetchImpl, reload });
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.value = 'wrong-wrong-wrong-01';
    document.querySelector<HTMLFormElement>('form')!.requestSubmit();
    const error = document.querySelector<HTMLElement>('[data-gate-error]')!;
    await vi.waitFor(() => expect(error.hidden).toBe(false));
    expect(error.textContent).toContain('did not match');
    // Never says whether the customer exists — only that the password was wrong.
    expect(error.textContent).not.toContain('no such');
    expect(reload).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    unbind();
  });

  it('names the throttle and survives a network failure without a redirect', async () => {
    page(GATE);
    const throttled = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'too many attempts' }), {
        status: 429,
      })) as unknown as typeof fetch;
    const reload = vi.fn();
    let unbind = bindGate({ fetchImpl: throttled, reload });
    document.querySelector<HTMLInputElement>('input')!.value = 'x'.repeat(12);
    document.querySelector<HTMLFormElement>('form')!.requestSubmit();
    const error = document.querySelector<HTMLElement>('[data-gate-error]')!;
    await vi.waitFor(() => expect(error.textContent).toContain('Too many attempts'));
    unbind();

    const dead = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    unbind = bindGate({ fetchImpl: dead, reload });
    document.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await vi.waitFor(() => expect(error.textContent).toContain('network'));
    expect(reload).not.toHaveBeenCalled();
    unbind();
  });

  it('does nothing on a page with no gate form', () => {
    page('<p>no form here</p>');
    expect(() => bindGate()()).not.toThrow();
  });
});

describe('lede.ts', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => {
    unbind?.();
    unbind = undefined;
  });
  const lede = (visible = true) => `
    <div data-standfirst ${visible ? '' : 'hidden'}>
      <p class="lede-text" data-lede>
        <span class="lede-body">Flatweaves from Denizli, woven on the old looms.</span>
        <button type="button" class="lede-more" data-lede-more hidden>See more</button>
      </p>
    </div>`;

  /** happy-dom reports 0 for every layout box, so clipping is scripted per element. */
  const setClipped = (clipped: boolean): void => {
    const body = document.querySelector<HTMLElement>('.lede-body')!;
    Object.defineProperty(body, 'scrollHeight', { value: clipped ? 40 : 20, configurable: true });
    Object.defineProperty(body, 'clientHeight', { value: 20, configurable: true });
  };

  it('reveals See more only when the description is actually clipped', () => {
    page(lede());
    setClipped(false);
    unbind = bindLede();
    const more = document.querySelector<HTMLButtonElement>('[data-lede-more]')!;
    // A two-word description gets no dead control, and the clamp comes off.
    expect(more.hidden).toBe(true);
    expect(document.querySelector('[data-lede]')?.classList.contains('clamped')).toBe(false);
  });

  it('clamps, reveals the control and toggles the label on click', () => {
    page(lede());
    setClipped(true);
    unbind = bindLede();
    const paragraph = document.querySelector<HTMLElement>('[data-lede]')!;
    const more = document.querySelector<HTMLButtonElement>('[data-lede-more]')!;
    expect(more.hidden).toBe(false);
    expect(paragraph.classList.contains('clamped')).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('false');

    more.click();
    expect(paragraph.classList.contains('clamped')).toBe(false);
    expect(more.textContent).toBe('See less');
    expect(more.getAttribute('aria-expanded')).toBe('true');

    more.click();
    expect(paragraph.classList.contains('clamped')).toBe(true);
    expect(more.textContent).toBe('See more');
  });

  it('keeps the control for a collection tab that is hidden at load, which cannot be measured', () => {
    page(lede(false));
    setClipped(false); // measures as unclipped only because the tab is display:none
    unbind = bindLede();
    expect(document.querySelector<HTMLButtonElement>('[data-lede-more]')?.hidden).toBe(false);
  });
});
