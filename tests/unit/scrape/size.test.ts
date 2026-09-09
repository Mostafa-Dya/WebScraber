import { describe, expect, it } from 'vitest';
import { ftInToCm, orderPair, parseFeetInchesSide, parseSize } from '../../../src/lib/scrape/size.ts';

describe('parseSize (ADMIN_SPEC §4.6)', () => {
  it('prefers an explicit cm pair anywhere in the string', () => {
    expect(parseSize('202 x 315 cm / 6\'8" x 10\'4" ft')).toMatchObject({
      widthCm: 202,
      lengthCm: 315,
      source: 'cm',
      sizeRaw: '202 x 315 cm',
    });
    expect(parseSize('4.3 x 11.9 feet / 130 x 360 cm')).toMatchObject({
      widthCm: 130,
      lengthCm: 360,
      source: 'cm',
    });
    expect(parseSize('65 x 362 cm')).toMatchObject({ widthCm: 65, lengthCm: 362 });
    expect(parseSize('Vintage Turkish Runner Rug, 2.7x9.8 ft, 82x300 cm')).toMatchObject({
      widthCm: 82,
      lengthCm: 300,
      sizeRaw: '82x300 cm',
    });
    expect(parseSize('305 x 370 cm (10.0 x 12.1 ft)')).toMatchObject({ widthCm: 305, lengthCm: 370 });
    expect(parseSize('130,5 × 200 cm')).toMatchObject({ widthCm: 131, lengthCm: 200 });
  });

  it('converts feet-inches with Math.round((ft * 12 + in) * 2.54)', () => {
    expect(parseSize(`4'3" x 7'5"`)).toMatchObject({ widthCm: 130, lengthCm: 226, source: 'ftin' });
    expect(parseSize(`6'8" x 10'4"`)).toMatchObject({ widthCm: 203, lengthCm: 315 });
    expect(parseSize(`2'11" x 5'`)).toMatchObject({ widthCm: 89, lengthCm: 152 });
    expect(parseSize(`Persian Style 4'3" x 7'5" Hand-knotted Wool Rug`)?.note).toBe(
      `no cm on page; converted 4'3" × 7'5" → 130 × 226 cm`,
    );
    expect(parseSize('4’3” × 7’5”')).toMatchObject({ widthCm: 130, lengthCm: 226 });
  });

  it('never reads KV feet.inches as decimal feet', () => {
    const s = parseSize('4.3 x 11.9 feet');
    expect(s).toMatchObject({ widthCm: 130, lengthCm: 358, source: 'feet.inches' });
    expect(s?.note).toContain('feet.inches');
    expect(parseSize('10.0 x 12.1 ft')).toMatchObject({ widthCm: 305, lengthCm: 368 });
    // inches ≥ 12 cannot be feet.inches
    expect(parseSize('2.75 x 9.20 feet')).toBeUndefined();
  });

  it('orders the pair so that width ≤ length and says so', () => {
    const s = parseSize('300 x 200 cm');
    expect(s).toMatchObject({ widthCm: 200, lengthCm: 300, swapped: true });
    expect(s?.note).toContain('swapped');
    expect(orderPair(5, 3)).toEqual({ widthCm: 3, lengthCm: 5, swapped: true });
    expect(orderPair(3, 5)).toEqual({ widthCm: 3, lengthCm: 5, swapped: false });
  });

  it('ignores the 5x8 category shorthand and returns undefined for junk', () => {
    expect(parseSize('Blue 5x8 Area Rugs')).toBeUndefined();
    expect(parseSize('')).toBeUndefined();
    expect(parseSize(undefined)).toBeUndefined();
    expect(parseSize('0 x 0 cm')).toBeUndefined();
  });
});

describe('parseFeetInchesSide (ECG Width / Length rows)', () => {
  it('converts one side', () => {
    expect(parseFeetInchesSide(`4'5"`)).toBe(135);
    expect(parseFeetInchesSide(`6'11"`)).toBe(211);
    expect(parseFeetInchesSide(`10'0"`)).toBe(305);
    expect(parseFeetInchesSide(`7'`)).toBe(213);
    expect(parseFeetInchesSide(`3' 1"`)).toBe(94);
    expect(parseFeetInchesSide('4 ft 3 in')).toBe(130);
  });
  it('rejects impossible or foreign values', () => {
    expect(parseFeetInchesSide(`4'13"`)).toBeUndefined();
    expect(parseFeetInchesSide('130 cm')).toBeUndefined();
    expect(parseFeetInchesSide('')).toBeUndefined();
    expect(parseFeetInchesSide(undefined)).toBeUndefined();
  });
  it('ftInToCm matches the spec examples', () => {
    expect(ftInToCm(4, 3)).toBe(130);
    expect(ftInToCm(7, 5)).toBe(226);
    expect(ftInToCm(6, 8)).toBe(203);
    expect(ftInToCm(10, 4)).toBe(315);
    expect(ftInToCm(2, 11)).toBe(89);
  });
});
