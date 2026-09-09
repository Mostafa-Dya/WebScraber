// Customers (brief §10): one row per named buyer, addressed by a URL slug that is also their
// private preview link (`/{slug}`). The password is generated server-side, shown once and stored
// only as a hash — never in this row's readable columns.
import { randomBytes } from 'node:crypto';
import type { CellValue } from '../sheets/client.ts';
import { TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';
import { slugify } from '../text.ts';
import { CLIENT_CODE_RE } from './dto.ts';

export { CLIENT_CODE_RE };
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'; // 36 symbols
const RAND_LEN = 6;

/** Six characters from [a-z0-9], uniform via rejection sampling over crypto bytes. */
export function rand6(): string {
  let out = '';
  while (out.length < RAND_LEN) {
    for (const b of randomBytes(16)) {
      if (b >= 252) continue; // 252 = 7 × 36: reject the tail so every symbol is equally likely
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === RAND_LEN) break;
    }
  }
  return out;
}

export function clientCode(name: string, rand: () => string = rand6): string {
  const base = slugify(name).slice(0, 20).replace(/-+$/, '');
  const code = `${base || 'client'}-${rand()}`;
  if (!CLIENT_CODE_RE.test(code)) throw new Error(`generated client code "${code}" is malformed`);
  return code;
}

/** Retries once on a collision with `existing` (case-insensitive), then throws. */
export function newClientCode(name: string, existing: Iterable<string>, rand: () => string = rand6): string {
  const taken = new Set<string>();
  for (const c of existing) taken.add(String(c).trim().toLowerCase());
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = clientCode(name, rand);
    if (!taken.has(code)) return code;
  }
  throw new Error('client code collision twice in a row');
}

/**
 * The buyer's private preview link, `${SITE_URL}/${slug}` (brief §1, §10). Always regenerated from
 * the runtime SITE_URL, never trusted from the sheet, so moving hosts moves every link at once.
 */
export function clientLink(siteUrl: string, code: string): string {
  if (!CLIENT_CODE_RE.test(code)) throw new Error('clientLink: malformed code');
  return `${new URL(siteUrl).origin}/${code}`;
}

export type ClientStatusValue = 'active' | 'revoked';

export interface ClientRow {
  row: number;
  /** The customer slug; also the first path segment of their preview link. */
  code: string;
  /** `display_name` — greets the buyer on the gate and in the header (brief §7). */
  name: string;
  note: string;
  /** Derived from the `active` column: an inactive customer can no longer sign in. */
  status: ClientStatusValue;
  createdAt: string;
  /** Not a Customers column; kept blank so the admin table can stay as it is. */
  createdBy: string;
  /** Regenerated from the runtime SITE_URL, never stored. */
  link: string;
  /** Present only when the row was just written; never rendered. */
  passwordHash?: string;
}

/** Customers columns: slug, display_name, password_hash, note, created_at, active. */
export function clientToCells(c: Omit<ClientRow, 'row'>): CellValue[] {
  return [c.code, c.name, c.passwordHash ?? '', c.note, c.createdAt, c.status === 'active'];
}

/** Parses `Customers!A1:F` (header first, newest first). Rows with a malformed slug are dropped. */
export function parseClients(values: CellValue[][] | undefined): { items: ClientRow[]; dropped: number } {
  assertHeaders(TABS.customers, values?.[0]);
  const items: ClientRow[] = [];
  let dropped = 0;
  if (!values) return { items, dropped };
  const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v).trim());
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every((c) => text(c) === '')) continue;
    const code = text(cells[0]);
    const activeCell = text(cells[5]).toLowerCase();
    const status: ClientStatusValue =
      activeCell === 'false' || activeCell === '0' || activeCell === 'no' ? 'revoked' : 'active';
    if (!CLIENT_CODE_RE.test(code)) {
      dropped++;
      continue;
    }
    items.push({
      row: i + 1,
      code,
      name: text(cells[1]),
      passwordHash: text(cells[2]),
      note: text(cells[3]),
      status,
      createdAt: text(cells[4]),
      createdBy: '',
      link: '',
    });
  }
  return { items, dropped };
}
