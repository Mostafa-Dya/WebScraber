// /admin/audit (docs/ADMIN_SPEC.md §8.3): client-side filter by action / target id over the
// server-rendered rows, "Load more" through GET /api/admin/audit (offset paging), rows built as text.
import { get, type ApiOptions } from './api.ts';
import { byId, el, maybe } from './dom.ts';
import { hide, msg } from './msg.ts';

export interface AuditEntryLike {
  row: number;
  timestamp: string;
  actor: string;
  action: string;
  targetTab: string;
  targetId: string;
  before: string;
  after: string;
  note: string;
}

export function pretty(s: string): string {
  if (!s) return '';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export function auditRow(a: AuditEntryLike, doc: Document = document): HTMLTableRowElement {
  const change = el('td', {}, [], doc);
  if (a.before || a.after) {
    change.appendChild(
      el(
        'details',
        {},
        [
          el('summary', {}, 'before → after', doc),
          a.before ? el('pre', {}, pretty(a.before), doc) : null,
          a.after ? el('pre', {}, pretty(a.after), doc) : null,
        ],
        doc,
      ),
    );
  }
  return el(
    'tr',
    { 'data-action': a.action, 'data-target': a.targetId.toLowerCase(), 'data-row': a.row },
    [
      el('td', { class: 'mono' }, a.timestamp, doc),
      el('td', {}, a.actor, doc),
      el('td', { class: 'mono' }, a.action, doc),
      el('td', { class: 'mono' }, `${a.targetTab} ${a.targetId}`, doc),
      change,
      el('td', { class: 'mono' }, a.note, doc),
    ],
    doc,
  );
}

export interface AuditPage {
  apply(): void;
  loadMore(): Promise<void>;
}

export function initAudit(doc: Document = document, api: ApiOptions = {}): AuditPage {
  const action = byId<HTMLSelectElement>('f_action', doc);
  const target = byId<HTMLInputElement>('f_target', doc);
  const more = byId<HTMLButtonElement>('btnMore', doc);
  const body = byId<HTMLTableElement>('auditTable', doc).querySelector('tbody')!;
  const count = maybe('count', doc);
  const m = byId('m11', doc);

  const apply = (): void => {
    const a = action.value;
    const t = target.value.trim().toLowerCase();
    let shown = 0;
    body.querySelectorAll<HTMLTableRowElement>('tr').forEach((tr) => {
      const on = (!a || tr.dataset.action === a) && (!t || (tr.dataset.target ?? '').includes(t));
      tr.hidden = !on;
      if (on) shown++;
    });
    if (count) count.textContent = `${shown} of ${body.children.length} loaded rows shown`;
  };

  const loadMore = async (): Promise<void> => {
    const offset = Number(more.dataset.offset ?? '0');
    more.disabled = true;
    msg(m, 'Loading…', 'busy');
    const r = await get<{ rows: AuditEntryLike[]; total: number }>(
      `/api/admin/audit?offset=${offset}&limit=100`,
      api,
    );
    more.disabled = false;
    if (!r.ok) {
      msg(m, r.message, 'err');
      return;
    }
    for (const row of r.data.rows) body.appendChild(auditRow(row, doc));
    more.dataset.offset = String(offset + r.data.rows.length);
    if (offset + r.data.rows.length >= r.data.total || r.data.rows.length === 0) {
      more.disabled = true;
      msg(m, `All ${r.data.total} rows loaded.`, 'busy');
    } else hide(m);
    apply();
  };

  action.addEventListener('change', apply);
  target.addEventListener('input', apply);
  more.addEventListener('click', () => void loadMore());
  apply();
  return { apply, loadMore };
}
