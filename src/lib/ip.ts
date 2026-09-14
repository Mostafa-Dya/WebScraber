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
  /**
   * The socket peer address, from Astro's `context.clientAddress` (the Node adapter exposes it in
   * standalone mode). LAST resort, and it is what stops the whole site sharing one rate-limit bucket.
   *
   * With `CLIENT_IP_HEADER` unset — the default — and no `X-Forwarded-For`, both sources above
   * return undefined and `ipHash` hashed the literal string "unknown". Every visitor then shared a
   * single bucket, so five wrong passwords from ONE person locked every admin out for fifteen
   * minutes, and one visitor could exhaust the vote limit for everybody. Behind a proxy this is
   * never reached; exposed directly, it is the difference between per-client limits and none.
   *
   * It is deliberately last: behind a proxy the socket peer is the PROXY, which would put everyone
   * in one bucket again — so it is only consulted when the header sources yield nothing at all.
   */
  socketAddress?: string | undefined;
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
  if (!xff) return isIp(opts.socketAddress ?? '') ? opts.socketAddress : undefined;
  const parts = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = Math.max(1, Math.floor(opts.trustedHops));
  const idx = parts.length - hops;
  // Fewer entries than trusted proxies: cannot be a proxied request, so fall back to the socket.
  if (idx < 0) return isIp(opts.socketAddress ?? '') ? opts.socketAddress : undefined;
  const v = parts[idx] ?? '';
  if (isIp(v)) return v;
  return isIp(opts.socketAddress ?? '') ? opts.socketAddress : undefined;
}
