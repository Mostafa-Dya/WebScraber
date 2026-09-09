// Shared string hygiene for the extraction ladder (docs/ADMIN_SPEC.md §4.4, brief §11). Lives in
// its own module so `jsonld.ts`, `shopify.ts` and `generic.ts` can use it without importing each
// other; `generic.ts` re-exports it so the existing import path keeps working.

/** Whitespace-collapsed, trimmed string; '' for nothing. */
export function collapse(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
