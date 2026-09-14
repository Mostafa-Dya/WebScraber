// Helpers every /api/admin/* route shares (docs/ADMIN_SPEC.md §2.3, §3.4). Not a route: Astro skips
// files whose name starts with an underscore. Astro-bound (runtime singletons); the logic it leans
// on lives in src/lib/admin/*.
import type { CellValue, SheetsClient } from '../../../lib/sheets/client.ts';
import { HEADERS, PRODUCT_WIDTH, TABS } from '../../../lib/sheets/contract.ts';
import { consoleLogger } from '../../../lib/sheets/errors.ts';
import { parseCollections, parseTags } from '../../../lib/sheets/parse.ts';
import type { Rotate, Status } from '../../../lib/sheets/types.ts';
import { AdminError, adminRuntime } from '../../../lib/admin/http.ts';
import { clientLink, parseClients, withoutSecrets } from '../../../lib/admin/clients.ts';
import type { RugInputT } from '../../../lib/admin/dto.ts';
import {
  adminRugFromCells,
  fetchAdminSnapshot,
  findCollectionByName,
  findTagByName,
  rowVersion,
  type AdminClient,
  type AdminCollection,
  type AdminRug,
  type AdminSnapshot,
  type AdminTag,
} from '../../../lib/admin/read.ts';
import type { Cells, RugFields } from '../../../lib/admin/write.ts';
import type { ScopeStatus } from '../../../lib/drive/index.ts';
import { normaliseImageUrl } from '../../../lib/images.ts';
import { getAdminDeps, getClient } from '../../../lib/runtime.ts';

export type Client = Pick<
  SheetsClient,
  'batchGet' | 'batchUpdate' | 'sheetIdByTitle' | 'getSpreadsheet' | 'forgetSheetIds'
>;

export const nowIso = (): string => new Date().toISOString();

/** One fresh admin read (never the public route cache). */
export async function loadSnapshot(
  client: Pick<SheetsClient, 'batchGet'> = getClient(),
): Promise<AdminSnapshot> {
  return fetchAdminSnapshot(client, { logger: consoleLogger });
}

/** Writes to Rugs W:Z need the admin headers in place (§3.1): refuse with a clear 503 otherwise. */
export function requireAdminHeaders(snapshot: Pick<AdminSnapshot, 'report'>): void {
  if (snapshot.report.adminHeaders === 'missing') {
    throw new AdminError(
      503,
      'sheet not initialised',
      'Rugs W1:Z1 are blank — run `npm run sheet:init` to add the admin columns before editing rugs.',
    );
  }
}

/** The canonical Collections.name for a typed/selected name (case-insensitive), else 422. */
export function resolveCollection(snapshot: Pick<AdminSnapshot, 'collections'>, name: string): string {
  const hit = findCollectionByName(snapshot, name);
  if (!hit)
    throw new AdminError(422, 'unknown collection', `Collection "${name}" is not in the Collections tab.`, {
      collection: name,
    });
  return hit.name;
}

/**
 * Canonical Collections.name for every requested collection, in the order given, else 422.
 *
 * De-duplicated case-insensitively on the CANONICAL name, so a body listing both "kilims" and
 * "Kilims" resolves to one membership rather than writing the same collection into the cell twice.
 * The first unknown name is the one reported: naming all of them would be kinder, but the 422 shape
 * in §2.3 carries a single `collection`, and widening it is a spec change, not a bug fix.
 */
export function resolveCollections(
  snapshot: Pick<AdminSnapshot, 'collections'>,
  names: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const canonical = resolveCollection(snapshot, name);
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out;
}

/** Canonical Tags.name for every requested tag (case-insensitive, de-duplicated), else 422. */
export function resolveTags(snapshot: Pick<AdminSnapshot, 'tags'>, tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const hit = findTagByName(snapshot, t);
    if (!hit)
      throw new AdminError(422, 'unknown tag', `Tag "${t}" is not in the Tags tab — add it first.`, {
        tag: t,
      });
    const key = hit.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit.name);
  }
  return out;
}

type RugBody = Omit<RugInputT, 'id' | 'roundPrice' | 'slug'>;

/** RugFields from a validated body plus the resolved slug / collection / tags and the price to store. */
export function rugFieldsFrom(
  body: RugBody,
  resolved: {
    slug: string;
    collections: string[];
    tags: string[];
    priceUsd: number | undefined;
    /**
     * The row's existing scrape date, on update. `RugUpdate` has no `scrapedAt` — it is provenance
     * the server owns, not something a form posts — so without this the rebuilt full-width row wrote
     * an empty string over it on every save. Absent on create, where the caller stamps `now`.
     */
    scrapedAt?: string;
  },
): RugFields {
  return {
    slug: resolved.slug,
    name: body.name,
    description: body.description,
    collections: resolved.collections,
    tags: resolved.tags,
    photos: body.photos,
    widthCm: body.widthCm,
    lengthCm: body.lengthCm,
    material: body.material,
    age: body.age,
    origin: body.origin,
    priceUsd: resolved.priceUsd,
    rotate: body.rotate as Rotate,
    featured: body.featured,
    status: body.status as Status,
    method: body.method,
    sourceUrl: body.sourceUrl ?? '',
    supplier: body.supplier,
    supplierRef: body.supplierRef,
    notes: body.notes,
    commitStatus: body.commitStatus,
    driveFolderId: body.driveFolderId,
    driveFolderUrl: body.driveFolderUrl,
    scrapedAt: resolved.scrapedAt,
  };
}

/** The writable fields of a rug as read (what an unchanged save would write back). */
export function fieldsOfRug(rug: AdminRug): RugFields {
  return {
    slug: rug.slug,
    name: rug.name,
    description: rug.description,
    collections: [...rug.collections],
    tags: [...rug.tags],
    photos: [...rug.photos],
    widthCm: rug.widthCm,
    lengthCm: rug.lengthCm,
    material: rug.material,
    age: rug.age,
    origin: rug.origin,
    priceUsd: rug.priceUsd,
    rotate: rug.rotate,
    featured: rug.featured,
    status: rug.status,
    method: rug.method,
    sourceUrl: rug.sourceUrl,
    supplier: rug.supplier,
    supplierRef: rug.supplierRef,
    notes: rug.notes,
    commitStatus: rug.commitStatus,
    driveFolderId: rug.driveFolderId,
    driveFolderUrl: rug.driveFolderUrl,
    /**
     * Server-owned provenance, carried through rather than re-derived.
     *
     * `productFieldsToCells` writes a FULL-WIDTH row and sets `cells[scrapedAt] = f.scrapedAt ?? ''`,
     * so anything that rebuilds the row from a `RugFields` without this field silently erases the
     * column. The create and retry paths both remembered to stamp it inline; `fieldsOfRug` did not,
     * so a status change blanked it — and `rugFieldsFrom` did not either, so did every ordinary edit.
     */
    scrapedAt: rug.scrapedAt,
  };
}

const STATUSES = new Set(['active', 'draft', 'archived', 'all']);

/** Client-side filtering is the norm; the server filter exists for scripts and the `?q=` deep link. */
export function filterRugs(rugs: readonly AdminRug[], status: string | null, q: string | null): AdminRug[] {
  const wanted = status && STATUSES.has(status) ? status : 'all';
  const needle = (q ?? '').trim().toLowerCase();
  return rugs.filter((r) => {
    if (wanted !== 'all' && r.status !== wanted) return false;
    if (!needle) return true;
    return [r.name, r.id, r.supplierRef, r.slug].some((s) => s.toLowerCase().includes(needle));
  });
}

/** Ids reserved by `rug.create` audit rows (a create whose verify failed still burnt its number). */
export function reservedIds(snapshot: Pick<AdminSnapshot, 'audit'>): string[] {
  return snapshot.audit.filter((a) => a.action === 'rug.create').map((a) => a.targetId);
}

/** '' clears; anything else must be a Drive id/URL or an allow-listed https URL (stored as typed). */
export function checkCover(input: string): string {
  const s = input.trim();
  if (!s) return '';
  const res = normaliseImageUrl(s);
  if (!res.url) throw new AdminError(400, 'bad cover', `Cover image: ${res.reason ?? 'not usable'}`);
  return s;
}

/** Plain object (undefined → null) so `diffFields` and the audit JSON see every key. */
export function auditable(fields: RugFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = v === undefined ? null : v;
  return out;
}

const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v));

/* ---------- fresh rows after a commit (the version the UI needs for its next save) ---------- */

export async function freshRug(
  client: Pick<SheetsClient, 'batchGet'>,
  row: number,
  id: string,
): Promise<AdminRug> {
  const [vr] = await client.batchGet([`${TABS.products}!A${row}:AP${row}`]);
  const cells = (vr?.values?.[0] ?? []).slice(0, PRODUCT_WIDTH);
  const rug = adminRugFromCells(cells, row);
  if (!rug || rug.id !== id) {
    throw new AdminError(500, 'verify failed', `Products row ${row} does not read back as ${id}`);
  }
  return rug;
}

export async function freshCollection(
  client: Pick<SheetsClient, 'batchGet'>,
  row: number,
): Promise<AdminCollection> {
  const [vr] = await client.batchGet([`${TABS.collections}!A${row}:G${row}`]);
  const cells = vr?.values?.[0] ?? [];
  const parsed = parseCollections([[...HEADERS.Collections], cells]);
  const c = parsed.items[0];
  if (!c) throw new AdminError(500, 'verify failed', `Collections row ${row} does not parse after the write`);
  return { ...c, row, version: rowVersion(cells, HEADERS.Collections.length) };
}

export async function freshTag(client: Pick<SheetsClient, 'batchGet'>, row: number): Promise<AdminTag> {
  const [vr] = await client.batchGet([`${TABS.tags}!A${row}:D${row}`]);
  const cells = vr?.values?.[0] ?? [];
  const parsed = parseTags([[...HEADERS.Tags], cells]);
  const t = parsed.items[0];
  if (!t) throw new AdminError(500, 'verify failed', `Tags row ${row} does not parse after the write`);
  return { ...t, row, version: rowVersion(cells, HEADERS.Tags.length) };
}

export async function freshClient(client: Pick<SheetsClient, 'batchGet'>, row: number): Promise<AdminClient> {
  const [vr] = await client.batchGet([`${TABS.customers}!A${row}:F${row}`]);
  const cells = vr?.values?.[0] ?? [];
  const parsed = parseClients([[...HEADERS.Customers], cells]);
  const c = parsed.items[0];
  if (!c) throw new AdminError(500, 'verify failed', `Customers row ${row} does not parse after the write`);
  return { ...c, row, version: rowVersion(cells, HEADERS.Customers.length) };
}

/**
 * Clients as the UI shows them: the link always regenerated from the runtime SITE_URL (§3.2), and
 * the stored password hash stripped.
 *
 * This used to spread `c` wholesale, which carried `passwordHash` into every clients API response
 * and into the admin page's embedded JSON. A scrypt hash is not a password, but publishing one for
 * every buyer turns a single admin-session leak into an offline cracking target for the whole list.
 */
export function clientView(c: AdminClient): Omit<AdminClient, 'passwordHash'> {
  return { ...withoutSecrets(c), link: clientLink(adminRuntime.siteUrl, c.code) };
}

/** Raw `A{row}:D{row}` of a Settings row → its whole-row version token (the parsed rows carry none). */
export async function settingsRowVersion(
  client: Pick<SheetsClient, 'batchGet'>,
  row: number,
): Promise<{ version: string; key: string; cells: CellValue[] }> {
  const [vr] = await client.batchGet([`${TABS.settings}!A${row}:D${row}`]);
  const cells = vr?.values?.[0] ?? [];
  return { version: rowVersion(cells, HEADERS.Settings.length), key: text(cells[0]).trim(), cells };
}

export function cellsToValues(cells: Cells): CellValue[] {
  return cells.map((c) => (c === undefined || c === null ? '' : c));
}

/* ---------- Drive scope (§5.4) ---------- */

/**
 * Refreshes `adminRuntime.driveScopeOk` from the Drive client (cached inside it, 10 min). Never
 * throws; undefined when no client can be built (service-account mode reports false).
 */
export async function driveScope(): Promise<ScopeStatus | undefined> {
  let deps;
  try {
    deps = getAdminDeps();
  } catch {
    return undefined;
  }
  if (!deps.drive) {
    adminRuntime.driveScopeOk = false;
    return undefined;
  }
  try {
    const status = await deps.drive.scopeStatus();
    adminRuntime.driveScopeOk = status.driveScopeOk;
    return status;
  } catch {
    adminRuntime.driveScopeOk = false;
    return undefined;
  }
}
