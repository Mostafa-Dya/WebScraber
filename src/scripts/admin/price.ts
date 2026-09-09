// Client copy of src/lib/price.ts `roundUpToStep` (docs/ADMIN_SPEC.md §7): the "Round to 5" button
// rounds in the form immediately with the same rule the server applies on save. Kept in sync by
// tests/unit/admin-ui/price-parity.test.ts, which runs both over the same inputs.
export const DEFAULT_ROUND_STEP = 5;

function validStep(step: number | undefined): number {
  return step !== undefined && Number.isInteger(step) && step > 0 ? step : DEFAULT_ROUND_STEP;
}

/** Rounds a positive price UP to the next multiple of `step` whole units; undefined for bad input. */
export function roundUpToStep(
  price: number | undefined | null,
  step: number = DEFAULT_ROUND_STEP,
): number | undefined {
  if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) return undefined;
  const s = validStep(step);
  const cents = Math.round(price * 100);
  return Math.ceil(cents / (s * 100)) * s;
}

/** Parses what the owner typed into the price field: digits, one decimal point, thousands separators. */
export function parsePrice(text: string): number | undefined {
  const s = text.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
