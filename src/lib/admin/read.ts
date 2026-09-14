// The admin read (docs/ADMIN_SPEC.md §3.4): one batchGet of Rugs!A1:Z, Collections, Tags, Settings,
// Clients and the newest 100 AuditLog rows, parsed with the PUBLIC parsers for A:V (the admin sees
// exactly what the site sees, dropped rows included) plus the admin columns, each row carrying its
// sheet row number and a version token. Never cached beyond the request.
import { createHash } from 'node:crypto';
import type { CellValue, SheetsClient, ValueRange } from '../sheets/client.ts';
import { HEADERS, PRODUCT_COLS, PRODUCT_WIDTH, TABS } from '../sheets/contract.ts';
import { assertHeaders, parseCollections, parseProducts, parseTags } from '../sheets/parse.ts';
import type { Collection, DroppedRow, Rug, Tag } from '../sheets/types.ts';
import type { Logger } from '../sheets/errors.ts';
import { parseAuditRows, type AuditEntry } from './audit.ts';
import { parseClients, type ClientRow } from './clients.ts';
import { parseSettings, type AdminSettings } from './settings.ts';

export const AUDIT_DASHBOARD_ROWS = 100;
export const ADMIN_READ_RANGES = [
  `${TABS.products}!A1:AP`,
  `${TABS.collections}!A1:G`,
  `${TABS.tags}!A1:D`,
  `${TABS.settings}!A1:D`,
  `${TABS.customers}!A1:F`,
  `${TABS.auditLog}!A1:J${AUDIT_DASHBOARD_ROWS + 1}`,
] as const;

export interface AdminRug extends Rug {
  row: number;
  version: string;
  sourceUrl: string;
  supplier: string;
  supplierRef: string;
  notes: string;
}
export interface AdminCollection extends Collection {
  row: number;
  version: string;
}
export interface AdminTag extends Tag {
  row: number;
  version: string;
}
export interface AdminClient extends ClientRow {
  version: string;
}

export type AdminHeadersState = 'ok' | 'missing';

export interface AdminSnapshot {
  rugs: AdminRug[];
  collections: AdminCollection[];
  tags: AdminTag[];
  settings: AdminSettings;
  clients: AdminClient[];
  audit: AuditEntry[];
  report: {
    dropped: DroppedRow[];
    warnings: DroppedRow[];
    /** 'missing' = W1:Z1 blank → "run `npm run sheet:init`" (not a contract error). */
    adminHeaders: AdminHeadersState;
    clientsDropped: number;
  };
  fetchedAt: number;
}

/* ---------- headers and versions ---------- */

/**
 * The Products tab carries the whole contract now (brief §9), so the admin validates exactly what
 * the site validates. 'missing' is reported when the tab has no header row at all — the owner has
 * not run `npm run sheet:init` yet.
 */
/**
 * The topbar's status line — Figma's App Shell draws "Sheet synced 4 min ago" (25:236) on the right
 * of every admin screen, and it was the only thing between the page name and the logout glyph 1160px
 * away. The slot was plumbed all the way through AdminLayout and AppShell; no page ever filled it,
 * so the bar read as half-finished on every screen.
 *
 * Deliberately coarse. The exact second is noise to the owner — what they need to know is whether
 * what they are looking at is current, and "4 min ago" answers that while "14:32:07" does not.
 */
export function syncLabel(fetchedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 45) return 'Sheet synced just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Sheet synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Sheet synced ${hours} h ago`;
  return `Sheet synced ${Math.round(hours / 24)} d ago`;
}

export function assertAdminHeaders(headerRow: CellValue[] | undefined): AdminHeadersState {
  if (!headerRow || headerRow.every((c) => String(c ?? '').trim() === '')) return 'missing';
  assertHeaders(TABS.products, headerRow);
  return 'ok';
}

function norm(cells: readonly (CellValue | undefined)[], from: number, to: number): CellValue[] {
  const out: CellValue[] = [];
  for (let i = from; i < to; i++) {
    const v = cells[i];
    out.push(v === undefined || v === null ? '' : v);
  }
  return out;
}

function hash16(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

/**
 * Product version token: sha256 over the whole row as read (trailing blanks normalised to '').
 * No column is formula-owned any more — counts come from the Reactions log — so nothing is excluded.
 */
export function rugVersion(cells: readonly (CellValue | undefined)[]): string {
  return hash16(norm(cells, 0, PRODUCT_WIDTH));
}

/** Whole-row version token for the small tabs (Collections A:G, Tags A:D, Customers A:F). */
export function rowVersion(cells: readonly (CellValue | undefined)[], width: number): string {
  return hash16(norm(cells, 0, width));
}

/* ---------- row mapping ---------- */

const isBlank = (c: CellValue | undefined): boolean =>
  c === undefined || c === null || (typeof c === 'string' && c.trim() === '');

/**
 * The public parsers drop or skip rows silently; this recovers the sheet row number of each kept
 * item: kept rows are, in order, the non-blank rows that are neither dropped nor id-less.
 */
function keptRows(values: CellValue[][], dropped: DroppedRow[], needsId: boolean): number[] {
  const droppedRows = new Set(dropped.map((d) => d.row));
  const rows: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every(isBlank)) continue;
    if (needsId && isBlank(cells[0])) continue;
    const row = i + 1;
    if (droppedRows.has(row)) continue;
    rows.push(row);
  }
  return rows;
}

const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v).trim());

export function parseAdminRugs(values: CellValue[][] | undefined): {
  items: AdminRug[];
  dropped: DroppedRow[];
  warnings: DroppedRow[];
  adminHeaders: AdminHeadersState;
} {
  const adminHeaders = assertAdminHeaders(values?.[0]);
  // A blank header row means the owner has not run `npm run sheet:init`: report that plainly
  // instead of letting the parser raise a contract error about column A.
  if (adminHeaders === 'missing') return { items: [], dropped: [], warnings: [], adminHeaders };
  const parsed = parseProducts(values);
  const rows = keptRows(values ?? [], parsed.dropped, true);
  if (rows.length !== parsed.items.length) {
    throw new Error(`admin read: ${parsed.items.length} rugs parsed but ${rows.length} rows located`);
  }
  const items = parsed.items.map((rug: Rug, i: number) => {
    const row = rows[i]!;
    const cells = values![row - 1] ?? [];
    return adminRugFrom(rug, cells, row);
  });
  return { items, dropped: parsed.dropped, warnings: parsed.warnings, adminHeaders };
}

function adminRugFrom(rug: Rug, cells: CellValue[], row: number): AdminRug {
  return {
    ...rug,
    row,
    version: rugVersion(cells),
    sourceUrl: text(cells[PRODUCT_COLS.sourceUrl]),
    supplier: text(cells[PRODUCT_COLS.sourceSite]).toLowerCase(),
    supplierRef: text(cells[PRODUCT_COLS.variantSku]),
    notes: text(cells[PRODUCT_COLS.internalNotes]),
  };
}

/** One freshly read `Products!A{row}:AP{row}` row → AdminRug (undefined when the row fails validation). */
export function adminRugFromCells(cells: CellValue[], row: number): AdminRug | undefined {
  const header = [...HEADERS.Products];
  const parsed = parseProducts([header, cells]);
  const rug = parsed.items[0];
  return rug ? adminRugFrom(rug, cells, row) : undefined;
}

export function parseAdminCollections(values: CellValue[][] | undefined): {
  items: AdminCollection[];
  dropped: DroppedRow[];
  warnings: DroppedRow[];
} {
  const parsed = parseCollections(values);
  const rows = keptRows(values ?? [], parsed.dropped, false);
  if (rows.length !== parsed.items.length) {
    throw new Error(`admin read: ${parsed.items.length} collections parsed but ${rows.length} rows located`);
  }
  const width = HEADERS.Collections.length;
  const items = parsed.items.map((c, i) => {
    const row = rows[i]!;
    return { ...c, row, version: rowVersion(values![row - 1] ?? [], width) };
  });
  return { items, dropped: parsed.dropped, warnings: parsed.warnings };
}

export function parseAdminTags(values: CellValue[][] | undefined): {
  items: AdminTag[];
  dropped: DroppedRow[];
  warnings: DroppedRow[];
} {
  const parsed = parseTags(values);
  const rows = keptRows(values ?? [], parsed.dropped, false);
  if (rows.length !== parsed.items.length) {
    throw new Error(`admin read: ${parsed.items.length} tags parsed but ${rows.length} rows located`);
  }
  const width = HEADERS.Tags.length;
  const items = parsed.items.map((t, i) => {
    const row = rows[i]!;
    return { ...t, row, version: rowVersion(values![row - 1] ?? [], width) };
  });
  return { items, dropped: parsed.dropped, warnings: parsed.warnings };
}

export function parseAdminClients(values: CellValue[][] | undefined): {
  items: AdminClient[];
  dropped: number;
} {
  const parsed = parseClients(values);
  const width = HEADERS.Customers.length;
  return {
    items: parsed.items.map((c) => ({ ...c, version: rowVersion(values![c.row - 1] ?? [], width) })),
    dropped: parsed.dropped,
  };
}

/* ---------- the snapshot ---------- */

/** Parses the six ADMIN_READ_RANGES value ranges (positional). Throws SheetContractError on a bad header. */
export function parseAdminSnapshot(
  ranges: readonly ValueRange[],
  opts: { now?: () => number; logger?: Logger } = {},
): AdminSnapshot {
  const [rugsVR, collectionsVR, tagsVR, settingsVR, clientsVR, auditVR] = ranges;
  const rugs = parseAdminRugs(rugsVR?.values);
  const collections = parseAdminCollections(collectionsVR?.values);
  const tags = parseAdminTags(tagsVR?.values);
  const settings = parseSettings(settingsVR?.values, opts.logger);
  const clients = parseAdminClients(clientsVR?.values);
  const audit = parseAuditRows(auditVR?.values);
  return {
    rugs: rugs.items,
    collections: collections.items,
    tags: tags.items,
    settings,
    clients: clients.items,
    audit,
    report: {
      dropped: [...rugs.dropped, ...collections.dropped, ...tags.dropped],
      warnings: [...rugs.warnings, ...collections.warnings, ...tags.warnings],
      adminHeaders: rugs.adminHeaders,
      clientsDropped: clients.dropped,
    },
    fetchedAt: (opts.now ?? Date.now)(),
  };
}

export async function fetchAdminSnapshot(
  client: Pick<SheetsClient, 'batchGet'>,
  opts: { now?: () => number; logger?: Logger } = {},
): Promise<AdminSnapshot> {
  return parseAdminSnapshot(await client.batchGet(ADMIN_READ_RANGES), opts);
}

/** Case-insensitive lookups the CRUD endpoints share. */
export function findRugById(snapshot: Pick<AdminSnapshot, 'rugs'>, id: string): AdminRug | undefined {
  const key = id.trim().toLowerCase();
  return snapshot.rugs.find((r) => r.id.toLowerCase() === key);
}

export function findCollectionByName(
  snapshot: Pick<AdminSnapshot, 'collections'>,
  name: string,
): AdminCollection | undefined {
  const key = name.trim().toLowerCase();
  return snapshot.collections.find((c) => c.name.trim().toLowerCase() === key);
}

export function findTagByName(snapshot: Pick<AdminSnapshot, 'tags'>, name: string): AdminTag | undefined {
  const key = name.trim().toLowerCase();
  return snapshot.tags.find((t) => t.name.trim().toLowerCase() === key);
}

export interface AdminCounts {
  rugs: { active: number; draft: number; archived: number; total: number };
  collections: number;
  tags: number;
  clients: { active: number; revoked: number };
}

export function adminCounts(snapshot: AdminSnapshot): AdminCounts {
  const rugs = { active: 0, draft: 0, archived: 0, total: snapshot.rugs.length };
  for (const r of snapshot.rugs) rugs[r.status] += 1;
  const clients = { active: 0, revoked: 0 };
  for (const c of snapshot.clients) clients[c.status] += 1;
  return { rugs, collections: snapshot.collections.length, tags: snapshot.tags.length, clients };
}
