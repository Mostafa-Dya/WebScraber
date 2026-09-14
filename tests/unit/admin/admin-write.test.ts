import { describe, expect, it, vi, type Mock } from 'vitest';
import { buildAuditRow, type AuditRow } from '../../../src/lib/admin/audit.ts';
import { rowVersion, rugVersion } from '../../../src/lib/admin/read.ts';
import {
  APPEND_ROWS,
  RowConflictError,
  UnsafeRequestError,
  VersionMismatchError,
  appendAudit,
  assertRugRequestsSafe,
  buildRugInsertRequests,
  buildRugUpdateRequests,
  insertRowAtBottom,
  insertRug,
  insertTopRow,
  productFieldsToCells,
  updateColumnCells,
  updateRow,
  updateRug,
  type Cells,
  type RugFields,
} from '../../../src/lib/admin/write.ts';
import type { CellValue, SpreadsheetInfo, ValueRange } from '../../../src/lib/sheets/client.ts';
import { HEADERS, PRODUCT_COLS, PRODUCT_WIDTH } from '../../../src/lib/sheets/contract.ts';
import { buildInsertRows, cellOrClear } from '../../../src/lib/sheets/write.ts';
import { rugRow } from '../../helpers/ranges.ts';

// Must match tests/unit/admin-ui/fake-sheets.ts SHEET_IDS: the commit paths resolve ids by title.
// Keys are sheet *titles*: the fake resolves ids and grid metadata from this map.
const IDS = {
  Products: 11,
  Collections: 33,
  Tags: 44,
  Customers: 88,
  AuditLog: 99,
  Settings: 100,
} as const;
/** Alias so the assertions keep reading "the products tab". */
const RUGS_ID = IDS.Products;
const audit: AuditRow = buildAuditRow({
  action: 'rug.update',
  targetTab: 'Products',
  targetId: 'SL-021',
  actor: 'owner',
  ipHash: 'a'.repeat(32),
  requestId: 'b'.repeat(16),
  after: { name: 'x' },
  timestamp: '2026-09-07T00:00:00.000Z',
});
const fields: RugFields = {
  slug: 'winks',
  name: 'Winks',
  description: '',
  collections: ['Kilims'],
  tags: ['Kilim', 'Denizli'],
  photos: ['1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb'],
  widthCm: 135,
  lengthCm: 190,
  material: '100% Wool',
  age: 'Modern',
  origin: 'Denizli, Turkey',
  priceUsd: 705,
  rotate: 'false',
  featured: true,
  status: 'active',
  method: 'Hand-woven',
  sourceUrl: 'https://karavanrug.com/products/winks',
  supplier: 'karavanrug',
  supplierRef: '1389',
  notes: '',
};

interface Req {
  updateCells?: {
    start: { sheetId: number; rowIndex: number; columnIndex: number };
    rows: Array<{ values: unknown[] }>;
  };
  insertDimension?: { range: { sheetId: number; startIndex: number; endIndex: number } };
  appendDimension?: { sheetId: number; dimension: string; length: number };
}

/** Columns covered by an updateCells request on `sheetId`. */
function covered(reqs: unknown[], sheetId: number): number[] {
  const cols = new Set<number>();
  for (const r of reqs as Req[]) {
    const u = r.updateCells;
    if (!u || u.start.sheetId !== sheetId) continue;
    const width = Math.max(...u.rows.map((row) => row.values.length));
    for (let c = u.start.columnIndex; c < u.start.columnIndex + width; c++) cols.add(c);
  }
  return [...cols].sort((a, b) => a - b);
}

/* ---------- a scripted Sheets client ---------- */

interface Fake {
  client: {
    batchGet: Mock<(ranges: readonly string[]) => Promise<ValueRange[]>>;
    batchUpdate: Mock<(reqs: unknown[]) => Promise<{ replies?: unknown[] }>>;
    sheetIdByTitle: (t: string) => Promise<number>;
    getSpreadsheet: () => Promise<SpreadsheetInfo>;
    forgetSheetIds: () => void;
  };
  writes: unknown[][];
  reads: string[][];
}

function fake(opts: {
  rows?: Record<string, CellValue[]>; // "Products!A31:Z31" → cells
  colA?: Record<string, number>; // tab → number of data rows in A2:A
  rowCount?: Record<string, number>;
  afterWrite?: (reqs: unknown[]) => void;
  fail?: (reqs: unknown[]) => Error | undefined;
}): Fake {
  const writes: unknown[][] = [];
  const reads: string[][] = [];
  const client: Fake['client'] = {
    batchGet: vi.fn<(ranges: readonly string[]) => Promise<ValueRange[]>>(async (ranges) => {
      reads.push([...ranges]);
      return ranges.map((range): ValueRange => {
        const [tab, a1] = range.split('!') as [string, string];
        if (/^A2:A$/.test(a1)) {
          const n = opts.colA?.[tab] ?? 0;
          return { range, values: Array.from({ length: n }, () => ['x']) };
        }
        const cells = opts.rows?.[range];
        return { range, values: cells ? [cells] : undefined };
      });
    }),
    batchUpdate: vi.fn<(reqs: unknown[]) => Promise<{ replies?: unknown[] }>>(async (reqs) => {
      const err = opts.fail?.(reqs);
      if (err) throw err;
      writes.push(reqs);
      opts.afterWrite?.(reqs);
      return { replies: reqs.map(() => ({})) };
    }),
    sheetIdByTitle: async (t: string) => (IDS as Record<string, number>)[t]!,
    getSpreadsheet: async () => ({
      spreadsheetId: 'dev',
      sheets: Object.entries(IDS).map(([title, sheetId]) => ({
        properties: {
          sheetId,
          title,
          gridProperties: { rowCount: opts.rowCount?.[title] ?? 1000, columnCount: 26 },
        },
      })),
    }),
    forgetSheetIds: () => {},
  };
  return { client, writes, reads };
}

const current = rugRow({ id: 'SL-021' });

describe('cell encoding and rug cells', () => {
  it('cellOrClear sends {} for blanks and literal values otherwise', () => {
    expect(cellOrClear('')).toEqual({});
    expect(cellOrClear(undefined)).toEqual({});
    expect(cellOrClear(null)).toEqual({});
    expect(cellOrClear('=1+1')).toEqual({ userEnteredValue: { stringValue: '=1+1' } });
    expect(cellOrClear(705)).toEqual({ userEnteredValue: { numberValue: 705 } });
    expect(cellOrClear(true)).toEqual({ userEnteredValue: { boolValue: true } });
    expect(cellOrClear(0)).toEqual({ userEnteredValue: { numberValue: 0 } });
  });
  it('productFieldsToCells fills every Products column, with the flags on Tags', () => {
    const cells = productFieldsToCells(fields, 'SL-030');
    expect(cells).toHaveLength(PRODUCT_WIDTH);
    expect(cells[PRODUCT_COLS.productId]).toBe('SL-030');
    expect(cells[PRODUCT_COLS.handle]).toBe('winks');
    expect(cells[PRODUCT_COLS.title]).toBe('Winks');
    expect(cells[PRODUCT_COLS.collection]).toBe('Kilims');
    expect(cells[PRODUCT_COLS.variantPrice]).toBe(705);
    expect(cells[PRODUCT_COLS.widthCm]).toBe(135);
    expect(cells[PRODUCT_COLS.lengthCm]).toBe(190);
    expect(cells[PRODUCT_COLS.status]).toBe('active');
    expect(cells[PRODUCT_COLS.published]).toBe(true);
    expect(cells[PRODUCT_COLS.imageSrc]).toBe('1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb');
    expect(cells[PRODUCT_COLS.variantSku]).toBe(fields.supplierRef);
    expect(cells[PRODUCT_COLS.sourceSite]).toBe(fields.supplier);
    expect(cells[PRODUCT_COLS.internalNotes]).toBe(fields.notes);
    // featured / rotate have no Shopify column: they ride on Tags.
    expect(String(cells[PRODUCT_COLS.tags]).split(', ')).toEqual(['Kilim', 'Denizli', 'featured']);
    const forced = productFieldsToCells({ ...fields, rotate: 'force', featured: false }, 'SL-030');
    expect(String(forced[PRODUCT_COLS.tags]).split(', ')).toContain('rotate-force');
  });

  it('buildInsertRows generalises the vote insert to any tab and row', () => {
    const reqs = buildInsertRows(55, 1, [['a', 1, true, '']]) as Req[];
    expect(reqs[0]!.insertDimension).toEqual({
      range: { sheetId: 55, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
      inheritFromBefore: false,
    });
    expect(reqs[1]!.updateCells!.start).toEqual({ sheetId: 55, rowIndex: 1, columnIndex: 0 });
    expect(reqs[1]!.updateCells!.rows[0]!.values[3]).toEqual({});
  });
});

describe('request builders and the safety walker (ADMIN_SPEC §3.4)', () => {
  const ids = { rugs: RUGS_ID, auditLog: IDS.AuditLog };
  it('an update never touches the Product ID and carries the audit insert', () => {
    const reqs = buildRugUpdateRequests(ids, 31, { all: productFieldsToCells(fields, 'SL-021') }, audit);
    const cols = covered(reqs, RUGS_ID);
    // B..AP: an update writes everything except the Product ID.
    expect(cols).toEqual(Array.from({ length: PRODUCT_WIDTH - 1 }, (_, i) => i + 1));
    expect(cols).not.toContain(0);
    expect((reqs[0] as Req).updateCells!.start.rowIndex).toBe(30);
    const auditReqs = reqs.filter(
      (r) => (r as Req).insertDimension || (r as Req).updateCells?.start.sheetId === IDS.AuditLog,
    );
    expect(auditReqs).toHaveLength(2);
    expect((auditReqs[0] as Req).insertDimension!.range).toMatchObject({
      sheetId: IDS.AuditLog,
      startIndex: 1,
      endIndex: 2,
    });
    expect(reqs.some((r) => (r as Req).appendDimension)).toBe(false);
  });
  it('an insert writes the whole row, appending grid rows only when the target is past the end', () => {
    const cells = {
      all: productFieldsToCells(fields, 'SL-030'),
    };
    const fits = buildRugInsertRequests(ids, 31, 1000, cells, audit);
    expect(covered(fits, RUGS_ID)).toEqual(Array.from({ length: PRODUCT_WIDTH }, (_, i) => i)); // A..AP
    expect(fits.some((r) => (r as Req).appendDimension)).toBe(false);
    const grows = buildRugInsertRequests(ids, 1001, 1000, cells, audit);
    expect((grows[0] as Req).appendDimension).toEqual({
      sheetId: RUGS_ID,
      dimension: 'ROWS',
      length: APPEND_ROWS,
    });
    expect(() => buildRugInsertRequests(ids, 1, 1000, cells, audit)).toThrow(UnsafeRequestError);
    expect(() => buildRugInsertRequests(ids, 31, 1000, { all: cells.all.slice(1) }, audit)).toThrow(
      /product insert needs/,
    );
  });
  it('assertRugRequestsSafe refuses the id column on update, inserts/deletes, and writes past the end', () => {
    const upd = (columnIndex: number, width: number): unknown => ({
      updateCells: {
        start: { sheetId: RUGS_ID, rowIndex: 5, columnIndex },
        rows: [{ values: Array(width).fill({}) }],
        fields: 'userEnteredValue',
      },
    });
    expect(() => assertRugRequestsSafe([upd(1, PRODUCT_WIDTH - 1)], RUGS_ID, 'update')).not.toThrow();
    expect(() => assertRugRequestsSafe([upd(0, 1)], RUGS_ID, 'update')).toThrow(/column A/);
    expect(() => assertRugRequestsSafe([upd(0, PRODUCT_WIDTH)], RUGS_ID, 'insert')).not.toThrow();
    expect(() => assertRugRequestsSafe([upd(1, PRODUCT_WIDTH)], RUGS_ID, 'insert')).toThrow(
      /past the last column/,
    );
    expect(() =>
      assertRugRequestsSafe(
        [{ insertDimension: { range: { sheetId: RUGS_ID, startIndex: 1, endIndex: 2 } } }],
        RUGS_ID,
        'update',
      ),
    ).toThrow(/never insert rows into Products/);
    expect(() => assertRugRequestsSafe([{ deleteDimension: {} }], RUGS_ID, 'update')).toThrow(/never delete/);
    expect(() => assertRugRequestsSafe([{ appendCells: { sheetId: RUGS_ID } }], RUGS_ID, 'insert')).toThrow(
      /never appendCells/,
    );
  });
});

describe('updateRug', () => {
  const version = rugVersion(current);
  const cells = { all: productFieldsToCells(fields, 'SL-021') };

  it('re-reads the row, checks id + version, sends ONE batchUpdate with the audit row, then verifies', async () => {
    const f = fake({ rows: { 'Products!A31:AP31': current } });
    const result = await updateRug(f.client, { row: 31, id: 'SL-021', version, cells, audit });
    expect(result).toEqual({ row: 31, audit: { row: 2, action: 'rug.update' }, verified: true });
    expect(f.writes).toHaveLength(1);
    const reqs = f.writes[0]!;
    expect(reqs.some((r) => (r as Req).updateCells?.start.sheetId === IDS.AuditLog)).toBe(true);
    expect(f.reads).toEqual([['Products!A31:AP31'], ['Products!A31:AP31']]); // check + verify
  });
  it('answers 409 with the fresh row and sends NO batchUpdate on a version mismatch or a moved id', async () => {
    const changed = [...current];
    changed[2] = 'Renamed by hand';
    const f = fake({ rows: { 'Products!A31:AP31': changed } });
    const err = await updateRug(f.client, { row: 31, id: 'SL-021', version, cells, audit }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(VersionMismatchError);
    expect((err as VersionMismatchError).status).toBe(409);
    expect((err as VersionMismatchError).fresh).toEqual(changed);
    expect(f.writes).toHaveLength(0);
    const moved = fake({ rows: { 'Products!A31:AP31': rugRow({ id: 'SL-099' }) } });
    await expect(updateRug(moved.client, { row: 31, id: 'SL-021', version, cells, audit })).rejects.toThrow(
      /expected id/,
    );
    expect(moved.writes).toHaveLength(0);
    // Counts live in the Reactions log now, so every cell of the row is owned by the admin: an
    // unchanged row still commits.
    const ok = fake({ rows: { 'Products!A31:AP31': [...current] } });
    await expect(
      updateRug(ok.client, { row: 31, id: 'SL-021', version, cells, audit }),
    ).resolves.toMatchObject({ row: 31 });
  });
  it('logs a verify-read mismatch and appends a verify-failed audit row (the write has already committed)', async () => {
    const store: Record<string, CellValue[]> = { 'Products!A31:AP31': current };
    const f = fake({
      rows: store,
      afterWrite: () => {
        store['Products!A31:AP31'] = rugRow({ id: 'SOMEONE-ELSE' });
      },
    });
    const errors: string[] = [];
    const logger = { info: () => {}, warn: () => {}, error: (m: string) => void errors.push(m) };
    const result = await updateRug(f.client, { row: 31, id: 'SL-021', version, cells, audit, logger });
    expect(result.verified).toBe(false);
    expect(errors).toContain('rug write verify mismatch');
    expect(f.writes).toHaveLength(2);
    const verifyReqs = f.writes[1] as Req[];
    const values = verifyReqs[1]!.updateCells!.rows[0]!.values as Array<{
      userEnteredValue?: { stringValue?: string };
    }>;
    expect(values[9]?.userEnteredValue?.stringValue).toMatch(/^verify-failed/);
  });
  it('the mutex serialises two writers (the second sees the first commit)', async () => {
    const store: Record<string, CellValue[]> = { 'Products!A31:AP31': current };
    const order: string[] = [];
    const f = fake({
      rows: store,
      afterWrite: (reqs) => {
        order.push('write');
        const name = (
          (reqs[0] as Req).updateCells!.rows[0]!.values[1] as { userEnteredValue: { stringValue: string } }
        ).userEnteredValue.stringValue;
        store['Products!A31:AP31'] = [...rugRow({ id: 'SL-021', name }), '', '', '', ''];
      },
    });
    const first = updateRug(f.client, {
      row: 31,
      id: 'SL-021',
      version,
      cells: { all: productFieldsToCells({ ...fields, name: 'First' }, 'SL-021') },
      audit,
    });
    const second = updateRug(f.client, {
      row: 31,
      id: 'SL-021',
      version,
      cells: { all: productFieldsToCells({ ...fields, name: 'Second' }, 'SL-021') },
      audit,
    });
    await expect(first).resolves.toMatchObject({ verified: true });
    await expect(second).rejects.toBeInstanceOf(VersionMismatchError); // stale version after the first commit
    expect(order).toEqual(['write']);
    expect(f.writes).toHaveLength(1);
  });
});

describe('insertRug', () => {
  const cells = {
    all: productFieldsToCells(fields, 'SL-030') as Cells,
  };
  const created = buildAuditRow({
    ...audit,
    action: 'rug.create',
    targetId: 'SL-030',
    after: { id: 'SL-030' },
  });

  it('computes the target row from A2:A, refuses a non-blank target, and never appends rows when it fits', async () => {
    const f = fake({
      colA: { Products: 29 },
      rows: {
        'Products!A31:AP31': ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      },
      afterWrite: () => {
        f.client.batchGet.mockImplementationOnce(async (r) => [
          { range: r[0]!, values: [['SL-030', 'winks']] },
        ]);
      },
    });
    const result = await insertRug(f.client, { cells, audit: created });
    expect(result).toEqual({ row: 31, audit: { row: 2, action: 'rug.create' }, verified: true });
    expect(f.writes[0]!.some((r) => (r as Req).appendDimension)).toBe(false);

    const busy = fake({ colA: { Products: 29 }, rows: { 'Products!A31:AP31': ['', '', 'stray name'] } });
    await expect(insertRug(busy.client, { cells, audit: created })).rejects.toBeInstanceOf(RowConflictError);
    expect(busy.writes).toHaveLength(0);
    // Q:S spill values ("") on the target row are ignored: first read = blank check (spills), second = verify
    const spill = fake({ colA: { Products: 29 } });
    let targetReads = 0;
    spill.client.batchGet.mockImplementation(async (r) =>
      r.map((range): ValueRange => {
        if (range === 'Products!A2:A') return { range, values: Array(29).fill(['x']) };
        targetReads++;
        return targetReads === 1
          ? { range, values: [['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']] }
          : { range, values: [['SL-030']] };
      }),
    );
    await expect(insertRug(spill.client, { cells, audit: created })).resolves.toMatchObject({
      row: 31,
      verified: true,
    });
  });
  it('adds appendDimension to the SAME batchUpdate when the target is past the grid', async () => {
    const f = fake({ colA: { Products: 999 }, rowCount: { Products: 1000 } });
    f.client.batchGet.mockImplementation(async (r) =>
      r.map((range): ValueRange =>
        range === 'Products!A2:A'
          ? { range, values: Array(999).fill(['x']) }
          : { range, values: [['SL-030']] },
      ),
    );
    const result = await insertRug(f.client, { cells, audit: created });
    expect(result.row).toBe(1001);
    expect(f.writes).toHaveLength(1);
    expect((f.writes[0]![0] as Req).appendDimension).toEqual({
      sheetId: RUGS_ID,
      dimension: 'ROWS',
      length: APPEND_ROWS,
    });
    expect(f.reads.flat()).not.toContain('Products!A1001:Z1001'); // no read past the grid
  });
  it('requires an id in A', async () => {
    const f = fake({});
    await expect(
      insertRug(f.client, { cells: { all: ['', ...cells.all.slice(1)] }, audit: created }),
    ).rejects.toThrow(/Product ID/);
  });
});

describe('row tabs (Collections / Tags / Clients / Settings)', () => {
  const rowCells: CellValue[] = ['kilims', 'Kilims', 'kilims', 'Flat weaves', '', '', 2];
  const version = rowVersion(rowCells, HEADERS.Collections.length);
  const cAudit = buildAuditRow({
    ...audit,
    action: 'collection.update',
    targetTab: 'Collections',
    targetId: 'kilims',
  });

  it('updateRow checks the whole-row version (and the id in A) then writes row + audit atomically', async () => {
    const f = fake({ rows: { 'Collections!A3:G3': rowCells } });
    const res = await updateRow(f.client, {
      tab: 'Collections',
      row: 3,
      version,
      cells: [...rowCells.slice(0, 3), 'Renamed', '', '', 2],
      audit: cAudit,
      expectFirstCell: 'kilims',
    });
    expect(res).toEqual({ row: 3, audit: { row: 2, action: 'collection.update' }, verified: true });
    expect(f.writes).toHaveLength(1);
    expect(covered(f.writes[0]!, IDS.Collections)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    await expect(
      updateRow(f.client, {
        tab: 'Collections',
        row: 3,
        version: 'ffffffffffffffff',
        cells: rowCells,
        audit: cAudit,
      }),
    ).rejects.toBeInstanceOf(VersionMismatchError);
    await expect(
      updateRow(f.client, {
        tab: 'Collections',
        row: 3,
        version,
        cells: rowCells,
        audit: cAudit,
        expectFirstCell: 'tulu',
      }),
    ).rejects.toThrow(/expected "tulu"/);
    await expect(
      updateRow(f.client, { tab: 'Collections', row: 1, version, cells: rowCells, audit: cAudit }),
    ).rejects.toThrow(/header/);
    await expect(
      updateRow(f.client, { tab: 'Tags', row: 3, version, cells: rowCells, audit: cAudit }),
    ).rejects.toThrow(/needs 4 cells/);
    expect(f.writes).toHaveLength(1);
  });
  it('insertRowAtBottom uses the A2:A rule, refuses a busy row and grows the grid when needed', async () => {
    const f = fake({ colA: { Tags: 5 } });
    const res = await insertRowAtBottom(f.client, {
      tab: 'Tags',
      cells: ['kilim', 'kilim', 'Kilim', ''],
      audit: cAudit,
    });
    expect(res.row).toBe(7);
    expect((f.writes[0]![0] as Req).updateCells!.start).toEqual({
      sheetId: IDS.Tags,
      rowIndex: 6,
      columnIndex: 0,
    });
    const busy = fake({ colA: { Tags: 5 }, rows: { 'Tags!A7:D7': ['', 'x'] } });
    await expect(
      insertRowAtBottom(busy.client, { tab: 'Tags', cells: ['a', 'a', 'A', ''], audit: cAudit }),
    ).rejects.toBeInstanceOf(RowConflictError);
    const grow = fake({ colA: { Tags: 999 }, rowCount: { Tags: 1000 } });
    const grown = await insertRowAtBottom(grow.client, {
      tab: 'Tags',
      cells: ['a', 'a', 'A', ''],
      audit: cAudit,
    });
    expect(grown.row).toBe(1001);
    expect((grow.writes[0]![0] as Req).appendDimension).toMatchObject({
      sheetId: IDS.Tags,
      length: APPEND_ROWS,
    });
  });
  it('insertTopRow puts a client at row 2 with the audit row in the same batch', async () => {
    const f = fake({});
    const clientAudit = buildAuditRow({
      ...audit,
      action: 'client.create',
      targetTab: 'Customers',
      targetId: 'nadia-k7m2pq',
    });
    const res = await insertTopRow(f.client, {
      tab: 'Customers',
      cells: ['nadia-k7m2pq', 'Nadia', 'scrypt.1.2.3.aa.bb', 'a note', 'now', true],
      audit: clientAudit,
    });
    expect(res).toEqual({ row: 2, audit: { row: 2, action: 'client.create' }, verified: true });
    const reqs = f.writes[0] as Req[];
    expect(reqs).toHaveLength(4);
    expect(reqs[0]!.insertDimension!.range).toMatchObject({
      sheetId: IDS.Customers,
      startIndex: 1,
      endIndex: 2,
    });
    expect(reqs[2]!.insertDimension!.range).toMatchObject({
      sheetId: IDS.AuditLog,
      startIndex: 1,
      endIndex: 2,
    });
  });
  it('insertTopRow runs the precheck INSIDE the lock, before anything is written', async () => {
    // The caller builds its row from a snapshot read outside the lock. Since customer codes became
    // short scrambles of the buyer's name (owner, 2026-09-13), a code taken in that window is a
    // realistic collision — and two buyers sharing one private link is the failure to avoid.
    const f = fake({});
    const order: string[] = [];
    await insertTopRow(f.client, {
      tab: 'Customers',
      cells: ['a1b-2c', 'Nadia', 'scrypt.1.2.3.aa.bb', '', 'now', true],
      audit: buildAuditRow({ ...audit, action: 'client.create', targetTab: 'Customers', targetId: 'a1b-2c' }),
      precheck: async () => {
        order.push('precheck');
      },
    });
    order.push('written');
    expect(order).toEqual(['precheck', 'written']);
    expect(f.writes).toHaveLength(1);
  });

  it('insertTopRow writes NOTHING when the precheck throws', async () => {
    const f = fake({});
    await expect(
      insertTopRow(f.client, {
        tab: 'Customers',
        cells: ['a1b-2c', 'Nadia', 'scrypt.1.2.3.aa.bb', '', 'now', true],
        audit: buildAuditRow({
          ...audit,
          action: 'client.create',
          targetTab: 'Customers',
          targetId: 'a1b-2c',
        }),
        precheck: async () => {
          throw new Error('code taken');
        },
      }),
    ).rejects.toThrow(/code taken/);
    // Not even the audit row: a create that did not happen must leave no trace claiming it did.
    expect(f.writes).toHaveLength(0);
  });

  it('updateColumnCells rewrites one column for many rows after checking each id', async () => {
    const f = fake({ rows: { 'Collections!A2:A2': ['kilims'], 'Collections!A3:A3': ['tulu'] } });
    const reorder = buildAuditRow({
      ...audit,
      action: 'collection.reorder',
      targetTab: 'Collections',
      targetId: '-',
      after: { order: ['tulu', 'kilims'] },
    });
    await updateColumnCells(f.client, {
      tab: 'Collections',
      columnIndex: 5,
      updates: [
        { row: 2, expectFirstCell: 'kilims', value: 2 },
        { row: 3, expectFirstCell: 'tulu', value: 1 },
      ],
      audit: reorder,
    });
    const reqs = f.writes[0] as Req[];
    expect(reqs[0]!.updateCells!.start).toEqual({ sheetId: IDS.Collections, rowIndex: 1, columnIndex: 5 });
    expect(reqs[1]!.updateCells!.start).toEqual({ sheetId: IDS.Collections, rowIndex: 2, columnIndex: 5 });
    expect(reqs).toHaveLength(4);
    await expect(
      updateColumnCells(f.client, {
        tab: 'Collections',
        columnIndex: 5,
        updates: [{ row: 2, expectFirstCell: 'tulu', value: 1 }],
        audit: reorder,
      }),
    ).rejects.toBeInstanceOf(VersionMismatchError);
    await expect(
      updateColumnCells(f.client, { tab: 'Collections', columnIndex: 0, updates: [], audit: reorder }),
    ).rejects.toThrow(/column out of range/);
  });
  it('appendAudit writes a stand-alone row at AuditLog row 2', async () => {
    const f = fake({});
    const login = buildAuditRow({ ...audit, action: 'auth.login', targetTab: '-', targetId: 'owner' });
    await expect(appendAudit(f.client, login)).resolves.toEqual({ row: 2, action: 'auth.login' });
    const reqs = f.writes[0] as Req[];
    expect(reqs).toHaveLength(2);
    expect(reqs[1]!.updateCells!.rows[0]!.values).toHaveLength(HEADERS.AuditLog.length);
  });
  it('forgets cached sheet ids after a stale-id 400 and rethrows (no silent replay)', async () => {
    const forget = vi.fn();
    const f = fake({
      fail: () =>
        Object.assign(new Error('Invalid requests[0]: No grid with id: 22'), {
          name: 'SheetsApiError',
          status: 400,
        }),
    });
    f.client.forgetSheetIds = forget;
    const login = buildAuditRow({ ...audit, action: 'auth.login', targetTab: '-', targetId: 'owner' });
    await expect(appendAudit(f.client, login)).rejects.toThrow(/No grid/);
    expect(f.writes).toHaveLength(0);
  });
});
