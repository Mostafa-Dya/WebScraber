// The short-lived state of one in-progress authorisation.
//
// The PKCE verifier must survive the round trip to Google and back, and it must not be guessable or
// replayable. It is kept in process memory keyed by a random id, with only that id in a cookie: a
// verifier in a cookie would be readable by anything that can read cookies, and this is a single
// long-lived Node process (ADR D2), so memory is the simpler and tighter place for it.
//
// Entries expire in ten minutes — long enough to pick an account and read a consent screen, short
// enough that an abandoned attempt cannot be resumed later.
import { randomBytes } from 'node:crypto';

export const HANDSHAKE_TTL_MS = 10 * 60_000;
export const HANDSHAKE_COOKIE = 'sl_g_oauth';
const MAX_PENDING = 8;

export interface Handshake {
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
  /** Where to send the owner once it is done; always an /admin path. */
  next: string;
}

export class HandshakeStore {
  private readonly pending = new Map<string, Handshake>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: { now?: () => number; ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? HANDSHAKE_TTL_MS;
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, h] of this.pending) if (h.createdAt < cutoff) this.pending.delete(id);
    // A bounded map: someone hammering the start endpoint cannot grow it without limit.
    while (this.pending.size > MAX_PENDING) {
      const oldest = this.pending.keys().next();
      if (oldest.done) break;
      this.pending.delete(oldest.value);
    }
  }

  /** Returns the cookie id; the handshake itself never leaves the process. */
  create(input: Omit<Handshake, 'createdAt'>): string {
    const id = randomBytes(16).toString('base64url');
    this.pending.set(id, { ...input, createdAt: this.now() });
    // After the insert, so the cap is the cap rather than the cap plus one.
    this.prune();
    return id;
  }

  /** One use only: taking it removes it, so a replayed callback finds nothing. */
  take(id: string | undefined): Handshake | undefined {
    this.prune();
    if (!id) return undefined;
    const h = this.pending.get(id);
    if (!h) return undefined;
    this.pending.delete(id);
    if (this.now() - h.createdAt > this.ttlMs) return undefined;
    return h;
  }

  get size(): number {
    return this.pending.size;
  }
}

/** Only an /admin path may be a post-connection destination. */
export function sanitiseNext(value: unknown, fallback = '/admin/google'): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (!/^\/admin(\/[A-Za-z0-9_\-/]*)?$/.test(v) || v.startsWith('//')) return fallback;
  return v;
}
