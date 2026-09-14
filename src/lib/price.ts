// Price rules for the admin panel (owner's requirement 2026-09-07: "round up product price to
// nearest five after comma"; docs/ADMIN_SPEC.md §7). Pure, unit-tested; the public site never
// rounds — it displays the sheet's price_usd as is, so rounding is applied only where the admin
// writes a price.

/** Default rounding step in whole currency units; `Settings.price_round_step` overrides it. */
export const DEFAULT_ROUND_STEP = 5;

function validStep(step: number | undefined): number {
  return step !== undefined && Number.isInteger(step) && step > 0 ? step : DEFAULT_ROUND_STEP;
}

/**
 * Rounds a positive price UP to the next multiple of `step` whole currency units (step 5:
 * 1332 → 1335, 1335 → 1335, 1332.4 → 1335, 12.5 → 15; step 50: 1126 → 1150). Returns undefined for
 * missing, non-finite or non-positive input. A non-positive or non-integer step falls back to 5.
 */
export function roundUpToStep(
  price: number | undefined | null,
  step: number = DEFAULT_ROUND_STEP,
): number | undefined {
  if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) return undefined;
  const s = validStep(step);
  // Guard against binary noise such as 1335.0000000000002 being pushed to 1340.
  const cents = Math.round(price * 100);
  return Math.ceil(cents / (s * 100)) * s;
}

/** Rounds a positive price UP to the nearest multiple of 5 (the original rule, kept for its callers). */
export function roundUpTo5(price: number | undefined | null): number | undefined {
  return roundUpToStep(price, 5);
}

/** Retail suggestion for a scraped supplier price: supplier × markup, then rounded up to the step. */
export function suggestRetail(
  supplierPrice: number | undefined,
  markup: number,
  step: number = DEFAULT_ROUND_STEP,
): number | undefined {
  if (supplierPrice === undefined || !Number.isFinite(markup) || markup <= 0) return undefined;
  return roundUpToStep(supplierPrice * markup, step);
}

/* ---------------------------------------------------------------------------------------------
   Per-supplier retail formulas (owner, 2026-09-13).

   Until now every supplier shared one multiplier from the Settings tab. The owner supplied a
   different rule for each of the two suppliers, and neither is a plain multiplication: Karavan's
   adds a flat amount that depends on which band the SCRAPED price falls in, and ecarpetgallery's
   adds a flat 150 after the multiplier. A single `markup` number cannot express either.

   These functions take the supplier price already converted to USD and return the retail figure
   BEFORE rounding — the caller applies `roundUpToStep`, so the "round to nearest 5/50" setting keeps
   working exactly as it did.
--------------------------------------------------------------------------------------------- */

/**
 * The flat amount Karavan's rule adds, chosen by the band the base price falls in.
 *
 * The owner's wording is "if X<500 then add 100 USD, if X=500 to 1000 then add 150 USD, if X>1000
 * then add 200 USD", and confirmed X to be the base USD price — the figure scraped from the page,
 * not the multiplied one. The boundaries are therefore inclusive at both ends of the middle band:
 * 500 and 1000 both add 150.
 */
export function karavanBand(basePriceUsd: number): number {
  if (basePriceUsd < 500) return 100;
  if (basePriceUsd <= 1000) return 150;
  return 200;
}

/** karavanrug.com: base × 0.7 × 2, then the band amount for the base price. */
export function karavanRetail(basePriceUsd: number): number {
  // Written as the owner wrote it (× 0.7 × 2, not × 1.4) so the rule stays legible against the note.
  return basePriceUsd * 0.7 * 2 + karavanBand(basePriceUsd);
}

/** ecarpetgallery.com: the USD price × 1.5, then a flat 150. */
export function ecarpetgalleryRetail(priceUsd: number): number {
  return priceUsd * 1.5 + 150;
}

/** Suppliers that carry an owner-supplied formula; anything else falls back to the Settings markup. */
export const SUPPLIER_FORMULAS: Readonly<Record<string, (priceUsd: number) => number>> = {
  karavanrug: karavanRetail,
  ecarpetgallery: ecarpetgalleryRetail,
};

/** A human-readable name for the rule applied, shown next to the suggested price in the admin form. */
export function pricingRuleName(supplier: string): string | undefined {
  if (supplier === 'karavanrug') return 'karavanrug: base × 0.7 × 2 + band';
  if (supplier === 'ecarpetgallery') return 'ecarpetgallery: USD × 1.5 + 150';
  return undefined;
}

/**
 * The retail suggestion for a scraped supplier price, rounded up to `step`.
 *
 * A supplier with an owner-supplied formula uses it and ignores `markup` entirely: the formula IS
 * the rule for that supplier, and silently letting a stale Settings row override it would be a
 * surprise the owner cannot see. Everything else (owned stock, "other") keeps the plain multiplier,
 * which is what the Settings markup is still for.
 */
export function supplierRetail(
  supplier: string,
  priceUsd: number | undefined,
  markup: number | undefined,
  step: number = DEFAULT_ROUND_STEP,
): number | undefined {
  if (priceUsd === undefined || !Number.isFinite(priceUsd) || priceUsd <= 0) return undefined;
  const formula = SUPPLIER_FORMULAS[supplier];
  if (formula) return roundUpToStep(formula(priceUsd), step);
  if (markup === undefined || !Number.isFinite(markup) || markup <= 0) return undefined;
  return roundUpToStep(priceUsd * markup, step);
}
