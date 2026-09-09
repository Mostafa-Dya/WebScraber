// ecarpetgallery.com adapter (docs/ADMIN_SPEC.md §4.4): Magento 2 / Hyvä behind Cloudflare, product
// page fully server-rendered. Pure: takes the fetched HTML, returns a ScrapedRug without pricing
// derivations. Challenge detection lives here too so the orchestrator can decide on the fallback.
import { ECG_BASE } from './detect.ts';
import { collapse, dedupeStrings, extractGeneric, loadHtml, splitList } from './generic.ts';
import { isAllowedImageUrl } from './guard.ts';
import { parseMoney } from './money.ts';
import { orderPair, parseFeetInchesSide, parseSize } from './size.ts';
import { resolvePhotos } from './photos.ts';
import type { FieldStatusMap, HeaderReader, ScrapedPhoto, ScrapedRug } from './types.ts';

/** The block page (`Attention Required! | Cloudflare`, ~5.5 KB, 403) or the JS challenge interstitial. */
const CHALLENGE_TITLE_RE = /<title>[^<]*(?:Attention Required!\s*\|\s*Cloudflare|Just a moment)/i;
const CHALLENGE_MARKER_RE = /id="cf-error-details"|window\._cf_chl_opt|data-translate="block_headline"/;

export function isCloudflareChallenge(status: number, body: string, headers?: HeaderReader): boolean {
  if (headers?.get('cf-mitigated') === 'challenge') return true;
  const head = body.slice(0, 20_000);
  if (CHALLENGE_TITLE_RE.test(head)) return true;
  return (status === 403 || status === 503) && CHALLENGE_MARKER_RE.test(head);
}

/** The gallery component's inline JSON: `images: [{ thumb, img, full, caption, … }, …]`. */
export const ECG_GALLERY_RE = /\bimages:\s*(\[[\s\S]*?\])\s*[,}]/;
const CACHE_SEGMENT_RE = /\/cache\/[0-9a-f]{32}\//;

/**
 * GTM dataLayer `item_sku` of the `view_item` event → else the URL's sku → else the first item_sku
 * on the page (related products carry their own, so they never override a known URL sku).
 */
export function ecgSku(html: string, urlSku: string): string {
  const view = /"event":"view_item[^"]*"[\s\S]{0,2000}?"item_sku":"(\d+)"/.exec(html)?.[1];
  if (view) return view;
  if (urlSku) return urlSku;
  return /"item_sku":"(\d+)"/.exec(html)?.[1] ?? '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Full-size gallery images (`full` preferred), with the un-cached original as an alternative. */
export function ecgGalleryPhotos(html: string, max = 12): ScrapedPhoto[] {
  const raw = ECG_GALLERY_RE.exec(html)?.[1];
  if (!raw) return [];
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  const photos: ScrapedPhoto[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (str(entry.type) && entry.type !== 'image') continue;
    const url = str(entry.full) ?? str(entry.img) ?? str(entry.thumb);
    if (!url || !isAllowedImageUrl(url)) continue;
    const original = url.replace(CACHE_SEGMENT_RE, '/');
    if (seen.has(original)) continue;
    seen.add(original);
    photos.push({ url, original: original !== url ? original : undefined });
    if (photos.length >= max) break;
  }
  return photos;
}

const TAG_ROWS: readonly string[] = ['collection', 'style', 'pattern', 'color', 'rug type'];
const IGNORED_ROWS = new Set(['new', 'remarks']);

/** `table.additional-attributes` rows → lowercased label → value (junk rows dropped). */
export function ecgSpecRows(html: string): Map<string, string> {
  const $ = loadHtml(html);
  const specs = new Map<string, string>();
  $('table.additional-attributes tr').each((_, tr) => {
    const label = collapse($(tr).find('th').first().text()).toLowerCase();
    const value = collapse($(tr).find('td').first().text());
    if (!label || !value || IGNORED_ROWS.has(label) || value.toUpperCase() === 'NA') return;
    if (!specs.has(label)) specs.set(label, value);
  });
  return specs;
}

/** Builds the ScrapedRug for an ECG product page (the caller has already ruled out challenge pages). */
export function parseEcg(det: { sku: string; urlKey: string }, html: string): ScrapedRug {
  const $ = loadHtml(html);
  const g = extractGeneric($);
  const warnings: string[] = [];

  const supplierTitle =
    collapse(g.title?.replace(/\s*\|\s*ECARPETGALLERY\s*$/i, '')) ||
    collapse($('h1.page-title').first().text());
  const description =
    collapse(g.description) || collapse($('.product.attribute .value').first().text()) || undefined;

  let seenPrice = g.price;
  let seenCurrency = g.currency;
  if (seenPrice === undefined) {
    const money = parseMoney($('.pricing-div .final-price').first().text());
    if (money) {
      seenPrice = money.amount;
      seenCurrency ??= money.currency;
    }
  }
  let currencyAssumed = false;
  if (seenPrice !== undefined && !seenCurrency) {
    seenCurrency = 'USD';
    currencyAssumed = true;
    warnings.push('currency not stated on the page; USD assumed (us_en store)');
  }
  const retailEstimate = collapse($('.pricing-div .retail-price').first().text()) || undefined;

  const specs = ecgSpecRows(html);
  const widthRaw = specs.get('width');
  const lengthRaw = specs.get('length');
  const w = parseFeetInchesSide(widthRaw);
  const l = parseFeetInchesSide(lengthRaw);
  let widthCm: number | undefined;
  let lengthCm: number | undefined;
  let sizeRaw: string | undefined;
  // brief §11 field status: ECG never prints cm, so every size we produce is derived.
  const fieldStatus: Partial<FieldStatusMap> = {};
  if (w && l) {
    const ordered = orderPair(w, l);
    widthCm = ordered.widthCm;
    lengthCm = ordered.lengthCm;
    sizeRaw = `${widthRaw} x ${lengthRaw}`;
    fieldStatus.widthCm = 'inferred';
    fieldStatus.lengthCm = 'inferred';
    fieldStatus.sizeRaw = 'inferred';
    warnings.push(
      `no cm on page; converted ${widthRaw} × ${lengthRaw} → ${widthCm} × ${lengthCm} cm${ordered.swapped ? ' (swapped so that width ≤ length)' : ''}`,
    );
  } else {
    const size = parseSize(supplierTitle);
    if (size) {
      widthCm = size.widthCm;
      lengthCm = size.lengthCm;
      sizeRaw = size.sizeRaw;
      // Read out of the marketing title rather than the spec table.
      fieldStatus.widthCm = 'inferred';
      fieldStatus.lengthCm = 'inferred';
      fieldStatus.sizeRaw = 'inferred';
      if (size.note) warnings.push(size.note);
    }
  }

  const tagsSuggested = dedupeStrings(
    TAG_ROWS.flatMap((row) => splitList(specs.get(row))),
    20,
  );

  // Photo-first (brief §11): the gallery's first `full` image is the primary, og:image is the last
  // resort, and a gallery that fails to parse never costs us the photo the form paints first.
  const resolved = resolvePhotos(() => ecgGalleryPhotos(html), { fallback: g.image });
  if (resolved.warning) warnings.push(resolved.warning);

  return {
    supplier: 'ecarpetgallery',
    supplierRef: ecgSku(html, det.sku),
    sourceUrl: `${ECG_BASE}${det.urlKey}`,
    supplierTitle,
    description,
    widthCm,
    lengthCm,
    sizeRaw,
    material: specs.get('material'),
    method: specs.get('weave'),
    age: specs.get('age'),
    origin: specs.get('made in'),
    seenPrice,
    seenCurrency,
    currencyAssumed,
    retailEstimate,
    tagsSuggested,
    photos: resolved.photos,
    primaryImage: resolved.primaryImage,
    warnings,
    fieldStatus,
  };
}
