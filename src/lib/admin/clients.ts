// Customers (brief §10): one row per named buyer, addressed by a URL slug that is also their
// private preview link (`/{slug}`). The password is generated server-side, shown once and stored
// only as a hash — never in this row's readable columns.
import { randomBytes } from 'node:crypto';
import type { CellValue } from '../sheets/client.ts';
import { TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';
import { slugify } from '../text.ts';
import { CLIENT_CODE_RE } from './dto.ts';
import { isReservedSlug } from '../customer/auth.ts';

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

/* ---------------------------------------------------------------------------------------------
   The scrambled customer route (owner, 2026-09-13).

   "Customer link route should take half the letters from the name I will provide, then shuffle them
    and adds symbols within it to make it as their page route, for example: a customer named Gida
    Hussami, the route should be: preview.serioludere.com/hi6g2a3a%s. no fixed rule, just like that."

   Two departures from that sentence, both deliberate:

   1. NOT "%". The owner's example uses it, but "%" begins a percent-escape in a URL path, and "%s"
      is not valid hex — browsers and the router would mangle or reject the link.

      The filler is "-", and only "-". `~` and `.` are equally unreserved in a path segment
      (RFC 3986 §2.3) and were the first choice, but this code is ALSO written into the sheet — as
      the Customers tab's own `slug`, and as `client` on every Reactions row. Those two columns do
      NOT share an alphabet: Reactions parses `/^[A-Za-z0-9_-]{1,64}$/`, but Customers parses
      `SLUG_RE = /^[a-z0-9-]{1,80}$/`. The narrower one governs, and it admits neither `~`, `.`
      nor `_`.

      This was got wrong until 2026-09-14, when "_" was still a filler: 38.9 % of codes carried one,
      every such row was dropped on read, and — because Customers is a GUARDED_TAB at a 0.1 drop
      ratio — a couple of those customers rejected the entire refresh and 503'd the whole site, not
      just that buyer's link.

   2. Never first or last. A code that starts with "." or ends with "-" is legal in a path but reads
      as broken, and a leading dot hides the segment on some filesystems if it is ever mirrored.

   This code is a locator, not a credential. It leaks roughly half the buyer's letters by design, and
   the shuffle plus fillers is on the order of 25 bits — guessable by someone determined. That is
   acceptable ONLY because §10 puts a password gate behind the route; the URL alone opens nothing.
--------------------------------------------------------------------------------------------- */

/**
 * Unreserved in a URL path AND accepted by BOTH sheet columns the code is written into.
 *
 * `-` is the whole set. `_` was here until 2026-09-14 and was a site-down defect: the Customers tab
 * parses its `slug` with `/^[a-z0-9-]{1,80}$/`, so an underscored code was dropped on every read and
 * the guarded-tab ratio turned a couple of such customers into a catalogue-wide 503. See the note on
 * CLIENT_CODE_RE in ./dto.ts. Do not re-add `_`, `~` or `.`.
 */
const FILLER_SYMBOLS = '-';
const FILLER_DIGITS = '0123456789';

/** A uniform integer in [0, max), rejection-sampled from crypto bytes. Injectable for tests. */
export type RandomInt = (max: number) => number;

export const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 0) throw new Error('cryptoRandomInt: max must be positive');
  // Reject the tail of the byte range so every value is equally likely (no modulo bias).
  const limit = Math.floor(256 / max) * max;
  for (;;) {
    for (const b of randomBytes(32)) if (b < limit) return b % max;
  }
};

/** Fisher–Yates, driven by the injected source so a test can make it deterministic. */
function shuffled<T>(items: readonly T[], rnd: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Half the name's characters, shuffled, with digits and symbols woven between them.
 *
 * "Half" rounds up and never falls below 3, and the pool itself is padded to 4: a one- or two-letter
 * name would otherwise produce a route so short it is both ugly and trivially enumerable. Non-Latin
 * names slugify to nothing, so they fall back to a fully random code of the same shape rather than
 * throwing and blocking the owner from adding that customer at all.
 */
export function scrambleName(name: string, rnd: RandomInt = cryptoRandomInt): string {
  const letters = slugify(name).replace(/[^a-z0-9]/g, '');
  let pool = letters || Array.from({ length: 6 }, () => ALPHABET[rnd(ALPHABET.length)]).join('');
  // A one-character name ("X") would otherwise yield a one-character code, which CLIENT_CODE_RE
  // rejects outright — the owner would simply be unable to add that customer. Pad with random
  // characters until there is enough to scramble.
  while (pool.length < 4) pool += ALPHABET[rnd(ALPHABET.length)];
  // …and a LONG name overflows the other end. ClientInput allows a 60-character name, so "half" can
  // reach 30 letters; add up to 4 fillers and the code passes CLIENT_CODE_RE's 28-character ceiling,
  // which made `clientCode` throw and the owner simply could not add that customer (a 500 on Add).
  // 24 + 4 fillers = 28 exactly, so the cap is the largest value that can never overflow.
  const MAX_TAKE = 24;
  const take = Math.min(pool.length, MAX_TAKE, Math.max(3, Math.ceil(pool.length / 2)));
  const picked = shuffled([...pool], rnd).slice(0, take);

  // Weave 3–4 fillers into the INTERIOR gaps only, so the code always begins and ends alphanumeric.
  const fillerCount = Math.min(picked.length - 1, 3 + rnd(2));
  const gaps = shuffled(
    Array.from({ length: picked.length - 1 }, (_, i) => i + 1),
    rnd,
  ).slice(0, Math.max(0, fillerCount));

  const out: string[] = [];
  for (let i = 0; i < picked.length; i++) {
    if (gaps.includes(i)) {
      // Digits outnumber symbols 3:1, matching the owner's example (three digits, one symbol).
      const useSymbol = rnd(4) === 0;
      out.push(
        useSymbol ? FILLER_SYMBOLS[rnd(FILLER_SYMBOLS.length)]! : FILLER_DIGITS[rnd(FILLER_DIGITS.length)]!,
      );
    }
    out.push(picked[i]!);
  }
  return out.join('');
}

/**
 * The customer's route segment. `rnd` is injectable so tests can pin the shuffle.
 *
 * Throws rather than returning a malformed code: a bad route here would 404 a buyer's only link, and
 * failing at creation time is far cheaper than discovering it after the link has been sent.
 */
export function clientCode(name: string, rnd: RandomInt = cryptoRandomInt): string {
  const code = scrambleName(name, rnd);
  if (!CLIENT_CODE_RE.test(code)) throw new Error(`generated client code "${code}" is malformed`);
  // Defence in depth, currently unreachable: every reserved slug is pure letters (or starts with
  // "_", or contains "."), and every generated code carries at least one interior digit-or-symbol
  // and never begins with one. The check costs nothing and survives a future change to the weave.
  if (isReservedSlug(code)) throw new Error(`generated client code "${code}" is a reserved route`);
  return code;
}

/**
 * A code not already taken (case-insensitive) and not a reserved route.
 *
 * Eight attempts, not the previous two: the old scheme prefixed the name, so a collision meant two
 * buyers with the same name AND the same six random characters — vanishingly rare. This one is
 * shorter and drawn from the name's own letters, so two buyers called "Ana Lee" collide far more
 * often. Eight tries makes exhausting them a signal that something is wrong, not bad luck.
 */
export function newClientCode(
  name: string,
  existing: Iterable<string>,
  rnd: RandomInt = cryptoRandomInt,
): string {
  const taken = new Set<string>();
  for (const c of existing) taken.add(String(c).trim().toLowerCase());
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = clientCode(name, rnd);
    if (!taken.has(code.toLowerCase())) return code;
  }
  throw new Error('client code collision eight times in a row');
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
  /**
   * The stored scrypt hash. Needed in-process to verify a buyer's password, and it must NEVER reach
   * a response body or a rendered page — use `withoutSecrets` on every path that leaves the server.
   *
   * This was documented as "present only when the row was just written" and was not: `parseClients`
   * sets it on every row, and both the admin page and the clients API spread the row wholesale, so
   * every customer's hash was being serialised into HTML an admin session could read.
   */
  passwordHash?: string;
}

/**
 * A client row with the password hash removed — the only shape allowed to leave the server.
 *
 * Written as an explicit destructure rather than `delete`, so adding a future secret to `ClientRow`
 * forces a compile-time decision here instead of silently shipping it.
 */
export function withoutSecrets<T extends ClientRow>(c: T): Omit<T, 'passwordHash'> {
  // Generic so the caller keeps whatever it started with: `AdminClient` adds `version`, which the
  // admin table renders as `data-version`, and a non-generic return type would silently drop it.
  const { passwordHash: _passwordHash, ...safe } = c;
  return safe;
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
