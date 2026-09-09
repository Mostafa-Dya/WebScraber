import { describe, expect, it } from 'vitest';
import { clientIp, isIp } from '../../src/lib/ip.ts';
import {
  ipHash,
  newVisitorId,
  VISITOR_ID_RE,
  visitorCookieName,
  visitorHash,
} from '../../src/lib/votes/identity.ts';
import { RateLimiter } from '../../src/lib/votes/ratelimit.ts';
import { uaFamily } from '../../src/lib/votes/ua.ts';

describe('clientIp (ADR D8)', () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it('uses the host header only when configured, taking its last value', () => {
    expect(
      clientIp(h({ 'do-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }), {
        header: 'do-connecting-ip',
        trustedHops: 1,
      }),
    ).toBe('203.0.113.7');
    expect(
      clientIp(h({ 'do-connecting-ip': '6.6.6.6, 203.0.113.7' }), {
        header: 'do-connecting-ip',
        trustedHops: 1,
      }),
    ).toBe('203.0.113.7');
    // Not configured: a client-supplied do-connecting-ip is ignored.
    expect(
      clientIp(h({ 'do-connecting-ip': '6.6.6.6', 'x-forwarded-for': '198.51.100.2' }), {
        header: '',
        trustedHops: 1,
      }),
    ).toBe('198.51.100.2');
  });
  it('X-Forwarded-For: the trusted proxy appends the real client, so it is the N-th entry from the right', () => {
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.2' }), { header: '', trustedHops: 1 })).toBe(
      '198.51.100.2',
    );
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 198.51.100.2' }), { header: '', trustedHops: 1 })).toBe(
      '198.51.100.2',
    ); // spoofed prefix ignored
    expect(
      clientIp(h({ 'x-forwarded-for': '6.6.6.6, 198.51.100.2, 10.0.0.1' }), { header: '', trustedHops: 2 }),
    ).toBe('198.51.100.2');
    expect(clientIp(h({ 'x-forwarded-for': '2001:db8::1' }), { header: '', trustedHops: 1 })).toBe(
      '2001:db8::1',
    );
  });
  it('ignores junk and returns undefined without headers or with too few entries', () => {
    expect(
      clientIp(h({ 'do-connecting-ip': 'not-an-ip', 'x-forwarded-for': 'garbage' }), {
        header: 'do-connecting-ip',
        trustedHops: 1,
      }),
    ).toBeUndefined();
    expect(
      clientIp(h({ 'x-forwarded-for': '198.51.100.2' }), { header: '', trustedHops: 2 }),
    ).toBeUndefined();
    expect(clientIp(h({}), { header: 'do-connecting-ip', trustedHops: 1 })).toBeUndefined();
    expect(isIp('999.1.1.1')).toBe(false);
  });
});

describe('identity', () => {
  it('mints 128-bit ids, hashes with the salt, never exposes the raw value', () => {
    const id = newVisitorId();
    expect(id).toMatch(VISITOR_ID_RE);
    const hash = visitorHash('s'.repeat(32), id);
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(hash).not.toContain(id.slice(0, 8));
    expect(visitorHash('a'.repeat(32), id)).not.toBe(visitorHash('b'.repeat(32), id));
    expect(ipHash('salt', '203.0.113.7')).toMatch(/^[a-f0-9]{32}$/);
    expect(ipHash('salt', undefined)).toBe(ipHash('salt', undefined));
    expect(visitorCookieName(true)).toBe('__Host-sl_v');
    expect(visitorCookieName(false)).toBe('sl_v');
  });
});

describe('RateLimiter', () => {
  it('counts per key within a fixed window, resets after it, and can refund', () => {
    let t = 0;
    const rl = new RateLimiter({ now: () => t });
    expect(rl.allow('k', 2, 1000)).toMatchObject({ ok: true, remaining: 1 });
    expect(rl.allow('k', 2, 1000)).toMatchObject({ ok: true, remaining: 0 });
    expect(rl.allow('k', 2, 1000)).toMatchObject({ ok: false, retryAfterSec: 1 });
    expect(rl.wouldAllow('k', 2, 1000).ok).toBe(false);
    rl.refund('k');
    expect(rl.wouldAllow('k', 2, 1000)).toMatchObject({ ok: true, remaining: 1 });
    expect(rl.allow('other', 2, 1000).ok).toBe(true);
    t = 1000;
    expect(rl.allow('k', 2, 1000).ok).toBe(true);
  });
  it('prunes expired keys by their own window and never evicts the global bucket', () => {
    let t = 0;
    const rl = new RateLimiter({ now: () => t, maxKeys: 5 });
    rl.allow('global', 10, 60_000);
    for (let i = 0; i < 4; i++) rl.allow(`k${i}`, 1, 100);
    t = 200;
    rl.allow('new', 1, 100);
    expect(rl.size).toBeLessThanOrEqual(5);
    expect(rl.wouldAllow('global', 10, 60_000).remaining).toBe(9);
    // Cap exceeded with nothing expired: oldest non-protected keys go first.
    for (let i = 0; i < 20; i++) rl.allow(`fresh${i}`, 1, 60_000);
    expect(rl.size).toBeLessThanOrEqual(6);
    expect(rl.wouldAllow('global', 10, 60_000).remaining).toBe(9);
  });
});

describe('uaFamily', () => {
  it('reduces user agents to browser/OS and never returns the raw string', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
    expect(uaFamily(chrome)).toBe('Chrome/Windows');
    expect(
      uaFamily(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari/iOS');
    expect(uaFamily('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe(
      'Firefox/Linux',
    );
    expect(uaFamily('curl/8.4.0')).toBe('Bot/Other');
    expect(uaFamily(null)).toBe('unknown');
    expect(uaFamily('=1+1' + 'x'.repeat(1000)).length).toBeLessThanOrEqual(64);
  });
});
