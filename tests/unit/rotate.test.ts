import { describe, expect, it } from 'vitest';
import { dataRot, shouldRotate } from '../../src/lib/rotate.ts';

describe('rotate decision (reference lines 199-212)', () => {
  it('force turns regardless of shape', () => {
    expect(shouldRotate('force', 800, 1200)).toBe(true);
    expect(shouldRotate('force', 1200, 800)).toBe(true);
  });
  it('"1" turns only a landscape file', () => {
    expect(shouldRotate('1', 1200, 800)).toBe(true);
    expect(shouldRotate('1', 800, 1200)).toBe(false);
    expect(shouldRotate('1', 800, 800)).toBe(false);
  });
  it('"0" or missing never turns', () => {
    expect(shouldRotate('0', 1200, 800)).toBe(false);
    expect(shouldRotate(undefined, 1200, 800)).toBe(false);
  });
  it('maps sheet values to the data attribute like the reference', () => {
    expect(dataRot('force')).toBe('force');
    expect(dataRot('true')).toBe('1');
    expect(dataRot('false')).toBe('0');
  });
});
