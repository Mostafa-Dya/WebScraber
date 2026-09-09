// An in-memory spreadsheet behind the SheetsClient surface the admin endpoints use: `batchGet`
// slices A1 ranges the way the API answers (trailing blanks omitted), `batchUpdate` applies
// updateCells / insertDimension / appendDimension in order, so a handler's read-back after its
// write sees what it wrote. Every call is recorded for assertions.
import type { CellValue, SpreadsheetInfo, ValueRange } from '../../../src/lib/sheets/client.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';
import { rugRow } from '../../helpers/ranges.ts';

export const SHEET_IDS: Record<string, number> = {
  Products: 11,
  Collections: 33,
  Tags: 44,
  Rates: 55,
  Reactions: 66,
  ReactionsArchive: 77,
  Customers: 88,
  AuditLog: 99,
  Settings: 100,
  Visits: 101,
};

export const ADMIN_RUGS_HEADER: CellValue[] = [...HEADERS.Products];

/**
 * A Products row. The pre-brief signature took four trailing admin cells (source_url, supplier,
 * supplier_ref, notes); those are ordinary Products columns now, so they are merged into the row.
 */
export function adminRugRow(
  over: Record<string, CellValue> = {},
  admin: [CellValue, CellValue, CellValue, CellValue] = ['', '', '', ''],
): CellValue[] {
  const [source_url, supplier, supplier_ref, notes] = admin;
  return rugRow({ ...over, source_url, supplier, supplier_ref, notes });
}

export interface FakeTabs {
  rugs?: CellValue[][];
  collections?: CellValue[][];
  tags?: CellValue[][];
  settings?: CellValue[][];
  clients?: CellValue[][];
  audit?: CellValue[][];
  votes?: CellValue[][];
  rates?: CellValue[][];
  /** ReactionsArchive rows. Defaults to a blank tab (no header), as a sheet that was never compacted. */
  archive?: CellValue[][];
  /** Header row of Products; pass [] to simulate a tab the owner has not initialised. */
  rugsHeader?: CellValue[];
}

export interface FakeSheet {
  tabs: Map<string, CellValue[][]>;
  rowCount: Map<string, number>;
  reads: string[][];
  writes: unknown[][];
  /** Throw from the next batchUpdate (once). */
  failNextWrite?: Error;
  client: {
    batchGet(ranges: readonly string[]): Promise<ValueRange[]>;
    batchUpdate(requests: unknown[]): Promise<{ replies?: unknown[] }>;
    sheetIdByTitle(title: string): Promise<number>;
    getSpreadsheet(): Promise<SpreadsheetInfo>;
    forgetSheetIds(): void;
    /** Values API (src/lib/sheets/compact.ts): writes cells in place at the range's top-left. */
    valuesUpdate(
      range: string,
      values: CellValue[][],
      valueInputOption: 'RAW' | 'USER_ENTERED',
    ): Promise<void>;
    /** Values API: appends below the last row of the range's tab that holds anything. */
    valuesAppend(
      range: string,
      values: CellValue[][],
      insertDataOption: 'INSERT_ROWS' | 'OVERWRITE',
    ): Promise<{ updates?: { updatedRange?: string } }>;
  };
  /** Row `n` (1-based) of a tab as stored. */
  row(tab: string, n: number): CellValue[];
  /** Data rows of a tab (without the header). */
  rows(tab: string): CellValue[][];
  /** The audit rows (newest first). */
  auditRows(): CellValue[][];
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface Parsed {
  tab: string;
  r1: number;
  c1: number;
  r2: number | undefined;
  c2: number | undefined;
}

function parseRange(range: string): Parsed {
  const m = /^([A-Za-z]+)!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(range);
  if (!m) throw new Error(`fake-sheets: unsupported range ${range}`);
  const [, tab, ca, ra, cb, rb] = m;
  return {
    tab: tab!,
    c1: colIndex(ca!),
    r1: ra ? Number(ra) - 1 : 0,
    c2: cb ? colIndex(cb) : colIndex(ca!),
    r2: rb ? Number(rb) - 1 : cb ? undefined : ra ? Number(ra) - 1 : undefined,
  };
}

const isBlank = (v: CellValue | undefined): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v === '');

function decode(cell: unknown): CellValue {
  const c = cell as {
    userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean };
  };
  const u = c?.userEnteredValue;
  if (!u) return '';
  if (u.stringValue !== undefined) return u.stringValue;
  if (u.numberValue !== undefined) return u.numberValue;
  if (u.boolValue !== undefined) return u.boolValue;
  return '';
}

/** Writes `values` into `grid` with its top-left cell at (row, col), growing rows and columns. */
function putAt(grid: CellValue[][], row: number, col: number, values: CellValue[][]): void {
  values.forEach((cells, i) => {
    const r = row + i;
    while (grid.length <= r) grid.push([]);
    const target = grid[r]!;
    cells.forEach((v, j) => {
      const c = col + j;
      while (target.length <= c) target.push('');
      target[c] = v;
    });
  });
}

export function fakeSheet(init: FakeTabs = {}): FakeSheet {
  const tabs = new Map<string, CellValue[][]>([
    ['Products', [init.rugsHeader ?? [...ADMIN_RUGS_HEADER], ...(init.rugs ?? [])]],
    ['Collections', [[...HEADERS.Collections], ...(init.collections ?? [])]],
    ['Tags', [[...HEADERS.Tags], ...(init.tags ?? [])]],
    ['Settings', [[...HEADERS.Settings], ...(init.settings ?? [['price_round_step', '5', '', '']])]],
    ['Customers', [[...HEADERS.Customers], ...(init.clients ?? [])]],
    ['AuditLog', [[...HEADERS.AuditLog], ...(init.audit ?? [])]],
    ['Reactions', [[...HEADERS.Reactions], ...(init.votes ?? [])]],
    ['ReactionsArchive', init.archive ?? [[]]],
    ['Rates', [[...HEADERS.Rates], ...(init.rates ?? [['USD', 1, '$', '']])]],
  ]);
  const rowCount = new Map<string, number>([...tabs.keys()].map((t) => [t, 1000]));
  const reads: string[][] = [];
  const writes: unknown[][] = [];

  const titleOf = (sheetId: number): string => {
    const hit = Object.entries(SHEET_IDS).find(([, id]) => id === sheetId);
    if (!hit) throw new Error(`fake-sheets: unknown sheetId ${sheetId}`);
    return hit[0];
  };
  const grid = (tab: string): CellValue[][] => {
    const g = tabs.get(tab);
    if (!g) throw new Error(`fake-sheets: unknown tab ${tab}`);
    return g;
  };

  const sheet: FakeSheet = {
    tabs,
    rowCount,
    reads,
    writes,
    client: {
      async batchGet(ranges) {
        reads.push([...ranges]);
        return ranges.map((range): ValueRange => {
          const p = parseRange(range);
          const g = grid(p.tab);
          const last = p.r2 ?? g.length - 1;
          const values: CellValue[][] = [];
          for (let r = p.r1; r <= last; r++) {
            const row = g[r] ?? [];
            const cells = row.slice(p.c1, (p.c2 ?? p.c1) + 1).map((v) => (v === undefined ? '' : v));
            while (cells.length && isBlank(cells[cells.length - 1])) cells.pop();
            values.push(cells);
          }
          while (values.length && values[values.length - 1]!.length === 0) values.pop();
          return values.length ? { range, values } : { range };
        });
      },
      async batchUpdate(requests) {
        if (sheet.failNextWrite) {
          const e = sheet.failNextWrite;
          sheet.failNextWrite = undefined;
          throw e;
        }
        writes.push(requests);
        for (const raw of requests) {
          const req = raw as Record<string, unknown>;
          if (req.appendDimension) {
            const a = req.appendDimension as { sheetId: number; length: number };
            const t = titleOf(a.sheetId);
            rowCount.set(t, (rowCount.get(t) ?? 0) + a.length);
          } else if (req.insertDimension) {
            const ins = req.insertDimension as {
              range: { sheetId: number; startIndex: number; endIndex: number };
            };
            const t = titleOf(ins.range.sheetId);
            const g = grid(t);
            const n = ins.range.endIndex - ins.range.startIndex;
            g.splice(ins.range.startIndex, 0, ...Array.from({ length: n }, () => [] as CellValue[]));
            rowCount.set(t, (rowCount.get(t) ?? 0) + n);
          } else if (req.updateCells) {
            const u = req.updateCells as {
              start: { sheetId: number; rowIndex: number; columnIndex: number };
              rows: Array<{ values: unknown[] }>;
            };
            const t = titleOf(u.start.sheetId);
            const g = grid(t);
            u.rows.forEach((r, i) => {
              const rowIdx = u.start.rowIndex + i;
              while (g.length <= rowIdx) g.push([]);
              const row = g[rowIdx]!;
              r.values.forEach((cell, j) => {
                const c = u.start.columnIndex + j;
                while (row.length <= c) row.push('');
                row[c] = decode(cell);
              });
            });
          } else {
            throw new Error(`fake-sheets: unsupported request ${Object.keys(req).join(',')}`);
          }
        }
        return { replies: requests.map(() => ({})) };
      },
      async sheetIdByTitle(title) {
        const id = SHEET_IDS[title];
        if (id === undefined) throw new Error(`fake-sheets: no sheetId for ${title}`);
        return id;
      },
      async getSpreadsheet() {
        return {
          spreadsheetId: 'fake',
          sheets: [...tabs.keys()].map((title) => ({
            properties: {
              sheetId: SHEET_IDS[title]!,
              title,
              gridProperties: { rowCount: rowCount.get(title) ?? 1000, columnCount: 26 },
            },
          })),
        };
      },
      forgetSheetIds() {},
      async valuesUpdate(range, values) {
        writes.push([{ valuesUpdate: { range, values } }]);
        const p = parseRange(range);
        putAt(grid(p.tab), p.r1, p.c1, values);
      },
      async valuesAppend(range, values) {
        writes.push([{ valuesAppend: { range, values } }]);
        const p = parseRange(range);
        const g = grid(p.tab);
        let last = g.length;
        while (last > 0 && (g[last - 1] ?? []).every(isBlank)) last--;
        putAt(g, last, p.c1, values);
        return { updates: { updatedRange: `${p.tab}!A${last + 1}` } };
      },
    },
    row: (tab, n) => grid(tab)[n - 1] ?? [],
    rows: (tab) => grid(tab).slice(1),
    auditRows: () => grid('AuditLog').slice(1),
  };
  return sheet;
}

/** Everything astro:env/server must export for the modules the endpoints import (no real secrets). */
export const ENV_MOCK = {
  SITE_URL: 'https://catalogue.example.test',
  VOTE_SALT: 'v'.repeat(40),
  REVALIDATE_SECRET: 'r'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  ADMIN_PASSWORD_HASH: 'scrypt.4096.8.1.' + 'a'.repeat(22) + '.' + 'b'.repeat(86),
  ADMIN_SESSION_SECRET: 's'.repeat(40),
  ADMIN_USER: 'owner',
  RETAIL_MARKUP: undefined as number | undefined,
  GOOGLE_SHEET_ID: 'dev',
  GOOGLE_AUTH_MODE: 'service_account',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined,
  GOOGLE_PRIVATE_KEY: undefined,
  GOOGLE_OAUTH_CLIENT_ID: undefined,
  GOOGLE_OAUTH_CLIENT_SECRET: undefined,
  GOOGLE_OAUTH_REFRESH_TOKEN: undefined,
  GOOGLE_DRIVE_FOLDER_ID: undefined,
  SCRAPE_JINA_FALLBACK: true,
  SCRAPE_ECG_GRAPHQL: false,
  SCRAPE_RESPECT_ROBOTS: true,
  SHEETS_CACHE_TTL: 60,
  DATA_DIR: undefined,
  // Customer realm + FX (brief §8, §10). The realm is off here: these suites are admin-only.
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
};

/** A CatalogueCache stand-in for invalidateAfterWrite / the health strip. */
export function fakeCache(): {
  busts: number;
  bust(): Promise<undefined>;
  health(): { lastRefreshOk: boolean; snapshotAgeSec: number };
  peek(): undefined;
} {
  const c = {
    busts: 0,
    async bust() {
      c.busts++;
      return undefined;
    },
    health: () => ({ lastRefreshOk: true, snapshotAgeSec: 1 }),
    peek: () => undefined,
  };
  return c;
}

/** The pieces of an Astro APIContext the admin wrappers touch. */
export function apiContext(init: {
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  params?: Record<string, string>;
  session?: { sid: string; user: string; iat: number; exp: number; abs: number } | undefined;
  headers?: Record<string, string>;
  rawBody?: string;
}): {
  request: Request;
  url: URL;
  params: Record<string, string | undefined>;
  locals: Record<string, unknown>;
  cache: { invalidate(input: { tags: string[] }): Promise<void>; set(): void };
  purges: unknown[];
} {
  const url = new URL(`https://catalogue.example.test${init.path}`);
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  let body: string | undefined;
  if (method === 'POST') {
    headers['content-type'] ??= 'application/json';
    headers['sec-fetch-site'] ??= 'same-origin';
    body = init.rawBody ?? JSON.stringify(init.body ?? {});
  }
  const purges: unknown[] = [];
  return {
    request: new Request(url, { method, headers, body }),
    url,
    params: init.params ?? {},
    locals: { requestId: 'c'.repeat(16), ...(init.session ? { admin: init.session } : {}) },
    cache: {
      async invalidate(input) {
        purges.push(input);
      },
      set() {},
    },
    purges,
  };
}
