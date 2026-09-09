import { describe, expect, it, vi } from 'vitest';
import { VisitThrottle, recordVisit, visitRow } from '../../../src/lib/customer/visits.ts';
import type { VisitRow } from '../../../src/lib/sheets/types.ts';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe('visit rows (brief §2 Visits)', () => {
  it('stamps an ISO time, coarsens the user agent and truncates the referrer', () => {
    const row = visitRow({
      customerSlug: 'hala',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      referrer: `https://wa.me/${'x'.repeat(400)}`,
      now: 1_800_000_000_000,
      eventId: 'e-1',
    });
    expect(row).toMatchObject({
      eventId: 'e-1',
      customerSlug: 'hala',
      occurredAt: new Date(1_800_000_000_000).toISOString(),
      // The raw header is never stored, only the family (ADR D8).
      userAgent: 'Safari/iOS',
    });
    expect(row.referrer).toHaveLength(200);
    expect(visitRow({ customerSlug: 'hala', userAgent: null, referrer: null, now: 0 }).userAgent).toBe(
      'unknown',
    );
  });

  it('mints a distinct event id per row', () => {
    const a = visitRow({ customerSlug: 'hala', userAgent: '', referrer: '', now: 0 });
    const b = visitRow({ customerSlug: 'hala', userAgent: '', referrer: '', now: 0 });
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe('visit throttle', () => {
  it('writes one row per customer per window and lets the next window through', () => {
    const t = new VisitThrottle(1000);
    expect(t.shouldRecord('hala', 0)).toBe(true);
    expect(t.shouldRecord('hala', 500)).toBe(false); // paging through the grid is one visit
    expect(t.shouldRecord('nadia', 500)).toBe(true); // a different buyer is a different visit
    expect(t.shouldRecord('hala', 1000)).toBe(true);
  });

  it('stays bounded, dropping the oldest customer rather than growing without limit', () => {
    const t = new VisitThrottle(60_000, 2);
    t.shouldRecord('a', 0);
    t.shouldRecord('b', 0);
    t.shouldRecord('c', 0); // evicts "a"
    expect(t.shouldRecord('b', 1)).toBe(false); // still remembered
    expect(t.shouldRecord('a', 1)).toBe(true); // forgotten: one extra row, never a leak
  });
});

describe('recordVisit', () => {
  const deps = (append: (rows: readonly VisitRow[]) => Promise<void>, now = 0) => ({
    throttle: new VisitThrottle(1000),
    append,
    logger: silentLogger,
    now: () => now,
  });

  it('appends one row and returns it', async () => {
    const rows: VisitRow[] = [];
    const row = await recordVisit(
      { customerSlug: 'hala', userAgent: 'curl/8', referrer: '' },
      deps(async (r) => void rows.push(...r)),
    );
    expect(row?.customerSlug).toBe('hala');
    expect(rows).toHaveLength(1);
  });

  it('writes nothing inside the throttle window', async () => {
    const append = vi.fn(async () => {});
    const d = deps(append);
    await recordVisit({ customerSlug: 'hala', userAgent: '', referrer: '' }, d);
    await recordVisit({ customerSlug: 'hala', userAgent: '', referrer: '' }, d);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('never throws when the sheet write fails: a visit row must not break a page', async () => {
    const errors: unknown[] = [];
    const row = await recordVisit(
      { customerSlug: 'hala', userAgent: '', referrer: '' },
      {
        ...deps(async () => {
          throw new Error('sheet down');
        }),
        logger: { ...silentLogger, error: (...a: unknown[]) => void errors.push(a) },
      },
    );
    expect(row).toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});
