// JSON-LD `Product` extraction — rung 2 of the brief's §11 extraction ladder (Shopify JSON →
// **JSON-LD** → OG/microdata → per-source selectors). Pure: takes a cheerio document, walks every
// `application/ld+json` block (arrays and `@graph` included) and flattens the first Product/Offer.
// Re-exported from `generic.ts` so the older import path keeps working.
import type { CheerioAPI } from 'cheerio';
import { collapse } from './text.ts';
import { normaliseCurrency, parseAmount } from './money.ts';

export interface LdProduct {
  name?: string;
  description?: string;
  sku?: string;
  price?: number;
  currency?: string;
  images: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return collapse(v) || undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

/** Every object node found in the page's ld+json scripts (arrays and `@graph` walked). */
export function jsonLdNodes($: CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
    } else if (isRecord(node)) {
      out.push(node);
      if (node['@graph'] !== undefined) walk(node['@graph']);
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    try {
      walk(JSON.parse(raw));
    } catch {
      // A broken block is not our problem: the ladder has other rungs.
    }
  });
  return out;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t === type;
  return Array.isArray(t) && t.includes(type);
}

function imageList(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
  const out: string[] = [];
  for (const item of list) {
    const url =
      typeof item === 'string' ? item : isRecord(item) ? str(item.url ?? item.contentUrl) : undefined;
    if (url) out.push(url);
  }
  return out;
}

/** The first `@type: Product` node with its first Offer flattened. */
export function findLdProduct(nodes: Record<string, unknown>[]): LdProduct | undefined {
  const product = nodes.find((n) => hasType(n, 'Product'));
  if (!product) return undefined;
  const offersRaw = product.offers;
  const offer = Array.isArray(offersRaw)
    ? offersRaw.find(isRecord)
    : isRecord(offersRaw)
      ? offersRaw
      : undefined;
  const priceRaw = offer?.price ?? offer?.lowPrice;
  const price = typeof priceRaw === 'number' ? priceRaw : parseAmount(str(priceRaw));
  return {
    name: str(product.name),
    description:
      typeof product.description === 'string' ? product.description.trim() || undefined : undefined,
    sku: str(product.sku) ?? str(offer?.sku),
    price,
    currency: normaliseCurrency(offer?.priceCurrency),
    images: imageList(product.image),
  };
}

/** Convenience: rung 2 straight off a loaded document. */
export function extractJsonLd($: CheerioAPI): LdProduct | undefined {
  return findLdProduct(jsonLdNodes($));
}
