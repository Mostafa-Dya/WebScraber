import { describe, expect, it } from 'vitest';
import {
  ADMIN_READ_RANGES,
  adminCounts,
  adminRugFromCells,
  fetchAdminSnapshot,
  findCollectionByName,
  findRugById,
  findTagByName,
  parseAdminSnapshot,
  rowVersion,
  rugVersion,
} from '../../../src/lib/admin/read.ts';
import type { CellValue, ValueRange } from '../../../src/lib/sheets/client.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';
import { rugRow } from '../../helpers/ranges.ts';

const adminHeader = [...HEADERS.Products];
/** The four pre-brief admin cells are ordinary Products columns now. */
const admin = (over: Record<string, CellValue> = {}, extra: CellValue[] = ['', '', '', '']): CellValue[] => {
  const [source_url = '', supplier = '', supplier_ref = '', notes = ''] = extra;
  return rugRow({ ...over, source_url, supplier, supplier_ref, notes });
};

function ranges(rows: {
  rugs?: CellValue[][];
  collections?: CellValue[][];
  tags?: CellValue[][];
  settings?: CellValue[][];
  clients?: CellValue[][];
  audit?: CellValue[][];
}): ValueRange[] {
  return [
    { range: ADMIN_READ_RANGES[0], values: [adminHeader, ...(rows.rugs ?? [])] },
    { range: ADMIN_READ_RANGES[1], values: [[...HEADERS.Collections], ...(rows.collections ?? [])] },
    { range: ADMIN_READ_RANGES[2], values: [[...HEADERS.Tags], ...(rows.tags ?? [])] },
    { range: ADMIN_READ_RANGES[3], values: [[...HEADERS.Settings], ...(rows.settings ?? [])] },
    { range: ADMIN_READ_RANGES[4], values: [[...HEADERS.Customers], ...(rows.clients ?? [])] },
    { range: ADMIN_READ_RANGES[5], values: [[...HEADERS.AuditLog], ...(rows.audit ?? [])] },
  ];
}

describe('version tokens (ADMIN_SPEC §3.4)', () => {
  it('rugVersion covers every cell of the row (no column is formula-owned any more)', () => {
    const base = admin({ id: 'SL-021' });
    const v = rugVersion(base);
    expect(v).toMatch(/^[a-f0-9]{16}$/);
    // Counts are not columns now, so a vote cannot change the row at all.
    expect(rugVersion(admin({ id: 'SL-021', likes: 99, dislikes: 3 }))).toBe(v);
    expect(rugVersion(admin({ id: 'SL-021', name: 'Other' }))).not.toBe(v);
    expect(rugVersion(admin({ id: 'SL-021' }, ['', '', '', 'note']))).not.toBe(v);
    // trailing blanks omitted by the API hash the same as explicit empty strings
    expect(rugVersion(base.slice(0, 3))).not.toBe(v);
  });
  it('rowVersion covers the whole row up to the tab width', () => {
    const a = rowVersion(['kilims', 'kilims', 'Kilims', '', '', 2], 6);
    expect(rowVersion(['kilims', 'kilims', 'Kilims', '', ''], 6)).not.toBe(a);
    expect(rowVersion(['kilims', 'kilims', 'Kilims', '', '', 2, 'ignored'], 6)).toBe(a);
    expect(rowVersion(['kilims', 'kilims', 'Kilims', '', '', 3], 6)).not.toBe(a);
  });
});

describe('parseAdminSnapshot', () => {
  it('parses the six ranges, keeps sheet row numbers across blank/dropped/id-less rows and reads W:Z', () => {
    const snap = parseAdminSnapshot(
      ranges({
        rugs: [
          admin({ id: 'SL-021' }, ['https://karavanrug.com/products/x', 'KaravanRug', '1389', 'note']),
          [], // blank row 3
          admin({ id: '' }), // id-less row 4 (ignored)
          admin({ id: 'bad', name: '' }), // dropped row 5
          admin({ id: 'SL-022', name: 'Yellow', status: 'draft' }),
          admin({ id: 'SL-023', name: 'Old', status: 'archived' }),
        ],
        collections: [
          ['kilims', 'kilims', 'Kilims', '', '', 2],
          [],
          ['', '', '', '', '', ''],
          ['tulu', 'tulu', 'Tulu', '', '', 1],
        ],
        tags: [['kilim', 'kilim', 'Kilim', '#A32020']],
        settings: [['price_round_step', '50', '', '']],
        clients: [['nadia-k7m2pq', 'Nadia', '', 'active', '', '', '']],
        audit: [['t', 'owner', 'rug.update', 'Products', 'SL-021', '', '', 'h', 'r', '']],
      }),
      { now: () => 123 },
    );
    expect(snap.fetchedAt).toBe(123);
    expect(snap.report.adminHeaders).toBe('ok');
    expect(snap.rugs.map((r) => [r.id, r.row])).toEqual([
      ['SL-021', 2],
      ['SL-022', 6],
      ['SL-023', 7],
    ]);
    expect(snap.rugs[0]).toMatchObject({
      sourceUrl: 'https://karavanrug.com/products/x',
      supplier: 'karavanrug',
      supplierRef: '1389',
      notes: 'note',
      // The admin read has no Reactions range, so counts are zero here by design.
      likes: 0,
    });
    expect(snap.rugs[0]!.version).toMatch(/^[a-f0-9]{16}$/);
    expect(snap.report.dropped).toEqual([{ tab: 'Products', row: 5, issues: expect.any(Array) }]);
    expect(snap.collections.map((c) => [c.slug, c.row])).toEqual([
      ['kilims', 2],
      ['tulu', 5],
    ]);
    expect(snap.tags[0]).toMatchObject({ slug: 'kilim', row: 2, color: '#A32020' });
    expect(snap.settings.priceRoundStep).toBe(50);
    expect(snap.clients[0]).toMatchObject({ code: 'nadia-k7m2pq', row: 2 });
    expect(snap.clients[0]!.version).toMatch(/^[a-f0-9]{16}$/);
    expect(snap.audit[0]).toMatchObject({ row: 2, action: 'rug.update' });
    expect(adminCounts(snap)).toEqual({
      rugs: { active: 1, draft: 1, archived: 1, total: 3 },
      collections: 2,
      tags: 1,
      clients: { active: 1, revoked: 0 },
    });
    expect(findRugById(snap, 'sl-022')?.name).toBe('Yellow');
    expect(findCollectionByName(snap, 'KILIMS')?.slug).toBe('kilims');
    expect(findTagByName(snap, 'kilim')?.id).toBe('kilim');
    expect(findRugById(snap, 'nope')).toBeUndefined();
  });
  it('reports the header state and throws on a broken one', () => {
    const r = ranges({ rugs: [rugRow({ id: 'SL-021' })] });
    r[0] = { range: ADMIN_READ_RANGES[0], values: [[...HEADERS.Products], rugRow({ id: 'SL-021' })] };
    const snap = parseAdminSnapshot(r);
    expect(snap.report.adminHeaders).toBe('ok');
    expect(snap.rugs).toHaveLength(1);
    const broken = ranges({});
    broken[0] = { range: ADMIN_READ_RANGES[0], values: [['id', 'title']] };
    expect(() => parseAdminSnapshot(broken)).toThrow(/Products/);
  });
  it('adminRugFromCells parses one A:AP row (undefined when invalid)', () => {
    const rug = adminRugFromCells(
      admin({ id: 'SL-030', name: 'New' }, ['', 'ecarpetgallery', '412224', '']),
      31,
    );
    expect(rug).toMatchObject({ id: 'SL-030', row: 31, supplier: 'ecarpetgallery', supplierRef: '412224' });
    expect(adminRugFromCells(admin({ id: 'SL-030', name: '' }), 31)).toBeUndefined();
  });
  it('fetchAdminSnapshot issues exactly one batchGet with the six ranges', async () => {
    const calls: unknown[] = [];
    const client = {
      batchGet: async (r: readonly string[]) => {
        calls.push(r);
        return ranges({});
      },
    };
    const snap = await fetchAdminSnapshot(client);
    expect(calls).toEqual([ADMIN_READ_RANGES]);
    expect(ADMIN_READ_RANGES[5]).toBe('AuditLog!A1:J101');
    expect(snap.rugs).toEqual([]);
  });
});
