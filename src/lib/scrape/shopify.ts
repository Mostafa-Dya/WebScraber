// Generic Shopify product JSON — rung 1 of the brief's §11 extraction ladder, tried for every URL
// before JSON-LD, OG/microdata and the per-source selectors, because most rug suppliers are Shopify
// stores. Two endpoints per product: the documented Ajax route `/products/<handle>.js` (price in
// cents) and `<url>.json` (`{ product: … }`, variant price as `'910.00'`). Pure parsing only; the
// fetching lives in `index.ts` so every request still goes through the guarded fetch layer.
import { isAllowedImageUrl } from './guard.ts';
import { dedupeStrings, htmlToText, splitList, tidyTag } from './generic.ts';
import type { RungDraft } from './ladder.ts';
import { parseSize } from './size.ts';
import { collapse } from './text.ts';
import type { ScrapedPhoto } from './types.ts';

/** Shopify's own product route; a URL shaped like this is worth probing for the JSON endpoints. */
export const SHOPIFY_PRODUCT_PATH_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/([a-z0-9._-]+)\/?$/i;

/**
 * Hosts known **not** to be Shopify, so rung 1 is skipped rather than spending a request (and a
 * politeness gap) on a guaranteed 404. ecarpetgallery.com is Magento 2 / Hyvä (ADMIN_SPEC §4.4).
 */
export const NON_SHOPIFY_HOSTS: readonly string[] = ['ecarpetgallery.com', 'www.ecarpetgallery.com'];

export interface ShopifyProduct {
  title: string;
  handle: string;
  descriptionHtml: string;
  tags: string[];
  /** `.js` price in cents. */
  priceCents?: number;
  /** `.json` variant price as a number (`'910.00'` → 910). */
  variantPrice?: number;
  variantSku?: string;
  images: string[];
  media: Array<{ src: string; width?: number; height?: number }>;
  source: 'js' | 'json';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
function tagList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((t): t is string => typeof t === 'string');
  if (typeof v === 'string') return splitList(v);
  return [];
}
function absolute(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src;
}

function imageEntries(v: unknown): Array<{ src: string; width?: number; height?: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ src: string; width?: number; height?: number }> = [];
  for (const item of v) {
    if (typeof item === 'string') out.push({ src: absolute(item) });
    else if (isRecord(item)) {
      if (str(item.media_type) && item.media_type !== 'image') continue;
      const src = str(item.src) ?? (isRecord(item.preview_image) ? str(item.preview_image.src) : undefined);
      if (src) out.push({ src: absolute(src), width: num(item.width), height: num(item.height) });
    }
  }
  return out;
}

/** True for a body that could be a Shopify JSON payload (cheap check before parsing). */
export function looksLikeJson(body: string | undefined): boolean {
  if (!body) return false;
  const head = body.trimStart();
  return head.startsWith('{') || head.startsWith('[');
}

/** The two rung-1 endpoints for a normalised product URL: `<url>.js` and `<url>.json`. */
export function shopifyEndpoints(productUrl: string): { js: string; json: string } {
  const base = productUrl.replace(/\/+$/, '');
  return { js: `${base}.js`, json: `${base}.json` };
}

/** `/products/<handle>` (optionally under a locale prefix) → the handle; undefined otherwise. */
export function shopifyHandle(productUrl: string): string | undefined {
  try {
    return SHOPIFY_PRODUCT_PATH_RE.exec(new URL(productUrl).pathname)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Whether rung 1 should spend a request on this URL: every host except the ones we have verified are
 * not Shopify. A URL that is not shaped like a Shopify product route is still probed (stores can
 * rewrite the route), which is what "Shopify JSON first for every URL" means in practice.
 */
export function shouldProbeShopify(productUrl: string): boolean {
  try {
    return !NON_SHOPIFY_HOSTS.includes(new URL(productUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Parses the `.js` body, else the `.json` body; undefined when neither is a Shopify product. */
export function parseShopifyProduct(js?: string, json?: string): ShopifyProduct | undefined {
  if (js) {
    try {
      const p: unknown = JSON.parse(js);
      if (isRecord(p) && str(p.title) && str(p.handle)) {
        const variant = Array.isArray(p.variants) ? p.variants.find(isRecord) : undefined;
        return {
          title: collapse(str(p.title)),
          handle: str(p.handle) ?? '',
          descriptionHtml: str(p.description) ?? '',
          tags: tagList(p.tags),
          priceCents: num(p.price) ?? (variant ? num(variant.price) : undefined),
          variantSku: variant ? str(variant.sku) : undefined,
          images: tagList(p.images).map(absolute),
          media: imageEntries(p.media),
          source: 'js',
        };
      }
    } catch {
      // fall through to .json
    }
  }
  if (json) {
    try {
      const wrapper: unknown = JSON.parse(json);
      const p = isRecord(wrapper) && isRecord(wrapper.product) ? wrapper.product : undefined;
      if (p && str(p.title) && str(p.handle)) {
        const variant = Array.isArray(p.variants) ? p.variants.find(isRecord) : undefined;
        return {
          title: collapse(str(p.title)),
          handle: str(p.handle) ?? '',
          descriptionHtml: str(p.body_html) ?? '',
          tags: tagList(p.tags),
          variantPrice: variant ? num(variant.price) : undefined,
          variantSku: variant ? str(variant.sku) : undefined,
          images: imageEntries(p.images).map((i) => i.src),
          media: imageEntries(p.images),
          source: 'json',
        };
      }
    } catch {
      // neither body parsed
    }
  }
  return undefined;
}

/** Shopify CDN resize parameter for the Drive import; the original is kept as `original`. */
export function withWidth(src: string, width: number): string {
  return `${src}${src.includes('?') ? '&' : '?'}width=${width}`;
}

/** Full-size candidates from `media[]` (else `images[]`), foreign hosts dropped, de-duplicated. */
export function shopifyPhotos(product: ShopifyProduct, max = 12): ScrapedPhoto[] {
  const photos: ScrapedPhoto[] = [];
  const seen = new Set<string>();
  const push = (src: string, width?: number, height?: number): void => {
    if (photos.length >= max || seen.has(src) || !isAllowedImageUrl(src)) return;
    seen.add(src);
    photos.push({ url: withWidth(src, 1600), original: src, width, height });
  };
  for (const m of product.media) push(m.src, m.width, m.height);
  if (!photos.length) for (const src of product.images) push(src);
  return photos;
}

/** `price` in major units: cents from `.js`, the variant price from `.json`. */
export function shopifyPrice(product: ShopifyProduct): number | undefined {
  if (product.priceCents !== undefined) return Math.round(product.priceCents) / 100;
  return product.variantPrice;
}

/**
 * Rung 1 of the brief's §11 ladder as a draft the merge can consume. Size is read out of the title
 * and the description, so it is always marked `inferred`; Shopify has no size field of its own.
 */
export function shopifyRung(product: ShopifyProduct, max = 12): RungDraft {
  const text = htmlToText(product.descriptionHtml);
  const size = parseSize(product.title) ?? parseSize(text);
  return {
    rung: 'shopify',
    supplierRef: product.variantSku,
    supplierTitle: product.title,
    description: text || undefined,
    seenPrice: shopifyPrice(product),
    widthCm: size?.widthCm,
    lengthCm: size?.lengthCm,
    sizeRaw: size?.sizeRaw,
    tagsSuggested: dedupeStrings(
      product.tags.map(tidyTag).filter((t) => t.toLowerCase() !== 'rugs'),
      20,
    ),
    photos: shopifyPhotos(product, max),
    warnings: size?.note ? [size.note] : undefined,
    inferred: ['widthCm', 'lengthCm', 'sizeRaw'],
  };
}
