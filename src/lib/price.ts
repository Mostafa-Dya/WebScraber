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
