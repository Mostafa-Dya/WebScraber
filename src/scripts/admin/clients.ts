// /admin/clients (docs/ADMIN_SPEC.md §6, §8.3): generate a unique link (name, note → code → link +
// Copy), revoke / restore rows, and the saves report (most saved + per-client lists) from
// GET /api/admin/clients/report. Everything rendered as text nodes.
// NOT from '../../lib/customer/auth.ts': that module imports `node:crypto`, whose browser stub
// throws at import time, which used to kill every handler on this page.
import { customerPasswordProblem } from '../../lib/customer/password-policy.ts';
import { get, post, type ApiOptions } from './api.ts';
import { byId, clear, el, readJson } from './dom.ts';
import { hide, msg } from './msg.ts';

export interface ClientLike {
  row: number;
  code: string;
  name: string;
  note: string;
  status: 'active' | 'revoked';
  createdAt: string;
  createdBy: string;
  link: string;
  version: string;
}

interface RugRef {
  rugId: string;
  name: string;
  slug: string;
  status: string;
}

export interface ReportLike {
  generatedAt: string;
  mostSaved: Array<RugRef & { saves: number; dislikes: number }>;
  byClient: Array<{
    code: string;
    name: string;
    known: boolean;
    status?: string;
    liked: RugRef[];
    disliked: RugRef[];
  }>;
  rowsRead: number;
  rowsDropped: number;
}

/**
 * The Copy-link control, cloned from the `#copyTpl` template the page renders with `CopyButton`.
 *
 * This used to be hand-rolled here as a bare <button> with a single <span> — no icons, no
 * `data-copied-label` — so `copy.ts` could swap the label but the `.copy__icon--default` →
 * `.copy__icon--copied` rule had nothing to act on, and the caption printed directly under the table
 * ("the control changes icon, label and colour for 2 seconds") described behaviour the page did not
 * have. Rebuilding a row after a toggle also quietly replaced the server's correct markup with this
 * poorer copy. Cloning the template keeps both paths identical by construction.
 */
function copyControl(link: string, doc: Document): HTMLElement {
  const tpl = doc.getElementById('copyTpl');
  if (tpl instanceof HTMLTemplateElement) {
    const node = tpl.content.firstElementChild?.cloneNode(true);
    if (node instanceof HTMLElement) {
      node.setAttribute('data-copy', link);
      return node;
    }
  }
  // No template (an older page, or a test fixture): the plain control still copies.
  return el(
    'button',
    { type: 'button', class: 'copy', 'data-copy': link, 'data-label': 'Copy link' },
    el('span', { 'data-copy-label': '' }, 'Copy link', doc),
    doc,
  );
}

export function clientRow(c: ClientLike, doc: Document = document): HTMLTableRowElement {
  const active = c.status === 'active';
  return el(
    'tr',
    { 'data-code': c.code, 'data-version': c.version, 'data-status': c.status },
    [
      // F5 (Figma 52:1207) is reachable from the name: the row already carries everything else the
      // owner needs, so the name is the one cell that means "show me this buyer".
      el('td', {}, el('a', { href: `/admin/clients/${encodeURIComponent(c.code)}` }, c.name, doc), doc),
      el(
        'td',
        { class: 'mono' },
        el('a', { href: c.link, target: '_blank', rel: 'noopener' }, c.link, doc),
        doc,
      ),
      el('td', {}, c.createdAt, doc),
      // Filled by the visits loader: a Badge reading "Opened" or "Not visited", never a bare count.
      el('td', {}, el('span', { class: 'badge', 'data-visits': '' }, 'Not visited', doc), doc),
      el('td', { 'data-last-seen': '' }, '—', doc),
      el(
        'td',
        {},
        el(
          'label',
          { class: 'toggle' },
          [
            el(
              'input',
              {
                type: 'checkbox',
                role: 'switch',
                class: 'toggle__track',
                'data-act': 'toggle',
                'aria-label': `Link active for ${c.name}`,
                ...(active ? { checked: 'checked' } : {}),
              },
              [],
              doc,
            ),
          ],
          doc,
        ),
        doc,
      ),
      el(
        'td',
        { class: 'acts' },
        [
          // "Copy-link is the most-used action here — the control changes icon, label and colour for
          // 2 seconds. A toast alone is missable when copying several in a row." (52:1114)
          copyControl(c.link, doc),
          el(
            'button',
            { type: 'button', class: 'btn btn--ghost', 'data-act': 'password' },
            'Reset password',
            doc,
          ),
        ],
        doc,
      ),
    ],
    doc,
  );
}

function rugLine(r: RugRef, doc: Document): HTMLElement {
  const label = `${r.name}${r.rugId !== r.name ? ` (${r.rugId})` : ''}`;
  const cls = r.status === 'archived' ? 'status-archived' : '';
  return r.slug
    ? el('a', { href: `/admin/rugs/${encodeURIComponent(r.rugId)}`, class: cls }, label, doc)
    : el('span', { class: cls }, label, doc);
}

export function renderReport(out: HTMLElement, report: ReportLike, doc: Document = document): void {
  clear(out);
  out.classList.add('report');
  const most = el('div', { class: 'stack' }, [el('h3', {}, 'Most saved', doc)], doc);
  if (report.mostSaved.length === 0)
    most.appendChild(el('p', { class: 'hint' }, 'No saves logged yet.', doc));
  else {
    const table = el(
      'table',
      {},
      [
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            [el('th', {}, 'Rug', doc), el('th', {}, 'Saves', doc), el('th', {}, 'Dislikes', doc)],
            doc,
          ),
          doc,
        ),
      ],
      doc,
    );
    const tbody = el('tbody', {}, [], doc);
    for (const r of report.mostSaved) {
      tbody.appendChild(
        el(
          'tr',
          {},
          [
            el('td', {}, rugLine(r, doc), doc),
            el('td', { class: 'n' }, String(r.saves), doc),
            el('td', { class: 'n' }, String(r.dislikes), doc),
          ],
          doc,
        ),
      );
    }
    table.appendChild(tbody);
    most.appendChild(el('div', { class: 'table-wrap' }, table, doc));
  }
  out.appendChild(most);
  for (const c of report.byClient) {
    const title = c.code === 'anon' ? 'anonymous' : c.known ? c.name : `unknown code ${c.code}`;
    const suffix = c.status === 'revoked' ? ' · revoked' : '';
    const block = el(
      'div',
      { class: 'stack' },
      [el('h3', {}, `${title} — ${c.liked.length} saved${suffix}`, doc)],
      doc,
    );
    const ul = el('ul', { class: 'hint' }, [], doc);
    for (const r of c.liked) ul.appendChild(el('li', {}, [rugLine(r, doc)], doc));
    for (const r of c.disliked) ul.appendChild(el('li', {}, ['👎 ', rugLine(r, doc)], doc));
    block.appendChild(ul);
    out.appendChild(block);
  }
  out.appendChild(
    el('p', { class: 'hint' }, `${report.rowsRead} vote rows read · generated ${report.generatedAt}`, doc),
  );
}

interface VisitRow {
  customerSlug: string;
  occurredAt: string;
  userAgent: string;
  referrer: string;
  name: string;
  known: boolean;
}

export interface VisitsLike {
  generatedAt: string;
  byClient: Array<{
    code: string;
    name: string;
    known: boolean;
    status?: string;
    visits: number;
    firstSeen: string;
    lastSeen: string;
    devices: string[];
  }>;
  recent: VisitRow[];
  rowsRead: number;
  rowsDropped: number;
}

/** "9 Sep, 14:32" in the reader's own locale; the raw ISO stays in the title attribute. */
export function whenText(iso: string, locale?: string): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function renderVisits(out: HTMLElement, report: VisitsLike, doc: Document = document): void {
  clear(out);
  out.classList.add('report');
  if (report.recent.length === 0) {
    out.appendChild(el('p', { class: 'hint' }, 'Nobody has opened a link yet.', doc));
    return;
  }
  const table = el(
    'table',
    {},
    [
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          [
            el('th', {}, 'When', doc),
            el('th', {}, 'Who', doc),
            el('th', {}, 'Device', doc),
            el('th', {}, 'Came from', doc),
          ],
          doc,
        ),
        doc,
      ),
    ],
    doc,
  );
  const tbody = el('tbody', {}, [], doc);
  for (const v of report.recent) {
    tbody.appendChild(
      el(
        'tr',
        {},
        [
          el('td', { class: 'mono', title: v.occurredAt }, whenText(v.occurredAt), doc),
          el('td', {}, v.known ? v.name : `${v.customerSlug} (deleted)`, doc),
          el('td', {}, v.userAgent || '—', doc),
          el('td', { class: 'mono' }, v.referrer || 'direct', doc),
        ],
        doc,
      ),
    );
  }
  table.appendChild(tbody);
  out.appendChild(el('div', { class: 'table-wrap' }, table, doc));
  out.appendChild(
    el(
      'p',
      { class: 'hint' },
      `${report.rowsRead} visit row${report.rowsRead === 1 ? '' : 's'} read · generated ${report.generatedAt}`,
      doc,
    ),
  );
}

export interface ClientsPage {
  generate(): Promise<void>;
  loadVisits(): Promise<void>;
  setStatus(code: string, status: 'active' | 'revoked'): Promise<void>;
  resetPassword(code: string, chosen?: string): Promise<void>;
  loadReport(): Promise<void>;
}

export function initClients(doc: Document = document, api: ApiOptions = {}): ClientsPage {
  const data = readJson<{ clients: ClientLike[]; siteOrigin: string }>('admin-data', doc);
  const name = byId<HTMLInputElement>('cl_name', doc);
  const note = byId<HTMLInputElement>('cl_note', doc);
  const pwField = byId<HTMLInputElement>('cl_pw', doc);
  const generate = byId<HTMLButtonElement>('btnGenerate', doc);
  const m8 = byId('m8', doc);
  const linkOut = byId('linkOut', doc);
  /** The create form inside the modal; hidden when the panel is opened from a row (a reset). */
  const fields = doc.querySelector<HTMLElement>('#new-client .modal__fields > .row');
  const linkCode = byId('linkCode', doc);
  const linkNote = byId('linkNote', doc);
  // F4 (Figma 52:1115): the Credential Panel replaces the two readonly inputs and their two separate
  // copy buttons. src/scripts/ui/copy.ts drives every [data-copy] and reads the attribute at CLICK
  // time, so filling these in here is all the wiring the panel needs.
  const credUrl = doc.querySelector<HTMLElement>('[data-credential-url]')!;
  const credPassword = doc.querySelector<HTMLElement>('[data-credential-password]')!;
  const credCopies = Array.from(doc.querySelectorAll<HTMLElement>('.credential [data-copy]'));
  const tbody = byId<HTMLTableElement>('clientTable', doc).querySelector('tbody')!;
  const m9 = byId('m9', doc);
  const reportBtn = byId<HTMLButtonElement>('btnReport', doc);
  const m10 = byId('m10', doc);
  const reportOut = byId('reportOut', doc);
  const visitsBtn = byId<HTMLButtonElement>('btnVisits', doc);
  const m11 = byId('m11', doc);
  const visitsOut = byId('visitsOut', doc);
  const clients = new Map(data.clients.map((c) => [c.code, c]));

  /**
   * The reveal-once panel (brief §10). The plaintext exists only in this response body: it is never
   * stored, never re-read from the sheet, and disappears from the page on the next action.
   */
  /**
   * Reveals the credential panel — and OPENS the dialog it lives in.
   *
   * `#linkOut` sits inside `<Modal id="new-client">`. On the create path that modal is already open,
   * so un-hiding the panel was enough and this looked correct for as long as anyone only ever
   * created customers. "Reset password" is a control on a TABLE ROW, outside the modal: it wrote the
   * one-time plaintext into a hidden element inside a CLOSED dialog, printed "copy it now, it is not
   * shown again", and the password was already live in the sheet. The buyer was locked out with no
   * way back — resetting again just repeated it.
   *
   * `showModal()` on an already-open dialog throws, hence the `open` check.
   */
  const revealPanel = (): void => {
    const dialog = doc.getElementById('new-client');
    if (dialog instanceof HTMLDialogElement && !dialog.open) {
      dialog.showModal();
      // Arriving from a row, the create form is noise and its inputs are the wrong thing to focus:
      // this is a reveal-once panel, not a form. F4 (52:1115) draws the panel alone.
      fields?.setAttribute('hidden', '');
    }
  };

  // …and put it back. A reset hides the create form so the panel stands alone; without this, the
  // next "New customer link" would open a modal with no form in it.
  const opener = doc.querySelector<HTMLElement>('[data-open="new-client"]');
  opener?.addEventListener('click', () => {
    fields?.removeAttribute('hidden');
    linkOut.hidden = true;
  });

  const showLink = (c: ClientLike, password?: string): void => {
    credUrl.textContent = c.link;
    credPassword.textContent = password ?? '';
    linkCode.textContent = c.code;
    linkNote.textContent = `Send this link; their ❤/👎 are recorded under ${c.name}.`;
    // Each control carries what IT copies; the footer button carries both on two lines, which is the
    // shape that gets pasted into a message. Set on the element, never rendered into the page twice.
    for (const el of credCopies) {
      const what = el.dataset.copyWhat;
      el.setAttribute(
        'data-copy',
        what === 'url'
          ? c.link
          : what === 'password'
            ? (password ?? '')
            : `${c.link}
${password ?? ''}`,
      );
    }
    linkOut.hidden = false;
    revealPanel();
  };

  const doGenerate = async (): Promise<void> => {
    const n = name.value.trim();
    if (!n) {
      msg(m8, 'Give the client a name first.', 'err');
      return;
    }
    // Blank is fine and means "generate one"; anything typed has to clear the floor before we spend
    // a round trip on it.
    const chosen = pwField.value.trim();
    if (chosen) {
      const problem = customerPasswordProblem(chosen);
      if (problem) {
        msg(m8, problem, 'err');
        pwField.focus();
        return;
      }
    }
    generate.disabled = true;
    msg(m8, 'Generating…', 'busy');
    const r = await post<{ client: ClientLike; password: string; audit: { row: number } }>(
      '/api/admin/clients',
      { name: n, note: note.value.trim(), ...(chosen ? { password: chosen } : {}) },
      api,
    );
    generate.disabled = false;
    if (!r.ok) {
      msg(m8, r.message, 'err');
      return;
    }
    const c = r.data.client;
    clients.set(c.code, c);
    tbody.insertBefore(clientRow(c, doc), tbody.firstChild);
    showLink(c, r.data.password);
    msg(m8, `Link ready for ${c.name} — copy it below. Audit row ${r.data.audit.row}.`, 'ok');
    name.value = '';
    note.value = '';
    pwField.value = '';
    // Focus the one control that copies BOTH — it is the only thing worth doing on this panel, and
    // it is where the keyboard should already be when the panel appears.
    doc.querySelector<HTMLElement>('.credential [data-copy-what="both"]')?.focus();
  };

  const setStatus = async (code: string, status: 'active' | 'revoked'): Promise<void> => {
    const current = clients.get(code);
    const tr = tbody.querySelector<HTMLTableRowElement>(`tr[data-code="${CSS.escape(code)}"]`);
    if (!current || !tr) return;
    const b = tr.querySelector<HTMLInputElement>('[data-act="toggle"]');
    if (b) b.disabled = true;
    msg(m9, `${status === 'revoked' ? 'Revoking' : 'Restoring'} ${current.name}…`, 'busy');
    const r = await post<{ client: ClientLike; audit: { row: number } }>(
      `/api/admin/clients/${encodeURIComponent(code)}/status`,
      { status, version: current.version },
      api,
    );
    if (!r.ok) {
      if (b) b.disabled = false;
      msg(m9, r.status === 409 ? 'This row changed in the sheet — reload the page.' : r.message, 'err');
      return;
    }
    clients.set(code, r.data.client);
    tr.replaceWith(clientRow(r.data.client, doc));
    msg(m9, `${r.data.client.name} is now ${r.data.client.status}. Audit row ${r.data.audit.row}.`, 'ok');
  };

  const resetPassword = async (code: string, chosen = ''): Promise<void> => {
    const current = clients.get(code);
    const tr = tbody.querySelector<HTMLTableRowElement>(`tr[data-code="${CSS.escape(code)}"]`);
    if (!current || !tr) return;
    msg(m9, `Setting a new password for ${current.name}…`, 'busy');
    const r = await post<{ client: ClientLike; password: string; audit: { row: number } }>(
      `/api/admin/clients/${encodeURIComponent(code)}/regenerate`,
      { version: current.version, ...(chosen ? { password: chosen } : {}) },
      api,
    );
    if (!r.ok) {
      msg(m9, r.status === 409 ? 'This row changed in the sheet — reload the page.' : r.message, 'err');
      return;
    }
    clients.set(code, r.data.client);
    tr.replaceWith(clientRow(r.data.client, doc));
    showLink(r.data.client, r.data.password);
    msg(m9, `New password for ${r.data.client.name} — copy it now, it is not shown again.`, 'ok');
  };

  /**
   * The access log. Fetched on load rather than on a button, because "has this buyer opened it yet"
   * is the question the owner has every time they arrive, and one extra sheet read on an admin page
   * nobody else visits is a fair price for not having to ask for it.
   */
  const loadVisits = async (): Promise<void> => {
    visitsBtn.disabled = true;
    msg(m11, 'Reading the access log…', 'busy');
    const r = await get<VisitsLike>('/api/admin/clients/visits', { timeoutMs: 30_000, ...api });
    visitsBtn.disabled = false;
    if (!r.ok) {
      msg(m11, r.message, 'err');
      return;
    }
    renderVisits(visitsOut, r.data, doc);
    const seen = new Map(r.data.byClient.map((c) => [c.code, c]));
    tbody.querySelectorAll<HTMLTableRowElement>('tr[data-code]').forEach((tr) => {
      const row = seen.get(tr.dataset.code ?? '');
      const visits = tr.querySelector('[data-visits]');
      const last = tr.querySelector<HTMLElement>('[data-last-seen]');
      if (visits) {
        // The drawn states are "Opened" and "Not visited" — a count of 0 reads as a measurement,
        // where the point is only whether the buyer has been (52:887).
        const n = row?.visits ?? 0;
        visits.textContent = n > 0 ? 'Opened' : 'Not visited';
        visits.classList.toggle('badge--success', n > 0);
        if (n > 0) visits.setAttribute('title', `${n} ${n === 1 ? 'visit' : 'visits'}`);
      }
      if (last) {
        last.textContent = whenText(row?.lastSeen ?? '');
        if (row?.lastSeen) last.title = row.lastSeen;
      }
    });
    hide(m11);
  };

  const loadReport = async (): Promise<void> => {
    reportBtn.disabled = true;
    msg(m10, 'Reading the votes…', 'busy');
    const r = await get<ReportLike>('/api/admin/clients/report', { timeoutMs: 30_000, ...api });
    reportBtn.disabled = false;
    if (!r.ok) {
      msg(m10, r.message, 'err');
      return;
    }
    renderReport(reportOut, r.data, doc);
    hide(m10);
  };

  /**
   * The reset dialog. A per-row password input would clutter the table, and a browser prompt cannot
   * be styled or validated, so the choice is made in a real <dialog> — the same control the rug page
   * uses to confirm a destructive action.
   */
  const pwDialog = byId<HTMLDialogElement>('pwDialog', doc);
  const pwDialogTitle = byId('pwDialogTitle', doc);
  const pwDialogInput = byId<HTMLInputElement>('pwDialogInput', doc);
  const pwDialogErr = byId('pwDialogErr', doc);
  const pwDialogOk = byId<HTMLButtonElement>('pwDialogOk', doc);
  const pwDialogCancel = byId<HTMLButtonElement>('pwDialogCancel', doc);
  let pwTarget = '';

  const askPassword = (code: string): void => {
    pwTarget = code;
    pwDialogInput.value = '';
    pwDialogErr.hidden = true;
    pwDialogTitle.textContent = `Reset password for ${clients.get(code)?.name ?? code}`;
    if (typeof pwDialog.showModal === 'function') pwDialog.showModal();
    else void resetPassword(code); // no dialog support: fall back to generating one
    pwDialogInput.focus();
  };

  pwDialogOk.addEventListener('click', () => {
    const chosen = pwDialogInput.value.trim();
    const problem = chosen ? customerPasswordProblem(chosen) : undefined;
    if (problem) {
      pwDialogErr.textContent = problem;
      pwDialogErr.hidden = false;
      pwDialogInput.focus();
      return;
    }
    pwDialog.close();
    void resetPassword(pwTarget, chosen);
  });
  pwDialogCancel.addEventListener('click', () => pwDialog.close());

  generate.addEventListener('click', () => void doGenerate());
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void doGenerate();
    }
  });
  tbody.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const tr = b?.closest<HTMLTableRowElement>('tr[data-code]');
    if (!b || !tr?.dataset.code) return;
    if (b.dataset.act === 'password') {
      askPassword(tr.dataset.code);
      return;
    }
    void setStatus(tr.dataset.code, b.dataset.act === 'revoke' ? 'revoked' : 'active');
  });

  /* The Active column is a switch (Figma F1). It is a real checkbox, so it changes rather than
     clicks — and if the write fails, setStatus puts the row back, which means the switch must
     follow the SERVER's answer, never its own optimistic flip. */
  tbody.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.act !== 'toggle') return;
    const tr = input.closest<HTMLTableRowElement>('tr[data-code]');
    if (!tr?.dataset.code) return;
    void setStatus(tr.dataset.code, input.checked ? 'active' : 'revoked');
  });
  reportBtn.addEventListener('click', () => void loadReport());
  visitsBtn.addEventListener('click', () => void loadVisits());
  void loadVisits();
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') doc.querySelectorAll<HTMLElement>('.msg.on').forEach(hide);
  });
  return { generate: doGenerate, setStatus, resetPassword, loadReport, loadVisits };
}
