// Nobody may share a rate-limit bucket with everybody else.
//
// THE BUG. `clientIp` had two sources — a host-specific header (only trusted when CLIENT_IP_HEADER
// is set, which is NOT the default) and X-Forwarded-For. With neither present it returned undefined,
// and `ipHash` then hashed the literal string "unknown". Every visitor landed in one bucket, so:
//   · five wrong admin passwords from ONE person locked every admin out for fifteen minutes, and
//   · one visitor could exhaust the vote limit for the whole site.
// Behind a proxy this never happens. Exposed directly — or misconfigured — it is a one-request DoS.
//
// The socket peer address is the last resort, and deliberately last: behind a proxy the peer IS the
// proxy, which would put everyone back in one bucket.
import { describe, expect, it } from 'vitest';
import { clientIp } from '../../../src/lib/ip.ts';
import { ipHash } from '../../../src/lib/votes/identity.ts';

const SALT = 's'.repeat(40);
const opts = (over: Partial<Parameters<typeof clientIp>[1]> = {}) => ({
  header: '',
  trustedHops: 1,
  ...over,
});

describe('deriving a client identity', () => {
  it('falls back to the socket address when no proxy header is present', () => {
    const ip = clientIp(new Headers(), opts({ socketAddress: '203.0.113.9' }));
    expect(ip).toBe('203.0.113.9');
  });

  it('gives two callers two different buckets — the whole point', () => {
    const a = ipHash(SALT, clientIp(new Headers(), opts({ socketAddress: '203.0.113.9' })));
    const b = ipHash(SALT, clientIp(new Headers(), opts({ socketAddress: '198.51.100.4' })));
    expect(a).not.toBe(b);
  });

  it('still prefers the proxy header and X-Forwarded-For over the socket', () => {
    // Behind a proxy the socket peer is the PROXY, so preferring it would re-create the shared bucket.
    const viaHeader = clientIp(
      new Headers({ 'do-connecting-ip': '203.0.113.9' }),
      opts({ header: 'do-connecting-ip', socketAddress: '10.0.0.1' }),
    );
    expect(viaHeader).toBe('203.0.113.9');

    const viaXff = clientIp(
      new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
      opts({ trustedHops: 1, socketAddress: '10.0.0.1' }),
    );
    expect(viaXff).toBe('10.0.0.1'); // one trusted hop: the right-most entry is the peer the proxy saw
  });

  it('ignores a socket address that is not an address', () => {
    expect(clientIp(new Headers(), opts({ socketAddress: 'not-an-ip' }))).toBeUndefined();
    expect(clientIp(new Headers(), opts({ socketAddress: '' }))).toBeUndefined();
  });

  it('still returns undefined when there is genuinely nothing — and that is one bucket', () => {
    // Documenting the residual risk rather than pretending it is gone: with no headers AND no socket
    // address, everyone shares "unknown". That is why the deploy sets CLIENT_IP_HEADER.
    expect(clientIp(new Headers(), opts())).toBeUndefined();
    expect(ipHash(SALT, undefined)).toBe(ipHash(SALT, undefined));
  });
});
