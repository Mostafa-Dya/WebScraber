// Integration of client → read → parse → cache → write with a mocked Sheets API (no network).
import { describe, expect, it, vi } from 'vitest';
import { CatalogueCache } from '../../src/lib/sheets/cache.ts';
import { SheetsClient, type TokenSource } from '../../src/lib/sheets/client.ts';
import { READ_RANGES } from '../../src/lib/sheets/contract.ts';
import { silentLogger } from '../../src/lib/sheets/errors.ts';
import { fetchRanges, snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import { insertReactionRows } from '../../src/lib/sheets/write.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

const tokens: TokenSource = { getAccessToken: async () => 't' };
const auth = { mode: 'service_account' as const, email: 'x@y', privateKey: 'k' };

function fakeSheets(): { fetchImpl: typeof fetch; writes: unknown[][]; batchGetUrls: string[] } {
  const writes: unknown[][] = [];
  const batchGetUrls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('values:batchGet')) {
      batchGetUrls.push(url);
      const ranges = rangesWith({
        rugs: [
          rugRow({ id: 'SL-021', likes: 2, dislikes: 1 }),
          rugRow({ id: 'SL-022', name: 'Yellow' }),
          rugRow({ id: 1389, name: 'Door', collection: 'Tulu' }),
        ],
        rates: [
          ['USD', 1, '$', ''],
          ['AED', 3.67, 'AED ', ''],
        ],
        votes: [['e-1', 'visitor-a', 'SL-021', 'like', 'card', 't']],
      });
      return new Response(JSON.stringify({ valueRanges: ranges }), { status: 200 });
    }
    if (url.endsWith('?fields=sheets.properties')) {
      return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 99, title: 'Reactions' } }] }), {
        status: 200,
      });
    }
    if (url.endsWith(':batchUpdate')) {
      writes.push((JSON.parse(String(init?.body)) as { requests: unknown[] }).requests);
      return new Response(JSON.stringify({ replies: [{}, {}] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
  }) as unknown as typeof fetch;
  return { fetchImpl, writes, batchGetUrls };
}

describe('snapshot round-trip against a mocked Sheets API', () => {
  it('reads all tabs in one request, parses, caches and applies a vote without busting', async () => {
    const { fetchImpl, writes, batchGetUrls } = fakeSheets();
    const client = new SheetsClient(
      { spreadsheetId: 'dev', auth, fetchImpl, logger: silentLogger, sleep: async () => {} },
      tokens,
    );
    const cache = new CatalogueCache({
      load: () => fetchRanges(client),
      parse: (r) => snapshotFromRanges(r),
      ttlMs: 60_000,
      logger: silentLogger,
    });

    const snap = await cache.get();
    expect(batchGetUrls).toHaveLength(1);
    expect([...new URL(batchGetUrls[0]!).searchParams.getAll('ranges')]).toEqual([...READ_RANGES]);
    expect(snap.catalogue.rugs.map((r) => r.id)).toEqual(['SL-021', 'SL-022', '1389']);
    expect(snap.catalogue.rates.find((r) => r.currency === 'AED')?.symbol).toBe('AED ');
    expect(cache.currentVote('visitor-a', 'SL-021')).toBe('like');
    expect(snap.report.votesRowsRead).toBeGreaterThanOrEqual(1);

    // A second visitor likes SL-021: one atomic batchUpdate, then the in-memory delta (no bust).
    await insertReactionRows(client, [
      {
        eventId: 'e-2',
        customerSlug: 'visitor-c',
        productId: 'SL-021',
        reaction: 'like',
        source: 'card',
        createdAt: 't2',
      },
    ]);
    const before = cache.peek()!.catalogue.rugs[0]!.likes;
    const updated = cache.applyVote('SL-021', 'visitor-c', 'none', 'like')?.rug;
    expect(updated?.likes).toBe(before + 1);
    expect(cache.currentVote('visitor-c', 'SL-021')).toBe('like');
    expect(writes).toHaveLength(1);
    expect(
      (writes[0]?.[0] as { insertDimension: { range: { sheetId: number } } }).insertDimension.range.sheetId,
    ).toBe(99);
    expect(batchGetUrls).toHaveLength(1);

    // Numeric-looking ids key the vote state as strings.
    cache.applyVote('1389', 'visitor-b', 'none', 'dislike');
    expect(cache.currentVote('visitor-b', '1389')).toBe('dislike');
  });
});
