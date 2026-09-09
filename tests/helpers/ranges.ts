// Builds the READ_RANGES value ranges (with header rows) for tests.
//
// `rugRow()` still takes the pre-brief logical keys (id, name, collection, tags, photos, width_cm,
// …) and maps them onto the Products tab's Shopify columns, so tests read as they always did.
// `likes` / `dislikes` are no longer stored: the helper stashes them on the row and `rangesWith`
// synthesises the matching append-only Reactions rows, which is what the site now derives counts
// from.
import type { CellValue, ValueRange } from '../../src/lib/sheets/client.ts';
import { HEADERS, PRODUCT_COLS, PRODUCT_WIDTH, READ_RANGES } from '../../src/lib/sheets/contract.ts';
import { sizeBandOf, sizeLabelOf } from '../../src/lib/size.ts';

const COUNTS = Symbol.for('sl.test.counts');

interface Counts {
  id: string;
  likes: number;
  dislikes: number;
}

export function rugRow(overrides: Record<string, CellValue> = {}): CellValue[] {
  const base: Record<string, CellValue> = {
    id: 'SL-021',
    slug: '',
    name: 'Winks',
    description: '',
    collection: 'Kilims',
    tags: 'Kilim|Denizli|Plant Dyes',
    photos: 'https://drive.google.com/file/d/1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb/view',
    width_cm: 135,
    length_cm: 190,
    material: '100% Wool ',
    age: 'Modern',
    origin: 'Denizli, Turkey ',
    price_usd: 576,
    rotate: '',
    featured: '',
    status: '',
    likes: 3,
    dislikes: 1,
    rating: 3.75,
    created_at: '',
    updated_at: '',
    method: 'Hand-woven',
    pile: '',
    shape: '',
    source_url: '',
    supplier: '',
    supplier_ref: '',
    notes: '',
  };
  Object.assign(base, overrides);

  const str = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v));
  const numOrBlank = (v: CellValue | undefined): CellValue =>
    typeof v === 'number' ? v : v === undefined ? '' : v;
  const width = typeof base.width_cm === 'number' ? base.width_cm : undefined;
  const length = typeof base.length_cm === 'number' ? base.length_cm : undefined;
  // `featured` and `rotate` have no Shopify column: they ride on Tags (see parse.ts flagsFromTags).
  const flags: string[] = [];
  if (base.featured === true || base.featured === 'TRUE' || base.featured === 'true') flags.push('featured');
  if (str(base.rotate).toLowerCase() === 'force') flags.push('rotate-force');
  else if (str(base.rotate).toLowerCase() === 'true') flags.push('rotate');
  const tags = [
    ...str(base.tags)
      .split(/[|,]/)
      .map((t) => t.trim())
      .filter(Boolean),
    ...flags,
  ].join(', ');
  const status = str(base.status) || 'active';

  const row: CellValue[] = new Array(PRODUCT_WIDTH).fill('');
  row[PRODUCT_COLS.productId] = base.id ?? '';
  row[PRODUCT_COLS.handle] = base.slug ?? '';
  row[PRODUCT_COLS.title] = base.name ?? '';
  row[PRODUCT_COLS.bodyHtml] = base.description ?? '';
  row[PRODUCT_COLS.tags] = tags;
  row[PRODUCT_COLS.published] = status === 'active';
  row[PRODUCT_COLS.variantSku] = base.supplier_ref ?? '';
  row[PRODUCT_COLS.variantPrice] = numOrBlank(base.price_usd);
  row[PRODUCT_COLS.imageSrc] = str(base.photos).split('|')[0] ?? '';
  row[PRODUCT_COLS.imageAltText] = base.name ?? '';
  row[PRODUCT_COLS.status] = base.status ?? '';
  row[PRODUCT_COLS.widthCm] = numOrBlank(base.width_cm);
  row[PRODUCT_COLS.lengthCm] = numOrBlank(base.length_cm);
  row[PRODUCT_COLS.sizeLabel] = sizeLabelOf(width, length);
  row[PRODUCT_COLS.sizeBand] = sizeBandOf(width, length);
  row[PRODUCT_COLS.material] = base.material ?? '';
  row[PRODUCT_COLS.method] = base.method ?? '';
  row[PRODUCT_COLS.origin] = base.origin ?? '';
  row[PRODUCT_COLS.age] = base.age ?? '';
  row[PRODUCT_COLS.pile] = base.pile ?? '';
  row[PRODUCT_COLS.shape] = base.shape ?? '';
  row[PRODUCT_COLS.collection] = base.collection ?? '';
  row[PRODUCT_COLS.sourceUrl] = base.source_url ?? '';
  row[PRODUCT_COLS.sourceSite] = base.supplier ?? '';
  row[PRODUCT_COLS.scrapedAt] = base.created_at ?? '';
  row[PRODUCT_COLS.internalNotes] = base.notes ?? '';

  const likes = typeof base.likes === 'number' ? base.likes : 0;
  const dislikes = typeof base.dislikes === 'number' ? base.dislikes : 0;
  if (likes || dislikes) {
    Object.defineProperty(row, COUNTS, {
      value: { id: str(base.id), likes, dislikes } satisfies Counts,
      enumerable: false,
    });
  }
  return row;
}

/** One synthetic customer per like/dislike a fixture row asks for, newest-first. */
function reactionsFor(rows: CellValue[][]): CellValue[][] {
  const out: CellValue[][] = [];
  let n = 0;
  for (const row of rows) {
    const counts = (row as unknown as Record<symbol, Counts | undefined>)[COUNTS];
    if (!counts) continue;
    for (let i = 0; i < counts.likes; i++)
      out.push([`e${++n}`, `fixture-l${i}-${counts.id.toLowerCase()}`, counts.id, 'like', 'card', '']);
    for (let i = 0; i < counts.dislikes; i++)
      out.push([`e${++n}`, `fixture-d${i}-${counts.id.toLowerCase()}`, counts.id, 'dislike', 'detail', '']);
  }
  return out;
}

export interface RangeRows {
  rugs?: CellValue[][];
  collections?: CellValue[][];
  tags?: CellValue[][];
  rates?: CellValue[][];
  /** Reaction rows, newest first. Kept under the old name so existing tests read unchanged. */
  votes?: CellValue[][];
  customers?: CellValue[][];
}

/** The ranges in READ_RANGES order, each starting with its contract header row. */
export function rangesWith(rows: RangeRows = {}): ValueRange[] {
  const products = rows.rugs ?? [];
  const reactions = [...(rows.votes ?? []), ...reactionsFor(products)];
  return [
    { range: READ_RANGES[0], values: [[...HEADERS.Products], ...products] },
    { range: READ_RANGES[1], values: [[...HEADERS.Collections], ...(rows.collections ?? [])] },
    { range: READ_RANGES[2], values: [[...HEADERS.Tags], ...(rows.tags ?? [])] },
    { range: READ_RANGES[3], values: [[...HEADERS.Rates], ...(rows.rates ?? [['USD', 1, '$', '']])] },
    { range: READ_RANGES[4], values: [[...HEADERS.Reactions], ...reactions] },
    { range: READ_RANGES[5], values: [[...HEADERS.Customers], ...(rows.customers ?? [])] },
  ];
}
