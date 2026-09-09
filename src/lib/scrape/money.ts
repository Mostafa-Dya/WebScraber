// Price normalisation and the retail suggestion (docs/ADMIN_SPEC.md §4.7, §7). Pure.
// `roundUpToStep` lives in src/lib/price.ts (shared with the form's rounding button) and is
// re-exported here so scrape callers have one import.
import { DEFAULT_ROUND_STEP, roundUpToStep } from '../price.ts';

export { DEFAULT_ROUND_STEP, roundUpToStep };

export interface ParsedMoney {
  amount: number;
  currency?: string;
}

const CODE_RE = /\b(USD|CAD|EUR|GBP|TRY|AED|SAR|MXN|AUD|CHF|JPY)\b/i;
const NUMBER_RE = /\d(?:[\d.,]|\s(?=\d))*\d|\d/;

/** ISO-4217-looking code → uppercase; anything else undefined. */
export function normaliseCurrency(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : undefined;
}

/**
 * Amount from free text: keeps digits and separators; with both `,` and `.` the last one is the
 * decimal separator; a lone `,` followed by exactly two digits is decimal, otherwise thousands;
 * repeated `.` are thousands. `USD $1,290 Estimated Retail` → 1290, `4,000.00` → 4000,
 * `1.234,50` → 1234.5, `1,50` → 1.5.
 */
export function parseAmount(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const m = NUMBER_RE.exec(text);
  if (!m) return undefined;
  let s = m[0].replace(/\s+/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = s.split(',').length - 1;
    s = commas === 1 && /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const dots = s.split('.').length - 1;
    if (dots > 1) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Currency from a code or a symbol: `CA$`/`C$` → CAD, `US$`/`$` → USD, `€`, `£`, `₺`/`TL` → TRY. */
export function detectCurrency(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const code = CODE_RE.exec(text)?.[1];
  if (code) return code.toUpperCase();
  if (/(?:CA|C)\$/.test(text)) return 'CAD';
  if (/US\$|\$/.test(text)) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('₺') || /\bTL\b/.test(text)) return 'TRY';
  return undefined;
}

/** `USD $700 ECARPETGALLERY` → { amount: 700, currency: 'USD' }; undefined without an amount. */
export function parseMoney(text: string | undefined | null): ParsedMoney | undefined {
  const amount = parseAmount(text);
  if (amount === undefined) return undefined;
  return { amount, currency: detectCurrency(text) };
}

export interface UsdConversion {
  priceUsd?: number;
  warning?: string;
}

/**
 * `priceUsd = seenPrice` when USD; otherwise the Rates-tab conversion (flagged as an estimate);
 * undefined (manual entry) when no rate exists. A missing currency is treated as USD.
 */
export function priceToUsd(
  seenPrice: number | undefined,
  seenCurrency: string | undefined,
  convert?: (amount: number, currency: string) => number | undefined,
): UsdConversion {
  if (seenPrice === undefined || !Number.isFinite(seenPrice)) return {};
  const currency = normaliseCurrency(seenCurrency) ?? 'USD';
  if (currency === 'USD') return { priceUsd: seenPrice };
  const converted = convert?.(seenPrice, currency);
  if (converted !== undefined && Number.isFinite(converted) && converted > 0) {
    return {
      priceUsd: Math.round(converted * 100) / 100,
      warning: `price converted from ${currency} ${seenPrice} with the Rates tab (estimate)`,
    };
  }
  return { warning: `price is in ${currency} and no rate is available — enter the USD price manually` };
}

/** `roundUpToStep(priceUsd × markup, step)`; undefined without a price or a positive markup. */
export function retailSuggestion(
  priceUsd: number | undefined,
  markup: number | undefined,
  step: number = DEFAULT_ROUND_STEP,
): number | undefined {
  if (priceUsd === undefined || markup === undefined || !Number.isFinite(markup) || markup <= 0)
    return undefined;
  return roundUpToStep(priceUsd * markup, step);
}
