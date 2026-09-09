// URL normalisation and supplier detection (docs/ADMIN_SPEC.md §4.2). The pasted string is never
// fetched: the outbound URLs are rebuilt from `(supplier, urlKey | handle)` against constant hosts.
import { hostnameProblem } from './guard.ts';
import type { DetectError, Detected, ManualEntry, Supplier } from './types.ts';

const ECG_HOSTS: readonly string[] = ['ecarpetgallery.com', 'www.ecarpetgallery.com'];
const KV_HOSTS: readonly string[] = ['karavanrug.com', 'www.karavanrug.com'];

/** `/us_en/red-5x8-andelz-area-rugs-380114` → urlKey + sku (store code optional, forced to us_en). */
export const ECG_PATH_RE = /^\/(?:(us_en|ca_en|eu_en|ca_fr)\/)?([a-z0-9-]+?-(\d{4,}))\/?$/;
/** `/products/<handle>` (Shopify). */
export const KV_PATH_RE = /^\/products\/([a-z0-9-]+)\/?$/;

export const ECG_BASE = 'https://ecarpetgallery.com/us_en/';
export const KV_BASE = 'https://karavanrug.com/products/';

export function supplierForHost(hostname: string): Supplier | undefined {
  const h = hostname.toLowerCase();
  if (ECG_HOSTS.includes(h)) return 'ecarpetgallery';
  if (KV_HOSTS.includes(h)) return 'karavanrug';
  return undefined;
}

/**
 * Parses a pasted supplier link. http is rewritten to https; userinfo, ports, tracking query/hash
 * and anything off the allow-list are refused. Paths are compared lowercased ([assumption]: Magento
 * url keys and Shopify handles are lowercase).
 */
export function detectSupplier(input: string): Detected | DetectError {
  const raw = input.trim();
  if (!raw) return { error: 'invalid_url' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'invalid_url' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return { error: 'invalid_url' };
  if (url.username || url.password || url.port) return { error: 'invalid_url' };
  if (hostnameProblem(url.hostname)) return { error: 'invalid_url' };
  const supplier = supplierForHost(url.hostname);
  if (!supplier) return { error: 'unsupported_host' };
  const path = url.pathname.toLowerCase();
  if (supplier === 'ecarpetgallery') {
    const m = ECG_PATH_RE.exec(path);
    const urlKey = m?.[2];
    const sku = m?.[3];
    if (!urlKey || !sku) return { error: 'invalid_url' };
    const sourceUrl = `${ECG_BASE}${urlKey}`;
    return { supplier, urlKey, sku, supplierRef: sku, sourceUrl, htmlUrl: sourceUrl };
  }
  const m = KV_PATH_RE.exec(path);
  const handle = m?.[1];
  if (!handle) return { error: 'invalid_url' };
  const sourceUrl = `${KV_BASE}${handle}`;
  return {
    supplier,
    handle,
    supplierRef: handle,
    sourceUrl,
    jsUrl: `${sourceUrl}.js`,
    jsonUrl: `${sourceUrl}.json`,
    htmlUrl: sourceUrl,
  };
}

/**
 * Manual-entry pre-fill (§4.8): supplier and reference from the pasted URL alone — the last 4+ digit
 * run for ECG, the handle for KV — even when the link is not a product page. Undefined for other hosts.
 */
export function manualFallback(input: string): ManualEntry | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  const supplier = /(^|\.)ecarpetgallery\.com$/.test(host)
    ? 'ecarpetgallery'
    : /(^|\.)karavanrug\.com$/.test(host)
      ? 'karavanrug'
      : undefined;
  if (!supplier) return undefined;
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  const path = url.pathname;
  const supplierRef =
    supplier === 'ecarpetgallery'
      ? ([...path.matchAll(/\d{4,}/g)].at(-1)?.[0] ?? '')
      : (/\/products\/([a-z0-9-]+)/i.exec(path)?.[1]?.toLowerCase() ?? '');
  return { supplier, supplierRef, sourceUrl: url.toString() };
}

/** The manual pre-fill for a successfully detected link. */
export function manualFromDetected(det: Detected): ManualEntry {
  return { supplier: det.supplier, supplierRef: det.supplierRef, sourceUrl: det.sourceUrl };
}
