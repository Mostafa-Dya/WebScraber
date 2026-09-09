import { describe, expect, it } from 'vitest';
import { idProblem, maxSequence, nextRugId, uniqueSlug, zeroPad } from '../../../src/lib/admin/ids.ts';

describe('nextRugId (ADMIN_SPEC §3.4)', () => {
  it('increments the highest SL-nnn over every row, ignoring legacy numeric and slug ids', () => {
    expect(nextRugId(['SL-021', 'SL-029', '1389', 'door-rug', 'SL-007'])).toBe('SL-030');
    expect(nextRugId([])).toBe('SL-001');
    expect(nextRugId(['1389', 'abc'])).toBe('SL-001');
    expect(nextRugId([' sl-030 '])).toBe('SL-001'); // case matters: ids are exact
  });
  it('grows past 999 and pads to three digits', () => {
    expect(nextRugId(['SL-999'])).toBe('SL-1000');
    expect(nextRugId(['SL-1000'])).toBe('SL-1001');
    expect(zeroPad(7)).toBe('007');
    expect(zeroPad(1234)).toBe('1234');
  });
  it('reserves ids from rug.create audit rows (a failed verify must not reuse a number)', () => {
    expect(nextRugId(['SL-029'], ['SL-030', 'SL-031'])).toBe('SL-032');
    expect(maxSequence(['SL-002', 'SL-010', 'x'])).toBe(10);
  });
  it('idProblem refuses duplicates (case-insensitive) and sequence numbers at or below the max', () => {
    const existing = ['SL-029', '1389'];
    expect(idProblem('SL-030', existing)).toBeUndefined();
    expect(idProblem('sl-029', existing)).toMatch(/already exists/);
    expect(idProblem('1389', existing)).toMatch(/already exists/);
    expect(idProblem('SL-012', existing)).toMatch(/below the current sequence/);
    expect(idProblem('SL-029', ['SL-001'], ['SL-029'])).toMatch(/below the current sequence/);
    expect(idProblem('KV-60-years', existing)).toBeUndefined();
  });
});

describe('uniqueSlug', () => {
  it('slugifies and appends -2, -3 … against every existing slug (any status)', () => {
    expect(uniqueSlug('Khal Mohammadi', ['winks'])).toBe('khal-mohammadi');
    expect(uniqueSlug('Winks', ['winks'])).toBe('winks-2');
    expect(uniqueSlug('Winks', ['winks', 'winks-2', 'WINKS-3'])).toBe('winks-4');
    expect(uniqueSlug('Winks', ['winks'], 'winks')).toBe('winks'); // renaming keeps its own slug
    expect(uniqueSlug('ماذا', [])).toBe('rug');
    expect(uniqueSlug('ماذا', ['rug'])).toBe('rug-2');
  });
  it('never exceeds 80 characters', () => {
    const long = 'x'.repeat(100);
    const first = uniqueSlug(long, []);
    expect(first).toHaveLength(80);
    const second = uniqueSlug(long, [first]);
    expect(second.length).toBeLessThanOrEqual(80);
    expect(second.endsWith('-2')).toBe(true);
  });
});
