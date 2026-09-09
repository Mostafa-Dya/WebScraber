import { describe, expect, it } from 'vitest';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

function rugs(valid: number, invalid: number, withWarning = 0): ReturnType<typeof rugRow>[] {
  const rows: ReturnType<typeof rugRow>[] = [];
  for (let i = 0; i < valid; i++) rows.push(rugRow({ id: `ok-${i}` }));
  for (let i = 0; i < withWarning; i++)
    rows.push(rugRow({ id: `warn-${i}`, photos: 'https://example.com/not-drive.jpg' }));
  for (let i = 0; i < invalid; i++) rows.push(rugRow({ id: `bad-${i}`, price_usd: 'ask' }));
  return rows;
}

describe('snapshotFromRanges — the 10 % rejection rule (ADR D5.2)', () => {
  it('rejects when more than 10 % of rug rows fail validation', () => {
    expect(() => snapshotFromRanges(rangesWith({ rugs: rugs(9, 2) }), () => 1)).toThrow(
      /refresh rejected: 2 of 11 Products rows/,
    );
  });
  it('accepts exactly 10 %', () => {
    const snap = snapshotFromRanges(rangesWith({ rugs: rugs(9, 1) }), () => 1);
    expect(snap.catalogue.rugs).toHaveLength(9);
    expect(snap.report.dropped).toHaveLength(1);
    expect(snap.fetchedAt).toBe(1);
  });
  it('does not let warnings dilute the denominator', () => {
    // 12 rows: 2 invalid (16.7 %) and 10 kept-with-warning → must still reject.
    expect(() => snapshotFromRanges(rangesWith({ rugs: rugs(0, 2, 10) }))).toThrow(/2 of 12 Products rows/);
  });
  it('applies the rule per content tab (an all-text Rates tab rejects the refresh)', () => {
    const ranges = rangesWith({
      rugs: rugs(3, 0),
      rates: [
        ['USD', '1,00 USD', '$', ''],
        ['MXN', 'x', '$', ''],
      ],
    });
    expect(() => snapshotFromRanges(ranges)).toThrow(/2 of 2 Rates rows/);
  });
  it('never rejects because of malformed Reactions rows', () => {
    const ranges = rangesWith({
      rugs: rugs(2, 0),
      votes: [
        ['e-9', 'visitor-1', 'SL-1', 'love', 'card', 't'],
        ['e-10', 'bad slug', 'SL-1', 'like', 'card', 't'],
      ],
    });
    const snap = snapshotFromRanges(ranges);
    expect(snap.report.stats.Reactions?.dropped).toBe(2);
    expect(snap.catalogue.rugs).toHaveLength(2); // a malformed reaction never rejects the refresh
  });
  it('throws on a missing header row', () => {
    const ranges = rangesWith({ rugs: rugs(2, 0) });
    ranges[0] = {
      range: ranges[0]!.range,
      values: [[...HEADERS.Products].map((h) => (h === 'title' ? 'name' : h))],
    };
    expect(() => snapshotFromRanges(ranges)).toThrow(/column C should be "title"/);
  });
});
