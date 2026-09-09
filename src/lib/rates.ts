// FX rates (brief §8): prices are stored once in the base currency and every other currency is
// derived. A free daily-rates API is enough for an indicative catalogue, so the table is fetched at
// most once per refresh window, cached in memory, and falls back to a hardcoded table when the API
// is unreachable — a rates outage degrades to slightly-stale numbers, never to a page that cannot
// render prices. Converted prices are rounded to whole units; the footer disclaims the precision.
import type { RateTable } from './currency.ts';
import { SUPPORTED_CURRENCIES } from './currency.ts';
import type { Rate } from './sheets/types.ts';

/**
 * Units of each currency per 1 USD. AED (3.6725) and SAR (3.75) are pegged to the dollar, so their
 * static values are correct rather than merely stale; the ECB-derived APIs do not quote them.
 */
export const FALLBACK_RATES: Readonly<Record<string, number>> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.37,
  MXN: 17.5,
  AED: 3.6725,
  SAR: 3.75,
};

export const SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: '$',
  MXN: '$',
  AED: 'AED ',
  SAR: 'SAR ',
};

export interface RatesState {
  table: RateTable;
  /** Epoch ms of the last successful fetch; 0 when only the fallback has ever been used. */
  fetchedAt: number;
  source: 'fallback' | 'api' | 'sheet';
  lastError: string | null;
}

function baseTable(base: string): RateTable {
  const rates: Record<string, number> = {};
  const symbols: Record<string, string> = {};
  const perUsd = FALLBACK_RATES[base] ?? 1;
  for (const c of SUPPORTED_CURRENCIES) {
    const v = FALLBACK_RATES[c];
    if (v === undefined) continue;
    rates[c] = v / perUsd; // re-base: units of c per 1 unit of `base`
    symbols[c] = SYMBOLS[c] ?? '';
  }
  rates[base] = 1;
  return { rates, symbols };
}

/** Overlays the sheet's Rates tab (symbols always, numbers when the tab supplies them). */
export function withSheetRates(table: RateTable, sheet: readonly Rate[]): RateTable {
  const rates = { ...table.rates };
  const symbols = { ...table.symbols };
  for (const r of sheet) {
    if (r.rateToBase > 0) rates[r.currency] = r.rateToBase;
    if (r.symbol) symbols[r.currency] = r.symbol;
  }
  return { rates, symbols };
}

interface FrankfurterResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

export interface FetchRatesOptions {
  url: string;
  base: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** One GET; returns only the currencies the API quotes (pegged ones keep their static value). */
export async function fetchRates(opts: FetchRatesOptions): Promise<Record<string, number>> {
  const f = opts.fetchImpl ?? fetch;
  const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== opts.base).join(',');
  const url = `${opts.url}?base=${encodeURIComponent(opts.base)}&symbols=${encodeURIComponent(symbols)}`;
  const res = await f(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) throw new Error(`rates API answered ${res.status}`);
  const body = (await res.json()) as FrankfurterResponse;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.rates ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k.toUpperCase()] = v;
  }
  if (Object.keys(out).length === 0) throw new Error('rates API returned no usable rates');
  return out;
}

export interface RatesCacheOptions {
  base: string;
  url: string;
  refreshMs: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Long-TTL, single-flight, never-throws rate table. */
export class RatesCache {
  private state: RatesState;
  private inflight: Promise<void> | undefined;
  private readonly now: () => number;
  private readonly options: RatesCacheOptions;

  constructor(options: RatesCacheOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.state = { table: baseTable(options.base), fetchedAt: 0, source: 'fallback', lastError: null };
  }

  /** The current table; refreshes in the background when the window has passed. */
  get(sheet: readonly Rate[] = []): RateTable {
    const age = this.now() - this.state.fetchedAt;
    if (age >= this.options.refreshMs && !this.inflight) void this.refresh();
    return withSheetRates(this.state.table, sheet);
  }

  health(): Omit<RatesState, 'table'> & { currencies: string[] } {
    return {
      fetchedAt: this.state.fetchedAt,
      source: this.state.source,
      lastError: this.state.lastError,
      currencies: Object.keys(this.state.table.rates),
    };
  }

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const live = await fetchRates({
          url: this.options.url,
          base: this.options.base,
          fetchImpl: this.options.fetchImpl,
        });
        const table = baseTable(this.options.base);
        this.state = {
          table: { rates: { ...table.rates, ...live }, symbols: table.symbols },
          fetchedAt: this.now(),
          source: 'api',
          lastError: null,
        };
      } catch (e) {
        // Keep whatever we have (fallback or the last good table) and record why.
        this.state = { ...this.state, lastError: e instanceof Error ? e.message : String(e) };
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }
}
