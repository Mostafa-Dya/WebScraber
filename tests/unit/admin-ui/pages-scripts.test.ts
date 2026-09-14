// @vitest-environment happy-dom
// The collections, clients, audit and dashboard page scripts (docs/ADMIN_SPEC.md §8.3) on the
// markup their pages render: reorder posts the whole order, inline save carries the version and
// refreshes on 409, tag edit / add, client link generation + copy + revoke, the saves report, audit
// filter + load more, relative times.
import { beforeEach, describe, expect, it } from 'vitest';
import { auditRow, initAudit, pretty } from '../../../src/scripts/admin/audit.ts';
import { clientRow, initClients, renderReport } from '../../../src/scripts/admin/clients.ts';
import { collectionRow, initCollections, tagChip } from '../../../src/scripts/admin/collections.ts';
import { initDashboard, relativeTime } from '../../../src/scripts/admin/dashboard.ts';
import { jsonForScript } from '../../../src/lib/view.ts';

type Handler = (
  url: string,
  method: string,
  body: Record<string, unknown>,
) => { status: number; body: unknown };
function fakeFetch(
  handler: Handler,
  calls: Array<{ url: string; method: string; body: Record<string, unknown> }>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body });
    const r = handler(url, method, body);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}
const data = (value: unknown): string =>
  `<script type="application/json" id="admin-data">${jsonForScript(value)}</script>`;
const text = (id: string): string => document.getElementById(id)?.textContent?.trim() ?? '';
const cls = (id: string): string => document.getElementById(id)?.className ?? '';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('collections.ts', () => {
  const collections = [
    {
      id: 'tulu',
      slug: 'tulu',
      name: 'Tulu',
      description: '',
      sortOrder: 1,
      row: 3,
      version: 'a'.repeat(16),
      rugs: 0,
    },
    {
      id: 'kilims',
      slug: 'kilims',
      name: 'Kilims',
      description: 'Flat',
      coverImageUrl: '',
      sortOrder: 2,
      row: 2,
      version: 'b'.repeat(16),
      rugs: 2,
    },
  ];
  const tags = [
    { id: 'kilim', slug: 'kilim', name: 'Kilim', color: '#bb3e03', row: 2, version: 'c'.repeat(16), rugs: 1 },
  ];
  const markup = (): string => `
    <div id="m5" class="msg"></div>
    <ul id="collectionList">${collections.map((c, i) => collectionRow(c, i).outerHTML).join('')}</ul>
    <input id="c_name" /><input id="c_description" /><input id="c_cover" /><button id="btnAddCollection"></button><div id="m6" class="msg"></div>
    <div id="tagList" class="chips">${tags.map((t) => tagChip(t).outerHTML).join('')}</div>
    <div id="tagEdit" hidden><input id="t_name" /><input id="t_color" type="color" value="#000000" /><input id="t_noColor" type="checkbox" />
      <button id="btnSaveTag"></button><button id="btnCancelTag"></button><p id="tagEditHint"></p></div>
    <div id="m7" class="msg"></div>
    <input id="nt_name" /><input id="nt_color" type="color" value="#2f6b3a" /><input id="nt_noColor" type="checkbox" checked /><button id="btnAddTag"></button><div id="m8" class="msg"></div>
    ${data({ collections, tags })}`;

  it('▲/▼ reorders the rows and posts the whole order; failure refreshes from the API', async () => {
    document.body.innerHTML = markup();
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    let fail = false;
    const page = initCollections(document, {
      fetchImpl: fakeFetch((url) => {
        if (url === '/api/admin/collections/reorder')
          return fail
            ? { status: 400, body: { ok: false, error: 'unknown id', message: 'nope' } }
            : {
                status: 200,
                body: {
                  ok: true,
                  collections: [
                    { ...collections[1], sortOrder: 1, version: 'x'.repeat(16) },
                    { ...collections[0], sortOrder: 2, version: 'y'.repeat(16) },
                  ],
                  audit: { row: 2 },
                },
              };
        if (url === '/api/admin/collections') return { status: 200, body: { ok: true, collections } };
        if (url === '/api/admin/tags') return { status: 200, body: { ok: true, tags } };
        return { status: 500, body: {} };
      }, calls),
    });
    const ids = (): string[] =>
      [...document.querySelectorAll<HTMLElement>('#collectionList [data-id]')].map((r) => r.dataset.id!);
    expect(ids()).toEqual(['tulu', 'kilims']);
    await page.move('kilims', 'up');
    expect(calls[0]).toMatchObject({
      url: '/api/admin/collections/reorder',
      body: { order: ['kilims', 'tulu'] },
    });
    expect(ids()).toEqual(['kilims', 'tulu']);
    expect(document.querySelector<HTMLElement>('[data-id="kilims"]')?.dataset.version).toBe('x'.repeat(16));
    expect(cls('m5')).toBe('msg on ok');
    fail = true;
    await page.move('kilims', 'down');
    expect(cls('m5')).toBe('msg on err');
    expect(ids()).toEqual(['tulu', 'kilims']); // refreshed from the API answer
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+=/i);
  });

  it('inline save carries the version and reports detached rugs; 409 refreshes; add appends', async () => {
    document.body.innerHTML = markup();
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    let conflict = false;
    const page = initCollections(document, {
      fetchImpl: fakeFetch((url, method, body) => {
        if (url === '/api/admin/collections/kilims')
          return conflict
            ? { status: 409, body: { ok: false, error: 'version mismatch', tab: 'Collections', fresh: [] } }
            : {
                status: 200,
                body: {
                  ok: true,
                  collection: { ...collections[1], name: body.name, version: 'n'.repeat(16) },
                  audit: { row: 2 },
                  detached: 2,
                },
              };
        if (url === '/api/admin/collections' && method === 'POST')
          return {
            status: 201,
            body: {
              ok: true,
              collection: {
                id: 'modern',
                slug: 'modern',
                name: 'Modern',
                description: '',
                sortOrder: 3,
                row: 4,
                version: 'm'.repeat(16),
              },
              audit: { row: 2 },
            },
          };
        if (url === '/api/admin/collections') return { status: 200, body: { ok: true, collections } };
        if (url === '/api/admin/tags') return { status: 200, body: { ok: true, tags } };
        return { status: 500, body: {} };
      }, calls),
    });
    const input = document.querySelector<HTMLInputElement>('[data-id="kilims"] input[data-field="name"]')!;
    input.value = 'Flatweaves';
    await page.saveCollection('kilims');
    expect(calls[0]?.body).toEqual({
      name: 'Flatweaves',
      description: 'Flat',
      coverImageUrl: '',
      version: 'b'.repeat(16),
    });
    expect(text('m5')).toContain('2 rugs still store the old name "Kilims"');
    expect(document.querySelector<HTMLElement>('[data-id="kilims"]')?.dataset.version).toBe('n'.repeat(16));
    conflict = true;
    await page.saveCollection('kilims');
    expect(cls('m5')).toBe('msg on err');
    expect(calls.map((c) => c.url)).toContain('/api/admin/collections'); // refresh after 409
    (document.getElementById('c_name') as HTMLInputElement).value = 'Modern';
    await page.addCollection();
    expect(cls('m6')).toBe('msg on ok');
    expect(
      [...document.querySelectorAll<HTMLElement>('#collectionList [data-id]')].map((r) => r.dataset.id),
    ).toContain('modern');
  });

  it('tag chips open the edit panel; save posts name + colour with the version; add creates', async () => {
    document.body.innerHTML = markup();
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const page = initCollections(document, {
      fetchImpl: fakeFetch((url, method, body) => {
        if (url === '/api/admin/tags/kilim')
          return {
            status: 200,
            body: {
              ok: true,
              tag: { ...tags[0], name: body.name, color: body.color ?? '', version: 'z'.repeat(16) },
              audit: { row: 2 },
              detached: 1,
            },
          };
        if (url === '/api/admin/tags' && method === 'POST')
          return {
            status: 201,
            body: {
              ok: true,
              tag: { id: 'red', slug: 'red', name: 'Red', row: 3, version: 'r'.repeat(16) },
              audit: { row: 2 },
            },
          };
        return { status: 500, body: {} };
      }, calls),
    });
    document.querySelector<HTMLButtonElement>('#tagList button[data-id="kilim"]')!.click();
    expect((document.getElementById('tagEdit') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('t_name') as HTMLInputElement).value).toBe('Kilim');
    expect((document.getElementById('t_color') as HTMLInputElement).value).toBe('#bb3e03');
    expect(text('tagEditHint')).toBe('1 rug use "Kilim". Renaming does not rewrite them.');
    (document.getElementById('t_name') as HTMLInputElement).value = 'Kilim weave';
    await page.saveTag();
    expect(calls[0]?.body).toEqual({ name: 'Kilim weave', version: 'c'.repeat(16), color: '#bb3e03' });
    expect((document.getElementById('tagEdit') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#tagList button[data-id="kilim"]')?.dataset.name).toBe(
      'Kilim weave',
    );
    expect(text('m7')).toContain('1 rug still store "Kilim"');
    (document.getElementById('nt_name') as HTMLInputElement).value = 'Red';
    await page.addTag();
    expect(calls[1]?.body).toEqual({ name: 'Red' }); // no colour box checked
    expect(document.querySelectorAll('#tagList button[data-id]')).toHaveLength(2);
  });
});

describe('clients.ts', () => {
  const client = {
    row: 2,
    code: 'nadia-k7m2pq',
    name: 'Nadia',
    note: '',
    status: 'active' as const,
    createdAt: '2026-09-01',
    createdBy: 'owner',
    link: 'https://s.test/nadia-k7m2pq',
    version: 'a'.repeat(16),
  };
  const markup = (): string => `
    <input id="cl_name" /><input id="cl_note" /><input id="cl_pw" /><button id="btnGenerate"></button><div id="m8" class="msg"></div>
    <dialog id="pwDialog"><h3 id="pwDialogTitle"></h3><input id="pwDialogInput" /><p id="pwDialogErr" hidden></p>
      <button id="pwDialogOk"></button><button id="pwDialogCancel"></button></dialog>
    <div id="linkOut" hidden>
      <section class="credential">
        <div class="credential__value"><span data-credential-url></span>
          <button class="credential__copy" data-copy data-copy-what="url"></button></div>
        <div class="credential__value"><span data-credential-password></span>
          <button class="credential__copy" data-copy data-copy-what="password"></button></div>
        <button class="btn btn--primary credential__both" data-copy data-copy-what="both"></button>
      </section>
      <span id="linkCode"></span><span id="linkNote"></span></div>
    <div id="m9" class="msg"></div>
    <table id="clientTable"><tbody>${clientRow(client).outerHTML}</tbody></table>
    <button id="btnReport"></button><div id="m10" class="msg"></div><div id="reportOut"></div>
    <button id="btnVisits"></button><div id="m11" class="msg"></div><div id="visitsOut"></div>
    ${data({ clients: [client], siteOrigin: 'https://s.test' })}`;

  it('generates a link, shows it with Copy, prepends the row; revoke posts the version; the report renders as text', async () => {
    document.body.innerHTML = markup();
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const created = {
      ...client,
      row: 2,
      code: 'lea-abc123',
      name: 'Léa',
      link: 'https://s.test/lea-abc123',
      version: 'l'.repeat(16),
    };
    const page = initClients(document, {
      fetchImpl: fakeFetch((url, method) => {
        if (url === '/api/admin/clients' && method === 'POST')
          return {
            status: 201,
            body: { ok: true, client: created, password: 'amber-loom-serai-47', audit: { row: 2 } },
          };
        if (url === '/api/admin/clients/nadia-k7m2pq/regenerate')
          return {
            status: 200,
            body: {
              ok: true,
              client: { ...client, version: 'p'.repeat(16) },
              password: 'cedar-quarry-tulip-11',
              audit: { row: 3 },
            },
          };
        if (url === '/api/admin/clients/nadia-k7m2pq/status')
          return {
            status: 200,
            body: {
              ok: true,
              client: { ...client, status: 'revoked', version: 'v'.repeat(16) },
              audit: { row: 2 },
            },
          };
        if (url === '/api/admin/clients/visits')
          return {
            status: 200,
            body: {
              ok: true,
              generatedAt: '2026-09-09T00:00:00Z',
              rowsRead: 2,
              rowsDropped: 0,
              byClient: [
                {
                  code: 'nadia-k7m2pq',
                  name: 'Nadia',
                  known: true,
                  status: 'active',
                  visits: 2,
                  firstSeen: '2026-09-01T09:00:00Z',
                  lastSeen: '2026-09-08T17:30:00Z',
                  devices: ['Safari/iOS'],
                },
              ],
              recent: [
                {
                  customerSlug: 'nadia-k7m2pq',
                  occurredAt: '2026-09-08T17:30:00Z',
                  userAgent: 'Safari/iOS',
                  referrer: '',
                  name: 'Nadia',
                  known: true,
                },
              ],
            },
          };
        if (url === '/api/admin/clients/report')
          return {
            status: 200,
            body: {
              ok: true,
              generatedAt: '2026-09-07T00:00:00Z',
              rowsRead: 3,
              rowsDropped: 0,
              mostSaved: [
                {
                  rugId: 'SL-021',
                  name: 'Winks <b>x</b>',
                  slug: 'winks',
                  status: 'active',
                  saves: 2,
                  dislikes: 0,
                },
              ],
              byClient: [
                {
                  code: 'nadia-k7m2pq',
                  name: 'Nadia',
                  known: true,
                  status: 'active',
                  liked: [{ rugId: 'SL-021', name: 'Winks <b>x</b>', slug: 'winks', status: 'active' }],
                  disliked: [],
                },
                {
                  code: 'anon',
                  name: 'anonymous',
                  known: false,
                  liked: [],
                  disliked: [{ rugId: 'SL-022', name: 'Old', slug: 'old', status: 'archived' }],
                },
              ],
            },
          };
        return { status: 500, body: {} };
      }, calls),
    });
    (document.getElementById('cl_name') as HTMLInputElement).value = 'Léa';
    await page.generate();
    const call = (url: string) => calls.find((c) => c.url === url);
    expect(call('/api/admin/clients')).toMatchObject({
      method: 'POST',
      body: { name: 'Léa', note: '' },
    });
    expect((document.getElementById('linkOut') as HTMLElement).hidden).toBe(false);
    expect(document.querySelector('[data-credential-url]')?.textContent).toBe('https://s.test/lea-abc123');
    expect(text('linkCode')).toBe('lea-abc123');
    expect(text('linkNote')).toContain('recorded under Léa');
    // Reveal-once (brief §10): the plaintext is in the create response and nowhere else.
    // The panel is one surface now: there is no separate password sub-block to unhide.
    expect(document.querySelector('[data-credential-password]')?.textContent).toBe('amber-loom-serai-47');
    // F4 (Figma 20:91): one control carries BOTH, because that is what gets pasted into a message.
    const both = document.querySelector<HTMLElement>('[data-copy-what="both"]')!;
    expect(both.getAttribute('data-copy')).toContain('amber-loom-serai-47');
    expect(both.getAttribute('data-copy')).toContain(
      document.querySelector('[data-credential-url]')!.textContent!,
    );
    expect(document.querySelector<HTMLTableRowElement>('#clientTable tr')?.dataset.code).toBe('lea-abc123');
    // Blank means "generate one for me": no password is sent and the server mints it.
    await page.resetPassword('nadia-k7m2pq');
    expect(call('/api/admin/clients/nadia-k7m2pq/regenerate')).toMatchObject({
      method: 'POST',
      body: { version: 'a'.repeat(16) },
    });
    expect(call('/api/admin/clients/nadia-k7m2pq/regenerate')?.body).not.toHaveProperty('password');
    // The new plaintext replaces the old one in the same reveal-once panel.
    expect(document.querySelector('[data-credential-password]')?.textContent).toBe('cedar-quarry-tulip-11');

    // …and a password the owner types is sent through instead.
    await page.resetPassword('nadia-k7m2pq', 'winter-loom-2026');
    expect(calls.filter((c) => c.url.endsWith('/regenerate')).at(-1)?.body).toMatchObject({
      password: 'winter-loom-2026',
    });
    await page.setStatus('nadia-k7m2pq', 'revoked');
    expect(call('/api/admin/clients/nadia-k7m2pq/status')).toMatchObject({
      body: { status: 'revoked', version: 'p'.repeat(16) },
    });
    const row = document.querySelector<HTMLTableRowElement>('tr[data-code="nadia-k7m2pq"]')!;
    expect(row.dataset.status).toBe('revoked');
    expect(row.querySelector<HTMLInputElement>('[data-act="toggle"]')?.checked).toBe(false);
    await page.loadReport();
    const out = document.getElementById('reportOut')!;
    expect(out.textContent).toContain('Most saved');
    expect(out.textContent).toContain('Winks <b>x</b>');
    expect(out.innerHTML).not.toContain('<b>x</b>');
    expect(out.textContent).toContain('Nadia — 1 saved');
    expect(out.textContent).toContain('anonymous — 0 saved');
    expect(out.querySelector('.status-archived')?.textContent).toBe('Old (SL-022)');
    // The saves count lives in the "Most saved" report, not in a column — F1 does not draw one.
    expect(out.textContent).toContain('Nadia — 1 saved');
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+=/i);
  });
  it('renderReport handles an empty report', () => {
    document.body.innerHTML = '<div id="out"></div>';
    renderReport(document.getElementById('out')!, {
      generatedAt: 'now',
      mostSaved: [],
      byClient: [],
      rowsRead: 0,
      rowsDropped: 0,
    });
    expect(text('out')).toContain('No saves logged yet.');
  });
});

describe('audit.ts', () => {
  const entry = (n: number, action: string, target: string) => ({
    row: n,
    timestamp: `t${n}`,
    actor: 'owner',
    action,
    targetTab: 'Rugs',
    targetId: target,
    before: '',
    after: '{"a":1}',
    note: '',
  });
  it('filters rows client-side, loads more pages until the total, renders JSON as text', async () => {
    document.body.innerHTML = `
      <select id="f_action"><option value="">any</option><option value="rug.update">rug.update</option></select>
      <input id="f_target" /><p id="count"></p>
      <table id="auditTable"><tbody>${[entry(2, 'rug.update', 'SL-021'), entry(3, 'auth.login', 'owner')].map((e) => auditRow(e).outerHTML).join('')}</tbody></table>
      <button id="btnMore" data-offset="2"></button><div id="m11" class="msg"></div>`;
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const page = initAudit(document, {
      fetchImpl: fakeFetch((url) => {
        if (url === '/api/admin/audit?offset=2&limit=100')
          return {
            status: 200,
            body: { ok: true, rows: [entry(4, 'rug.update', 'SL-022')], offset: 2, limit: 100, total: 3 },
          };
        return { status: 500, body: {} };
      }, calls),
    });
    const visible = (): string[] =>
      [...document.querySelectorAll<HTMLTableRowElement>('#auditTable tr')]
        .filter((r) => !r.hidden)
        .map((r) => r.dataset.target!);
    expect(visible()).toEqual(['sl-021', 'owner']);
    (document.getElementById('f_action') as HTMLSelectElement).value = 'rug.update';
    document.getElementById('f_action')!.dispatchEvent(new Event('change'));
    expect(visible()).toEqual(['sl-021']);
    await page.loadMore();
    expect(visible()).toEqual(['sl-021', 'sl-022']);
    expect((document.getElementById('btnMore') as HTMLButtonElement).disabled).toBe(true);
    expect(text('m11')).toBe('All 3 rows loaded.');
    const target = document.getElementById('f_target') as HTMLInputElement;
    target.value = '022';
    target.dispatchEvent(new Event('input'));
    expect(visible()).toEqual(['sl-022']);
    expect(text('count')).toBe('1 of 3 loaded rows shown');
    expect(document.querySelector('#auditTable pre')?.textContent).toBe('{\n  "a": 1\n}');
    expect(pretty('not json')).toBe('not json');
  });
});

describe('dashboard.ts', () => {
  it('relativises timestamps', () => {
    const now = Date.parse('2026-09-07T12:00:00Z');
    expect(relativeTime('2026-09-07T11:59:30Z', now)).toBe('30 s ago');
    expect(relativeTime('2026-09-07T11:15:00Z', now)).toBe('45 min ago');
    expect(relativeTime('2026-09-06T12:00:00Z', now)).toBe('24 h ago');
    expect(relativeTime('2026-08-01T12:00:00Z', now)).toBe('37 d ago');
    expect(relativeTime('junk', now)).toBe('');
    document.body.innerHTML =
      '<table><tbody><tr><td data-ts="2026-09-07T11:15:00Z">2026-09-07T11:15:00Z</td>' +
      '<td data-ts="junk">junk</td></tr></tbody></table>';
    initDashboard(document, now);
    const cells = document.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('45 min ago');
    expect(cells[0]?.title).toBe('2026-09-07T11:15:00Z');
    expect(cells[1]?.textContent).toBe('junk');
  });
});
