// Supplier scraper entry point (docs/ADMIN_SPEC.md §4, brief §11). `scrapeRug(url)` = normalise →
// robots.txt → fetch through the right client (2 s per host) → the brief's extraction ladder
// (Shopify product JSON → JSON-LD → OpenGraph/microdata → per-source selectors) → pricing
// derivations → Size Label / Size Band / field status → cache. Never imports astro:env: the endpoint
// passes its configuration (markup, rounding step, Jina flag, Rates conversion) through `opts`.
import { silentLogger, type Logger } from '../sheets/errors.ts';
import { DEFAULT_ROUND_STEP } from '../price.ts';
import { SUPPLIER_HOSTS } from './guard.ts';
import { ScrapeCache, defaultScrapeCache } from './cache.ts';
import { detectSupplier, manualFallback, manualFromDetected } from './detect.ts';
import { isCloudflareChallenge, parseEcg } from './ecg.ts';
import { SCRAPE_TIMEOUT_MS, fetchText, toScrapeError, type FetchTextOptions } from './fetch.ts';
import { fetchViaJina } from './jina.ts';
import { parseKaravan } from './karavan.ts';
import {
  draftToRug,
  fillBlanks,
  finalisePartial,
  finaliseScraped,
  hasBlanks,
  htmlRungs,
  mergeRungs,
  type RungDraft,
} from './ladder.ts';
import { priceToUsd } from './money.ts';
import { pricingRuleName, supplierRetail } from '../price.ts';
import { RobotsCache, defaultRobotsCache, isPathAllowed, robotsAllows, type RobotsRules } from './robots.ts';
import { looksLikeJson, parseShopifyProduct, shopifyRung, shouldProbeShopify } from './shopify.ts';
import { HostThrottle, defaultHostThrottle } from './throttle.ts';
import {
  ScrapeError,
  type DetectedEcg,
  type DetectedKaravan,
  type FetchedText,
  type ScrapeFail,
  type ScrapeOptions,
  type ScrapeResult,
  type ScrapeVia,
  type ScrapedProduct,
  type ScrapedRug,
} from './types.ts';

export { detectSupplier, manualFallback, manualFromDetected, ECG_PATH_RE, KV_PATH_RE } from './detect.ts';
export { parseSize, parseFeetInchesSide, ftInToCm, orderPair } from './size.ts';
export {
  parseMoney,
  parseAmount,
  detectCurrency,
  normaliseCurrency,
  priceToUsd,
  retailSuggestion,
  roundUpToStep,
  DEFAULT_ROUND_STEP,
} from './money.ts';
export { ScrapeCache, defaultScrapeCache } from './cache.ts';
export { isAllowedImageUrl, SUPPLIER_HOSTS, IMAGE_HOSTS } from './guard.ts';
export {
  LADDER_ORDER,
  finaliseScraped,
  mergeRungs,
  draftToRug,
  htmlRungs,
  type LadderRung,
  type RungDraft,
} from './ladder.ts';
export {
  RobotsCache,
  defaultRobotsCache,
  parseRobots,
  isPathAllowed,
  robotsAllows,
  ROBOTS_TTL_MS,
} from './robots.ts';
export { HostThrottle, defaultHostThrottle, MIN_HOST_GAP_MS } from './throttle.ts';
export { parseShopifyProduct, shopifyEndpoints, shopifyRung, shouldProbeShopify } from './shopify.ts';
export { resolvePhotos, MAX_PHOTOS } from './photos.ts';
export { ScrapeError, SCRAPED_FIELDS } from './types.ts';
export type {
  Detected,
  DetectError,
  FieldStatus,
  FieldStatusMap,
  ManualEntry,
  ScrapeErrorCode,
  ScrapeFail,
  ScrapeOk,
  ScrapeOptions,
  ScrapeResult,
  ScrapeVia,
  ScrapedField,
  ScrapedPhoto,
  ScrapedProduct,
  ScrapedRug,
  Supplier,
  Transport,
} from './types.ts';

type Attempt =
  { ok: true; data: ScrapedRug; via: ScrapeVia } | (Omit<ScrapeFail, 'manual'> & { via?: ScrapeVia });

interface Ctx {
  fetchOpts: Omit<FetchTextOptions, 'kind'>;
  signal: AbortSignal;
  logger: Logger;
  jina: boolean;
  /** Rules for the target host, already fetched once; used to vet the secondary URLs. */
  robots: RobotsRules;
}

function cloneRug(data: ScrapedRug): ScrapedRug {
  return {
    ...data,
    tagsSuggested: [...data.tagsSuggested],
    photos: data.photos.map((p) => ({ ...p })),
    warnings: [...data.warnings],
    fieldStatus: { ...data.fieldStatus },
  };
}

/**
 * Applies §4.7 / §7 to a raw scrape: USD conversion (Rates tab), then the retail suggestion when a
 * markup is configured, then the derivations every `ScrapedProduct` carries (Size Label, Size Band,
 * primary image, per-field status). Pure; returns a new object.
 */
export function finalisePricing(
  data: ScrapedRug,
  opts: Pick<ScrapeOptions, 'convertToUsd' | 'markup' | 'roundStep'>,
): ScrapedProduct {
  const out = cloneRug(data);
  const { priceUsd, warning } = priceToUsd(out.seenPrice, out.seenCurrency, opts.convertToUsd);
  out.priceUsd = priceUsd;
  if (warning) out.warnings.push(warning);
  const step =
    opts.roundStep !== undefined && Number.isInteger(opts.roundStep) && opts.roundStep > 0
      ? opts.roundStep
      : DEFAULT_ROUND_STEP;
  // Per-supplier formula where the owner supplied one, else the Settings multiplier (ADMIN_SPEC §7).
  const retail = supplierRetail(out.supplier, priceUsd, opts.markup, step);
  const rule = pricingRuleName(out.supplier);
  if (retail !== undefined) {
    out.suggestedRetailUsd = retail;
    // A formula has no single markup, so `markupApplied` stays undefined and `pricingRule` names the
    // rule instead. Reporting an effective ratio here would read as a setting the owner could change.
    out.markupApplied = rule === undefined ? opts.markup : undefined;
    out.pricingRule = rule;
    out.roundStep = step;
  } else {
    out.suggestedRetailUsd = undefined;
    out.markupApplied = undefined;
    out.pricingRule = undefined;
    out.roundStep = undefined;
  }
  return finaliseScraped(out);
}

function fail(
  code: ScrapeFail['code'],
  message: string,
  status?: number,
  data?: Partial<ScrapedRug>,
): Attempt {
  return { ok: false, code, message, status, data };
}

function fromError(e: unknown): Attempt {
  const err = toScrapeError(e);
  return { ok: false, code: err.code, message: err.message, status: err.status };
}

/** robots.txt for the target host was read once; every other outbound URL is vetted against it. */
function robotsRefusal(url: string, ctx: Ctx): Attempt | undefined {
  try {
    const u = new URL(url);
    if (isPathAllowed(ctx.robots, `${u.pathname}${u.search}`)) return undefined;
    ctx.logger.warn('robots.txt disallows the URL', { url });
    return fail('blocked', `robots.txt on ${u.hostname} disallows ${u.pathname}`);
  } catch {
    return undefined;
  }
}

/** Classifies one ECG response: challenge → blocked, 404 → not_found, other 4xx/5xx → fetch_failed, else parse. */
function attemptEcg(det: DetectedEcg, res: FetchedText, ctx: Ctx): Attempt {
  if (isCloudflareChallenge(res.status, res.body, res.headers)) {
    ctx.logger.warn('ecarpetgallery challenge page', { url: res.url, status: res.status, via: res.via });
    return fail(
      'blocked',
      `ecarpetgallery.com refused the request (Cloudflare, HTTP ${res.status})`,
      res.status,
    );
  }
  if (res.status === 404) return fail('not_found', 'product page not found (HTTP 404)', 404);
  if (res.status >= 400)
    return fail('fetch_failed', `ecarpetgallery.com answered HTTP ${res.status}`, res.status);
  // Ladder rung 1 is skipped here: ecarpetgallery.com is Magento 2, not Shopify (shopify.ts).
  // `parseEcg` is rung 4 and already reads rungs 2-3 for the fields it cannot select; the generic
  // rungs are re-run only when it left something blank they could still fill.
  const data = parseEcg(det, res.body);
  if (hasBlanks(data)) fillBlanks(data, mergeRungs(htmlRungs(res.body)).values);
  if (!data.supplierTitle || data.seenPrice === undefined) {
    return fail(
      'parse_failed',
      data.supplierTitle ? 'no price found on the product page' : 'could not read the product page',
      res.status,
      data,
    );
  }
  return { ok: true, data, via: res.via };
}

async function scrapeEcg(det: DetectedEcg, ctx: Ctx): Promise<Attempt> {
  let first: Attempt;
  try {
    first = attemptEcg(det, await fetchText(det.htmlUrl, 'impit', { ...ctx.fetchOpts, kind: 'html' }), ctx);
  } catch (e) {
    first = fromError(e);
  }
  if (first.ok || first.code === 'not_found' || !ctx.jina || ctx.signal.aborted) return first;
  // §4.3: 403 / challenge / network error / no price → keyless Jina Reader, same parsers.
  ctx.logger.info('trying the Jina Reader fallback', { url: det.htmlUrl, reason: first.code });
  let second: Attempt;
  try {
    const res = await fetchViaJina(det.htmlUrl, ctx.fetchOpts);
    second =
      res.status >= 400
        ? fail('fetch_failed', `Jina Reader answered HTTP ${res.status}`, res.status)
        : attemptEcg(det, res, ctx);
  } catch (e) {
    second = fromError(e);
  }
  if (second.ok) return second;
  const better = !first.ok && first.data ? first : second.data ? second : first;
  return { ...better, message: `${first.message}; Jina fallback: ${second.message}` };
}

/**
 * The brief's §11 ladder for a Shopify-shaped product URL: rung 1 is the product JSON
 * (`/products/<handle>.js`, then `<url>.json`), rungs 2-3 are the HTML page's JSON-LD and
 * OpenGraph/microdata, rung 4 is the per-source adapter when the host has one. Rungs 1-3 alone are
 * enough for a store we have no adapter for, and they rescue a product whose JSON payload is broken.
 */
async function scrapeShopifyFirst(det: DetectedKaravan, ctx: Ctx): Promise<Attempt> {
  let js: FetchedText | undefined;
  let json: FetchedText | undefined;
  let lastError: Attempt | undefined;
  let jsOk = false;
  let jsonOk = false;
  if (shouldProbeShopify(det.sourceUrl)) {
    const refusal = robotsRefusal(det.jsUrl, ctx);
    if (refusal) return refusal;
    try {
      js = await fetchText(det.jsUrl, 'impit', { ...ctx.fetchOpts, kind: 'json' });
    } catch (e) {
      lastError = fromError(e);
    }
    if (js?.status === 404) return fail('not_found', 'product not found (HTTP 404)', 404);
    jsOk = js !== undefined && js.status < 400 && looksLikeJson(js.body);
    if (!jsOk) {
      if (js && js.status >= 400)
        lastError = fail(
          js.status === 403 ? 'blocked' : 'fetch_failed',
          `karavanrug.com answered HTTP ${js.status} for the .js endpoint`,
          js.status,
        );
      if (ctx.signal.aborted && lastError) return lastError;
      const jsonRefusal = robotsRefusal(det.jsonUrl, ctx);
      if (jsonRefusal) return jsonRefusal;
      try {
        json = await fetchText(det.jsonUrl, 'impit', { ...ctx.fetchOpts, kind: 'json' });
      } catch (e) {
        lastError = fromError(e);
      }
      if (json?.status === 404) return fail('not_found', 'product not found (HTTP 404)', 404);
      jsonOk = json !== undefined && json.status < 400 && looksLikeJson(json.body);
      if (!jsonOk && json && json.status >= 400) {
        // A hard block or a server error on both JSON endpoints is not something the HTML rungs
        // can rescue: the host is refusing us, not answering badly.
        return fail(
          json.status === 403 ? 'blocked' : 'fetch_failed',
          `karavanrug.com answered HTTP ${json.status}`,
          json.status,
        );
      }
    }
  }

  // Rungs 2-3 need the product page; a failure here is not fatal when rung 1 answered.
  let html: FetchedText | undefined;
  if (!ctx.signal.aborted && !robotsRefusal(det.htmlUrl, ctx)) {
    try {
      const res = await fetchText(det.htmlUrl, 'impit', { ...ctx.fetchOpts, kind: 'html' });
      if (res.status < 400) html = res;
      else
        ctx.logger.warn('karavanrug.com product page unavailable; currency assumed', { status: res.status });
    } catch (e) {
      const err = toScrapeError(e);
      if (err.code === 'timeout' && ctx.signal.aborted)
        return { ok: false, code: 'timeout', message: err.message };
      ctx.logger.warn('karavanrug.com product page fetch failed; currency assumed', { message: err.message });
    }
  }

  const jsBody = jsOk ? js?.body : undefined;
  const jsonBody = json && json.status < 400 ? json.body : undefined;
  const product = parseShopifyProduct(jsBody, jsonBody);
  const rungs: RungDraft[] = [];
  if (product) rungs.push(shopifyRung(product));
  if (html) rungs.push(...htmlRungs(html.body));
  const merged = mergeRungs(rungs);
  const via: ScrapeVia = (jsOk ? js?.via : jsonOk ? json?.via : html?.via) ?? 'impit';

  // Rung 4: the host's own adapter, the most specific reading of the page.
  const refined = parseKaravan(det.handle, { js: jsBody, json: jsonBody, html: html?.body });
  const data =
    refined ?? (rungs.length ? draftToRug(det.supplier, det.sourceUrl, merged, det.handle) : undefined);
  if (!data) return lastError ?? fail('parse_failed', 'the Shopify product payload could not be parsed');
  if (refined) fillBlanks(data, merged.values);
  if (data.seenPrice === undefined)
    return fail('parse_failed', 'no price in the Shopify product payload', undefined, data);
  return { ok: true, data, via };
}

/**
 * Scrapes one supplier product URL (§4). Never throws: every outcome is a ScrapeOk or ScrapeFail
 * (with `manual` pre-filled whenever the supplier was recognised).
 */
export async function scrapeRug(input: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const logger = opts.logger ?? silentLogger;
  const cache = opts.cache ?? defaultScrapeCache;
  const pricing = { convertToUsd: opts.convertToUsd, markup: opts.markup, roundStep: opts.roundStep };

  const det = detectSupplier(input);
  if ('error' in det) {
    const message =
      det.error === 'unsupported_host'
        ? 'only ecarpetgallery.com and karavanrug.com product links are supported'
        : 'not a supported product link';
    return { ok: false, code: det.error, message, manual: manualFallback(input) };
  }
  const manual = manualFromDetected(det);

  if (!opts.force) {
    const hit = cache.get(det.sourceUrl);
    if (hit) {
      const data = finalisePricing(hit.data, pricing);
      return {
        ok: true,
        data,
        primaryImage: data.primaryImage,
        via: hit.via,
        cached: true,
        ms: now() - started,
      };
    }
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? SCRAPE_TIMEOUT_MS;
  const timer = setTimeout(
    () => controller.abort(new ScrapeError('timeout', `scrape exceeded ${timeoutMs} ms`)),
    timeoutMs,
  );
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  const fetchOpts: Omit<FetchTextOptions, 'kind'> = {
    transport: opts.fetchImpl,
    signal: controller.signal,
    requestTimeoutMs: opts.requestTimeoutMs,
    // brief §11: at least 2 s between two requests to the same host, redirects included.
    throttle: opts.throttle ?? defaultHostThrottle,
    logger,
  };
  const ctx: Ctx = {
    fetchOpts,
    signal: controller.signal,
    logger,
    jina: opts.jinaFallback ?? true,
    robots: { agent: '', rules: [] },
  };
  try {
    // brief §11: robots.txt, once per host, cached, and a Disallow is the `blocked` error code.
    if (opts.respectRobots !== false) {
      const verdict = await robotsAllows(det.sourceUrl, {
        cache: opts.robots ?? defaultRobotsCache,
        // impit must only ever see the two constant supplier hosts (ADMIN_SPEC §4.3).
        client: SUPPLIER_HOSTS.includes(new URL(det.sourceUrl).hostname) ? 'impit' : 'undici',
        fetchOpts,
        logger,
      });
      ctx.robots = verdict.rules;
      if (!verdict.allowed) {
        logger.warn('robots.txt disallows the product URL', {
          url: det.sourceUrl,
          agent: verdict.rules.agent,
        });
        return {
          ok: false,
          code: 'blocked',
          message: `robots.txt on ${new URL(det.sourceUrl).hostname} disallows this URL`,
          manual,
        };
      }
    }
    const attempt =
      det.supplier === 'ecarpetgallery' ? await scrapeEcg(det, ctx) : await scrapeShopifyFirst(det, ctx);
    const ms = now() - started;
    if (!attempt.ok) {
      const code = controller.signal.aborted ? 'timeout' : attempt.code;
      logger.warn('scrape failed', {
        supplier: det.supplier,
        ref: det.supplierRef,
        code,
        status: attempt.status,
        ms,
      });
      return {
        ok: false,
        code,
        status: attempt.status,
        message: attempt.message,
        manual,
        // §4.8: a 422 keeps whatever was read — with its field status, so the form can flag it.
        data: attempt.data ? finalisePartial(attempt.data) : undefined,
      };
    }
    cache.set(det.sourceUrl, { data: attempt.data, via: attempt.via });
    logger.info('scrape ok', { supplier: det.supplier, ref: attempt.data.supplierRef, via: attempt.via, ms });
    const data = finalisePricing(attempt.data, pricing);
    return { ok: true, data, primaryImage: data.primaryImage, via: attempt.via, cached: false, ms };
  } catch (e) {
    const err = toScrapeError(e);
    logger.error('scrape crashed', { supplier: det.supplier, code: err.code, message: err.message });
    return { ok: false, code: err.code, status: err.status, message: err.message, manual };
  } finally {
    clearTimeout(timer);
  }
}

/** Test/ops helper: a fresh cache with the production limits. */
export function createScrapeCache(): ScrapeCache {
  return new ScrapeCache();
}

/** Test/ops helper: a fresh robots cache and host throttle with the production limits. */
export function createScrapeGuards(): { robots: RobotsCache; throttle: HostThrottle } {
  return { robots: new RobotsCache(), throttle: new HostThrottle() };
}
