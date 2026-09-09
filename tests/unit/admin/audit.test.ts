import { describe, expect, it } from 'vitest';
import {
  AUDIT_JSON_MAX,
  UnauditableError,
  auditRowToCells,
  buildAuditRow,
  diffFields,
  parseAuditRows,
} from '../../../src/lib/admin/audit.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';

const base = { actor: 'owner', ipHash: 'a'.repeat(32), requestId: 'b'.repeat(16) };

describe('buildAuditRow (ADMIN_SPEC §3.2)', () => {
  it('produces the ten cells in header order with ISO timestamps and JSON diffs', () => {
    const row = buildAuditRow({
      ...base,
      action: 'rug.update',
      targetTab: 'Products',
      targetId: 'SL-030',
      before: { priceUsd: 700 },
      after: { priceUsd: 705 },
      note: 'row 31',
      timestamp: '2026-09-07T10:00:00.000Z',
    });
    expect(row).toEqual({
      timestamp: '2026-09-07T10:00:00.000Z',
      actor: 'owner',
      action: 'rug.update',
      targetTab: 'Products',
      targetId: 'SL-030',
      before: '{"priceUsd":700}',
      after: '{"priceUsd":705}',
      ipHash: 'a'.repeat(32),
      requestId: 'b'.repeat(16),
      note: 'row 31',
    });
    const cells = auditRowToCells(row);
    expect(cells).toHaveLength(HEADERS.AuditLog.length);
    expect(cells[2]).toBe('rug.update');
    expect(cells[9]).toBe('row 31');
    const auto = buildAuditRow({ ...base, action: 'auth.login', targetTab: '-', targetId: 'owner' });
    expect(auto.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(auto.before).toBe('');
    expect(auto.after).toBe('');
  });
  it('never accepts a raw IP or a non-hex request id', () => {
    expect(() =>
      buildAuditRow({ ...base, ipHash: '203.0.113.7', action: 'auth.login', targetTab: '-', targetId: 'x' }),
    ).toThrow(UnauditableError);
    expect(() =>
      buildAuditRow({ ...base, ipHash: '2001:db8::1', action: 'auth.login', targetTab: '-', targetId: 'x' }),
    ).toThrow(/never an address/);
    expect(() =>
      buildAuditRow({ ...base, requestId: 'req-1', action: 'auth.login', targetTab: '-', targetId: 'x' }),
    ).toThrow(UnauditableError);
    expect(() =>
      buildAuditRow({ ...base, action: 'rug.delete' as never, targetTab: 'Products', targetId: 'x' }),
    ).toThrow(/unknown audit action/);
  });
  it('refuses a mutation whose diff would be truncated, but truncates informational events', () => {
    const huge = { description: 'x'.repeat(AUDIT_JSON_MAX + 10) };
    expect(() =>
      buildAuditRow({
        ...base,
        action: 'rug.update',
        targetTab: 'Products',
        targetId: 'SL-030',
        after: huge,
      }),
    ).toThrow(UnauditableError);
    const info = buildAuditRow({
      ...base,
      action: 'scrape.fetch',
      targetTab: '-',
      targetId: 'url',
      after: huge,
    });
    expect(info.after).toHaveLength(AUDIT_JSON_MAX);
    expect(info.after.endsWith('…[truncated]')).toBe(true);
    const fits = buildAuditRow({
      ...base,
      action: 'rug.update',
      targetTab: 'Products',
      targetId: 'SL-030',
      after: { description: 'x'.repeat(AUDIT_JSON_MAX - 20) },
    });
    expect(fits.after.length).toBeLessThanOrEqual(AUDIT_JSON_MAX);
  });
  it('serialises with sorted keys so equal objects hash equal and the note is capped', () => {
    const a = buildAuditRow({
      ...base,
      action: 'rug.status',
      targetTab: 'Products',
      targetId: 'x',
      after: { b: 1, a: 2 },
    });
    const b = buildAuditRow({
      ...base,
      action: 'rug.status',
      targetTab: 'Products',
      targetId: 'x',
      after: { a: 2, b: 1 },
    });
    expect(a.after).toBe(b.after);
    expect(a.after).toBe('{"a":2,"b":1}');
    const long = buildAuditRow({
      ...base,
      action: 'auth.lockout',
      targetTab: '-',
      targetId: 'ip',
      note: 'n'.repeat(900),
    });
    expect(long.note).toHaveLength(500);
  });
});

describe('diffFields', () => {
  it('keeps changed keys only, on both sides, and reports the key list', () => {
    const before = { name: 'A', price: 700, tags: ['x'], notes: '' };
    const after = { name: 'A', price: 705, tags: ['x'], notes: 'hi' };
    const d = diffFields(before, after);
    expect(d.changed).toEqual(['notes', 'price']);
    expect(d.before).toEqual({ price: 700, notes: '' });
    expect(d.after).toEqual({ price: 705, notes: 'hi' });
    expect(diffFields({ a: 1 }, { a: 1 }).changed).toEqual([]);
    expect(diffFields({ a: undefined } as Record<string, unknown>, { a: 1 })).toMatchObject({
      before: {},
      after: { a: 1 },
    });
  });
});

describe('parseAuditRows', () => {
  it('validates the header and maps rows newest-first with their sheet row numbers', () => {
    const rows = parseAuditRows([
      [...HEADERS.AuditLog],
      ['t2', 'owner', 'rug.update', 'Products', 'SL-030', '{}', '{"a":1}', 'h', 'r', 'note'],
      [],
      ['t1', 'owner', 'auth.login', '-', 'owner', '', '', 'h', 'r', ''],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      row: 2,
      action: 'rug.update',
      targetId: 'SL-030',
      after: '{"a":1}',
      note: 'note',
    });
    expect(rows[1]).toMatchObject({ row: 4, action: 'auth.login' });
    expect(() => parseAuditRows([['when', 'who']])).toThrow(/Sheet contract violated in tab "AuditLog"/);
    expect(parseAuditRows([[...HEADERS.AuditLog]])).toEqual([]);
  });
});
