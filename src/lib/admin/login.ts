// Login throttling (docs/ADMIN_SPEC.md §1.3, §9.3), pure. Every limit is checked BEFORE scrypt runs
// (a verification costs ~184 ms of CPU and 128 MiB): 5 failures / 15 min per ip_hash, 20 / 15 min
// globally, an exponential Retry-After (1 s doubling from the 3rd failure, capped at 15 min) that is
// enforced, not only advertised, and one `auth.lockout` audit row per (key, window).
import type { RateLimiter } from '../votes/ratelimit.ts';

export const LOGIN_LIMITS = {
  perIp: { limit: 5, windowMs: 15 * 60_000 },
  global: { limit: 20, windowMs: 15 * 60_000 },
} as const;
export const RETRY_CAP_SEC = 900;
const FAIL_PREFIX = 'admin-fail:';
const GLOBAL_KEY = `${FAIL_PREFIX}global`;

/** Seconds a caller must wait after `failures` consecutive failures: 0, 0, 1, 2, 4, … ≤ 900. */
export function retryAfterSec(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(RETRY_CAP_SEC, 2 ** (failures - 3));
}

export type LoginCheck =
  | { ok: true }
  | {
      ok: false;
      /** `locked` = a window limit is exhausted; `backoff` = inside the exponential delay. */
      reason: 'locked' | 'backoff';
      retryAfterSec: number;
      /** True exactly once per (key, window): the caller writes the `auth.lockout` audit row. */
      auditLockout: boolean;
      /** Which limit tripped (audit note). */
      scope: 'ip' | 'global';
    };

export interface LoginFailure {
  retryAfterSec: number;
  auditLockout: boolean;
  scope: 'ip' | 'global';
  failures: number;
}

interface IpState {
  failures: number;
  notBefore: number;
  windowStart: number;
}

export class LoginThrottle {
  private readonly limiter: RateLimiter;
  private readonly now: () => number;
  private readonly ips = new Map<string, IpState>();
  private readonly lockoutAudited = new Map<string, number>(); // key → window start
  private readonly maxKeys: number;

  constructor(limiter: RateLimiter, options: { now?: () => number; maxKeys?: number } = {}) {
    this.limiter = limiter;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 2000;
  }

  private ipKey(ipHash: string): string {
    return `${FAIL_PREFIX}${ipHash}`;
  }

  /** Per-ip bookkeeping, reset when the limiter's window for that ip has rolled over. */
  private state(ipHash: string): IpState {
    const t = this.now();
    const key = this.ipKey(ipHash);
    const fresh = this.limiter.wouldAllow(key, LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowMs);
    let s = this.ips.get(ipHash);
    if (!s || (fresh.ok && fresh.remaining === LOGIN_LIMITS.perIp.limit)) {
      s = { failures: 0, notBefore: 0, windowStart: t };
      this.ips.set(ipHash, s);
      if (this.ips.size > this.maxKeys) this.prune(t);
    }
    return s;
  }

  private prune(t: number): void {
    for (const [k, s] of this.ips) {
      if (t - s.windowStart >= LOGIN_LIMITS.perIp.windowMs && t >= s.notBefore) this.ips.delete(k);
    }
    for (const [k, end] of this.lockoutAudited) if (t >= end) this.lockoutAudited.delete(k);
  }

  /**
   * Marks the lockout as audited for the window that ends in `retryAfterSec`; true the first time
   * only (successive checks in the same window compute the same end, give or take a second).
   */
  private firstLockout(key: string, retryAfterSec: number): boolean {
    const end = this.now() + retryAfterSec * 1000;
    const prior = this.lockoutAudited.get(key);
    if (prior !== undefined && Math.abs(prior - end) < 2_000) return false;
    this.lockoutAudited.set(key, end);
    return true;
  }

  /** Call before verifying a password. Consumes nothing. */
  check(ipHash: string): LoginCheck {
    const t = this.now();
    const s = this.state(ipHash);
    const global = this.limiter.wouldAllow(
      GLOBAL_KEY,
      LOGIN_LIMITS.global.limit,
      LOGIN_LIMITS.global.windowMs,
    );
    if (!global.ok) {
      return {
        ok: false,
        reason: 'locked',
        retryAfterSec: global.retryAfterSec,
        auditLockout: this.firstLockout(GLOBAL_KEY, global.retryAfterSec),
        scope: 'global',
      };
    }
    const ip = this.limiter.wouldAllow(
      this.ipKey(ipHash),
      LOGIN_LIMITS.perIp.limit,
      LOGIN_LIMITS.perIp.windowMs,
    );
    if (!ip.ok) {
      return {
        ok: false,
        reason: 'locked',
        retryAfterSec: ip.retryAfterSec,
        auditLockout: this.firstLockout(this.ipKey(ipHash), ip.retryAfterSec),
        scope: 'ip',
      };
    }
    if (t < s.notBefore) {
      return {
        ok: false,
        reason: 'backoff',
        retryAfterSec: Math.max(1, Math.ceil((s.notBefore - t) / 1000)),
        auditLockout: false,
        scope: 'ip',
      };
    }
    return { ok: true };
  }

  /** Records a failed verification: consumes one unit from both windows, sets the backoff. */
  fail(ipHash: string): LoginFailure {
    const t = this.now();
    const s = this.state(ipHash);
    const ip = this.limiter.allow(this.ipKey(ipHash), LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowMs);
    const global = this.limiter.allow(GLOBAL_KEY, LOGIN_LIMITS.global.limit, LOGIN_LIMITS.global.windowMs);
    s.failures += 1;
    let retry = retryAfterSec(s.failures);
    let scope: 'ip' | 'global' = 'ip';
    let auditLockout = false;
    if (ip.ok && ip.remaining === 0) {
      // This failure exhausted the per-ip window: the lockout lasts until the window resets.
      const remaining = this.limiter.wouldAllow(
        this.ipKey(ipHash),
        LOGIN_LIMITS.perIp.limit,
        LOGIN_LIMITS.perIp.windowMs,
      );
      retry = Math.max(retry, remaining.retryAfterSec);
      auditLockout = this.firstLockout(this.ipKey(ipHash), remaining.retryAfterSec);
    }
    if (global.ok && global.remaining === 0) {
      const remaining = this.limiter.wouldAllow(
        GLOBAL_KEY,
        LOGIN_LIMITS.global.limit,
        LOGIN_LIMITS.global.windowMs,
      );
      retry = Math.max(retry, remaining.retryAfterSec);
      scope = 'global';
      auditLockout = this.firstLockout(GLOBAL_KEY, remaining.retryAfterSec) || auditLockout;
    }
    s.notBefore = t + retry * 1000;
    return { retryAfterSec: retry, auditLockout, scope, failures: s.failures };
  }

  /** A successful login refunds the ip's window and clears its backoff (the global window is kept). */
  succeed(ipHash: string): void {
    const s = this.ips.get(ipHash);
    if (s) {
      for (let i = 0; i < s.failures; i++) this.limiter.refund(this.ipKey(ipHash));
      this.ips.delete(ipHash);
    }
  }
}

/** Only `/admin`, `/admin/...` with url-safe segments may be a post-login destination. */
export const NEXT_RE = /^\/admin(\/[A-Za-z0-9_\-/]*)?$/;

export function sanitiseNext(value: unknown, fallback = '/admin'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (!NEXT_RE.test(v) || v.startsWith('//') || v === '/admin/login' || v === '/admin/logout')
    return fallback;
  return v;
}
