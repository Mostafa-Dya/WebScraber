// karavanrug.com adapter — the host-specific (last) rung of the brief's §11 ladder. Shopify,
// server-rendered, no bot protection (docs/ADMIN_SPEC.md §4.4). The generic Shopify product parsing
// now lives in `shopify.ts` (ladder rung 1) and is re-exported here under the historic names; what
// stays is what is specific to KV: the "Item Details" spec block, the method keyword fallback, the
// tag tidying and the JSON-LD/OG currency read. Pure: takes the fetched bodies, returns a ScrapedRug.
import { KV_BASE } from './detect.ts';
import {
  collapse,
  dedupeStrings,
  extractGeneric,
  firstKeyword,
  htmlToText,
  labelValueLines,
  loadHtml,
  splitList,
  tidyTag,
} from './generic.ts';
import { normaliseCurrency } from './money.ts';
import { resolvePhotos } from './photos.ts';
import {
  parseShopifyProduct,
  shopifyPhotos,
  shopifyPrice,
  withWidth,
  type ShopifyProduct,
} from './shopify.ts';
import { parseSize } from './size.ts';
import type { FieldStatusMap, ScrapedRug } from './types.ts';

export { withWidth };
/** Historic names: KV's product payload is an ordinary Shopify one (`shopify.ts`). */
export const parseKaravanProduct = parseShopifyProduct;
export const karavanPhotos = shopifyPhotos;
export type KaravanProduct = ShopifyProduct;

export interface KaravanSources {
  /** Body of `/products/<handle>.js` (JSON). */
  js?: string;
  /** Body of `/products/<handle>.json` (JSON, `{ product: … }`). */
  json?: string;
  /** Body of `/products/<handle>` (HTML, JSON-LD). */
  html?: string;
}

export const KV_METHOD_KEYWORDS: readonly string[] = [
  'Kilim',
  'Cicim',
  'Soumak',
  'Tulu',
  'Handwoven',
  'Hand-knotted',
];

/** Headings that KV prints on their own line with the value on the next (`Size` / `305 x 370 cm …`). */
const KV_HEADINGS: readonly string[] = [
  'stock code',
  'size',
  'material',
  'technique',
  'age',
  'origin',
  'colors',
  'colours',
  'style',
  'dyes',
  'condition',
];

export const DESCRIPTION_MAX = 4000;

/** `Label: value` lines plus KV's heading-on-its-own-line blocks. */
export function parseKaravanSpecs(descriptionHtml: string): { text: string; specs: Map<string, string> } {
  const text = htmlToText(descriptionHtml);
  const specs = labelValueLines(text);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const heading = collapse(lines[i]).replace(/:$/, '').toLowerCase();
    const key = KV_HEADINGS.find(
      (h) => heading === h || (h === 'material' && heading.startsWith('material')),
    );
    const next = collapse(lines[i + 1]);
    if (key && next && !specs.has(key)) specs.set(key, next);
  }
  return { text, specs };
}

/**
 * Builds the ScrapedRug for a KV handle from whichever bodies were fetched. Undefined when no product
 * body parsed. `seenCurrency` comes from the HTML's JSON-LD / og meta, else USD is assumed and flagged.
 */
export function parseKaravan(handle: string, src: KaravanSources): ScrapedRug | undefined {
  const product = parseKaravanProduct(src.js, src.json);
  if (!product) return undefined;
  const warnings: string[] = [];
  const { text, specs } = parseKaravanSpecs(product.descriptionHtml);

  // brief §11 field status: anything KV did not print as a labelled spec is marked `inferred`.
  const fieldStatus: Partial<FieldStatusMap> = {};
  let seenCurrency: string | undefined;
  let currencyAssumed = false;
  let ldSku: string | undefined;
  let ldPrice: number | undefined;
  let ogImage: string | undefined;
  if (src.html) {
    const g = extractGeneric(loadHtml(src.html));
    seenCurrency = g.ld?.currency ?? g.currency;
    ldSku = g.ld?.sku;
    ldPrice = g.ld?.price ?? g.price;
    ogImage = g.image;
  }
  if (!seenCurrency) {
    seenCurrency = 'USD';
    currencyAssumed = true;
    warnings.push(
      src.html
        ? 'currency not stated on the product page; USD assumed'
        : 'product page not read; currency USD assumed',
    );
  }
  seenCurrency = normaliseCurrency(seenCurrency) ?? 'USD';

  const seenPrice = shopifyPrice(product) ?? ldPrice;

  const stockCode = specs.get('stock code');
  const supplierRef = stockCode ?? product.variantSku ?? ldSku ?? handle;
  // No Stock Code on the page: the variant sku, the JSON-LD sku or the handle stands in for it.
  if (!stockCode) fieldStatus.supplierRef = 'inferred';

  const sizeText = specs.get('size');
  const sizeFromSpec = parseSize(sizeText);
  const size = sizeFromSpec ?? parseSize(product.title) ?? parseSize(text);
  if (size && (!sizeFromSpec || size.source !== 'cm')) {
    // Read out of the title or the description, or converted from feet — not a stated cm pair.
    fieldStatus.widthCm = 'inferred';
    fieldStatus.lengthCm = 'inferred';
    fieldStatus.sizeRaw = 'inferred';
  }
  if (size?.note) warnings.push(size.note);

  const material = specs.get('material');
  const technique = specs.get('technique');
  const method = technique ?? firstKeyword(`${product.title}\n${text}`, KV_METHOD_KEYWORDS) ?? undefined;
  // Guessed from a keyword in the title/description rather than read from the Technique row.
  if (!technique && method) fieldStatus.method = 'inferred';

  for (const key of ['dyes', 'condition'] as const) {
    const v = specs.get(key);
    if (v) warnings.push(`${key === 'dyes' ? 'Dyes' : 'Condition'}: ${v}`);
  }

  const tagsSuggested = dedupeStrings(
    [
      ...splitList(specs.get('colors') ?? specs.get('colours')),
      ...splitList(specs.get('style')),
      ...product.tags,
    ]
      .map(tidyTag)
      .filter((t) => t.toLowerCase() !== 'rugs'),
    20,
  );

  // Photo-first (brief §11): the Shopify media list is the gallery, og:image the last resort.
  const resolved = resolvePhotos(() => shopifyPhotos(product), { fallback: ogImage });
  if (resolved.warning) warnings.push(resolved.warning);

  let description: string | undefined = text || undefined;
  if (description && description.length > DESCRIPTION_MAX) {
    description = description.slice(0, DESCRIPTION_MAX);
    warnings.push(`description truncated to ${DESCRIPTION_MAX} characters`);
  }

  return {
    supplier: 'karavanrug',
    supplierRef: collapse(supplierRef),
    sourceUrl: `${KV_BASE}${handle}`,
    supplierTitle: product.title,
    description,
    widthCm: size?.widthCm,
    lengthCm: size?.lengthCm,
    sizeRaw: sizeText ?? size?.sizeRaw,
    material,
    method,
    age: specs.get('age'),
    origin: specs.get('origin'),
    seenPrice,
    seenCurrency,
    currencyAssumed,
    tagsSuggested,
    photos: resolved.photos,
    primaryImage: resolved.primaryImage,
    warnings,
    fieldStatus,
  };
}
