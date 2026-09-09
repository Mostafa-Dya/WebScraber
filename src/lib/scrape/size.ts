// Unit conversion (docs/ADMIN_SPEC.md §4.6). Pure. An explicit cm pair always wins; feet-inches are
// converted with Math.round((ft * 12 + in) * 2.54); KV's `4.3 x 11.9 feet` is feet.inches, never
// decimal feet (130 cm = 4'3").

/** `202 x 315 cm`, `4.3 x 11.9 feet / 130 x 360 cm`, `65 x 362 cm`, `82x300 cm`. */
export const CM_PAIR_RE = /(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)\s*cm\b/i;

/** `4'3" x 7'5"`, `6'8" x 10'4"`, `10'0" × 12'1"` (straight or curly quotes, inches optional). */
export const FT_IN_PAIR_RE =
  /(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d)?)?\s*(?:"|''|”|″)?\s*[x×]\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d)?)?\s*(?:"|''|”|″)?/;

/** KV's `4.3 x 11.9 feet` / `10.0 x 12.1 ft`: the fraction is inches (last resort, flagged). */
export const FEET_DOT_INCHES_PAIR_RE =
  /(\d{1,2})(?:\.(\d{1,2}))?\s*[x×]\s*(\d{1,2})(?:\.(\d{1,2}))?\s*(?:ft|feet)\b/i;

/** One side as ECG prints it in the Width / Length rows: `4'5"`, `10'0"`, `6' 11"`, `7'`. */
export const FT_IN_SIDE_RE =
  /^\s*(\d{1,2})\s*(?:['’′]|ft|feet)\s*(?:(\d{1,2}(?:\.\d)?)\s*(?:"|''|”|″|in(?:ch(?:es)?)?)?)?\s*$/i;

export interface ParsedSize {
  widthCm: number;
  lengthCm: number;
  /** The matched supplier string, verbatim. */
  sizeRaw: string;
  source: 'cm' | 'ftin' | 'feet.inches';
  /** True when the pair was reordered so that width ≤ length. */
  swapped: boolean;
  /** Human note for `warnings` when a conversion or reorder happened. */
  note?: string;
}

export function ftInToCm(feet: number, inches = 0): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

/** Orders a pair so that width ≤ length (the form has a swap button). */
export function orderPair(a: number, b: number): { widthCm: number; lengthCm: number; swapped: boolean } {
  return a <= b ? { widthCm: a, lengthCm: b, swapped: false } : { widthCm: b, lengthCm: a, swapped: true };
}

function num(s: string | undefined): number {
  return s ? Number(s.replace(',', '.')) : 0;
}

function ftInLabel(ft: number, inch: number): string {
  return `${ft}'${inch}"`;
}

/** `4'5"` → 135; `10'0"` → 305; `7'` → 213; undefined for anything else. */
export function parseFeetInchesSide(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = FT_IN_SIDE_RE.exec(text);
  if (!m?.[1]) return undefined;
  const ft = Number(m[1]);
  const inches = num(m[2]);
  if (!Number.isFinite(ft) || inches >= 12) return undefined;
  const cm = ftInToCm(ft, inches);
  return cm > 0 ? cm : undefined;
}

/**
 * Finds a rug size anywhere in `text`: explicit cm pair first, then feet-inches, then KV's
 * feet.inches shorthand. Returns integer cm ordered width ≤ length, or undefined.
 */
export function parseSize(text: string | undefined): ParsedSize | undefined {
  if (!text) return undefined;
  const cm = CM_PAIR_RE.exec(text);
  if (cm?.[1] && cm[2]) {
    const a = Math.round(num(cm[1]));
    const b = Math.round(num(cm[2]));
    if (a > 0 && b > 0) {
      const ordered = orderPair(a, b);
      return {
        ...ordered,
        sizeRaw: cm[0].trim(),
        source: 'cm',
        note: ordered.swapped ? `width/length swapped so that width ≤ length (${cm[0].trim()})` : undefined,
      };
    }
  }
  const ft = FT_IN_PAIR_RE.exec(text);
  if (ft?.[1] && ft[3]) {
    const f1 = Number(ft[1]);
    const i1 = num(ft[2]);
    const f2 = Number(ft[3]);
    const i2 = num(ft[4]);
    if (i1 < 12 && i2 < 12) {
      const a = ftInToCm(f1, i1);
      const b = ftInToCm(f2, i2);
      if (a > 0 && b > 0) {
        const ordered = orderPair(a, b);
        return {
          ...ordered,
          sizeRaw: ft[0].trim(),
          source: 'ftin',
          note: `no cm on page; converted ${ftInLabel(f1, i1)} × ${ftInLabel(f2, i2)} → ${ordered.widthCm} × ${ordered.lengthCm} cm${ordered.swapped ? ' (swapped so that width ≤ length)' : ''}`,
        };
      }
    }
  }
  const fd = FEET_DOT_INCHES_PAIR_RE.exec(text);
  if (fd?.[1] && fd[3]) {
    const f1 = Number(fd[1]);
    const i1 = fd[2] === undefined ? 0 : Number(fd[2]);
    const f2 = Number(fd[3]);
    const i2 = fd[4] === undefined ? 0 : Number(fd[4]);
    if (i1 < 12 && i2 < 12) {
      const a = ftInToCm(f1, i1);
      const b = ftInToCm(f2, i2);
      if (a > 0 && b > 0) {
        const ordered = orderPair(a, b);
        return {
          ...ordered,
          sizeRaw: fd[0].trim(),
          source: 'feet.inches',
          note: `no cm on page; read "${fd[0].trim()}" as feet.inches (${ftInLabel(f1, i1)} × ${ftInLabel(f2, i2)}) → ${ordered.widthCm} × ${ordered.lengthCm} cm — check it`,
        };
      }
    }
  }
  return undefined;
}
