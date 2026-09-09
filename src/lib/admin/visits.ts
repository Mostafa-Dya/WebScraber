// Access log (brief §2 `Visits`), pure. Input: the Visits tab read newest-first.
//
// The site already writes one row per buyer per half-hour session — event id, customer slug, an ISO
// timestamp, the coarse user-agent family and the referrer. Nothing read it back until now, so the
// owner could see what a buyer *liked* but not whether they had opened their link at all. That is
// the question this answers: who has been in, when they were last in, and how often.
//
// A row whose slug is malformed is dropped rather than guessed at; rows for a customer who has since
// been deleted from the Customers tab still count, and are marked `known: false`, because the visit
// happened whether or not the row survives.
import type { CellValue } from '../sheets/client.ts';
import { TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';

/** Bounded like the saves report: the same growth breaker governs both append-only logs. */
export const VISITS_READ_RANGE = `${TABS.visits}!A1:E200001`;

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Anything that is not a plausible ISO timestamp is treated as unknown rather than sorted wrongly. */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v).trim());

export interface VisitEntry {
  customerSlug: string;
  occurredAt: string;
  userAgent: string;
  referrer: string;
}

export interface ClientVisits {
  code: string;
  /** Display name from the Customers tab; the code itself when the row is gone. */
  name: string;
  known: boolean;
  status?: 'active' | 'revoked';
  visits: number;
  /** ISO timestamps; empty string when no row carried a usable one. */
  firstSeen: string;
  lastSeen: string;
  /** The devices this buyer has opened the link on, most recent first, de-duplicated. */
  devices: string[];
}

export interface VisitsReport {
  generatedAt: string;
  byClient: ClientVisits[];
  /** The newest visits across everyone, for an at-a-glance access log. */
  recent: Array<VisitEntry & { name: string; known: boolean }>;
  rowsRead: number;
  rowsDropped: number;
}

export interface KnownClient {
  code: string;
  name: string;
  status: 'active' | 'revoked';
}

/** Parses the tab into entries, newest first, dropping anything malformed. */
export function parseVisits(values: CellValue[][] | undefined): {
  entries: VisitEntry[];
  dropped: number;
} {
  assertHeaders(TABS.visits, values?.[0]);
  const entries: VisitEntry[] = [];
  let dropped = 0;
  if (!values) return { entries, dropped };
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every((c) => text(c) === '')) continue;
    const customerSlug = text(cells[1]);
    if (!SLUG_RE.test(customerSlug)) {
      dropped++;
      continue;
    }
    const occurredAt = text(cells[2]);
    entries.push({
      customerSlug,
      occurredAt: ISO_RE.test(occurredAt) ? occurredAt : '',
      userAgent: text(cells[3]),
      referrer: text(cells[4]),
    });
  }
  return { entries, dropped };
}

/** How many of the newest visits the access log shows. */
export const RECENT_LIMIT = 25;

export function buildVisitsReport(
  values: CellValue[][] | undefined,
  clients: readonly KnownClient[],
  now: () => number = Date.now,
): VisitsReport {
  const { entries, dropped } = parseVisits(values);
  const known = new Map(clients.map((c) => [c.code.toLowerCase(), c]));

  const byCode = new Map<string, ClientVisits>();
  for (const e of entries) {
    const key = e.customerSlug.toLowerCase();
    const client = known.get(key);
    let row = byCode.get(key);
    if (!row) {
      row = {
        code: e.customerSlug,
        name: client?.name || e.customerSlug,
        known: Boolean(client),
        ...(client ? { status: client.status } : {}),
        visits: 0,
        firstSeen: '',
        lastSeen: '',
        devices: [],
      };
      byCode.set(key, row);
    }
    row.visits += 1;
    if (e.occurredAt) {
      // The tab is newest-first, but a hand-edited sheet may not be, so both ends are compared.
      if (!row.lastSeen || e.occurredAt > row.lastSeen) row.lastSeen = e.occurredAt;
      if (!row.firstSeen || e.occurredAt < row.firstSeen) row.firstSeen = e.occurredAt;
    }
    if (e.userAgent && !row.devices.includes(e.userAgent)) row.devices.push(e.userAgent);
  }

  // Buyers who have a link but have never opened it are the interesting ones, so they are listed too.
  for (const c of clients) {
    if (byCode.has(c.code.toLowerCase())) continue;
    byCode.set(c.code.toLowerCase(), {
      code: c.code,
      name: c.name,
      known: true,
      status: c.status,
      visits: 0,
      firstSeen: '',
      lastSeen: '',
      devices: [],
    });
  }

  const byClient = [...byCode.values()].sort(
    (a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name),
  );

  const recent = entries.slice(0, RECENT_LIMIT).map((e) => {
    const client = known.get(e.customerSlug.toLowerCase());
    return { ...e, name: client?.name || e.customerSlug, known: Boolean(client) };
  });

  return {
    generatedAt: new Date(now()).toISOString(),
    byClient,
    recent,
    rowsRead: entries.length,
    rowsDropped: dropped,
  };
}
