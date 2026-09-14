// @vitest-environment happy-dom
// The login lockout countdown — Figma 63:487 (06 · States & Edge Cases).
//
// "The counter ticks visibly. A static message reads as broken; a countdown reads as finite."
//
// The behaviour that matters is what happens at ZERO: the wait ends, and the owner gets the control
// back without reloading. Reloading a throttled login is the one action that makes it worse, and a
// frozen counter is exactly what provokes it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindLockout } from '../../../src/scripts/admin/lockout.ts';

const off: Array<() => void> = [];
afterEach(() => {
  while (off.length) off.pop()?.();
  vi.useRealTimers();
});

/** The A3 markup as login.astro renders it when the throttle refuses the attempt. */
function mount(seconds: number): void {
  document.body.innerHTML = `
    <form>
      <div class="field">
        <input class="input input--password" type="password" id="password" name="password" disabled />
        <p class="field__message field__message--warning" id="password-error">
          Too many attempts — wait 60s. ${seconds}s remaining.
        </p>
      </div>
      <button type="submit" class="btn btn--primary" disabled>Locked</button>
    </form>`;
}

const message = (): string => document.querySelector('.field__message--warning')!.textContent!.trim();
const field = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[type="password"]')!;
const submit = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;

describe('ticking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mount(3);
  });

  it('counts down once a second, keeping the rest of the sentence intact', () => {
    off.push(bindLockout());
    expect(message()).toContain('3s remaining');
    vi.advanceTimersByTime(1000);
    // The "wait 60s" half is the POLICY and must not be decremented with the counter.
    expect(message()).toBe('Too many attempts — wait 60s. 2s remaining.');
    vi.advanceTimersByTime(1000);
    expect(message()).toContain('1s remaining');
  });

  it('hands the form back at zero instead of making them reload', () => {
    off.push(bindLockout());
    expect(field().disabled).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(message()).toBe('You can try again now.');
    expect(field().disabled).toBe(false);
    expect(submit().disabled).toBe(false);
    // The button goes back to A1's wording: the field is empty now, not locked.
    expect(submit().textContent).toBe('Enter');
  });

  it('stops ticking once it has finished', () => {
    off.push(bindLockout());
    vi.advanceTimersByTime(10_000);
    expect(message()).toBe('You can try again now.');
  });
});

describe('when there is nothing to count', () => {
  it('does nothing on a page with no lockout message (A1 and A2)', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <form>
        <input class="input input--password" type="password" id="password" />
        <p class="field__message field__message--danger">That password is not correct.</p>
        <button type="submit" class="btn btn--primary">Enter</button>
      </form>`;
    expect(() => off.push(bindLockout())).not.toThrow();
    vi.advanceTimersByTime(5000);
    // A2's field must stay usable and its message untouched.
    expect(document.querySelector('.field__message--danger')!.textContent).toContain(
      'That password is not correct.',
    );
  });

  it('does nothing when the message carries no seconds', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <form>
        <input class="input input--password" type="password" disabled />
        <p class="field__message field__message--warning">Too many attempts.</p>
        <button type="submit" disabled>Locked</button>
      </form>`;
    expect(() => off.push(bindLockout())).not.toThrow();
    vi.advanceTimersByTime(5000);
    // Nothing to count down to, so the field stays locked rather than being freed early.
    expect(document.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  });
});

describe('teardown', () => {
  it('stops the timer when unbound, so a detached page cannot keep ticking', () => {
    vi.useFakeTimers();
    mount(5);
    const stop = bindLockout();
    stop();
    vi.advanceTimersByTime(3000);
    expect(message()).toContain('5s remaining');
  });
});
