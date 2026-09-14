// The topbar status line — Figma App Shell 25:236, "Sheet synced 4 min ago".
//
// The slot was plumbed the whole way through AdminLayout and AppShell and no page ever filled it, so
// the right half of the topbar was empty on every admin screen. This is the string that fills it.
//
// Deliberately coarse: the owner needs to know whether what they are looking at is current, and
// "4 min ago" answers that where a timestamp does not.
import { describe, expect, it } from 'vitest';
import { syncLabel } from '../../../src/lib/admin/read.ts';

const NOW = 1_760_000_000_000;
const ago = (ms: number): string => syncLabel(NOW - ms, NOW);

describe('syncLabel', () => {
  it('says "just now" while the read is still fresh', () => {
    expect(ago(0)).toBe('Sheet synced just now');
    expect(ago(44_000)).toBe('Sheet synced just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(ago(4 * 60_000)).toBe('Sheet synced 4 min ago');
    expect(ago(59 * 60_000)).toBe('Sheet synced 59 min ago');
    expect(ago(3 * 3_600_000)).toBe('Sheet synced 3 h ago');
    expect(ago(50 * 3_600_000)).toBe('Sheet synced 2 d ago');
  });

  it('never reads as being from the future when clocks disagree', () => {
    // The sheet read is stamped server-side and `now` defaults to Date.now(); a small skew must not
    // produce "-1 min ago", which would look like a bug rather than a clock.
    expect(syncLabel(NOW + 5_000, NOW)).toBe('Sheet synced just now');
  });
});
