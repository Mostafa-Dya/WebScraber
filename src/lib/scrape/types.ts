// Supplier scraper types (docs/ADMIN_SPEC.md §4). Pure declarations plus the one error class the
// fetch layer, the adapters and the endpoint share; nothing here touches the network.
import type { Logger } from '../sheets/errors.ts';
import type { ScrapeCache } from './cache.ts';
import type { RobotsCache } from './robots.ts';
import type { HostThrottle } from './throttle.ts';

export type Supplier = 'ecarpetgallery' | 'karavanrug';

/** Which client produced the body: impit (supplier hosts), guarded undici (fallback / Jina). */
export type ScrapeVia = 'impit' | 'undici' | 'jina';

export type ScrapeErrorCode =
  'unsupported_host' | 'invalid_url' | 'blocked' | 'fetch_failed' | 'not_found' | 'parse_failed' | 'timeout';

export interface ScrapedPhoto {
  /** Full-size candidate for the Drive import (ECG `full`, KV `?width=1600`). */
  url: string;
  width?: number;
  height?: number;
  /** The supplier's un-resized original when it differs from `url` (reference only). */
  original?: string;
}

/**
 * Per-field provenance (brief §11): `found` = read directly off the page, `inferred` = derived (a
 * size parsed out of a title, a label composed from width × length, a converted price), `missing` =
 * not obtainable. The admin form flags everything that is not `found`.
 */
export type FieldStatus = 'found' | 'inferred' | 'missing';

/** Every field the form shows and therefore has to be able to flag. */
export const SCRAPED_FIELDS = [
  'supplierRef',
  'supplierTitle',
  'description',
  'widthCm',
  'lengthCm',
  'sizeRaw',
  'sizeLabel',
  'sizeBand',
  'material',
  'method',
  'age',
  'origin',
  'seenPrice',
  'seenCurrency',
  'priceUsd',
  'suggestedRetailUsd',
  'retailEstimate',
  'tagsSuggested',
  'photos',
  'primaryImage',
] as const;

export type ScrapedField = (typeof SCRAPED_FIELDS)[number];

export type FieldStatusMap = Record<ScrapedField, FieldStatus>;

/** ADMIN_SPEC §4.1 — the owner's name, collection and tags are never part of it. */
export interface ScrapedRug {
  supplier: Supplier;
  /** ECG sku (URL suffix / dataLayer item_sku); KV Stock Code (fallback: variant sku). */
  supplierRef: string;
  /** Normalised outbound URL (ECG forced to /us_en/). */
  sourceUrl: string;
  /** Shown as "Supplier calls it: …" (reference only). */
  supplierTitle: string;
  description?: string;
  widthCm?: number;
  lengthCm?: number;
  /** The supplier's own measurement string (legacy size_ft). */
  sizeRaw?: string;
  material?: string;
  method?: string;
  age?: string;
  origin?: string;
  seenPrice?: number;
  seenCurrency?: string;
  currencyAssumed?: boolean;
  /** ECG "Estimated Retail" text, hint only. */
  retailEstimate?: string;
  /** seenPrice converted to USD (Rates tab) when not USD; else = seenPrice. */
  priceUsd?: number;
  /**
   * The retail suggestion: the supplier's own formula where one exists (owner, 2026-09-13), else
   * roundUpToStep(priceUsd × markup). Undefined when neither a formula nor a markup applies.
   */
  suggestedRetailUsd?: number;
  /** Set only when the plain multiplier was used; a formula has no single markup to report. */
  markupApplied?: number;
  /** The formula's name when one was applied, e.g. "karavanrug: base × 0.7 × 2 + band". */
  pricingRule?: string;
  roundStep?: number;
  tagsSuggested: string[];
  /** Full-size candidates, max 12. */
  photos: ScrapedPhoto[];
  /** e.g. `no cm on page; converted 4'3" × 7'5" → 130 × 226 cm`. */
  warnings: string[];
  /** `photos[0].url` — resolved before the rest of the gallery so the form can paint it (brief §11). */
  primaryImage?: string;
  /** `240 × 170 cm` (src/lib/size.ts `sizeLabelOf`); '' when a side is unknown. */
  sizeLabel?: string;
  /** XS/S/M/L/XL from the area in m² (src/lib/size.ts `sizeBandOf`); '' when a side is unknown. */
  sizeBand?: string;
  /**
   * Provenance per field. A producing rung fills in only what it knows (its `inferred` marks);
   * `finaliseScraped` (ladder.ts) completes the map, so everything `scrapeRug` returns is a
   * `ScrapedProduct` with a status for every field.
   */
  fieldStatus?: Partial<FieldStatusMap>;
}

/**
 * The brief's §11 name for a fully derived scrape: a `ScrapedRug` whose derivations are resolved —
 * every field carries a `FieldStatus`, and the Size Label / Size Band columns are ready to commit.
 */
export interface ScrapedProduct extends ScrapedRug {
  fieldStatus: FieldStatusMap;
  sizeLabel: string;
  sizeBand: string;
}

/** What the manual-entry fallback pre-fills from the pasted URL alone (§4.8). */
export interface ManualEntry {
  supplier: Supplier;
  supplierRef: string;
  sourceUrl: string;
}

export interface DetectedEcg {
  supplier: 'ecarpetgallery';
  sku: string;
  urlKey: string;
  supplierRef: string;
  sourceUrl: string;
  htmlUrl: string;
}

export interface DetectedKaravan {
  supplier: 'karavanrug';
  handle: string;
  supplierRef: string;
  sourceUrl: string;
  jsUrl: string;
  jsonUrl: string;
  htmlUrl: string;
}

export type Detected = DetectedEcg | DetectedKaravan;

export interface DetectError {
  error: 'unsupported_host' | 'invalid_url';
}

export interface ScrapeOk {
  ok: true;
  data: ScrapedProduct;
  /** The primary image, repeated at the top level so the UI can paint it first (brief §11). */
  primaryImage?: string;
  via: ScrapeVia;
  cached: boolean;
  ms: number;
}

export interface ScrapeFail {
  ok: false;
  code: ScrapeErrorCode;
  /** Upstream HTTP status when one was seen. */
  status?: number;
  message: string;
  /** Present whenever the supplier is known, so the UI can offer "Enter manually". */
  manual?: ManualEntry;
  /** Whatever a failed parse still extracted (422 parse_failed). */
  data?: Partial<ScrapedRug>;
}

export type ScrapeResult = ScrapeOk | ScrapeFail;

export type TransportClient = 'impit' | 'undici';

/** The only part of a response the fetch layer needs from either client. */
export interface HeaderReader {
  get(name: string): string | null;
}

export interface TransportInit {
  headers: Record<string, string>;
  signal: AbortSignal;
  client: TransportClient;
  logger?: Logger;
}

/** The slice of a WHATWG ReadableStream the fetch layer uses (works for undici's and impit's bodies). */
export interface BodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
}

export interface BodyStream {
  getReader(): BodyReader;
}

export interface TransportResponse {
  status: number;
  headers: HeaderReader;
  body: BodyStream | null;
  /** Which client actually answered (impit may be unavailable and fall back to undici). */
  via?: TransportClient;
  /** Drops the connection early (over-cap bodies, discarded redirect bodies). */
  abort?: () => void;
}

/** One raw request without redirect following: what impit / undici give us. Test hook. */
export type Transport = (url: string, init: TransportInit) => Promise<TransportResponse>;

export interface FetchedText {
  status: number;
  /** Final URL after any (re-validated) redirects. */
  url: string;
  contentType: string;
  body: string;
  hops: number;
  via: ScrapeVia;
  headers: HeaderReader;
}

export interface ScrapeOptions {
  /** Bypass the 15-minute result cache. */
  force?: boolean;
  /** Rates-tab conversion for non-USD prices; undefined when the currency is unknown. */
  convertToUsd?: (amount: number, currency: string) => number | undefined;
  /** Retail multiplier (Settings lookup order, §3.2); unset → no suggestion. */
  markup?: number;
  /** Rounding step for the retail suggestion (§7); default 5. */
  roundStep?: number;
  /** Keyless Jina Reader fallback for ECG (SCRAPE_JINA_FALLBACK); default true. */
  jinaFallback?: boolean;
  logger?: Logger;
  /** Replaces the impit/undici transport (unit tests never hit the network). */
  fetchImpl?: Transport;
  cache?: ScrapeCache;
  now?: () => number;
  /** Whole-scrape deadline; default 20 s. */
  timeoutMs?: number;
  /** Per-request deadline; default 10 s. */
  requestTimeoutMs?: number;
  /** Honour the host's robots.txt (brief §11); default true. */
  respectRobots?: boolean;
  /** Parsed-robots cache; defaults to the process-wide one. */
  robots?: RobotsCache;
  /** 2 s-per-host politeness throttle; defaults to the process-wide one. */
  throttle?: HostThrottle;
}

export class ScrapeError extends Error {
  readonly code: ScrapeErrorCode;
  readonly status: number | undefined;

  constructor(code: ScrapeErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ScrapeError';
    this.code = code;
    this.status = status;
  }
}
