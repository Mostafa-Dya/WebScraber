// Generic extractors (docs/ADMIN_SPEC.md §4.4, brief §11 ladder rungs 2-3): OpenGraph/product meta
// and microdata, the JSON-LD rung (re-exported from `jsonld.ts`) and the text heuristics the
// adapters share. cheerio 1.2 is fed our own fetched string only (never its fromURL helper).
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { findLdProduct, jsonLdNodes, type LdProduct } from './jsonld.ts';
import { normaliseCurrency, parseAmount } from './money.ts';
import { collapse } from './text.ts';

export { collapse };
export { findLdProduct, jsonLdNodes, extractJsonLd } from './jsonld.ts';
export type { LdProduct } from './jsonld.ts';

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/** First non-empty `content` among the given meta selectors. */
export function metaContent($: CheerioAPI, ...selectors: string[]): string | undefined {
  for (const sel of selectors) {
    const v = collapse($(sel).first().attr('content'));
    if (v) return v;
  }
  return undefined;
}

export interface GenericExtract {
  title?: string;
  description?: string;
  image?: string;
  price?: number;
  currency?: string;
  sku?: string;
  ld?: LdProduct;
}

/** Ladder rung 3 on its own: OpenGraph / `product:` meta and microdata, with no JSON-LD fallback. */
export function extractOpenGraph($: CheerioAPI): Omit<GenericExtract, 'ld'> {
  const priceMeta = metaContent(
    $,
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[itemprop="price"]',
  );
  const currencyMeta = metaContent(
    $,
    'meta[property="product:price:currency"]',
    'meta[property="og:price:currency"]',
    'meta[itemprop="priceCurrency"]',
  );
  return {
    title: metaContent($, 'meta[property="og:title"]') ?? collapse($('title').first().text()) ?? undefined,
    description: metaContent($, 'meta[property="og:description"]', 'meta[name="description"]'),
    image: metaContent($, 'meta[property="og:image:secure_url"]', 'meta[property="og:image"]'),
    price: parseAmount(priceMeta),
    currency: normaliseCurrency(currencyMeta),
    sku: metaContent($, 'meta[itemprop="sku"]'),
  };
}

/** OG/product meta → microdata → JSON-LD, in the spec's order, for the fields every adapter needs. */
export function extractGeneric($: CheerioAPI): GenericExtract {
  const ld = findLdProduct(jsonLdNodes($));
  const og = extractOpenGraph($);
  return {
    title: og.title ?? ld?.name,
    description: og.description ?? (ld?.description ? collapse(ld.description) : undefined),
    image: og.image ?? ld?.images[0],
    price: og.price ?? ld?.price,
    currency: og.currency ?? ld?.currency,
    sku: og.sku ?? ld?.sku,
    ld,
  };
}

/**
 * HTML fragment → plain text, one line per block (`<br>`, `</p>`, `</div>`, `</li>`, headings…),
 * entities decoded, blank lines dropped.
 */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  const prepared = html
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|ul|ol|table|section|blockquote|dd|dt)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' ');
  const $ = cheerio.load(`<div id="__scrape_root">${prepared}</div>`);
  return $('#__scrape_root')
    .text()
    .split('\n')
    .map((line) => collapse(line))
    .filter(Boolean)
    .join('\n');
}

const LABEL_LINE_RE = /^([A-Za-z][A-Za-z &/()'-]{0,39}?)\s*:\s*(.+)$/;

/** `Label: value` lines → lowercased label → value (first occurrence wins). */
export function labelValueLines(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = LABEL_LINE_RE.exec(line.trim());
    const label = m?.[1] ? collapse(m[1]).toLowerCase() : '';
    const value = m?.[2] ? collapse(m[2]) : '';
    if (label && value && !out.has(label)) out.set(label, value);
  }
  return out;
}

/** First keyword (case-insensitive, hyphen/space tolerant) present in `text`, in its canonical spelling. */
export function firstKeyword(text: string, keywords: readonly string[]): string | undefined {
  const hay = text.toLowerCase();
  for (const kw of keywords) {
    const pattern = kw.toLowerCase().replace(/[-\s]+/g, '[-\\s]?');
    if (new RegExp(`\\b${pattern}\\b`).test(hay)) return kw;
  }
  return undefined;
}

/** Splits a comma / pipe / slash separated value into tidy, non-empty parts. */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*[,|]\s*|\s+\/\s+/)
    .map((v) => collapse(v))
    .filter(Boolean);
}

/** `VINTAGE LARGE RUGS` → `Vintage Large Rugs`; `terracotta` → `Terracotta`; mixed case untouched. */
export function tidyTag(s: string): string {
  const v = collapse(s);
  if (!/[a-z]/i.test(v)) return v;
  if (v === v.toUpperCase())
    return v.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
  if (v === v.toLowerCase()) return v.charAt(0).toUpperCase() + v.slice(1);
  return v;
}

/** Case-insensitive de-duplication preserving first spelling and order; optional cap. */
export function dedupeStrings(list: readonly string[], max = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = collapse(raw);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
