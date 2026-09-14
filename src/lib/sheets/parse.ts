// Turns raw batchGet value ranges into validated domain objects (docs/ADR.md §5 parsing rules).
// Header rows are validated first (SheetContractError, even when a tab has no rows at all);
// bad rows are dropped and reported; replaced/ignored fields are reported as warnings.

import * as z from 'zod';
import type { CellValue, ValueRange } from './client.ts';
import { HEADERS, PRODUCT_COLS, REFERENCE_COLLECTION_ORDER, TABS, type TabName } from './contract.ts';
import { SheetContractError } from './errors.ts';
import type {
  Catalogue,
  Collection,
  Customer,
  DroppedRow,
  ParseReport,
  Product,
  Rate,
  Status,
  TabStats,
  Tag,
  Vote,
  VoteStateMap,
} from './types.ts';
import { extractDriveId, normaliseImageUrl } from '../images.ts';
import { slugify, splitPipe, splitCollections, collectionSlug } from '../text.ts';
import { sizeBandOf, sizeLabelOf } from '../size.ts';

type Raw = Record<string, CellValue | undefined>;

/* ---------- primitive coercions ---------- */

/** Blank = null/undefined or a whitespace-only string (ADR §5: blanks → undefined). */
const blank = (v: unknown): unknown =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v;

const asTrimmed = (v: unknown): string | undefined => {
  const b = blank(v);
  return b === undefined ? undefined : String(b).trim();
};

const trimmed = z.preprocess(asTrimmed, z.string().optional());
const required = z.preprocess(asTrimmed, z.string().min(1));
const untrimmed = z.preprocess((v) => {
  const b = blank(v);
  return b === undefined ? undefined : String(b);
}, z.string().optional());

/** Numbers arrive as JSON numbers under UNFORMATTED_VALUE; a text cell must be a plain decimal. */
function toNumber(v: unknown): unknown {
  const b = blank(v);
  if (b === undefined) return undefined;
  if (typeof b === 'number') return b;
  if (typeof b === 'boolean') return b;
  const s = String(b).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s; // "1,250" stays a string and fails validation
}
const num = z.preprocess(toNumber, z.number().optional());

/** Checkbox booleans, "true"/"false" and 1/0; blank → false. */
const bool = z.preprocess((v) => {
  const b = blank(v);
  if (b === undefined) return false;
  if (typeof b === 'boolean') return b;
  const t = String(b).trim().toLowerCase();
  if (t === 'true' || t === '1' || t === 'yes') return true;
  if (t === 'false' || t === '0' || t === 'no') return false;
  return b; // anything else fails validation loudly
}, z.boolean());

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** A customer slug (Reactions/Visits) uses the same alphabet as the retired client code. */
const CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

const id = z.preprocess(asTrimmed, z.string().regex(ID_RE, 'id must be 1-64 letters, digits, "-" or "_"'));

const status = z.preprocess(
  (v) => {
    const b = blank(v);
    return b === undefined ? 'active' : String(b).trim().toLowerCase();
  },
  z.enum(['active', 'draft', 'archived']),
);

/* ---------- row schemas (keys = sheet headers) ---------- */

/** Products is index-mapped (Shopify headers contain spaces and parentheses), so the schema is flat. */
const ProductRow = z.object({
  id,
  handle: trimmed,
  title: required,
  body_html: trimmed,
  vendor: trimmed,
  product_category: trimmed,
  type: trimmed,
  tags: trimmed,
  published: bool,
  variant_sku: trimmed,
  variant_grams: num,
  variant_inventory_qty: num,
  variant_inventory_policy: trimmed,
  variant_price: num,
  variant_compare_at_price: num,
  variant_requires_shipping: bool,
  variant_taxable: bool,
  image_src: trimmed,
  image_alt_text: trimmed,
  seo_title: trimmed,
  seo_description: trimmed,
  status,
  width_cm: num,
  length_cm: num,
  size_label: trimmed,
  size_band: trimmed,
  material: trimmed,
  method: trimmed,
  origin: trimmed,
  age: trimmed,
  pile: trimmed,
  shape: trimmed,
  collection: trimmed,
  source_url: trimmed,
  source_site: trimmed,
  drive_folder_id: trimmed,
  drive_folder_url: trimmed,
  scraped_at: trimmed,
  commit_status: z.preprocess((v) => asTrimmed(v)?.toLowerCase() ?? '', z.enum(['pending', 'complete', ''])),
  internal_notes: trimmed,
});

const CollectionRow = z.object({
  id: trimmed,
  name: required,
  slug: trimmed,
  description: trimmed,
  created_at: trimmed,
  cover_image_url: trimmed,
  sort_order: num,
});

const CustomerRow = z.object({
  slug: z.preprocess(asTrimmed, z.string().regex(SLUG_RE, 'slug must be lowercase url-safe')),
  display_name: required,
  password_hash: trimmed,
  note: trimmed,
  created_at: trimmed,
  active: z.preprocess((v) => (blank(v) === undefined ? true : v), bool),
});

const ReactionRowSchema = z.object({
  event_id: trimmed,
  customer_slug: z.preprocess(asTrimmed, z.string().regex(CLIENT_RE, 'customer_slug is not url-safe')),
  product_id: id,
  reaction: z.preprocess((v) => asTrimmed(v)?.toLowerCase(), z.enum(['like', 'dislike', 'none'])),
  source: z.preprocess((v) => asTrimmed(v)?.toLowerCase() ?? 'card', z.enum(['card', 'detail'])),
  created_at: trimmed,
});

const TagRow = z.object({
  id: trimmed,
  slug: trimmed,
  name: required,
  color: trimmed,
});

const RateRow = z.object({
  currency: z.preprocess((v) => asTrimmed(v)?.toUpperCase(), z.string().regex(/^[A-Z]{3}$/)),
  rate_to_base: z.preprocess(toNumber, z.number().positive()),
  symbol: untrimmed, // "AED " keeps its trailing space (reference line 105)
  updated_at: trimmed,
});

/* ---------- header validation and row mapping ---------- */

export function assertHeaders(tab: TabName, headerRow: CellValue[] | undefined): void {
  const expected = HEADERS[tab];
  const actual = (headerRow ?? []).map((c) =>
    String(c ?? '')
      .trim()
      .toLowerCase(),
  );
  const mismatches: string[] = [];
  expected.forEach((name, i) => {
    if (actual[i] !== name)
      mismatches.push(`column ${columnLetter(i)} should be "${name}" but is "${actual[i] ?? ''}"`);
  });
  if (mismatches.length) throw new SheetContractError(tab, mismatches);
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Validates the header row (always, even for an empty tab) and maps data rows to header-keyed objects. */
function rowsToObjects(tab: TabName, values: CellValue[][] | undefined): Array<{ row: number; raw: Raw }> {
  assertHeaders(tab, values?.[0]);
  if (!values || values.length < 2) return [];
  const headers = HEADERS[tab];
  const out: Array<{ row: number; raw: Raw }> = [];
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every((c) => blank(c) === undefined)) continue; // fully blank row
    const raw: Raw = {};
    headers.forEach((h, j) => {
      raw[h] = cells[j];
    });
    out.push({ row: i + 1, raw });
  }
  return out;
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(row)'}: ${i.message}`);
}

interface Parsed<T> {
  items: T[];
  dropped: DroppedRow[];
  warnings: DroppedRow[];
}

/* ---------- public API ---------- */

/** Maps a Products row (index-based) onto the flat keys of ProductRow. */
function productRaw(cells: CellValue[]): Raw {
  const at = (i: number): CellValue | undefined => cells[i];
  return {
    id: at(PRODUCT_COLS.productId),
    handle: at(PRODUCT_COLS.handle),
    title: at(PRODUCT_COLS.title),
    body_html: at(PRODUCT_COLS.bodyHtml),
    vendor: at(PRODUCT_COLS.vendor),
    product_category: at(PRODUCT_COLS.productCategory),
    type: at(PRODUCT_COLS.type),
    tags: at(PRODUCT_COLS.tags),
    published: at(PRODUCT_COLS.published),
    variant_sku: at(PRODUCT_COLS.variantSku),
    variant_grams: at(PRODUCT_COLS.variantGrams),
    variant_inventory_qty: at(PRODUCT_COLS.variantInventoryQty),
    variant_inventory_policy: at(PRODUCT_COLS.variantInventoryPolicy),
    variant_price: at(PRODUCT_COLS.variantPrice),
    variant_compare_at_price: at(PRODUCT_COLS.variantCompareAtPrice),
    variant_requires_shipping: at(PRODUCT_COLS.variantRequiresShipping),
    variant_taxable: at(PRODUCT_COLS.variantTaxable),
    image_src: at(PRODUCT_COLS.imageSrc),
    image_alt_text: at(PRODUCT_COLS.imageAltText),
    seo_title: at(PRODUCT_COLS.seoTitle),
    seo_description: at(PRODUCT_COLS.seoDescription),
    status: at(PRODUCT_COLS.status),
    width_cm: at(PRODUCT_COLS.widthCm),
    length_cm: at(PRODUCT_COLS.lengthCm),
    size_label: at(PRODUCT_COLS.sizeLabel),
    size_band: at(PRODUCT_COLS.sizeBand),
    material: at(PRODUCT_COLS.material),
    method: at(PRODUCT_COLS.method),
    origin: at(PRODUCT_COLS.origin),
    age: at(PRODUCT_COLS.age),
    pile: at(PRODUCT_COLS.pile),
    shape: at(PRODUCT_COLS.shape),
    collection: at(PRODUCT_COLS.collection),
    source_url: at(PRODUCT_COLS.sourceUrl),
    source_site: at(PRODUCT_COLS.sourceSite),
    drive_folder_id: at(PRODUCT_COLS.driveFolderId),
    drive_folder_url: at(PRODUCT_COLS.driveFolderUrl),
    scraped_at: at(PRODUCT_COLS.scrapedAt),
    commit_status: at(PRODUCT_COLS.commitStatus),
    internal_notes: at(PRODUCT_COLS.internalNotes),
  };
}

/** Shopify CSV tags are comma-separated; the pre-brief sheet used "|". Accept both. */
export function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  const parts = value.includes('|') ? splitPipe(value) : value.split(',');
  return parts.map((t) => t.trim()).filter(Boolean);
}

/** No column exists for these in the Shopify set, so they ride on tags (documented in ADR D15). */
function flagsFromTags(tags: string[]): { featured: boolean; rotate: Product['rotate']; rest: string[] } {
  let featured = false;
  let rotate: Product['rotate'] = 'false';
  const rest: string[] = [];
  for (const t of tags) {
    const k = t.trim().toLowerCase();
    if (k === 'featured') featured = true;
    else if (k === 'rotate-force') rotate = 'force';
    else if (k === 'rotate') rotate = rotate === 'force' ? 'force' : 'true';
    else rest.push(t);
  }
  return { featured, rotate, rest };
}

export function parseProducts(values: CellValue[][] | undefined): Parsed<Product> {
  const items: Product[] = [];
  const dropped: DroppedRow[] = [];
  const warnings: DroppedRow[] = [];
  const seenSlugs = new Map<string, number>();
  const seenIds = new Set<string>();
  assertHeaders(TABS.products, values?.[0]);
  const rows = values ?? [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (cells.every((c) => blank(c) === undefined)) continue; // fully blank row
    const row = i + 1;
    const raw = productRaw(cells);
    if (blank(raw.id) === undefined) continue; // rows without an id are ignored before validation
    const parsed = ProductRow.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.products, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const p = parsed.data;
    if (seenIds.has(p.id)) {
      dropped.push({ tab: TABS.products, row, issues: [`id: "${p.id}" duplicates an earlier row`] });
      continue;
    }
    seenIds.add(p.id);

    const warn: string[] = [];
    const photos: string[] = [];
    if (p.image_src) {
      const fid = extractDriveId(p.image_src);
      if (fid) photos.push(fid);
      else if (!/^https:\/\//i.test(p.image_src))
        warn.push(`image src: "${p.image_src.slice(0, 40)}" is not a Drive id/URL or https URL`);
    }
    let slug: string;
    if (p.handle !== undefined && !SLUG_RE.test(p.handle)) {
      warn.push(`handle: "${p.handle.slice(0, 40)}" is not a valid handle and was replaced`);
      slug = slugify(p.title);
    } else {
      slug = p.handle ?? slugify(p.title);
    }
    if (!slug) slug = slugify(p.id) || p.id.toLowerCase();
    const n = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n + 1}`;
    if (warn.length) warnings.push({ tab: TABS.products, row, issues: warn });

    const widthCm = p.width_cm && p.width_cm > 0 ? p.width_cm : undefined;
    const lengthCm = p.length_cm && p.length_cm > 0 ? p.length_cm : undefined;
    const { featured, rotate, rest } = flagsFromTags(splitTags(p.tags));
    // One cell, several collections (owner requirement 2026-09-13). The first is the primary — the
    // canonical route and the single label a card shows; the rest are additional memberships.
    const collections = splitCollections(p.collection);
    items.push({
      id: p.id,
      slug,
      name: p.title,
      description: p.body_html ?? '',
      collections,
      collection: collections[0] ?? '',
      tags: rest,
      photos,
      imageSrc: p.image_src ?? '',
      imageAltText: p.image_alt_text ?? '',
      widthCm,
      lengthCm,
      sizeLabel: p.size_label ?? sizeLabelOf(widthCm, lengthCm),
      sizeBand: (p.size_band ?? sizeBandOf(widthCm, lengthCm)).toUpperCase(),
      material: p.material ?? '',
      method: p.method ?? '',
      origin: p.origin ?? '',
      age: p.age ?? '',
      pile: p.pile ?? '',
      shape: p.shape ?? '',
      priceUsd: p.variant_price && p.variant_price > 0 ? p.variant_price : undefined,
      compareAtPrice:
        p.variant_compare_at_price && p.variant_compare_at_price > 0 ? p.variant_compare_at_price : undefined,
      vendor: p.vendor ?? '',
      productCategory: p.product_category ?? '',
      productType: p.type ?? '',
      published: p.published,
      variantSku: p.variant_sku ?? '',
      variantGrams: p.variant_grams,
      variantInventoryQty: p.variant_inventory_qty,
      variantInventoryPolicy: p.variant_inventory_policy ?? '',
      variantRequiresShipping: p.variant_requires_shipping,
      variantTaxable: p.variant_taxable,
      seoTitle: p.seo_title ?? '',
      seoDescription: p.seo_description ?? '',
      status: p.status as Status,
      sourceUrl: p.source_url ?? '',
      sourceSite: p.source_site ?? '',
      driveFolderId: p.drive_folder_id ?? '',
      driveFolderUrl: p.drive_folder_url ?? '',
      scrapedAt: p.scraped_at ?? '',
      commitStatus: p.commit_status,
      internalNotes: p.internal_notes ?? '',
      featured,
      rotate,
      likes: 0,
      dislikes: 0,
      rating: 0,
    });
  }
  return { items, dropped, warnings };
}

export function parseCollections(values: CellValue[][] | undefined): Parsed<Collection> {
  const items: Collection[] = [];
  const dropped: DroppedRow[] = [];
  const warnings: DroppedRow[] = [];
  for (const { row, raw } of rowsToObjects(TABS.collections, values)) {
    const parsed = CollectionRow.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.collections, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const c = parsed.data;
    const warn: string[] = [];
    let cover: string | undefined;
    if (c.cover_image_url) {
      const res = normaliseImageUrl(c.cover_image_url);
      if (res.url) cover = res.url;
      else warn.push(`cover_image_url: ${res.reason}; ignored`);
    }
    let slug = c.slug ?? slugify(c.name);
    if (c.slug !== undefined && !SLUG_RE.test(c.slug)) {
      warn.push(`slug: "${c.slug.slice(0, 40)}" is not a valid slug and was replaced`);
      slug = slugify(c.name);
    }
    if (!slug) {
      // A name without ASCII letters or digits (e.g. Arabic-only) still needs a usable slug.
      slug = (c.id && slugify(c.id)) || `collection-${row}`;
      warn.push(`slug: derived "${slug}" because the name has no ASCII letters or digits`);
    }
    if (warn.length) warnings.push({ tab: TABS.collections, row, issues: warn });
    items.push({
      id: c.id ?? slug,
      slug,
      name: c.name,
      description: c.description ?? '',
      createdAt: c.created_at,
      coverImageUrl: cover,
      sortOrder: c.sort_order,
    });
  }
  return { items, dropped, warnings };
}

export function parseTags(values: CellValue[][] | undefined): Parsed<Tag> {
  const items: Tag[] = [];
  const dropped: DroppedRow[] = [];
  const warnings: DroppedRow[] = [];
  for (const { row, raw } of rowsToObjects(TABS.tags, values)) {
    const parsed = TagRow.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.tags, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const t = parsed.data;
    const warn: string[] = [];
    let slug = t.slug ?? slugify(t.name);
    if (t.slug !== undefined && !SLUG_RE.test(t.slug)) {
      warn.push(`slug: "${t.slug.slice(0, 40)}" is not a valid slug and was replaced`);
      slug = slugify(t.name);
    }
    let color: string | undefined;
    if (t.color !== undefined) {
      if (COLOR_RE.test(t.color)) color = t.color;
      else warn.push(`color: "${t.color.slice(0, 20)}" is not #RRGGBB; ignored`);
    }
    if (warn.length) warnings.push({ tab: TABS.tags, row, issues: warn });
    items.push({ id: t.id ?? slugify(t.name), slug, name: t.name, color });
  }
  return { items, dropped, warnings };
}

export function parseRates(values: CellValue[][] | undefined): Parsed<Rate> {
  const items: Rate[] = [];
  const dropped: DroppedRow[] = [];
  for (const { row, raw } of rowsToObjects(TABS.rates, values)) {
    const parsed = RateRow.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.rates, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const r = parsed.data;
    items.push({
      currency: r.currency,
      rateToBase: r.rate_to_base,
      symbol: r.symbol ?? '',
      updatedAt: r.updated_at,
    });
  }
  return { items, dropped, warnings: [] };
}

export function parseCustomers(values: CellValue[][] | undefined): Parsed<Customer> {
  const items: Customer[] = [];
  const dropped: DroppedRow[] = [];
  const seen = new Set<string>();
  for (const { row, raw } of rowsToObjects(TABS.customers, values)) {
    if (blank(raw.slug) === undefined) continue;
    const parsed = CustomerRow.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.customers, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const c = parsed.data;
    if (seen.has(c.slug)) {
      dropped.push({ tab: TABS.customers, row, issues: [`slug: "${c.slug}" duplicates an earlier row`] });
      continue;
    }
    seen.add(c.slug);
    items.push({
      slug: c.slug,
      displayName: c.display_name,
      passwordHash: c.password_hash ?? '',
      note: c.note ?? '',
      createdAt: c.created_at,
      active: c.active,
    });
  }
  return { items, dropped, warnings: [] };
}

export interface ReactionCounts {
  likes: number;
  dislikes: number;
}

/**
 * Newest-first window (brief §3 rule 1): the latest event per (customer, product) wins, and a
 * `none` event clears the pair. Counts are the number of distinct customers currently liking or
 * disliking each product — the site never reads a stored count.
 */
export function parseReactions(values: CellValue[][] | undefined): {
  state: VoteStateMap;
  counts: Map<string, ReactionCounts>;
  rowsRead: number;
  dropped: DroppedRow[];
} {
  const state: VoteStateMap = new Map();
  const counts = new Map<string, ReactionCounts>();
  const dropped: DroppedRow[] = [];
  const decided = new Set<string>();
  let rowsRead = 0;
  for (const { row, raw } of rowsToObjects(TABS.reactions, values)) {
    rowsRead++;
    const parsed = ReactionRowSchema.safeParse(raw);
    if (!parsed.success) {
      dropped.push({ tab: TABS.reactions, row, issues: issuesOf(parsed.error) });
      continue;
    }
    const e = parsed.data;
    const pair = `${e.customer_slug} ${e.product_id}`;
    if (decided.has(pair)) continue; // an older event for a pair already settled
    decided.add(pair);
    if (e.reaction === 'none') continue;
    const vote: Vote = e.reaction;
    let byProduct = state.get(e.customer_slug);
    if (!byProduct) {
      byProduct = new Map<string, Vote>();
      state.set(e.customer_slug, byProduct);
    }
    byProduct.set(e.product_id, vote);
    const c = counts.get(e.product_id) ?? { likes: 0, dislikes: 0 };
    if (vote === 'like') c.likes++;
    else c.dislikes++;
    counts.set(e.product_id, c);
  }
  return { state, counts, rowsRead, dropped };
}

/** likes / (likes + dislikes) × 5, two decimals — the rule the retired sheet formula encoded. */
export function ratingOf(likes: number, dislikes: number): number {
  const n = likes + dislikes;
  return n === 0 ? 0 : Math.round((likes / n) * 5 * 100) / 100;
}

/** Orders collections by sort_order then A→Z; falls back to the reference ORDER list when the tab is empty. */
export function orderedCollectionNames(products: Product[], collections: Collection[]): string[] {
  // Every name a product claims, not just its primary: a collection that only ever appears as a
  // second membership still deserves a tab (owner requirement 2026-09-13).
  const present = [
    ...new Set(
      products.flatMap((r) => (r.collections?.length ? r.collections : [r.collection])).filter(Boolean),
    ),
  ];
  const known = collections
    .slice()
    .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name))
    .map((c) => c.name);
  const order = known.length ? known : [...REFERENCE_COLLECTION_ORDER];
  // Key by the slug the tabs and cards use, so "Wabi-sabi" fills the "Wabi Sabi" slot (view.ts navTabs).
  const keyOf = (name: string): string => collectionSlug(name, collections);
  const byKey = new Map<string, string>();
  for (const name of present) if (!byKey.has(keyOf(name))) byKey.set(keyOf(name), name);
  const out: string[] = [];
  for (const name of order) {
    const hit = byKey.get(keyOf(name));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  const placed = new Set(out.map(keyOf));
  const rest = present.filter((n) => !placed.has(keyOf(n))).sort((a, b) => a.localeCompare(b));
  return out.concat(rest);
}

export interface ParsedSnapshot {
  catalogue: Catalogue;
  voteState: VoteStateMap;
  report: ParseReport;
}

/** Parses the value ranges returned for READ_RANGES (positional). Throws SheetContractError on a bad header row. */
export function parseSnapshot(ranges: readonly ValueRange[]): ParsedSnapshot {
  const [productsVR, collectionsVR, tagsVR, ratesVR, reactionsVR, customersVR] = ranges;
  const products = parseProducts(productsVR?.values);
  const collections = parseCollections(collectionsVR?.values);
  const tags = parseTags(tagsVR?.values);
  const rates = parseRates(ratesVR?.values);
  const reactions = parseReactions(reactionsVR?.values);
  const customers = parseCustomers(customersVR?.values);
  for (const p of products.items) {
    const c = reactions.counts.get(p.id);
    if (!c) continue;
    p.likes = c.likes;
    p.dislikes = c.dislikes;
    p.rating = ratingOf(c.likes, c.dislikes);
  }
  const stats: Record<string, TabStats> = {
    [TABS.products]: { kept: products.items.length, dropped: products.dropped.length },
    [TABS.collections]: { kept: collections.items.length, dropped: collections.dropped.length },
    [TABS.tags]: { kept: tags.items.length, dropped: tags.dropped.length },
    [TABS.rates]: { kept: rates.items.length, dropped: rates.dropped.length },
    [TABS.reactions]: {
      kept: reactions.rowsRead - reactions.dropped.length,
      dropped: reactions.dropped.length,
    },
    [TABS.customers]: { kept: customers.items.length, dropped: customers.dropped.length },
  };
  return {
    catalogue: {
      rugs: products.items,
      collections: collections.items,
      tags: tags.items,
      rates: rates.items,
      customers: customers.items,
    },
    voteState: reactions.state,
    report: {
      dropped: [
        ...products.dropped,
        ...collections.dropped,
        ...tags.dropped,
        ...rates.dropped,
        ...reactions.dropped,
        ...customers.dropped,
      ],
      warnings: [...products.warnings, ...collections.warnings, ...tags.warnings],
      votesRowsRead: reactions.rowsRead,
      stats,
    },
  };
}
