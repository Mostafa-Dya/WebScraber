// Request-scoped locals set by the gates (docs/ADMIN_SPEC.md §2.2, brief §10). `.astro/types.d.ts`
// already references astro/client; tsconfig includes **/* so this augmentation is picked up.
declare namespace App {
  interface Locals {
    /** Verified admin session; present only on /admin* and /api/admin* requests with a valid cookie. */
    admin?: { sid: string; user: string; iat: number; exp: number; abs: number };
    /** Verified customer slug; present only on `/{slug}*` requests with that slug's valid cookie. */
    customer?: string;
    /** Random id per admin request; correlates audit rows from the same form (scrape → photos → create). */
    requestId: string;
  }
}
