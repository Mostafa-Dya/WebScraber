// Visitor identity (docs/ADR.md D8): a server-issued random cookie id, hashed with the salt
// before it is stored in the sheet; the IP is hashed with the same salt for rate limiting only.
import { createHmac, randomBytes } from 'node:crypto';

export const VISITOR_ID_RE = /^[a-f0-9]{32}$/;

/** `__Host-` requires Secure; plain name on http (local development). */
export function visitorCookieName(secure: boolean): string {
  return secure ? '__Host-sl_v' : 'sl_v';
}

export function newVisitorId(): string {
  return randomBytes(16).toString('hex');
}

function hmac32(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value).digest('hex').slice(0, 32);
}

/** Stored in Votes column E: HMAC-SHA256(VOTE_SALT, cookieId), 32 hex chars. */
export function visitorHash(salt: string, visitorId: string): string {
  return hmac32(salt, `v:${visitorId}`);
}

/** Rate-limit key only; never stored. */
export function ipHash(salt: string, ip: string | undefined): string {
  return hmac32(salt, `ip:${ip ?? 'unknown'}`);
}
