// Unit (cm/ft) and currency preferences: reference lines 169-170 + localStorage persistence
// (`sl-unit`, `sl-cur`, brief §4). Re-renders every [data-dims] and [data-price] in place, always
// with the visitor's locale grouping like the reference's toLocaleString().
import { money, type RateTable } from '../lib/currency.ts';
import { dims } from '../lib/units.ts';

const UNIT_KEY = 'sl-unit';
const CUR_KEY = 'sl-cur';

type Unit = 'cm' | 'ft';

export function readTable(doc: Document = document): RateTable {
  let table: RateTable = { rates: {}, symbols: {} };
  try {
    const el = doc.getElementById('sl-rates');
    const parsed = el?.textContent ? (JSON.parse(el.textContent) as Partial<RateTable>) : {};
    table = { rates: { ...(parsed.rates ?? {}) }, symbols: { ...(parsed.symbols ?? {}) } };
  } catch {
    /* fall through to the USD fallback */
  }
  if (typeof table.rates.USD !== 'number') table.rates.USD = 1;
  if (typeof table.symbols.USD !== 'string') table.symbols.USD = '$';
  return table;
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function render(unit: Unit, cur: string, table: RateTable, doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>('[data-dims]').forEach((el) => {
    const w = Number(el.dataset.w) || undefined;
    const l = Number(el.dataset.l) || undefined;
    // `data-sep` lets the customer preview render "240 · 170 cm" while the public catalogue keeps
    // the reference's cross. Absent attribute means the reference separator.
    const text = dims(w, l, unit, el.dataset.sep || undefined);
    el.textContent = text;
    el.hidden = !text;
  });
  doc.querySelectorAll<HTMLElement>('[data-price]').forEach((el) => {
    const usd = Number(el.dataset.usd) || undefined;
    const text = money(usd, cur, table); // visitor locale, like the reference
    el.textContent = text;
    el.hidden = !text;
  });
}

export function initPrefs(doc: Document = document): void {
  const toggle = doc.getElementById('unitTog');
  const select = doc.getElementById('cur') as HTMLSelectElement | null;
  const table = readTable(doc);
  const options = select ? [...select.options].map((o) => o.value) : ['USD'];
  // A currency the sheet no longer provides is not selectable (the option is kept but disabled).
  if (select)
    for (const o of select.options) o.disabled = !(o.value in table.rates && o.value in table.symbols);
  const allowed = (c: string | null): c is string =>
    Boolean(c && options.includes(c) && c in table.rates && c in table.symbols);

  let unit: Unit = stored(UNIT_KEY) === 'ft' ? 'ft' : 'cm';
  const storedCur = stored(CUR_KEY);
  let cur = allowed(storedCur) ? storedCur : 'USD';

  const apply = (): void => {
    toggle?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const on = b.dataset.u === unit;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (select) select.value = cur;
    render(unit, cur, table, doc);
  };

  toggle?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-u]');
    if (!b) return;
    unit = b.dataset.u === 'ft' ? 'ft' : 'cm';
    store(UNIT_KEY, unit);
    apply();
  });
  select?.addEventListener('change', () => {
    cur = allowed(select.value) ? select.value : 'USD';
    store(CUR_KEY, cur);
    apply();
  });

  apply(); // idempotent; normalises grouping to the visitor's locale on every load
}
