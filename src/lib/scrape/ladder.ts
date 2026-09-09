// The brief's §11 extraction ladder and the per-field provenance it produces. Rungs are tried in
// the brief's order — Shopify product JSON → JSON-LD `Product` → OpenGraph/microdata → per-source
// selectors — and the first rung with a value for a field wins. `finaliseScraped` then resolves the
// derivations every `ScrapedProduct` carries: the Size Label and Size Band (both from src/lib/size.ts,
// the one implementation), the primary image, and a `FieldStatus` for every field so the admin form
// can flag what a human still has to check. Pure; no network, no config.
import { sizeBandOf, sizeLabelOf } from '../size.ts';
import type { CheerioAPI } from 'cheerio';
import { collapse, extractOpenGraph, loadHtml } from './generic.ts';
import { isAllowedImageUrl } from './guard.ts';
import { extractJsonLd, type LdProduct } from './jsonld.ts';
import { normaliseCurrency } from './money.ts';
import { primaryImageOf, resolvePhotos } from './photos.ts';
import { parseSize } from './size.ts';
import {
  SCRAPED_FIELDS,
  type FieldStatus,
  type FieldStatusMap,
  type ScrapedField,
  type ScrapedPhoto,
  type ScrapedProduct,
  type ScrapedRug,
  type Supplier,
} from './types.ts';

export type LadderRung = 'shopify' | 'jsonld' | 'opengraph' | 'source';

/** brief §11, in order. `source` (the per-host adapter) is the last, most specific rung. */
export const LADDER_ORDER: readonly LadderRung[] = ['shopify', 'jsonld', 'opengraph', 'source'];

/** The fields a rung can contribute. Identity fields (supplier, sourceUrl) are the caller's. */
export interface RungValues {
  supplierRef?: string;
  supplierTitle?: string;
  description?: string;
  widthCm?: number;
  lengthCm?: number;
  sizeRaw?: string;
  material?: string;
  method?: string;
  age?: string;
  origin?: string;
  seenPrice?: number;
  seenCurrency?: string;
  retailEstimate?: string;
  tagsSuggested?: string[];
  photos?: ScrapedPhoto[];
}

const RUNG_FIELDS = [
  'supplierRef',
  'supplierTitle',
  'description',
  'widthCm',
  'lengthCm',
  'sizeRaw',
  'material',
  'method',
  'age',
  'origin',
  'seenPrice',
  'seenCurrency',
  'retailEstimate',
  'tagsSuggested',
  'photos',
] as const satisfies readonly (keyof RungValues & ScrapedField)[];

export interface RungDraft extends RungValues {
  rung: LadderRung;
  warnings?: string[];
  /** Fields this rung derived rather than read off the page (a size parsed out of a title…). */
  inferred?: readonly ScrapedField[];
}

export interface MergedDraft {
  values: RungValues;
  /** Which rung supplied each field — for the log and for debugging a bad extraction. */
  from: Partial<Record<ScrapedField, LadderRung>>;
  /** `inferred` marks of the winning rung, ready to pass to `finaliseScraped`. */
  inferred: Partial<FieldStatusMap>;
  warnings: string[];
}

/**
 * Indexes a rug by field name. Every `ScrapedField` is a declared key of `ScrapedRug`, so reading and
 * writing through this view is safe; TypeScript just has no index signature for it.
 */
function fieldBag(rug: ScrapedRug): Record<string, unknown> {
  return rug as unknown as Record<string, unknown>;
}

/** True for a value the form would show: a non-blank string, a finite number, a non-empty list. */
export function present(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Merges rung drafts in the brief's ladder order: for each field, the first rung with a value wins. */
export function mergeRungs(drafts: readonly RungDraft[]): MergedDraft {
  const ordered = LADDER_ORDER.flatMap((rung) => drafts.filter((d) => d.rung === rung));
  const values: RungValues = {};
  const from: Partial<Record<ScrapedField, LadderRung>> = {};
  const inferred: Partial<FieldStatusMap> = {};
  const warnings: string[] = [];
  for (const draft of ordered) {
    for (const field of RUNG_FIELDS) {
      if (from[field] !== undefined) continue;
      const value = draft[field];
      if (!present(value)) continue;
      // Same key on both sides of the assignment; the cast keeps the loop generic.
      (values as Record<string, unknown>)[field] = value;
      from[field] = draft.rung;
      if (draft.inferred?.includes(field)) inferred[field] = 'inferred';
    }
    for (const w of draft.warnings ?? []) if (!warnings.includes(w)) warnings.push(w);
  }
  return { values, from, inferred, warnings };
}

/**
 * Fills the blanks of a per-source result from the earlier, generic rungs (the adapter is the most
 * specific reading of the page, so anything it did read wins). Returns the fields that were filled.
 */
export function fillBlanks(rug: ScrapedRug, values: RungValues): ScrapedField[] {
  const filled: ScrapedField[] = [];
  for (const field of RUNG_FIELDS) {
    if (present(fieldBag(rug)[field])) continue;
    const value = values[field];
    if (!present(value)) continue;
    fieldBag(rug)[field] = value;
    filled.push(field);
  }
  return filled;
}

function autoStatus(rug: ScrapedRug, field: ScrapedField, value: unknown): FieldStatus {
  if (!present(value)) return 'missing';
  switch (field) {
    // Always composed, never read off the page.
    case 'sizeLabel':
    case 'sizeBand':
    case 'suggestedRetailUsd':
      return 'inferred';
    case 'seenCurrency':
      return rug.currencyAssumed ? 'inferred' : 'found';
    case 'priceUsd': {
      const currency = normaliseCurrency(rug.seenCurrency) ?? 'USD';
      return rug.currencyAssumed || currency !== 'USD' ? 'inferred' : 'found';
    }
    default:
      return 'found';
  }
}

/** Keeps only the `inferred` marks of a status map, so re-running `finaliseScraped` is idempotent. */
export function inferredHints(map: Partial<FieldStatusMap> | undefined): Partial<FieldStatusMap> {
  const out: Partial<FieldStatusMap> = {};
  for (const [field, status] of Object.entries(map ?? {})) {
    if (status === 'inferred') out[field as ScrapedField] = 'inferred';
  }
  return out;
}

/**
 * Resolves every derivation a `ScrapedProduct` carries and completes its `fieldStatus`: the Size
 * Label and Size Band from `src/lib/size.ts`, the primary image, and `found` / `inferred` / `missing`
 * for all 20 fields. A hint can only mark a present field as `inferred` — a status is never claimed
 * for a value that is not there. Pure and idempotent; the input is not mutated.
 */
export function finaliseScraped(rug: ScrapedRug, hints: Partial<FieldStatusMap> = {}): ScrapedProduct {
  const out: ScrapedProduct = {
    ...rug,
    tagsSuggested: [...rug.tagsSuggested],
    photos: rug.photos.map((p) => ({ ...p })),
    warnings: [...rug.warnings],
    sizeLabel: sizeLabelOf(rug.widthCm, rug.lengthCm),
    sizeBand: sizeBandOf(rug.widthCm, rug.lengthCm),
    primaryImage: primaryImageOf(rug.photos) ?? rug.primaryImage,
    fieldStatus: {} as FieldStatusMap,
  };
  const merged = { ...inferredHints(rug.fieldStatus), ...inferredHints(hints) };
  const status = {} as FieldStatusMap;
  for (const field of SCRAPED_FIELDS) {
    const value = fieldBag(out)[field];
    const auto = autoStatus(out, field, value);
    status[field] = auto !== 'missing' && merged[field] === 'inferred' ? 'inferred' : auto;
  }
  out.fieldStatus = status;
  return out;
}

/**
 * Same treatment for the partial a failed parse still produced (ADMIN_SPEC §4.8: a 422 keeps the
 * form open with whatever was read), so those fields are flagged too. Anything too incomplete to
 * finalise is returned untouched.
 */
export function finalisePartial(data: Partial<ScrapedRug>): Partial<ScrapedRug> {
  const complete =
    typeof data.supplier === 'string' &&
    typeof data.sourceUrl === 'string' &&
    typeof data.supplierRef === 'string' &&
    typeof data.supplierTitle === 'string' &&
    Array.isArray(data.tagsSuggested) &&
    Array.isArray(data.photos) &&
    Array.isArray(data.warnings);
  return complete ? finaliseScraped(data as ScrapedRug) : data;
}

/** Size read out of free text (a title, a description) is derived, never stated — always `inferred`. */
function sizeRungFields(
  ...texts: (string | undefined)[]
): Pick<RungValues, 'widthCm' | 'lengthCm' | 'sizeRaw'> {
  for (const text of texts) {
    const size = parseSize(text);
    if (size) return { widthCm: size.widthCm, lengthCm: size.lengthCm, sizeRaw: size.sizeRaw };
  }
  return {};
}

const SIZE_FIELDS: readonly ScrapedField[] = ['widthCm', 'lengthCm', 'sizeRaw'];

/** Ladder rung 2 for a JSON-LD `Product`. */
export function jsonLdRung(ld: LdProduct): RungDraft {
  const size = sizeRungFields(ld.name, ld.description);
  return {
    rung: 'jsonld',
    supplierRef: ld.sku,
    supplierTitle: ld.name,
    description: collapse(ld.description) || undefined,
    seenPrice: ld.price,
    seenCurrency: ld.currency,
    photos: ld.images.filter(isAllowedImageUrl).map((url) => ({ url })),
    ...size,
    inferred: SIZE_FIELDS,
  };
}

/** Ladder rung 3 for OpenGraph / `product:` meta and microdata. */
export function openGraphRung($: CheerioAPI): RungDraft {
  const og = extractOpenGraph($);
  const size = sizeRungFields(og.title, og.description);
  const primary = og.image && isAllowedImageUrl(og.image) ? [{ url: og.image }] : [];
  return {
    rung: 'opengraph',
    supplierRef: og.sku,
    supplierTitle: og.title,
    description: og.description,
    seenPrice: og.price,
    seenCurrency: og.currency,
    photos: primary,
    ...size,
    inferred: SIZE_FIELDS,
  };
}

/** Rungs 2 and 3 of a fetched HTML page, parsed once. */
export function htmlRungs(html: string): RungDraft[] {
  const $ = loadHtml(html);
  const ld = extractJsonLd($);
  return ld ? [jsonLdRung(ld), openGraphRung($)] : [openGraphRung($)];
}

/** True when the per-source rung left a field the generic rungs could still fill. */
export function hasBlanks(rug: ScrapedRug): boolean {
  return RUNG_FIELDS.some((field) => !present(fieldBag(rug)[field]));
}

/**
 * A `ScrapedRug` built from the generic rungs alone — what a Shopify store with no per-source
 * adapter yields. The identity fields come from the caller (they are never scraped).
 */
export function draftToRug(
  supplier: Supplier,
  sourceUrl: string,
  merged: MergedDraft,
  fallbackRef = '',
): ScrapedRug {
  const values = merged.values;
  const resolved = resolvePhotos(() => values.photos ?? []);
  const warnings = [...merged.warnings];
  if (resolved.warning) warnings.push(resolved.warning);
  const fieldStatus = { ...merged.inferred };
  if (!values.supplierRef && fallbackRef) fieldStatus.supplierRef = 'inferred';
  return {
    supplier,
    supplierRef: values.supplierRef ?? fallbackRef,
    sourceUrl,
    supplierTitle: values.supplierTitle ?? '',
    description: values.description,
    widthCm: values.widthCm,
    lengthCm: values.lengthCm,
    sizeRaw: values.sizeRaw,
    material: values.material,
    method: values.method,
    age: values.age,
    origin: values.origin,
    seenPrice: values.seenPrice,
    seenCurrency: values.seenCurrency,
    retailEstimate: values.retailEstimate,
    tagsSuggested: values.tagsSuggested ?? [],
    photos: resolved.photos,
    primaryImage: resolved.primaryImage,
    warnings,
    fieldStatus,
  };
}
