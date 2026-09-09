// Settings tab (docs/ADMIN_SPEC.md §3.2): `key | value | updated_at | updated_by`, parsed per key;
// a bad value parses to undefined with a warning, never a crash. Pure.
import type { CellValue } from '../sheets/client.ts';
import { TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';
import type { Logger } from '../sheets/errors.ts';

export const SETTINGS_KEYS = [
  'retail_markup',
  'retail_markup.ecarpetgallery',
  'retail_markup.karavanrug',
  'price_round_step',
  'default_status',
] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];
export const SUPPLIERS = ['ecarpetgallery', 'karavanrug'] as const;
export type Supplier = (typeof SUPPLIERS)[number];

export interface SettingRow {
  row: number;
  key: string;
  value: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AdminSettings {
  retailMarkup?: number;
  retailMarkupBySupplier: Partial<Record<Supplier, number>>;
  priceRoundStep?: number;
  defaultStatus?: 'active' | 'draft';
  /** Every data row as read (the settings endpoint edits by row + version). */
  rows: SettingRow[];
  warnings: string[];
}

export type ParsedSettingValue =
  { ok: true; value: number | 'active' | 'draft' | undefined } | { ok: false; error: string };

function positiveNumber(raw: string): number | undefined {
  const s = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Validates one value for a key; '' clears (undefined). Used by the settings endpoint (400 on !ok). */
export function parseSettingValue(key: SettingsKey, raw: string): ParsedSettingValue {
  const s = raw.trim();
  if (s === '') return { ok: true, value: undefined };
  switch (key) {
    case 'retail_markup':
    case 'retail_markup.ecarpetgallery':
    case 'retail_markup.karavanrug': {
      const n = positiveNumber(s);
      return n === undefined
        ? { ok: false, error: `${key} must be a positive number such as 1.6` }
        : { ok: true, value: n };
    }
    case 'price_round_step': {
      const n = positiveNumber(s);
      return n === undefined || !Number.isInteger(n)
        ? { ok: false, error: 'price_round_step must be a positive whole number' }
        : { ok: true, value: n };
    }
    case 'default_status': {
      const v = s.toLowerCase();
      return v === 'active' || v === 'draft'
        ? { ok: true, value: v }
        : { ok: false, error: 'default_status must be active or draft' };
    }
  }
}

export function isSettingsKey(key: string): key is SettingsKey {
  return (SETTINGS_KEYS as readonly string[]).includes(key);
}

function cellText(v: CellValue | undefined): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

/** Parses `Settings!A1:D` (header first). Unknown keys are kept in `rows` and reported once. */
export function parseSettings(values: CellValue[][] | undefined, logger?: Logger): AdminSettings {
  assertHeaders(TABS.settings, values?.[0]);
  const out: AdminSettings = { retailMarkupBySupplier: {}, rows: [], warnings: [] };
  if (!values) return out;
  const seen = new Set<string>();
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const key = cellText(cells[0]);
    if (!key) continue;
    const value = cellText(cells[1]);
    out.rows.push({
      row: i + 1,
      key,
      value,
      updatedAt: cellText(cells[2]) || undefined,
      updatedBy: cellText(cells[3]) || undefined,
    });
    if (!isSettingsKey(key)) {
      out.warnings.push(`Settings row ${i + 1}: unknown key "${key.slice(0, 40)}" ignored`);
      continue;
    }
    if (seen.has(key)) {
      out.warnings.push(`Settings row ${i + 1}: duplicate key "${key}" ignored (first row wins)`);
      continue;
    }
    seen.add(key);
    const parsed = parseSettingValue(key, value);
    if (!parsed.ok) {
      out.warnings.push(`Settings row ${i + 1}: ${parsed.error} (got "${value.slice(0, 40)}")`);
      continue;
    }
    if (parsed.value === undefined) continue;
    switch (key) {
      case 'retail_markup':
        out.retailMarkup = parsed.value as number;
        break;
      case 'retail_markup.ecarpetgallery':
        out.retailMarkupBySupplier.ecarpetgallery = parsed.value as number;
        break;
      case 'retail_markup.karavanrug':
        out.retailMarkupBySupplier.karavanrug = parsed.value as number;
        break;
      case 'price_round_step':
        out.priceRoundStep = parsed.value as number;
        break;
      case 'default_status':
        out.defaultStatus = parsed.value as 'active' | 'draft';
        break;
    }
  }
  for (const w of out.warnings) logger?.warn(w);
  return out;
}

/** Markup lookup order (§3.2): `retail_markup.<supplier>` → `retail_markup` → env `RETAIL_MARKUP` → unset. */
export function markupFor(
  settings: Pick<AdminSettings, 'retailMarkup' | 'retailMarkupBySupplier'>,
  supplier: string | undefined,
  envMarkup?: number,
): number | undefined {
  if (supplier && (SUPPLIERS as readonly string[]).includes(supplier)) {
    const s = settings.retailMarkupBySupplier[supplier as Supplier];
    if (s !== undefined) return s;
  }
  if (settings.retailMarkup !== undefined) return settings.retailMarkup;
  return envMarkup !== undefined && Number.isFinite(envMarkup) && envMarkup > 0 ? envMarkup : undefined;
}

export function roundStepOf(settings: Pick<AdminSettings, 'priceRoundStep'>): number {
  return settings.priceRoundStep ?? 5;
}

export function defaultStatusOf(settings: Pick<AdminSettings, 'defaultStatus'>): 'active' | 'draft' {
  return settings.defaultStatus ?? 'active';
}
