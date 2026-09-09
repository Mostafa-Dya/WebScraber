// Client IP behind the host's proxy (docs/ADR.md D8). Two sources, in order:
//   1. A host-specific header that the platform overwrites on every request (DigitalOcean App
//      Platform: `do-connecting-ip`). Only trusted when CLIENT_IP_HEADER is set explicitly, because
//      on any other host a client could send that header itself.
//   2. X-Forwarded-For: each trusted proxy APPENDS the address of the peer it accepted the
//      connection from, so with N trusted proxies the real client is the N-th entry from the right.
//      Everything to the left is client-supplied and ignored.
// The address is never stored; only hashed for rate limiting.

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;

export function isIp(value: string): boolean {
  const m = IPV4.exec(value);
  if (m) return m.slice(1).every((o) => Number(o) <= 255);
  return value.includes(':') && IPV6.test(value);
}

export interface IpOptions {
  /** Header the host sets with the real client address, e.g. "do-connecting-ip". Empty = not trusted. */
  header: string;
  /** Number of trusted proxies appending to X-Forwarded-For (default 1). */
  trustedHops: number;
}

export function clientIp(headers: Headers, opts: IpOptions): string | undefined {
  const name = opts.header.trim().toLowerCase();
  if (name) {
    const direct = headers.get(name);
    if (direct) {
      const v = direct.split(',').pop()?.trim() ?? '';
      if (isIp(v)) return v;
    }
  }
  const xff = headers.get('x-forwarded-for');
  if (!xff) return undefined;
  const parts = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = Math.max(1, Math.floor(opts.trustedHops));
  const idx = parts.length - hops;
  if (idx < 0) return undefined; // fewer entries than trusted proxies: cannot be a proxied request
  const v = parts[idx] ?? '';
  return isIp(v) ? v : undefined;
}
