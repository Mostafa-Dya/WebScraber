// POST /api/admin/scrape — one supplier product page → ScrapedProduct (docs/ADMIN_SPEC.md §2.3,
// §4.8, §4.9). 10 / min per session and 30 / 10 min global (the `scrape` rate kind); every call is
// audited as `scrape.fetch`; failures carry `manual` so the form can offer "Enter manually".
//
// Photo-first (brief §11): one JSON response, not a stream — `primaryImage` is resolved before the
// rest of the gallery (src/lib/scrape/photos.ts) and is serialised as the **first** key of the body,
// ahead of `data`, so a client reading the response incrementally sees the photo URL before the
// slower fields. A failure to resolve the secondary images degrades to the primary plus a warning
// and never fails the scrape.
export const prerender = false;

import { noStore } from '../../../lib/api.ts';
import { ScrapeRequest } from '../../../lib/admin/dto.ts';
import {
  adminPost,
  adminRuntime,
  auditBase,
  methodNotAllowed,
  recordAuditEvent,
} from '../../../lib/admin/http.ts';
import { markupFor, parseSettings, roundStepOf, type AdminSettings } from '../../../lib/admin/settings.ts';
import { getAdminDeps, getClient, warmRates } from '../../../lib/runtime.ts';
import { detectSupplier, scrapeRug, type ScrapeErrorCode } from '../../../lib/scrape/index.ts';
import { TABS } from '../../../lib/sheets/contract.ts';
import { consoleLogger, serializeError } from '../../../lib/sheets/errors.ts';

/** §2.3: 400 unsupported_host / invalid_url, 502 blocked / fetch_failed, 404, 422 parse_failed, 504 timeout. */
export const SCRAPE_STATUS: Record<ScrapeErrorCode, number> = {
  unsupported_host: 400,
  invalid_url: 400,
  blocked: 502,
  fetch_failed: 502,
  not_found: 404,
  parse_failed: 422,
  timeout: 504,
};

const EMPTY_SETTINGS: Pick<AdminSettings, 'retailMarkup' | 'retailMarkupBySupplier' | 'priceRoundStep'> = {
  retailMarkupBySupplier: {},
};

/** The Settings tab alone (one small read); a failure leaves the markup unset rather than blocking. */
async function readSettings(): Promise<typeof EMPTY_SETTINGS> {
  try {
    const [vr] = await getClient().batchGet([`${TABS.settings}!A1:D`]);
    return parseSettings(vr?.values, consoleLogger);
  } catch (e) {
    consoleLogger.warn('scrape: Settings tab unavailable; no retail suggestion', {
      error: serializeError(e),
    });
    return EMPTY_SETTINGS;
  }
}

export const POST = adminPost(
  ScrapeRequest,
  async ({ context, body }) => {
    const started = Date.now();
    const det = detectSupplier(body.url);
    const supplier = 'error' in det ? undefined : det.supplier;
    // `convertToUsd` reads the in-memory snapshot synchronously and does not load it, so on a cold
    // process a non-USD supplier price got no conversion and therefore no retail suggestion —
    // silently, and with no admin page that would ever warm it. The Settings read is already a round
    // trip; this runs alongside it rather than adding latency.
    const [settings] = await Promise.all([
      supplier ? readSettings() : Promise.resolve(EMPTY_SETTINGS),
      warmRates(),
    ]);
    const deps = getAdminDeps();
    const result = await scrapeRug(body.url, {
      force: body.force,
      markup: markupFor(settings, supplier, adminRuntime.retailMarkup),
      roundStep: roundStepOf(settings),
      jinaFallback: deps.scrape.jinaFallback,
      respectRobots: deps.scrape.respectRobots,
      convertToUsd: deps.convertToUsd,
      logger: consoleLogger,
    });
    const audit = await recordAuditEvent({
      ...auditBase(context),
      action: 'scrape.fetch',
      targetTab: '-',
      targetId: result.ok ? result.data.supplierRef : (result.manual?.supplierRef ?? ''),
      after: {
        url: result.ok ? result.data.sourceUrl : (result.manual?.sourceUrl ?? body.url.slice(0, 500)),
        supplier: supplier ?? null,
        via: result.ok ? result.via : null,
        ok: result.ok,
        code: result.ok ? null : result.code,
        status: result.ok ? 200 : (result.status ?? null),
        ms: result.ok ? result.ms : Date.now() - started,
        cached: result.ok ? result.cached : false,
        seenPrice: result.ok ? (result.data.seenPrice ?? null) : (result.data?.seenPrice ?? null),
        seenCurrency: result.ok ? (result.data.seenCurrency ?? null) : (result.data?.seenCurrency ?? null),
      },
    });
    if (result.ok) {
      return noStore({
        ok: true,
        primaryImage: result.primaryImage ?? null,
        sizeLabel: result.data.sizeLabel,
        sizeBand: result.data.sizeBand,
        fieldStatus: result.data.fieldStatus,
        data: result.data,
        via: result.via,
        cached: result.cached,
        ms: result.ms,
        audit,
      });
    }
    return noStore(
      {
        ok: false,
        error: result.code,
        message: result.message,
        status: result.status ?? null,
        manual: result.manual ?? null,
        data: result.data ?? null,
        audit,
      },
      SCRAPE_STATUS[result.code],
    );
  },
  'scrape',
);

export const ALL = methodNotAllowed('POST');
