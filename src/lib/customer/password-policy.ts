// The customer password policy — the one piece of `customer/auth.ts` that BOTH realms need.
//
// Why this is its own module and not just another export of `customer/auth.ts`:
//
// `customer/auth.ts` imports `node:crypto` at the top for scrypt, HMAC and `timingSafeEqual`. The
// admin's Customers screen (`src/scripts/admin/clients.ts`) wants to validate a typed password
// before sending it, so it imported the checker from there — which dragged the whole server module
// into the browser bundle. Vite externalises `node:crypto` for the browser and its stub THROWS on
// first property access, so the import failed at module scope and every handler on that page never
// bound: "Add customer", "Reset password" and the Active switch all silently did nothing.
//
// A build warning said exactly this ("Module node:crypto has been externalized … imported by
// src/lib/customer/auth.ts") and was not acted on.
//
// So: anything the client needs lives here, and this file must never import a Node builtin. The
// server keeps importing it through `customer/auth.ts`, which re-exports it, so server callers are
// unchanged.

/**
 * The floor for a password the owner types in themselves. Shorter than the admin's twelve because
 * this one is read down a phone and typed on a handset, and the login is already throttled to five
 * attempts per address per fifteen minutes. Anything the studio picks should still be more than a
 * first name.
 */
export const CUSTOMER_MIN_PASSWORD = 8;

/** The message the admin shows for a password that is too short; also the API's 400 text. */
export function customerPasswordProblem(password: string): string | undefined {
  const value = password.trim();
  if (value.length < CUSTOMER_MIN_PASSWORD) {
    return `A password needs at least ${CUSTOMER_MIN_PASSWORD} characters.`;
  }
  if (value.length > 200) return 'That password is too long.';
  return undefined;
}
