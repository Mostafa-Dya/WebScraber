// SSRF guard (docs/ADMIN_SPEC.md §4.3, §4.5): host allow-lists, hostname hygiene, a node:net
// BlockList checked at DNS time, and the guarded undici Agent built on that lookup. impit has no
// DNS hook, so it only ever sees the two constant supplier hosts; everything else (images, Jina)
// goes through the Agent returned by `guardedAgent()`.
import { promises as dnsPromises } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import type { TcpSocketConnectOpts } from 'node:net';
import { Agent } from 'undici';
import { ScrapeError } from './types.ts';

export const SUPPLIER_HOSTS: readonly string[] = [
  'ecarpetgallery.com',
  'www.ecarpetgallery.com',
  'karavanrug.com',
  'www.karavanrug.com',
];

/** Hosts a scraped photo URL may point at (ECG's image CDN, Shopify's CDN, KV's /cdn/ proxy). */
export const IMAGE_HOSTS: readonly string[] = [
  'images.ecarpetwholesale.com',
  'cdn.shopify.com',
  'karavanrug.com',
];

export const JINA_HOST = 'r.jina.ai';

/** Private, loopback, link-local, CGNAT, "this" network and their IPv6 counterparts (§4.3). */
export const blockList = new BlockList();
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
];
// Deliberately not ::ffff:0:0/96 (that would block every IPv4 address); mapped literals are
// unmapped first and checked as IPv4 instead. `::` (unspecified) is added for hygiene.
const BLOCKED_V6: ReadonlyArray<readonly [string, number]> = [
  ['::1', 128],
  ['::', 128],
  ['fc00::', 7],
  ['fe80::', 10],
];
for (const [net, prefix] of BLOCKED_V4) blockList.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of BLOCKED_V6) blockList.addSubnet(net, prefix, 'ipv6');

/** `::ffff:a.b.c.d` / `::ffff:7f00:1` → `a.b.c.d`; anything else unchanged. */
export function unmapIpv4(address: string): string {
  const a = address.trim();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(a);
  if (dotted?.[1]) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(a);
  if (hex?.[1] && hex[2]) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return a;
}

/** True for any address we must never connect to (invalid strings count as blocked). */
export function isBlockedAddress(address: string): boolean {
  const a = unmapIpv4(address);
  const family = isIP(a);
  if (family === 0) return true;
  return blockList.check(a, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Rejects hostnames that must not reach DNS at all: IP literals in any spelling (`127.1`,
 * `2130706433`, `0x7f000001`, bracketed IPv6), localhost, `.local` / `.internal` / `.home.arpa`,
 * and single-label names. Returns the reason, or undefined when the name looks like a public host.
 */
export function hostnameProblem(hostname: string): string | undefined {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return 'empty host';
  if (h.startsWith('[') || isIP(h) !== 0) return 'IP-literal host';
  if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/.test(h)) return 'numeric host';
  if (h === 'localhost' || h.endsWith('.localhost')) return 'localhost';
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return 'internal domain';
  if (!h.includes('.')) return 'single-label host';
  return undefined;
}

/**
 * Parses and validates an outbound URL: https only, no userinfo, no explicit port, a public-looking
 * hostname that is on `allowHosts`. Throws `ScrapeError` (`invalid_url` / `unsupported_host`).
 */
export function validateOutboundUrl(input: string | URL, allowHosts: readonly string[], what = 'URL'): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    throw new ScrapeError('invalid_url', `${what} is not a valid URL`);
  }
  if (url.protocol !== 'https:') throw new ScrapeError('invalid_url', `${what} must use https`);
  if (url.username || url.password) throw new ScrapeError('invalid_url', `${what} must not carry userinfo`);
  if (url.port) throw new ScrapeError('invalid_url', `${what} must not name a port`);
  const problem = hostnameProblem(url.hostname);
  if (problem) throw new ScrapeError('invalid_url', `${what} host rejected: ${problem}`);
  if (!allowHosts.includes(url.hostname.toLowerCase()))
    throw new ScrapeError('unsupported_host', `${what} host "${url.hostname}" is not allow-listed`);
  return url;
}

/** Photo URLs: https + IMAGE_HOSTS; karavanrug.com only under its /cdn/ proxy path. */
export function isAllowedImageUrl(input: string): boolean {
  try {
    const url = validateOutboundUrl(input, IMAGE_HOSTS, 'image URL');
    if (url.hostname === 'karavanrug.com') return url.pathname.startsWith('/cdn/');
    return true;
  } catch {
    return false;
  }
}

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: Resolver = (hostname) => dnsPromises.lookup(hostname, { all: true });

type LookupFunction = NonNullable<TcpSocketConnectOpts['lookup']>;

function blockedError(hostname: string, reason: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`refusing to connect to ${hostname}: ${reason}`);
  err.code = 'EBLOCKED';
  err.syscall = 'getaddrinfo';
  return err;
}

/**
 * `dns.lookup` replacement for undici's connector: resolves every address, unmaps `::ffff:` literals,
 * drops anything in the BlockList and hands back only vetted addresses (`EBLOCKED` when none survive).
 */
export function createVettedLookup(resolve: Resolver = defaultResolver): LookupFunction {
  return (hostname, options, callback) => {
    const problem = hostnameProblem(hostname);
    if (problem) {
      queueMicrotask(() => callback(blockedError(hostname, problem), []));
      return;
    }
    const fam = options.family;
    const want = fam === 4 || fam === 'IPv4' ? 4 : fam === 6 || fam === 'IPv6' ? 6 : 0;
    resolve(hostname)
      .then((addresses) => {
        const vetted: LookupAddress[] = [];
        for (const entry of addresses) {
          const address = unmapIpv4(entry.address);
          const family = isIP(address);
          if (family === 0 || isBlockedAddress(address)) continue;
          if (want !== 0 && family !== want) continue;
          vetted.push({ address, family });
        }
        const first = vetted[0];
        if (!first) throw blockedError(hostname, 'every resolved address is blocked');
        if (options.all) callback(null, vetted);
        else callback(null, first.address, first.family);
      })
      .catch((err: unknown) => {
        callback(err instanceof Error ? err : new Error(String(err)), []);
      });
  };
}

export const vettedLookup: LookupFunction = createVettedLookup();

export function createGuardedAgent(lookup: LookupFunction = vettedLookup): Agent {
  return new Agent({
    connect: { lookup, timeout: 5000 },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
}

let agent: Agent | undefined;

/** Process-wide guarded Agent for undici (images, Jina, the impit-unavailable fallback). */
export function guardedAgent(): Agent {
  agent ??= createGuardedAgent();
  return agent;
}
