// The access log (src/lib/admin/visits.ts): who has opened their private link and when.
import { describe, expect, it } from 'vitest';
import type { CellValue } from '../../../src/lib/sheets/client.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';
import {
  RECENT_LIMIT,
  VISITS_READ_RANGE,
  buildVisitsReport,
  parseVisits,
  type KnownClient,
} from '../../../src/lib/admin/visits.ts';

const header = [...HEADERS.Visits];
let seq = 0;
/** One Visits row, in the order the tab stores them: newest first. */
const row = (slug: string, at: string, ua = 'Safari/iOS', ref = ''): CellValue[] => [
  `e${++seq}`,
  slug,
  at,
  ua,
  ref,
];

const CLIENTS: KnownClient[] = [
  { code: 'hala-ab12cd', name: 'Hala', status: 'active' },
  { code: 'omar-ef34gh', name: 'Omar', status: 'revoked' },
  { code: 'never-xy56z', name: 'Never Opened', status: 'active' },
];

const at = () => 1_800_000_000_000;

describe('parseVisits', () => {
  it('reads the rows and drops the ones with a malformed slug', () => {
    const { entries, dropped } = parseVisits([
      header,
      row('hala-ab12cd', '2026-09-08T17:30:00Z', 'Safari/iOS', 'https://wa.me/x'),
      row('bad slug!', '2026-09-08T17:00:00Z'),
      [],
      row('omar-ef34gh', '2026-09-01T09:00:00Z', 'Chrome/Windows'),
    ]);
    expect(dropped).toBe(1);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      customerSlug: 'hala-ab12cd',
      occurredAt: '2026-09-08T17:30:00Z',
      userAgent: 'Safari/iOS',
      referrer: 'https://wa.me/x',
    });
  });

  it('treats an unparseable timestamp as unknown rather than sorting on nonsense', () => {
    const { entries } = parseVisits([header, row('hala-ab12cd', 'last tuesday')]);
    expect(entries[0]?.occurredAt).toBe('');
  });

  it('validates the header and bounds the read', () => {
    expect(VISITS_READ_RANGE).toBe('Visits!A1:E200001');
    expect(() => parseVisits([['nope', 'wrong', 'header', 'x', 'y']])).toThrow(/Visits/);
  });
});

describe('buildVisitsReport', () => {
  it('counts visits per buyer and reports when they were last in', () => {
    const report = buildVisitsReport(
      [
        header,
        row('hala-ab12cd', '2026-09-08T17:30:00Z', 'Safari/iOS'),
        row('hala-ab12cd', '2026-09-05T11:00:00Z', 'Chrome/macOS'),
        row('hala-ab12cd', '2026-09-01T09:00:00Z', 'Safari/iOS'),
        row('omar-ef34gh', '2026-09-02T08:00:00Z', 'Chrome/Windows'),
      ],
      CLIENTS,
      at,
    );
    const hala = report.byClient.find((c) => c.code === 'hala-ab12cd')!;
    expect(hala).toMatchObject({ name: 'Hala', known: true, status: 'active', visits: 3 });
    expect(hala.lastSeen).toBe('2026-09-08T17:30:00Z');
    expect(hala.firstSeen).toBe('2026-09-01T09:00:00Z');
    // Each distinct device once, in the order they were last used.
    expect(hala.devices).toEqual(['Safari/iOS', 'Chrome/macOS']);
    // Most recently seen first — the row the owner looks at.
    expect(report.byClient.map((c) => c.code)[0]).toBe('hala-ab12cd');
    expect(report.rowsRead).toBe(4);
  });

  it('lists a buyer who has a link but has never opened it', () => {
    const report = buildVisitsReport([header], CLIENTS, at);
    const never = report.byClient.find((c) => c.code === 'never-xy56z')!;
    expect(never).toMatchObject({ visits: 0, lastSeen: '', firstSeen: '', known: true });
    // That is the interesting row, so it must be present even with an empty log.
    expect(report.byClient).toHaveLength(3);
    expect(report.recent).toEqual([]);
  });

  it('keeps a visit whose customer row has since been deleted, and marks it', () => {
    const report = buildVisitsReport([header, row('ghost-zz99zz', '2026-09-07T12:00:00Z')], CLIENTS, at);
    const ghost = report.byClient.find((c) => c.code === 'ghost-zz99zz')!;
    expect(ghost).toMatchObject({ known: false, name: 'ghost-zz99zz', visits: 1 });
    expect(ghost.status).toBeUndefined();
    expect(report.recent[0]).toMatchObject({ known: false, name: 'ghost-zz99zz' });
  });

  it('caps the access log and keeps the newest entries', () => {
    const rows = Array.from({ length: RECENT_LIMIT + 10 }, (_, i) =>
      row('hala-ab12cd', `2026-09-${String(28 - i).padStart(2, '0')}T10:00:00Z`),
    );
    const report = buildVisitsReport([header, ...rows], CLIENTS, at);
    expect(report.recent).toHaveLength(RECENT_LIMIT);
    expect(report.recent[0]?.occurredAt).toBe('2026-09-28T10:00:00Z');
    // Capping the display does not change the count.
    expect(report.byClient.find((c) => c.code === 'hala-ab12cd')?.visits).toBe(RECENT_LIMIT + 10);
  });

  it('survives a hand-sorted sheet, where newest-first is not guaranteed', () => {
    const report = buildVisitsReport(
      [
        header,
        row('hala-ab12cd', '2026-09-01T09:00:00Z'),
        row('hala-ab12cd', '2026-09-09T09:00:00Z'),
        row('hala-ab12cd', '2026-09-05T09:00:00Z'),
      ],
      CLIENTS,
      at,
    );
    const hala = report.byClient.find((c) => c.code === 'hala-ab12cd')!;
    expect(hala.lastSeen).toBe('2026-09-09T09:00:00Z');
    expect(hala.firstSeen).toBe('2026-09-01T09:00:00Z');
  });
});
