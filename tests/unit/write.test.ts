import { describe, expect, it, vi } from 'vitest';
import { SheetsClient, type TokenSource } from '../../src/lib/sheets/client.ts';
import { silentLogger } from '../../src/lib/sheets/errors.ts';
import { buildInsertRequests, insertReactionRows } from '../../src/lib/sheets/write.ts';

const tokens: TokenSource = { getAccessToken: async () => 't' };
const auth = { mode: 'service_account' as const, email: 'x@y', privateKey: 'k' };
const row = {
  eventId: 'e1',
  customerSlug: 'hala',
  productId: 'SL-021',
  reaction: 'like' as const,
  source: 'card' as const,
  createdAt: '2026-09-08T00:00:00.000Z',
};

describe('buildInsertRequests', () => {
  it('inserts at row 2 and writes literal string cells (formula-injection safe)', () => {
    const reqs = buildInsertRequests(7, [
      row,
      { ...row, productId: '=1+1', reaction: 'dislike' as const, source: 'detail' as const },
    ]) as Array<Record<string, unknown>>;
    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toEqual({
      insertDimension: {
        range: { sheetId: 7, dimension: 'ROWS', startIndex: 1, endIndex: 3 },
        inheritFromBefore: false,
      },
    });
    const update = reqs[1]?.updateCells as {
      start: unknown;
      rows: Array<{ values: Array<{ userEnteredValue: unknown }> }>;
      fields: string;
    };
    expect(update.start).toEqual({ sheetId: 7, rowIndex: 1, columnIndex: 0 });
    expect(update.fields).toBe('userEnteredValue');
    expect(update.rows[0]?.values[2]?.userEnteredValue).toEqual({ stringValue: 'SL-021' });
    expect(update.rows[1]?.values[2]?.userEnteredValue).toEqual({ stringValue: '=1+1' });
    expect(update.rows[0]?.values).toHaveLength(6);
  });
});

function client(fetchImpl: typeof fetch): SheetsClient {
  return new SheetsClient(
    { spreadsheetId: 'dev', auth, fetchImpl, logger: silentLogger, sleep: async () => {} },
    tokens,
  );
}

describe('insertReactionRows', () => {
  it('re-resolves the Votes sheetId once after a stale-id 400, then succeeds', async () => {
    let ids = 0;
    let updates = 0;
    const bodies: number[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('fields=sheets.properties')) {
        ids++;
        return new Response(
          JSON.stringify({ sheets: [{ properties: { sheetId: ids === 1 ? 99 : 123, title: 'Reactions' } }] }),
          { status: 200 },
        );
      }
      updates++;
      const body = JSON.parse(String(init?.body)) as {
        requests: Array<{ insertDimension?: { range: { sheetId: number } } }>;
      };
      bodies.push(body.requests[0]!.insertDimension!.range.sheetId);
      if (updates === 1) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Invalid requests[0].insertDimension: No grid with id: 99',
              status: 'INVALID_ARGUMENT',
            },
          }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ replies: [{}, {}] }), { status: 200 });
    }) as unknown as typeof fetch;
    await insertReactionRows(client(fetchImpl), [row]);
    expect(ids).toBe(2);
    expect(bodies).toEqual([99, 123]);
  });

  it('does not replay after other 400s or after a network error', async () => {
    let updates = 0;
    const bad400 = (async (input: string | URL | Request) => {
      if (String(input).includes('fields=sheets.properties'))
        return new Response(
          JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'Reactions' } }] }),
          {
            status: 200,
          },
        );
      updates++;
      return new Response(
        JSON.stringify({ error: { message: 'Unable to parse range', status: 'INVALID_ARGUMENT' } }),
        { status: 400 },
      );
    }) as unknown as typeof fetch;
    await expect(insertReactionRows(client(bad400), [row])).rejects.toMatchObject({ status: 400 });
    expect(updates).toBe(1);

    let netCalls = 0;
    const network = (async (input: string | URL | Request) => {
      if (String(input).includes('fields=sheets.properties'))
        return new Response(
          JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'Reactions' } }] }),
          {
            status: 200,
          },
        );
      netCalls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(insertReactionRows(client(network), [row])).rejects.toThrow('fetch failed');
    expect(netCalls).toBe(1);
  });

  it('is a no-op for an empty batch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await insertReactionRows(client(fetchImpl), []);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
