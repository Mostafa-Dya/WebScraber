import { describe, expect, it } from 'vitest';
import { LOGIN_LIMITS, LoginThrottle, retryAfterSec, sanitiseNext } from '../../../src/lib/admin/login.ts';
import { RateLimiter } from '../../../src/lib/votes/ratelimit.ts';

function setup(): { throttle: LoginThrottle; clock: { t: number }; limiter: RateLimiter } {
  const clock = { t: 1_000_000 };
  const limiter = new RateLimiter({ now: () => clock.t });
  return { throttle: new LoginThrottle(limiter, { now: () => clock.t }), clock, limiter };
}

describe('retryAfterSec curve (ADMIN_SPEC §9.3)', () => {
  it('is 0 before the 3rd failure, then 1 s doubling, capped at 15 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryAfterSec)).toEqual([0, 0, 1, 2, 4, 8, 16]);
    expect(retryAfterSec(13)).toBe(900);
    expect(retryAfterSec(40)).toBe(900);
  });
});

describe('LoginThrottle', () => {
  it('check() consumes nothing; failures consume, back off, and lock after 5 per ip', () => {
    const { throttle, clock, limiter } = setup();
    for (let i = 0; i < 10; i++) expect(throttle.check('ip1')).toEqual({ ok: true });
    expect(limiter.size).toBe(0);
    expect(throttle.fail('ip1')).toMatchObject({ retryAfterSec: 0, auditLockout: false, failures: 1 });
    expect(throttle.fail('ip1')).toMatchObject({ retryAfterSec: 0, failures: 2 });
    const third = throttle.fail('ip1');
    expect(third).toMatchObject({ retryAfterSec: 1, auditLockout: false, failures: 3 });
    // inside the backoff the check refuses without consuming
    expect(throttle.check('ip1')).toMatchObject({ ok: false, reason: 'backoff', retryAfterSec: 1 });
    clock.t += 1000;
    expect(throttle.check('ip1')).toEqual({ ok: true });
    expect(throttle.fail('ip1')).toMatchObject({ retryAfterSec: 2, failures: 4 });
    clock.t += 2000;
    const fifth = throttle.fail('ip1');
    // 5th failure exhausts the per-ip window: Retry-After is the window remainder, audited once
    expect(fifth.auditLockout).toBe(true);
    expect(fifth.scope).toBe('ip');
    expect(fifth.retryAfterSec).toBeGreaterThan(800);
    const locked = throttle.check('ip1');
    expect(locked).toMatchObject({ ok: false, reason: 'locked', scope: 'ip', auditLockout: false });
    // another ip is unaffected
    expect(throttle.check('ip2')).toEqual({ ok: true });
    // the window rolls over
    clock.t += LOGIN_LIMITS.perIp.windowMs;
    expect(throttle.check('ip1')).toEqual({ ok: true });
  });
  it('a success refunds the ip window and clears the backoff', () => {
    const { throttle, clock } = setup();
    throttle.fail('ip1');
    throttle.fail('ip1');
    throttle.fail('ip1');
    expect(throttle.check('ip1')).toMatchObject({ ok: false, reason: 'backoff' });
    clock.t += 1000;
    throttle.succeed('ip1');
    for (let i = 0; i < 3; i++) expect(throttle.fail('ip1').retryAfterSec).toBeLessThanOrEqual(1);
    expect(throttle.fail('ip1').failures).toBe(4); // counted afresh after the refund
  });
  it('locks everyone after 20 failures in the global window and audits that once', () => {
    const { throttle, clock } = setup();
    let audited = 0;
    for (let i = 0; i < 20; i++) {
      const r = throttle.fail(`ip${i}`);
      if (r.scope === 'global' && r.auditLockout) audited++;
      clock.t += 10;
    }
    expect(audited).toBe(1);
    const check = throttle.check('fresh-ip');
    expect(check).toMatchObject({ ok: false, reason: 'locked', scope: 'global', auditLockout: false });
    clock.t += LOGIN_LIMITS.global.windowMs;
    expect(throttle.check('fresh-ip')).toEqual({ ok: true });
  });
});

describe('sanitiseNext', () => {
  it('accepts /admin paths with url-safe segments and falls back otherwise', () => {
    expect(sanitiseNext('/admin')).toBe('/admin');
    expect(sanitiseNext('/admin/rugs/SL-030')).toBe('/admin/rugs/SL-030');
    expect(sanitiseNext('/admin/')).toBe('/admin/');
    expect(sanitiseNext('/')).toBe('/admin');
    expect(sanitiseNext('/admin/../etc')).toBe('/admin');
    expect(sanitiseNext('https://evil.example/admin')).toBe('/admin');
    expect(sanitiseNext('//evil.example/admin')).toBe('/admin');
    expect(sanitiseNext('/admin?x=1')).toBe('/admin');
    expect(sanitiseNext('/administrator')).toBe('/admin');
    expect(sanitiseNext('/admin/login')).toBe('/admin');
    expect(sanitiseNext(undefined)).toBe('/admin');
    expect(sanitiseNext(42)).toBe('/admin');
  });
});
