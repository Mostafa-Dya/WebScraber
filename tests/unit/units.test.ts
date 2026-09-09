import { describe, expect, it } from 'vitest';
import { dims, ftIn } from '../../src/lib/units.ts';

describe('ftIn (ported verbatim from the reference)', () => {
  it('rounds to the nearest inch and carries 12 inches into a foot', () => {
    expect(ftIn(244)).toBe("8'"); // 96.06 in → 8'0"
    expect(ftIn(30)).toBe("1'"); // 11.81 in → rounds to 12 → 1'
    expect(ftIn(100)).toBe(`3' 3"`);
    expect(ftIn(192)).toBe(`6' 4"`);
    expect(ftIn(135)).toBe(`4' 5"`);
    expect(ftIn(0)).toBe("0'");
  });
});

describe('dims', () => {
  it('renders exactly like the reference and is empty when a side is unknown', () => {
    expect(dims(135, 190, 'cm')).toBe('135 × 190 cm');
    expect(dims(135, 190, 'ft')).toBe(`4' 5" × 6' 3"`);
    expect(dims(undefined, 190, 'cm')).toBe('');
    expect(dims(0, 190, 'ft')).toBe('');
  });
});
