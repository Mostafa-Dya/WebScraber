// AuditLog rows (docs/ADMIN_SPEC.md §3.2): diff-only before/after JSON, the 40 000-char cap with
// refusal for mutations (422 `unauditable`) and truncation for informational events, and never a
// raw IP (the caller passes `ipHash(VOTE_SALT, ip)`). Pure; the row is written by write.ts in the
// same batchUpdate as the change it describes.
import type { CellValue } from '../sheets/client.ts';
import { HEADERS, TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';

export const AUDIT_ACTIONS = [
  'rug.create',
  'rug.update',
  'rug.status',
  'collection.create',
  'collection.update',
  'collection.reorder',
  'tag.create',
  'tag.update',
  'client.create',
  'client.status',
  'client.password',
  'settings.update',
  'photo.import',
  'scrape.fetch',
  'reactions.compact',
  'auth.login',
  'auth.logout',
  'auth.lockout',
  'auth.google',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TABS = [
  'Products',
  'Collections',
  'Tags',
  'Customers',
  'Reactions',
  'Settings',
  'Drive',
  '-',
] as const;
export type AuditTab = (typeof AUDIT_TABS)[number];

/** Actions whose diff must be complete: a truncated diff refuses the mutation instead. */
export const MUTATION_ACTIONS: ReadonlySet<AuditAction> = new Set<AuditAction>([
  'rug.create',
  'rug.update',
  'rug.status',
  'collection.create',
  'collection.update',
  'collection.reorder',
  'tag.create',
  'tag.update',
  'client.create',
  'client.status',
  'client.password',
  'settings.update',
]);

/** Per-cell cap for the before/after JSON (the sheet cell cap is 50 000). */
export const AUDIT_JSON_MAX = 40_000;
export const AUDIT_NOTE_MAX = 500;
const IP_HASH_RE = /^[a-f0-9]{32}$/;
const REQUEST_ID_RE = /^[a-f0-9]{8,32}$/;
const TRUNCATED_MARK = '…[truncated]';

export class UnauditableError extends Error {
  readonly status = 422;
  readonly code = 'unauditable';
  constructor(message: string) {
    super(message);
    this.name = 'UnauditableError';
  }
}

export interface AuditInput {
  action: AuditAction;
  targetTab: AuditTab;
  targetId: string;
  before?: unknown;
  after?: unknown;
  actor: string;
  /** `ipHash(VOTE_SALT, ip)` — 32 hex chars; a raw IP is refused. */
  ipHash: string;
  /** `locals.requestId` (correlates scrape → photo import → create from one form). */
  requestId: string;
  note?: string;
  /** ISO-8601 UTC; defaults to now. */
  timestamp?: string;
}

export interface AuditRow {
  timestamp: string;
  actor: string;
  action: AuditAction;
  targetTab: AuditTab;
  targetId: string;
  /** JSON text or '' */
  before: string;
  after: string;
  ipHash: string;
  requestId: string;
  note: string;
}

/** A row as read back from the tab (the dashboard / viewer). */
export interface AuditEntry extends Omit<AuditRow, 'action' | 'targetTab'> {
  row: number;
  action: string;
  targetTab: string;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = o[k];
          return acc;
        }, {});
    }
    return v;
  });
}

/** Changed keys only (union of both sides), compared by their stable JSON. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T>; changed: string[] } {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const k of [...keys].sort()) {
    if (stableStringify(before[k] ?? null) !== stableStringify(after[k] ?? null)) {
      changed.push(k);
      if (before[k] !== undefined) b[k] = before[k];
      if (after[k] !== undefined) a[k] = after[k];
    }
  }
  return { before: b as Partial<T>, after: a as Partial<T>, changed };
}

function jsonCell(value: unknown, mutation: boolean, what: string): string {
  if (value === undefined || value === null) return '';
  const text = stableStringify(value);
  if (text.length <= AUDIT_JSON_MAX) return text;
  if (mutation) {
    throw new UnauditableError(
      `audit ${what} JSON is ${text.length} chars (limit ${AUDIT_JSON_MAX}); refusing the change`,
    );
  }
  return text.slice(0, AUDIT_JSON_MAX - TRUNCATED_MARK.length) + TRUNCATED_MARK;
}

/**
 * Builds the row. Throws UnauditableError when a mutation's diff would not fit (the mutation must
 * be refused with 422), and on a malformed ip hash / request id (never a raw IP in the sheet).
 */
export function buildAuditRow(input: AuditInput): AuditRow {
  if (!AUDIT_ACTIONS.includes(input.action))
    throw new UnauditableError(`unknown audit action "${input.action}"`);
  if (!AUDIT_TABS.includes(input.targetTab))
    throw new UnauditableError(`unknown audit tab "${input.targetTab}"`);
  if (!IP_HASH_RE.test(input.ipHash))
    throw new UnauditableError('audit ip_hash must be the 32-hex HMAC, never an address');
  if (!REQUEST_ID_RE.test(input.requestId)) throw new UnauditableError('audit request_id must be hex');
  const mutation = MUTATION_ACTIONS.has(input.action);
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    actor: String(input.actor || 'owner').slice(0, 64),
    action: input.action,
    targetTab: input.targetTab,
    targetId: String(input.targetId ?? '').slice(0, 128),
    before: jsonCell(input.before, mutation, 'before'),
    after: jsonCell(input.after, mutation, 'after'),
    ipHash: input.ipHash,
    requestId: input.requestId,
    note: String(input.note ?? '').slice(0, AUDIT_NOTE_MAX),
  };
}

/** Cells in HEADERS.AuditLog order (10 columns). */
export function auditRowToCells(row: AuditRow): CellValue[] {
  return [
    row.timestamp,
    row.actor,
    row.action,
    row.targetTab,
    row.targetId,
    row.before,
    row.after,
    row.ipHash,
    row.requestId,
    row.note,
  ];
}

/** Reads `AuditLog!A1:J…` (header first, newest first) into entries with their sheet row number. */
export function parseAuditRows(values: CellValue[][] | undefined): AuditEntry[] {
  assertHeaders(TABS.auditLog, values?.[0]);
  const out: AuditEntry[] = [];
  if (!values) return out;
  const n = HEADERS.AuditLog.length;
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every((c) => c === undefined || c === null || String(c).trim() === '')) continue;
    const s = (j: number): string => (cells[j] === undefined || cells[j] === null ? '' : String(cells[j]));
    const entry: AuditEntry = {
      row: i + 1,
      timestamp: s(0),
      actor: s(1),
      action: s(2),
      targetTab: s(3),
      targetId: s(4),
      before: s(5),
      after: s(6),
      ipHash: s(7),
      requestId: s(8),
      note: s(n - 1),
    };
    out.push(entry);
  }
  return out;
}
