// Maps the legacy endpoint output (reference/live_catalogue.2026-09-05.json, public data) to sheet
// rows per docs/ADR.md §3.4. Pure and testable; scripts/init-sheet.ts writes the result.
import { PRODUCT_COLS, PRODUCT_WIDTH } from '../../src/lib/sheets/contract.ts';
import { sizeBandOf, sizeLabelOf } from '../../src/lib/size.ts';
import { canonicalCollection, slugify } from '../../src/lib/text.ts';
import { extractDriveId } from '../../src/lib/images.ts';
import { REFERENCE_COLLECTION_ORDER } from '../../src/lib/sheets/contract.ts';
import type { CellValue } from '../../src/lib/sheets/client.ts';

export interface LegacyRug {
  id?: string | number;
  name?: string;
  collection?: string;
  material?: string;
  width?: number;
  length?: number;
  age?: string;
  origin?: string;
  method?: string;
  tags?: string;
  rotate?: boolean | string;
  price?: number;
  photos?: string[];
}

export interface SeedRows {
  /** Rugs columns A..P (id … status); formula columns Q..S are never written. */
  /** Whole Products rows, A..AP (brief §9). */
  products: CellValue[][];
  collections: CellValue[][];
  tags: CellValue[][];
  notes: string[];
}

const AGE_FIXES: Record<string, string> = { anitque: 'Antique' };

function fixAge(age: string): string {
  return AGE_FIXES[age.toLowerCase()] ?? age;
}

function positive(n: unknown): number | '' {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : '';
}

export function buildSeed(rugs: LegacyRug[], now: string): SeedRows {
  const notes: string[] = [];
  const seenSlugs = new Map<string, number>();
  const tagNames = new Map<string, string>();
  const collectionsPresent = new Map<string, string>();
  const products: CellValue[][] = [];

  for (const r of rugs) {
    const name = (r.name ?? '').trim();
    if (!name) {
      notes.push('skipped a rug without a name');
      continue;
    }
    let id = String(r.id ?? '').trim();
    if (!id) {
      id = slugify(name);
      notes.push(`"${name}": blank id → "${id}" (legacy rule)`);
    }
    let slug = slugify(name) || id.toLowerCase();
    const n = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n + 1}`;

    const collection = canonicalCollection(r.collection ?? '');
    if (collection) collectionsPresent.set(collection.toLowerCase(), collection);

    const tagList: string[] = [];
    for (const t of (r.tags ?? '').split(',')) {
      const v = t.trim();
      if (!v || tagList.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
      tagList.push(v);
      if (!tagNames.has(v.toLowerCase())) tagNames.set(v.toLowerCase(), v);
    }

    const photos: string[] = [];
    for (const p of r.photos ?? []) {
      const fid = extractDriveId(p);
      if (fid) photos.push(fid);
      else notes.push(`"${name}": photo "${p.slice(0, 50)}" is not a Drive URL and was skipped`);
    }

    const rotate: 'force' | 'true' | 'false' =
      r.rotate === 'force' ? 'force' : r.rotate === true ? 'true' : 'false';
    // Only the legacy sheet's literal test row is a draft (ADR §3.4); a real rug named "Test …" stays active.
    const status = name === 'Test // testing' ? 'draft' : 'active';

    const width = positive(r.width);
    const length = positive(r.length);
    const flags = rotate === 'force' ? ['rotate-force'] : rotate === 'true' ? ['rotate'] : [];
    const row: CellValue[] = new Array(PRODUCT_WIDTH).fill('');
    row[PRODUCT_COLS.productId] = id;
    row[PRODUCT_COLS.handle] = slug;
    row[PRODUCT_COLS.title] = name;
    row[PRODUCT_COLS.tags] = [...tagList, ...flags].join(', ');
    row[PRODUCT_COLS.published] = status === 'active';
    row[PRODUCT_COLS.option1Name] = 'Title';
    row[PRODUCT_COLS.option1Value] = 'Default Title';
    row[PRODUCT_COLS.variantInventoryQty] = 1;
    row[PRODUCT_COLS.variantInventoryPolicy] = 'deny';
    row[PRODUCT_COLS.variantPrice] = positive(r.price);
    row[PRODUCT_COLS.variantRequiresShipping] = true;
    row[PRODUCT_COLS.variantTaxable] = true;
    row[PRODUCT_COLS.imageSrc] = photos[0] ?? '';
    row[PRODUCT_COLS.imageAltText] = name;
    row[PRODUCT_COLS.status] = status;
    row[PRODUCT_COLS.widthCm] = width;
    row[PRODUCT_COLS.lengthCm] = length;
    row[PRODUCT_COLS.sizeLabel] = sizeLabelOf(
      typeof width === 'number' ? width : undefined,
      typeof length === 'number' ? length : undefined,
    );
    row[PRODUCT_COLS.sizeBand] = sizeBandOf(
      typeof width === 'number' ? width : undefined,
      typeof length === 'number' ? length : undefined,
    );
    row[PRODUCT_COLS.material] = (r.material ?? '').trim();
    row[PRODUCT_COLS.method] = (r.method ?? '').trim();
    row[PRODUCT_COLS.origin] = (r.origin ?? '').trim();
    row[PRODUCT_COLS.age] = fixAge((r.age ?? '').trim());
    row[PRODUCT_COLS.collection] = collection;
    row[PRODUCT_COLS.scrapedAt] = now;
    row[PRODUCT_COLS.commitStatus] = photos.length ? 'complete' : '';
    // Every image the legacy page knew about; Image Src carries only the primary (brief §9), so the
    // rest are noted for the owner until the Drive folder is created.
    if (photos.length > 1) row[PRODUCT_COLS.internalNotes] = `extra photos: ${photos.slice(1).join(' ')}`;
    products.push(row);
  }

  const collections: CellValue[][] = [];
  let order = 1;
  for (const name of REFERENCE_COLLECTION_ORDER) {
    collections.push([slugify(name), name, slugify(name), '', now, '', order++]);
    collectionsPresent.delete(name.toLowerCase());
  }
  for (const name of [...collectionsPresent.values()].sort((a, b) => a.localeCompare(b))) {
    collections.push([slugify(name), name, slugify(name), '', now, '', order++]);
    notes.push(`collection "${name}" is not in the reference list; appended with sort_order ${order - 1}`);
  }

  const tags: CellValue[][] = [...tagNames.values()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => [slugify(name), slugify(name), name, '']);

  return { products, collections, tags, notes };
}
