// Admin writes (docs/ADMIN_SPEC.md §3.4): row-addressed `updateCells` with literal values, an
// optimistic version token checked under the in-process mutex, the AuditLog row in the SAME
// batchUpdate as the change (atomic per call), a read-back verification for Rugs, and the request
// walker that guarantees Rugs A (id), Q:S (formulas) and T (created_at) are never touched by an
// update. Rows are never deleted, never inserted at the top of Rugs, never appended with
// `values.append` (the Q:S array-formula spill makes table detection unverified).
import type { CellValue, SheetsClient } from '../sheets/client.ts';
import { HEADERS, PRODUCT_COLS, PRODUCT_WIDTH, TABS, type TabName } from '../sheets/contract.ts';
import { SheetsApiError, serializeError, type Logger } from '../sheets/errors.ts';
import type { Rotate, Status } from '../sheets/types.ts';
import { buildInsertRows, cellOrClear } from '../sheets/write.ts';
import { auditRowToCells, type AuditAction, type AuditRow } from './audit.ts';
import { withAdminLock } from './lock.ts';
import { joinCollections } from '../text.ts';
import { rowVersion, rugVersion } from './read.ts';

/** Grid rows added at once when an insert lands past the current row count. */
export const APPEND_ROWS = 50;
/** Newest-first tabs: the audit row and client rows always land on sheet row 2. */
export const TOP_ROW = 2;

export type RowTab =
  typeof TABS.collections | typeof TABS.tags | typeof TABS.settings | typeof TABS.customers;

/* ---------- errors ---------- */

export class VersionMismatchError extends Error {
  readonly status = 409;
  readonly code = 'version mismatch';
  readonly tab: string;
  readonly row: number;
  /** The row as it is now (A..Z for Rugs, A.. for the others). */
  readonly fresh: CellValue[];
  constructor(tab: string, row: number, fresh: CellValue[], reason: string) {
    super(`${tab} row ${row}: ${reason}`);
    this.name = 'VersionMismatchError';
    this.tab = tab;
    this.row = row;
    this.fresh = fresh;
  }
}

export class RowConflictError extends Error {
  readonly status = 409;
  readonly code = 'row conflict';
  constructor(message: string) {
    super(message);
    this.name = 'RowConflictError';
  }
}

export class UnsafeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRequestError';
  }
}

/* ---------- rug cells ---------- */

export interface RugFields {
  slug: string;
  name: string;
  description: string;
  /** Every collection the product belongs to, primary first; written pipe-joined into one cell. */
  collections: string[];
  tags: string[];
  photos: string[];
  widthCm?: number;
  lengthCm?: number;
  material: string;
  age: string;
  origin: string;
  priceUsd?: number;
  rotate: Rotate;
  featured: boolean;
  status: Status;
  method: string;
  sourceUrl: string;
  /** Written to `Source Site`. */
  supplier: string;
  /** Written to `Variant SKU`. */
  supplierRef: string;
  /** Written to `Internal Notes`. */
  notes: string;
  pile?: string;
  shape?: string;
  vendor?: string;
  productCategory?: string;
  productType?: string;
  seoTitle?: string;
  seoDescription?: string;
  imageAltText?: string;
  compareAtPrice?: number;
  variantGrams?: number;
  sizeLabel?: string;
  sizeBand?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  scrapedAt?: string;
  commitStatus?: string;
}

export type Cells = Array<CellValue | undefined>;

/**
 * Every Products cell A..AP in column order (brief §9). `featured` and `rotate` have no column in
 * the Shopify set, so they ride on Tags as the flags `featured` / `rotate` / `rotate-force`.
 */
export function productFieldsToCells(f: RugFields, id: string): Cells {
  const flags: string[] = [];
  if (f.featured) flags.push('featured');
  if (f.rotate === 'force') flags.push('rotate-force');
  else if (f.rotate === 'true') flags.push('rotate');
  const tags = [...f.tags, ...flags].join(', ');
  const cells: Cells = new Array(PRODUCT_WIDTH).fill('');
  cells[PRODUCT_COLS.productId] = id;
  cells[PRODUCT_COLS.handle] = f.slug;
  cells[PRODUCT_COLS.title] = f.name;
  cells[PRODUCT_COLS.bodyHtml] = f.description;
  cells[PRODUCT_COLS.vendor] = f.vendor ?? '';
  cells[PRODUCT_COLS.productCategory] = f.productCategory ?? '';
  cells[PRODUCT_COLS.type] = f.productType ?? '';
  cells[PRODUCT_COLS.tags] = tags;
  cells[PRODUCT_COLS.published] = f.status === 'active';
  cells[PRODUCT_COLS.option1Name] = 'Title';
  cells[PRODUCT_COLS.option1Value] = 'Default Title';
  cells[PRODUCT_COLS.variantSku] = f.supplierRef;
  cells[PRODUCT_COLS.variantGrams] = f.variantGrams;
  cells[PRODUCT_COLS.variantInventoryQty] = 1;
  cells[PRODUCT_COLS.variantInventoryPolicy] = 'deny';
  cells[PRODUCT_COLS.variantPrice] = f.priceUsd;
  cells[PRODUCT_COLS.variantCompareAtPrice] = f.compareAtPrice;
  cells[PRODUCT_COLS.variantRequiresShipping] = true;
  cells[PRODUCT_COLS.variantTaxable] = true;
  cells[PRODUCT_COLS.imageSrc] = f.photos[0] ?? '';
  cells[PRODUCT_COLS.imageAltText] = f.imageAltText ?? f.name;
  cells[PRODUCT_COLS.seoTitle] = f.seoTitle ?? '';
  cells[PRODUCT_COLS.seoDescription] = f.seoDescription ?? '';
  cells[PRODUCT_COLS.status] = f.status;
  cells[PRODUCT_COLS.widthCm] = f.widthCm;
  cells[PRODUCT_COLS.lengthCm] = f.lengthCm;
  cells[PRODUCT_COLS.sizeLabel] = f.sizeLabel ?? '';
  cells[PRODUCT_COLS.sizeBand] = f.sizeBand ?? '';
  cells[PRODUCT_COLS.material] = f.material;
  cells[PRODUCT_COLS.method] = f.method;
  cells[PRODUCT_COLS.origin] = f.origin;
  cells[PRODUCT_COLS.age] = f.age;
  cells[PRODUCT_COLS.pile] = f.pile ?? '';
  cells[PRODUCT_COLS.shape] = f.shape ?? '';
  cells[PRODUCT_COLS.collection] = joinCollections(f.collections);
  cells[PRODUCT_COLS.sourceUrl] = f.sourceUrl;
  cells[PRODUCT_COLS.sourceSite] = f.supplier;
  cells[PRODUCT_COLS.driveFolderId] = f.driveFolderId ?? '';
  cells[PRODUCT_COLS.driveFolderUrl] = f.driveFolderUrl ?? '';
  cells[PRODUCT_COLS.scrapedAt] = f.scrapedAt ?? '';
  cells[PRODUCT_COLS.commitStatus] = f.commitStatus ?? '';
  cells[PRODUCT_COLS.internalNotes] = f.notes;
  return cells;
}

/** Legacy shape kept for the callers that still speak in B..P slices. */
export function rugFieldsToBP(f: RugFields): Cells {
  return [
    f.slug,
    f.name,
    f.description,
    joinCollections(f.collections),
    f.tags.join('|'),
    f.photos.join('|'),
    f.widthCm,
    f.lengthCm,
    f.material,
    f.age,
    f.origin,
    f.priceUsd,
    f.rotate === 'false' ? '' : f.rotate,
    f.featured,
    f.status,
  ];
}

/** Columns V..Z (method, source_url, supplier, supplier_ref, notes). */
export function rugFieldsToVZ(f: RugFields): Cells {
  return [f.method, f.sourceUrl, f.supplier, f.supplierRef, f.notes];
}

/* ---------- request builders ---------- */

export interface UpdateCellsRequest {
  updateCells: {
    start: { sheetId: number; rowIndex: number; columnIndex: number };
    rows: Array<{ values: unknown[] }>;
    fields: 'userEnteredValue';
  };
}

/** One row of literal cells at 1-based `row`, starting at zero-based `columnIndex`. */
export function buildRowUpdate(
  sheetId: number,
  row: number,
  columnIndex: number,
  cells: Cells,
): UpdateCellsRequest {
  return {
    updateCells: {
      start: { sheetId, rowIndex: row - 1, columnIndex },
      rows: [{ values: cells.map(cellOrClear) }],
      fields: 'userEnteredValue',
    },
  };
}

export function buildAuditInsert(auditSheetId: number, audit: AuditRow): unknown[] {
  return buildInsertRows(auditSheetId, TOP_ROW - 1, [auditRowToCells(audit)]);
}

export function buildAppendRows(sheetId: number, length = APPEND_ROWS): unknown {
  return { appendDimension: { sheetId, dimension: 'ROWS', length } };
}

/** Update: B{row}:AP{row} (everything except the Product ID) + the audit row, in one batch. */
export function buildRugUpdateRequests(
  ids: { rugs: number; auditLog: number },
  row: number,
  cells: { all: Cells },
  audit: AuditRow,
): unknown[] {
  if (cells.all.length !== PRODUCT_WIDTH)
    throw new UnsafeRequestError(`product update needs ${PRODUCT_WIDTH} cells, got ${cells.all.length}`);
  const requests = [
    buildRowUpdate(ids.rugs, row, PRODUCT_COLS.handle, cells.all.slice(1)),
    ...buildAuditInsert(ids.auditLog, audit),
  ];
  assertRugRequestsSafe(requests, ids.rugs, 'update');
  return requests;
}

/** Insert: optional appendDimension first, then A{row}:AP{row} + the audit row. */
export function buildRugInsertRequests(
  ids: { rugs: number; auditLog: number },
  targetRow: number,
  rowCount: number,
  cells: { all: Cells },
  audit: AuditRow,
): unknown[] {
  if (cells.all.length !== PRODUCT_WIDTH)
    throw new UnsafeRequestError(`product insert needs ${PRODUCT_WIDTH} cells, got ${cells.all.length}`);
  if (targetRow < 2) throw new UnsafeRequestError('product insert target must be below the header');
  const requests: unknown[] = [];
  if (targetRow > rowCount)
    requests.push(buildAppendRows(ids.rugs, Math.max(APPEND_ROWS, targetRow - rowCount)));
  requests.push(
    buildRowUpdate(ids.rugs, targetRow, PRODUCT_COLS.productId, cells.all),
    ...buildAuditInsert(ids.auditLog, audit),
  );
  assertRugRequestsSafe(requests, ids.rugs, 'insert');
  return requests;
}

/**
 * Walks every request and refuses anything that could damage the Products tab: an `updateCells`
 * touching the Product ID on an update, row inserts/deletes, `appendCells`, deletes anywhere, or a
 * write past the last column. Called by every builder; exported for the unit test.
 */
export function assertRugRequestsSafe(
  requests: readonly unknown[],
  rugsSheetId: number,
  mode: 'update' | 'insert',
): void {
  // Counts are derived from the Reactions log, so no column is formula-owned any more; the id is
  // the only cell an update must never touch.
  const forbidden = new Set<number>(mode === 'update' ? [PRODUCT_COLS.productId] : []);
  for (const raw of requests) {
    const req = raw as Record<string, unknown>;
    if ('deleteDimension' in req || 'deleteRange' in req || 'deleteSheet' in req) {
      throw new UnsafeRequestError('admin writes never delete');
    }
    const insert = req.insertDimension as { range?: { sheetId?: number } } | undefined;
    if (insert?.range?.sheetId === rugsSheetId)
      throw new UnsafeRequestError('never insert rows into Products');
    const append = req.appendCells as { sheetId?: number } | undefined;
    if (append?.sheetId === rugsSheetId) throw new UnsafeRequestError('never appendCells on Products');
    const update = req.updateCells as
      | {
          start?: { sheetId?: number; columnIndex?: number };
          range?: unknown;
          rows?: Array<{ values?: unknown[] }>;
        }
      | undefined;
    if (!update || update.start?.sheetId !== rugsSheetId) continue;
    if (update.range !== undefined)
      throw new UnsafeRequestError('Products updates must use `start`, not `range`');
    const from = update.start?.columnIndex ?? 0;
    const width = Math.max(0, ...(update.rows ?? []).map((r) => r.values?.length ?? 0));
    if (mode === 'update' && from === 0)
      throw new UnsafeRequestError('Products updates never start at column A');
    for (let c = from; c < from + width; c++) {
      if (forbidden.has(c))
        throw new UnsafeRequestError(`Products ${mode} covers protected column index ${c}`);
    }
    if (from + width > PRODUCT_WIDTH) throw new UnsafeRequestError('Products write past the last column');
  }
}

/* ---------- commits (each under the admin lock) ---------- */

export interface CommitResult {
  row: number;
  audit: { row: number; action: AuditAction };
  /** Rugs only: the read-back matched (false = logged and audited as `verify-failed`). */
  verified: boolean;
}

type Client = Pick<
  SheetsClient,
  'batchGet' | 'batchUpdate' | 'sheetIdByTitle' | 'getSpreadsheet' | 'forgetSheetIds'
>;

function onSheetIdError(client: Client, e: unknown): never {
  if (e instanceof SheetsApiError && e.status === 400 && /sheetId|No grid with id/i.test(e.message)) {
    client.forgetSheetIds(); // a recreated tab has a new id; the next request resolves it again
  }
  throw e;
}

async function rugsRowCount(client: Client): Promise<number> {
  const info = await client.getSpreadsheet('sheets.properties');
  const rugs = (info.sheets ?? []).find((s) => s.properties.title === TABS.products);
  const n = rugs?.properties.gridProperties?.rowCount;
  if (typeof n !== 'number') throw new SheetsApiError(502, 'Rugs grid row count unavailable');
  return n;
}

/** Rugs A..Z of one row as read (missing trailing cells → absent). */
async function readRugRow(client: Client, row: number): Promise<CellValue[]> {
  const [vr] = await client.batchGet([`${TABS.products}!A${row}:AP${row}`]);
  return vr?.values?.[0] ?? [];
}

const cellText = (v: CellValue | undefined): string =>
  v === undefined || v === null ? '' : String(v).trim();

async function verifyRug(
  client: Client,
  row: number,
  id: string,
  audit: AuditRow,
  logger?: Logger,
): Promise<boolean> {
  let a: string | undefined;
  try {
    a = cellText((await readRugRow(client, row))[PRODUCT_COLS.productId]);
  } catch (e) {
    logger?.error('rug write verify read failed', { row, id, error: serializeError(e) });
    return false;
  }
  if (a === id) return true;
  logger?.error('rug write verify mismatch', { row, expected: id, found: a });
  try {
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    await client.batchUpdate(
      buildAuditInsert(auditSheetId, { ...audit, note: `verify-failed: A${row}="${a}"` }),
    );
  } catch (e) {
    logger?.error('verify-failed audit row not written', { error: serializeError(e) });
  }
  return false;
}

/**
 * Update one rug: (a) re-read A{row}:Z{row}; (b) assert `A === id` and hash === `version`, else
 * VersionMismatchError with the fresh row; (c) one batchUpdate (B:P + U:Z + audit); (d) read back.
 */
export async function updateRug(
  client: Client,
  args: {
    row: number;
    id: string;
    version: string;
    cells: { all: Cells };
    audit: AuditRow;
    logger?: Logger;
  },
): Promise<CommitResult> {
  return withAdminLock(async () => {
    const fresh = await readRugRow(client, args.row);
    if (cellText(fresh[PRODUCT_COLS.productId]) !== args.id) {
      throw new VersionMismatchError(TABS.products, args.row, fresh, `expected id "${args.id}"`);
    }
    if (rugVersion(fresh) !== args.version) {
      throw new VersionMismatchError(TABS.products, args.row, fresh, 'row changed since it was read');
    }
    const ids = {
      rugs: await client.sheetIdByTitle(TABS.products),
      auditLog: await client.sheetIdByTitle(TABS.auditLog),
    };
    const requests = buildRugUpdateRequests(ids, args.row, args.cells, args.audit);
    try {
      await client.batchUpdate(requests);
    } catch (e) {
      onSheetIdError(client, e);
    }
    const verified = await verifyRug(client, args.row, args.id, args.audit, args.logger);
    return { row: args.row, audit: { row: TOP_ROW, action: args.audit.action }, verified };
  });
}

/** Target row for a bottom insert on any tab: `(A2:A values).length + 2`. */
export async function nextRowOf(client: Pick<SheetsClient, 'batchGet'>, tab: TabName): Promise<number> {
  const [vr] = await client.batchGet([`${tab}!A2:A`]);
  return (vr?.values?.length ?? 0) + 2;
}

/**
 * Insert a new rug at the first row after the last id: asserts A..P and T..Z of the target are
 * empty (Q:S spills are ignored), appends grid rows in the same batch when needed, writes
 * A:P + T:Z + audit atomically, reads back. `cells.aToP[0]` must be the id.
 */
export async function insertRug(
  client: Client,
  args: { cells: { all: Cells }; audit: AuditRow; logger?: Logger },
): Promise<CommitResult> {
  const id = cellText(args.cells.all[0]);
  if (!id) throw new UnsafeRequestError('insertRug: the Product ID (column A) is required');
  return withAdminLock(async () => {
    const [targetRow, rowCount] = await Promise.all([nextRowOf(client, TABS.products), rugsRowCount(client)]);
    if (targetRow <= rowCount) {
      const existing = await readRugRow(client, targetRow);
      const occupied = existing.some((c) => cellText(c) !== '');
      if (occupied) throw new RowConflictError(`Products row ${targetRow} is not blank; retry`);
    }
    const ids = {
      rugs: await client.sheetIdByTitle(TABS.products),
      auditLog: await client.sheetIdByTitle(TABS.auditLog),
    };
    const requests = buildRugInsertRequests(ids, targetRow, rowCount, args.cells, args.audit);
    try {
      await client.batchUpdate(requests);
    } catch (e) {
      onSheetIdError(client, e);
    }
    const verified = await verifyRug(client, targetRow, id, args.audit, args.logger);
    return { row: targetRow, audit: { row: TOP_ROW, action: args.audit.action }, verified };
  });
}

function widthOf(tab: RowTab): number {
  return HEADERS[tab].length;
}

async function readRow(client: Client, tab: RowTab, row: number): Promise<CellValue[]> {
  const last = String.fromCharCode(64 + widthOf(tab));
  const [vr] = await client.batchGet([`${tab}!A${row}:${last}${row}`]);
  return vr?.values?.[0] ?? [];
}

/**
 * Collections / Tags / Settings / Clients: whole-row update (A..) guarded by the whole-row version
 * token and, when given, the expected first cell (id / key / code).
 */
export async function updateRow(
  client: Client,
  args: {
    tab: RowTab;
    row: number;
    version: string;
    cells: Cells;
    audit: AuditRow;
    expectFirstCell?: string;
  },
): Promise<CommitResult> {
  const width = widthOf(args.tab);
  if (args.cells.length !== width)
    throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
  if (args.row < 2) throw new UnsafeRequestError('never write the header row');
  return withAdminLock(async () => {
    const fresh = await readRow(client, args.tab, args.row);
    if (args.expectFirstCell !== undefined && cellText(fresh[0]) !== args.expectFirstCell) {
      throw new VersionMismatchError(
        args.tab,
        args.row,
        fresh,
        `expected "${args.expectFirstCell}" in column A`,
      );
    }
    if (rowVersion(fresh, width) !== args.version) {
      throw new VersionMismatchError(args.tab, args.row, fresh, 'row changed since it was read');
    }
    const sheetId = await client.sheetIdByTitle(args.tab);
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    try {
      await client.batchUpdate([
        buildRowUpdate(sheetId, args.row, 0, args.cells),
        ...buildAuditInsert(auditSheetId, args.audit),
      ]);
    } catch (e) {
      onSheetIdError(client, e);
    }
    return { row: args.row, audit: { row: TOP_ROW, action: args.audit.action }, verified: true };
  });
}

/** Collections / Tags / Settings: insert at the bottom (same target-row rule as Rugs). */
export async function insertRowAtBottom(
  client: Client,
  args: { tab: Exclude<RowTab, typeof TABS.customers>; cells: Cells; audit: AuditRow },
): Promise<CommitResult> {
  const width = widthOf(args.tab);
  if (args.cells.length !== width)
    throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
  return withAdminLock(async () => {
    const targetRow = await nextRowOf(client, args.tab);
    const info = await client.getSpreadsheet('sheets.properties');
    const props = (info.sheets ?? []).find((s) => s.properties.title === args.tab)?.properties;
    const rowCount = props?.gridProperties?.rowCount ?? 0;
    if (targetRow <= rowCount) {
      const existing = await readRow(client, args.tab, targetRow);
      if (existing.some((c) => cellText(c) !== ''))
        throw new RowConflictError(`${args.tab} row ${targetRow} is not blank; retry`);
    }
    const sheetId = await client.sheetIdByTitle(args.tab);
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    const requests: unknown[] = [];
    if (targetRow > rowCount)
      requests.push(buildAppendRows(sheetId, Math.max(APPEND_ROWS, targetRow - rowCount)));
    requests.push(
      buildRowUpdate(sheetId, targetRow, 0, args.cells),
      ...buildAuditInsert(auditSheetId, args.audit),
    );
    try {
      await client.batchUpdate(requests);
    } catch (e) {
      onSheetIdError(client, e);
    }
    return { row: targetRow, audit: { row: TOP_ROW, action: args.audit.action }, verified: true };
  });
}

/** Clients: newest-first at row 2 (no formulas on that tab), with the audit row in the same batch. */
export async function insertTopRow(
  client: Client,
  args: {
    tab: typeof TABS.customers;
    cells: Cells;
    audit: AuditRow;
    /**
     * Runs INSIDE the admin lock, immediately before the insert, and may throw to abort it.
     *
     * The caller builds its row from a snapshot read outside the lock, which leaves a window where
     * another write lands in between. That was academic while customer codes were `name-<6 random>`;
     * since the codes became short scrambles of the name itself (owner, 2026-09-13) the keyspace is
     * far smaller and two buyers with similar names are a realistic collision. This hook is where
     * the caller re-checks the thing it cannot afford to be stale about.
     */
    precheck?: () => Promise<void>;
  },
): Promise<CommitResult> {
  const width = widthOf(args.tab);
  if (args.cells.length !== width)
    throw new UnsafeRequestError(`${args.tab} row needs ${width} cells, got ${args.cells.length}`);
  return withAdminLock(async () => {
    await args.precheck?.();
    const sheetId = await client.sheetIdByTitle(args.tab);
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    try {
      await client.batchUpdate([
        ...buildInsertRows(sheetId, TOP_ROW - 1, [args.cells]),
        ...buildAuditInsert(auditSheetId, args.audit),
      ]);
    } catch (e) {
      onSheetIdError(client, e);
    }
    return { row: TOP_ROW, audit: { row: TOP_ROW, action: args.audit.action }, verified: true };
  });
}

/**
 * Collections reorder: rewrites one column (`sort_order`, F) for every listed row in one batch.
 * Each row's column A is checked against the expected id first (no version tokens, §3.4).
 */
export async function updateColumnCells(
  client: Client,
  args: {
    tab: RowTab;
    columnIndex: number;
    updates: Array<{ row: number; expectFirstCell: string; value: CellValue | undefined }>;
    audit: AuditRow;
  },
): Promise<CommitResult> {
  if (args.columnIndex < 1 || args.columnIndex >= widthOf(args.tab))
    throw new UnsafeRequestError('column out of range');
  if (args.updates.some((u) => u.row < 2)) throw new UnsafeRequestError('never write the header row');
  return withAdminLock(async () => {
    const ranges = args.updates.map((u) => `${args.tab}!A${u.row}:A${u.row}`);
    const read = ranges.length ? await client.batchGet(ranges) : [];
    args.updates.forEach((u, i) => {
      const found = cellText(read[i]?.values?.[0]?.[0]);
      if (found !== u.expectFirstCell) {
        throw new VersionMismatchError(
          args.tab,
          u.row,
          read[i]?.values?.[0] ?? [],
          `expected "${u.expectFirstCell}", found "${found}"`,
        );
      }
    });
    const sheetId = await client.sheetIdByTitle(args.tab);
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    try {
      await client.batchUpdate([
        ...args.updates.map((u) => buildRowUpdate(sheetId, u.row, args.columnIndex, [u.value])),
        ...buildAuditInsert(auditSheetId, args.audit),
      ]);
    } catch (e) {
      onSheetIdError(client, e);
    }
    return {
      row: args.updates[0]?.row ?? 0,
      audit: { row: TOP_ROW, action: args.audit.action },
      verified: true,
    };
  });
}

/** A stand-alone audit row (login, logout, lockout, scrape, photo import) at AuditLog row 2. */
export async function appendAudit(
  client: Client,
  audit: AuditRow,
): Promise<{ row: number; action: AuditAction }> {
  return withAdminLock(async () => {
    const auditSheetId = await client.sheetIdByTitle(TABS.auditLog);
    try {
      await client.batchUpdate(buildAuditInsert(auditSheetId, audit));
    } catch (e) {
      onSheetIdError(client, e);
    }
    return { row: TOP_ROW, action: audit.action };
  });
}
