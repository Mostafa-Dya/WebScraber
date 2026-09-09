import { describe, expect, it } from 'vitest';
import type { LookupAddress } from 'node:dns';
import {
  IMAGE_HOSTS,
  SUPPLIER_HOSTS,
  createVettedLookup,
  hostnameProblem,
  isAllowedImageUrl,
  isBlockedAddress,
  unmapIpv4,
  validateOutboundUrl,
} from '../../../src/lib/scrape/guard.ts';
import { ScrapeError } from '../../../src/lib/scrape/types.ts';

describe('BlockList (ADMIN_SPEC §4.3)', () => {
  it('unmaps IPv4-mapped IPv6 literals in both spellings', () => {
    expect(unmapIpv4('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(unmapIpv4('::FFFF:10.0.0.5')).toBe('10.0.0.5');
    expect(unmapIpv4('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(unmapIpv4('::ffff:c0a8:0101')).toBe('192.168.1.1');
    expect(unmapIpv4('2606:4700::1111')).toBe('2606:4700::1111');
    expect(unmapIpv4('8.8.8.8')).toBe('8.8.8.8');
  });

  it('blocks every private, loopback, link-local and CGNAT range', () => {
    for (const a of [
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '127.0.0.1',
      '127.255.255.254',
      '169.254.169.254',
      '0.0.0.0',
      '0.1.2.3',
      '100.64.0.1',
      '100.127.255.255',
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:192.168.1.1',
    ]) {
      expect(isBlockedAddress(a), a).toBe(true);
    }
  });

  it('lets public addresses through and treats junk as blocked', () => {
    for (const a of [
      '8.8.8.8',
      '104.16.0.1',
      '172.15.0.1',
      '172.32.0.1',
      '100.128.0.1',
      '2606:4700::1111',
      '::ffff:8.8.8.8',
    ]) {
      expect(isBlockedAddress(a), a).toBe(false);
    }
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('hostnameProblem', () => {
  it('rejects IP literals in every spelling before DNS', () => {
    for (const h of [
      '127.0.0.1',
      '127.1',
      '2130706433',
      '0x7f000001',
      '0x7f.1',
      '0177.0.0.1',
      '[::1]',
      '::1',
      '10.0.0.1',
    ]) {
      expect(hostnameProblem(h), h).toBeDefined();
    }
  });
  it('rejects localhost, internal suffixes and single-label names', () => {
    for (const h of [
      'localhost',
      'foo.localhost',
      'printer.local',
      'db.internal',
      'x.home.arpa',
      'intranet',
      '',
    ]) {
      expect(hostnameProblem(h), h).toBeDefined();
    }
  });
  it('accepts public-looking names', () => {
    for (const h of [
      ...SUPPLIER_HOSTS,
      ...IMAGE_HOSTS,
      'r.jina.ai',
      'ECARPETGALLERY.COM',
      '1password.com',
      'ecarpetgallery.com.',
    ]) {
      expect(hostnameProblem(h), h).toBeUndefined();
    }
  });
});

describe('validateOutboundUrl / isAllowedImageUrl', () => {
  it('requires https, no userinfo, no port and an allow-listed host', () => {
    expect(validateOutboundUrl('https://ecarpetgallery.com/us_en/x', SUPPLIER_HOSTS).hostname).toBe(
      'ecarpetgallery.com',
    );
    const cases: Array<[string, string]> = [
      ['http://ecarpetgallery.com/', 'invalid_url'],
      ['https://a:b@ecarpetgallery.com/', 'invalid_url'],
      ['https://ecarpetgallery.com:8443/', 'invalid_url'],
      ['https://127.0.0.1/', 'invalid_url'],
      ['https://localhost/', 'invalid_url'],
      ['https://example.com/', 'unsupported_host'],
      ['https://ecarpetgallery.com.evil.example/', 'unsupported_host'],
      ['nope', 'invalid_url'],
    ];
    for (const [url, code] of cases) {
      let caught: unknown;
      try {
        validateOutboundUrl(url, SUPPLIER_HOSTS);
      } catch (e) {
        caught = e;
      }
      expect(caught, url).toBeInstanceOf(ScrapeError);
      expect((caught as ScrapeError).code, url).toBe(code);
    }
  });

  it('accepts the two image CDNs and KV only under /cdn/', () => {
    expect(
      isAllowedImageUrl('https://images.ecarpetwholesale.com/dev/catalog/product/3/8/380114-1.jpg'),
    ).toBe(true);
    expect(
      isAllowedImageUrl('https://cdn.shopify.com/s/files/1/0759/3807/0707/files/x.jpg?v=1&width=1600'),
    ).toBe(true);
    expect(isAllowedImageUrl('https://karavanrug.com/cdn/shop/files/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://karavanrug.com/products/x')).toBe(false);
    expect(isAllowedImageUrl('http://cdn.shopify.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://cdn.shopify.com.evil.example/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://lh3.googleusercontent.com/d/abc')).toBe(false);
    expect(isAllowedImageUrl('//cdn.shopify.com/x.jpg')).toBe(false);
  });
});

describe('createVettedLookup (DNS-time check for undici)', () => {
  function lookupWith(addresses: LookupAddress[], calls: string[] = []) {
    return createVettedLookup(async (hostname) => {
      calls.push(hostname);
      return addresses;
    });
  }
  function run(
    lookup: ReturnType<typeof createVettedLookup>,
    hostname: string,
    options: { all?: boolean; family?: number | 'IPv4' | 'IPv6' } = {},
  ): Promise<{ err: NodeJS.ErrnoException | null; address: string | LookupAddress[]; family?: number }> {
    return new Promise((resolve) => {
      lookup(hostname, options, (err, address, family) => resolve({ err, address, family }));
    });
  }

  it('returns only vetted addresses (all: true) or the first vetted one', async () => {
    const lookup = lookupWith([
      { address: '::ffff:127.0.0.1', family: 6 },
      { address: '10.0.0.9', family: 4 },
      { address: '104.16.0.1', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
    const all = await run(lookup, 'cdn.shopify.com', { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toEqual([
      { address: '104.16.0.1', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
    const one = await run(lookup, 'cdn.shopify.com');
    expect(one).toEqual({ err: null, address: '104.16.0.1', family: 4 });
    const v6 = await run(lookup, 'cdn.shopify.com', { family: 6 });
    expect(v6.address).toBe('2606:4700::1111');
  });

  it('fails with EBLOCKED when every address is private (DNS rebinding)', async () => {
    const lookup = lookupWith([
      { address: '192.168.1.1', family: 4 },
      { address: '::ffff:7f00:1', family: 6 },
    ]);
    const r = await run(lookup, 'cdn.shopify.com', { all: true });
    expect(r.err?.code).toBe('EBLOCKED');
    expect(r.address).toEqual([]);
  });

  it('never resolves a hostname the hygiene rules reject', async () => {
    const calls: string[] = [];
    const lookup = lookupWith([{ address: '8.8.8.8', family: 4 }], calls);
    for (const h of ['localhost', '127.1', '2130706433', '0x7f000001', 'box.internal', 'single']) {
      const r = await run(lookup, h);
      expect(r.err?.code, h).toBe('EBLOCKED');
    }
    expect(calls).toEqual([]);
  });

  it('passes resolver failures through', async () => {
    const lookup = createVettedLookup(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    });
    const r = await run(lookup, 'missing.example.com');
    expect(r.err?.code).toBe('ENOTFOUND');
  });
});
