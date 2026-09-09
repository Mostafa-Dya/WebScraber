// Ported verbatim from reference/catalogue.html lines 127-132.
export function ftIn(cm: number): string {
  const total = cm / 2.54;
  let f = Math.floor(total / 12);
  let i = Math.round(total - f * 12);
  if (i === 12) {
    f++;
    i = 0;
  }
  return f + "'" + (i ? ' ' + i + '"' : '');
}

/** The reference's separator. The customer preview passes a middle dot instead (see PREVIEW_SEP). */
export const REFERENCE_SEP = '×';

/** The Figma customer preview writes "240 · 170 cm". The stored Size Label column keeps the cross. */
export const PREVIEW_SEP = '·';

/**
 * Dimension line exactly as the reference renders it (lines 175-179); empty when a side is unknown.
 * `sep` defaults to the reference's cross so the public catalogue is unchanged.
 */
export function dims(
  widthCm: number | undefined,
  lengthCm: number | undefined,
  unit: 'cm' | 'ft',
  sep: string = REFERENCE_SEP,
): string {
  if (!widthCm || !lengthCm) return '';
  return unit === 'cm' ? `${widthCm} ${sep} ${lengthCm} cm` : `${ftIn(widthCm)} ${sep} ${ftIn(lengthCm)}`;
}
