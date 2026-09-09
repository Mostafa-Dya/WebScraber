// Ported from reference/catalogue.html lines 133-137. Prices are stored in USD; rates and symbols
// come from the Rates tab (server) and are embedded in the page for the browser (ADR D12).

export interface RateTable {
  rates: Record<string, number>;
  symbols: Record<string, string>;
}

/**
 * `SYM[cur] + Math.round(v).toLocaleString()` as in the reference. `locale` is undefined in the
 * browser (visitor locale, like the reference) and 'en-US' on the server for a stable first paint.
 */
export function money(usd: number | undefined, cur: string, table: RateTable, locale?: string): string {
  if (!usd) return '';
  const rate = table.rates[cur];
  const sym = table.symbols[cur];
  if (rate === undefined || sym === undefined) return '';
  const v = usd * rate;
  return sym + Math.round(v).toLocaleString(locale);
}

// The picker's currencies (brief §8). AED and SAR are here because Gulf buyers are expected;
// no RTL layout has been drawn — flag that before a Gulf buyer gets a link.
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'MXN', 'AED', 'SAR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
