// Size label and size band (brief §7, §11). CM is canonical in storage; the imperial rendering is
// derived in src/lib/units.ts and never stored.

/** "240 × 170 cm" (width × length), empty when a side is unknown — the brief's rendering. */
export function sizeLabelOf(widthCm: number | undefined, lengthCm: number | undefined): string {
  if (!widthCm || !lengthCm) return '';
  return `${round(widthCm)} × ${round(lengthCm)} cm`;
}

function round(cm: number): number {
  // "Rugs are not sold to the millimetre and false precision reads as a spec sheet." (brief §8)
  return Math.round(cm * 10) / 10;
}

/** Band from the area in m²: <0.75 XS · ≤2.5 S · ≤5 M · ≤10 L · >10 XL (brief §11, boundaries inclusive). */
export function sizeBandOf(widthCm: number | undefined, lengthCm: number | undefined): string {
  if (!widthCm || !lengthCm) return '';
  const m2 = (widthCm / 100) * (lengthCm / 100);
  if (m2 < 0.75) return 'XS';
  if (m2 <= 2.5) return 'S';
  if (m2 <= 5) return 'M';
  if (m2 <= 10) return 'L';
  return 'XL';
}
