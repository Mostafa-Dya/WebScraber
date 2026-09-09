// Visit logging (brief §2 `Visits`, §1 "recording visits"). One append-only row per buyer session
// window: event_id, customer_slug, occurred_at, user_agent, referrer.
//
// Two deliberate choices, both about Sheets quota (60 writes/min/user, brief §3):
//   * the user agent is stored as the coarse family ("Chrome/iOS"), never the raw header — the same
//     posture the reaction log already takes (ADR D8);
//   * a customer's visits are throttled to one row per `VISIT_WINDOW_MS`, so paging through forty
//     rugs writes one row, not forty. The window is per process, which is exact here because the
//     app runs as a single long-lived Node process (ADR D2).
//
// Nothing in this module may fail a page render: `recordVisit` swallows every error and logs it.
import { randomUUID } from 'node:crypto';
import { uaFamily } from '../votes/ua.ts';
import type { Logger } from '../sheets/errors.ts';
import { serializeError } from '../sheets/errors.ts';
import type { VisitRow } from '../sheets/types.ts';

/** One row per customer per 30 minutes; a reload inside the window is the same visit. */
export const VISIT_WINDOW_MS = 30 * 60_000;

/** Referrers are stored for provenance only, so an over-long or hostile value is truncated. */
const MAX_REFERRER = 200;

export function visitRow(input: {
  customerSlug: string;
  userAgent: string | null | undefined;
  referrer: string | null | undefined;
  now: number;
  eventId?: string;
}): VisitRow {
  return {
    eventId: input.eventId ?? randomUUID(),
    customerSlug: input.customerSlug,
    occurredAt: new Date(input.now).toISOString(),
    userAgent: uaFamily(input.userAgent),
    referrer: (input.referrer ?? '').slice(0, MAX_REFERRER),
  };
}

/**
 * Remembers when each customer was last logged. Bounded: the oldest entries are dropped once the
 * map is full, which at worst writes one extra row for a buyer who has been idle a long time.
 */
export class VisitThrottle {
  private readonly seen = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(windowMs: number = VISIT_WINDOW_MS, maxKeys = 2000) {
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  /** True when this visit should be written; stamps the customer as seen when it returns true. */
  shouldRecord(customerSlug: string, now: number): boolean {
    const last = this.seen.get(customerSlug);
    if (last !== undefined && now - last < this.windowMs) return false;
    if (this.seen.size >= this.maxKeys && !this.seen.has(customerSlug)) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.set(customerSlug, now);
    return true;
  }

  /** Test seam. */
  clear(): void {
    this.seen.clear();
  }
}

export interface VisitDeps {
  throttle: VisitThrottle;
  append: (rows: readonly VisitRow[]) => Promise<void>;
  logger: Logger;
  now?: () => number;
}

/**
 * Fire-and-forget: returns the row that was written (for tests), or undefined when the visit was
 * inside the throttle window or the append failed. Never throws.
 */
export async function recordVisit(
  input: { customerSlug: string; userAgent: string | null | undefined; referrer: string | null | undefined },
  deps: VisitDeps,
): Promise<VisitRow | undefined> {
  const now = (deps.now ?? Date.now)();
  if (!deps.throttle.shouldRecord(input.customerSlug, now)) return undefined;
  const row = visitRow({ ...input, now });
  try {
    await deps.append([row]);
    return row;
  } catch (e) {
    deps.logger.error('visit not recorded', {
      customer: input.customerSlug,
      error: serializeError(e),
    });
    return undefined;
  }
}
