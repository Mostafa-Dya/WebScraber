// /admin/collections (docs/ADMIN_SPEC.md §8.3): ▲/▼ reorder (POST …/reorder with the whole order),
// inline edit + Save (version-guarded; 409 → refresh from the API), add form; tags as chips with an
// edit panel (name + colour) and an add form. Rows are rebuilt from API answers as text nodes.
import { get, issuesText, post, type ApiOptions } from './api.ts';
import { byId, clear, el, readJson } from './dom.ts';
import { hide, msg } from './msg.ts';

export interface CollectionLike {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  sortOrder?: number;
  row: number;
  version: string;
  rugs?: number;
}

export interface TagLike {
  id: string;
  slug: string;
  name: string;
  color?: string;
  row: number;
  version: string;
  rugs?: number;
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function collectionRow(
  c: CollectionLike,
  index: number,
  doc: Document = document,
): HTMLTableRowElement {
  const input = (field: string, value: string, label: string): HTMLInputElement =>
    el('input', { 'data-field': field, value, 'aria-label': label }, [], doc);
  return el(
    'tr',
    { 'data-id': c.id, 'data-version': c.version, 'data-name': c.name },
    [
      el('td', { class: 'n' }, String(c.sortOrder ?? index + 1), doc),
      el('td', {}, input('name', c.name, `Name of ${c.name}`), doc),
      el('td', { class: 'mono' }, c.slug, doc),
      el('td', {}, input('description', c.description, `Description of ${c.name}`), doc),
      el('td', {}, input('cover', c.coverImageUrl ?? '', `Cover of ${c.name}`), doc),
      el('td', { class: 'n' }, String(c.rugs ?? 0), doc),
      el(
        'td',
        { class: 'acts' },
        [
          el(
            'button',
            { type: 'button', class: 'chip', 'data-act': 'up', 'aria-label': `Move ${c.name} up` },
            '▲',
            doc,
          ),
          el(
            'button',
            { type: 'button', class: 'chip', 'data-act': 'down', 'aria-label': `Move ${c.name} down` },
            '▼',
            doc,
          ),
          el('button', { type: 'button', class: 'chip', 'data-act': 'save' }, 'Save', doc),
        ],
        doc,
      ),
    ],
    doc,
  );
}

export function tagChip(t: TagLike, doc: Document = document): HTMLButtonElement {
  const b = el(
    'button',
    {
      type: 'button',
      class: 'chip',
      'data-id': t.id,
      'data-version': t.version,
      'data-name': t.name,
      'data-color': t.color ?? '',
      'data-rugs': t.rugs ?? 0,
    },
    [],
    doc,
  );
  if (t.color && COLOR_RE.test(t.color)) {
    const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' }, [], doc);
    swatch.style.backgroundColor = t.color; // CSSOM, allowed under the hash CSP
    b.appendChild(swatch);
  }
  b.appendChild(doc.createTextNode(t.name));
  return b;
}

export interface CollectionsPage {
  move(id: string, dir: 'up' | 'down'): Promise<void>;
  saveCollection(id: string): Promise<void>;
  addCollection(): Promise<void>;
  openTag(id: string): void;
  saveTag(): Promise<void>;
  addTag(): Promise<void>;
  refresh(): Promise<void>;
}

export function initCollections(doc: Document = document, api: ApiOptions = {}): CollectionsPage {
  const data = readJson<{ collections: CollectionLike[]; tags: TagLike[] }>('admin-data', doc);
  const rugCounts = new Map(data.collections.map((c) => [c.id, c.rugs ?? 0]));
  const tagCounts = new Map(data.tags.map((t) => [t.id, t.rugs ?? 0]));
  let collections = new Map(data.collections.map((c) => [c.id, c]));
  let tags = new Map(data.tags.map((t) => [t.id, t]));

  const tbody = byId<HTMLTableElement>('collectionTable', doc).querySelector('tbody')!;
  const m5 = byId('m5', doc);
  const m6 = byId('m6', doc);
  const cName = byId<HTMLInputElement>('c_name', doc);
  const cDescription = byId<HTMLInputElement>('c_description', doc);
  const cCover = byId<HTMLInputElement>('c_cover', doc);
  const addCollectionBtn = byId<HTMLButtonElement>('btnAddCollection', doc);
  const tagList = byId('tagList', doc);
  const tagEdit = byId('tagEdit', doc);
  const tName = byId<HTMLInputElement>('t_name', doc);
  const tColor = byId<HTMLInputElement>('t_color', doc);
  const tNoColor = byId<HTMLInputElement>('t_noColor', doc);
  const tagEditHint = byId('tagEditHint', doc);
  const saveTagBtn = byId<HTMLButtonElement>('btnSaveTag', doc);
  const cancelTagBtn = byId<HTMLButtonElement>('btnCancelTag', doc);
  const m7 = byId('m7', doc);
  const ntName = byId<HTMLInputElement>('nt_name', doc);
  const ntColor = byId<HTMLInputElement>('nt_color', doc);
  const ntNoColor = byId<HTMLInputElement>('nt_noColor', doc);
  const addTagBtn = byId<HTMLButtonElement>('btnAddTag', doc);
  const m8 = byId('m8', doc);
  let editingTag: string | undefined;

  const ordered = (): CollectionLike[] =>
    [...collections.values()].sort(
      (a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name),
    );

  const renderCollections = (): void => {
    clear(tbody);
    ordered().forEach((c, i) =>
      tbody.appendChild(collectionRow({ ...c, rugs: rugCounts.get(c.id) ?? 0 }, i, doc)),
    );
  };

  const renderTags = (): void => {
    clear(tagList);
    for (const t of [...tags.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      tagList.appendChild(tagChip({ ...t, rugs: tagCounts.get(t.id) ?? 0 }, doc));
    }
  };

  const refresh = async (): Promise<void> => {
    const [c, t] = await Promise.all([
      get<{ collections: CollectionLike[] }>('/api/admin/collections', api),
      get<{ tags: TagLike[] }>('/api/admin/tags', api),
    ]);
    if (c.ok) {
      collections = new Map(c.data.collections.map((x) => [x.id, x]));
      renderCollections();
    }
    if (t.ok) {
      tags = new Map(t.data.tags.map((x) => [x.id, x]));
      renderTags();
    }
  };

  const rowInputs = (tr: HTMLTableRowElement): { name: string; description: string; cover: string } => {
    const v = (field: string): string =>
      tr.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.value.trim() ?? '';
    return { name: v('name'), description: v('description'), cover: v('cover') };
  };

  const move = async (id: string, dir: 'up' | 'down'): Promise<void> => {
    const rows = [...tbody.querySelectorAll<HTMLTableRowElement>('tr[data-id]')];
    const i = rows.findIndex((r) => r.dataset.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const me = rows[i]!;
    const other = rows[j]!;
    if (dir === 'up') tbody.insertBefore(me, other);
    else tbody.insertBefore(other, me);
    const order = [...tbody.querySelectorAll<HTMLTableRowElement>('tr[data-id]')].map(
      (r) => r.dataset.id ?? '',
    );
    msg(m5, 'Saving the order…', 'busy');
    const r = await post<{ collections: CollectionLike[]; audit?: { row: number } }>(
      '/api/admin/collections/reorder',
      { order },
      api,
    );
    if (!r.ok) {
      msg(m5, r.message, 'err');
      await refresh();
      return;
    }
    collections = new Map(r.data.collections.map((x) => [x.id, x]));
    renderCollections();
    msg(m5, r.data.audit ? `Order saved. Audit row ${r.data.audit.row}.` : 'Order unchanged.', 'ok');
    tbody
      .querySelector<HTMLButtonElement>(`tr[data-id="${CSS.escape(id)}"] button[data-act="${dir}"]`)
      ?.focus();
  };

  const saveCollection = async (id: string): Promise<void> => {
    const tr = tbody.querySelector<HTMLTableRowElement>(`tr[data-id="${CSS.escape(id)}"]`);
    const current = collections.get(id);
    if (!tr || !current) return;
    const { name, description, cover } = rowInputs(tr);
    if (!name) {
      msg(m5, 'A collection needs a name.', 'err');
      return;
    }
    const buttons = tr.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((b) => (b.disabled = true));
    msg(m5, `Saving ${current.name}…`, 'busy');
    const r = await post<{
      collection: CollectionLike;
      audit?: { row: number };
      detached?: number;
      unchanged?: boolean;
    }>(
      `/api/admin/collections/${encodeURIComponent(id)}`,
      { name, description, coverImageUrl: cover, version: tr.dataset.version ?? current.version },
      api,
    );
    buttons.forEach((b) => (b.disabled = false));
    if (!r.ok) {
      msg(m5, r.status === 400 ? issuesText(r) : r.message, 'err');
      if (r.status === 409) await refresh();
      return;
    }
    if (r.data.unchanged) {
      msg(m5, 'Nothing changed.', 'busy');
      return;
    }
    collections.set(id, r.data.collection);
    renderCollections();
    const detached = r.data.detached ?? 0;
    msg(
      m5,
      `Saved ${r.data.collection.name}. Audit row ${r.data.audit?.row ?? '?'}.` +
        (detached > 0
          ? ` ${detached} rug${detached === 1 ? '' : 's'} still store the old name "${current.name}".`
          : ''),
      detached > 0 ? 'busy' : 'ok',
    );
  };

  const addCollection = async (): Promise<void> => {
    const name = cName.value.trim();
    if (!name) {
      msg(m6, 'Give the collection a name.', 'err');
      return;
    }
    addCollectionBtn.disabled = true;
    msg(m6, 'Adding…', 'busy');
    const r = await post<{ collection: CollectionLike; audit: { row: number } }>(
      '/api/admin/collections',
      { name, description: cDescription.value.trim(), coverImageUrl: cCover.value.trim() },
      api,
    );
    addCollectionBtn.disabled = false;
    if (!r.ok) {
      msg(m6, r.status === 400 ? issuesText(r) : r.message, 'err');
      return;
    }
    collections.set(r.data.collection.id, r.data.collection);
    rugCounts.set(r.data.collection.id, 0);
    renderCollections();
    cName.value = '';
    cDescription.value = '';
    cCover.value = '';
    msg(
      m6,
      `Added ${r.data.collection.name} (row ${r.data.collection.row}). Audit row ${r.data.audit.row}.`,
      'ok',
    );
  };

  const openTag = (id: string): void => {
    const t = tags.get(id);
    if (!t) return;
    editingTag = id;
    tName.value = t.name;
    const hasColor = Boolean(t.color && COLOR_RE.test(t.color));
    tNoColor.checked = !hasColor;
    if (hasColor) tColor.value = t.color!;
    const n = tagCounts.get(id) ?? 0;
    tagEditHint.textContent = `${n} rug${n === 1 ? '' : 's'} use "${t.name}". Renaming does not rewrite them.`;
    tagEdit.hidden = false;
    tName.focus();
  };

  const closeTag = (): void => {
    editingTag = undefined;
    tagEdit.hidden = true;
  };

  const saveTag = async (): Promise<void> => {
    const id = editingTag;
    const t = id ? tags.get(id) : undefined;
    if (!id || !t) return;
    const name = tName.value.trim();
    if (!name) {
      msg(m7, 'A tag needs a name.', 'err');
      return;
    }
    saveTagBtn.disabled = true;
    msg(m7, `Saving ${t.name}…`, 'busy');
    const body: Record<string, unknown> = { name, version: t.version };
    if (!tNoColor.checked) body.color = tColor.value;
    const r = await post<{ tag: TagLike; audit?: { row: number }; detached?: number; unchanged?: boolean }>(
      `/api/admin/tags/${encodeURIComponent(id)}`,
      body,
      api,
    );
    saveTagBtn.disabled = false;
    if (!r.ok) {
      msg(m7, r.status === 400 ? issuesText(r) : r.message, 'err');
      if (r.status === 409) await refresh();
      return;
    }
    if (r.data.unchanged) {
      msg(m7, 'Nothing changed.', 'busy');
      closeTag();
      return;
    }
    tags.set(id, r.data.tag);
    renderTags();
    closeTag();
    const detached = r.data.detached ?? 0;
    msg(
      m7,
      `Saved ${r.data.tag.name}. Audit row ${r.data.audit?.row ?? '?'}.` +
        (detached > 0 ? ` ${detached} rug${detached === 1 ? '' : 's'} still store "${t.name}".` : ''),
      detached > 0 ? 'busy' : 'ok',
    );
  };

  const addTag = async (): Promise<void> => {
    const name = ntName.value.trim();
    if (!name) {
      msg(m8, 'Give the tag a name.', 'err');
      return;
    }
    addTagBtn.disabled = true;
    msg(m8, 'Adding…', 'busy');
    const body: Record<string, unknown> = { name };
    if (!ntNoColor.checked) body.color = ntColor.value;
    const r = await post<{ tag: TagLike; audit: { row: number } }>('/api/admin/tags', body, api);
    addTagBtn.disabled = false;
    if (!r.ok) {
      msg(m8, r.status === 400 ? issuesText(r) : r.message, 'err');
      return;
    }
    tags.set(r.data.tag.id, r.data.tag);
    tagCounts.set(r.data.tag.id, 0);
    renderTags();
    ntName.value = '';
    msg(m8, `Added ${r.data.tag.name}. Audit row ${r.data.audit.row}.`, 'ok');
  };

  tbody.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const tr = b?.closest<HTMLTableRowElement>('tr[data-id]');
    if (!b || !tr?.dataset.id) return;
    const id = tr.dataset.id;
    if (b.dataset.act === 'up' || b.dataset.act === 'down') void move(id, b.dataset.act);
    else if (b.dataset.act === 'save') void saveCollection(id);
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    const tr = e.target.closest<HTMLTableRowElement>('tr[data-id]');
    if (!tr?.dataset.id) return;
    e.preventDefault();
    void saveCollection(tr.dataset.id);
  });
  addCollectionBtn.addEventListener('click', () => void addCollection());
  cName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addCollection();
    }
  });
  tagList.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
    if (b?.dataset.id) openTag(b.dataset.id);
  });
  saveTagBtn.addEventListener('click', () => void saveTag());
  cancelTagBtn.addEventListener('click', closeTag);
  tName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveTag();
    }
  });
  addTagBtn.addEventListener('click', () => void addTag());
  ntName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addTag();
    }
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      doc.querySelectorAll<HTMLElement>('.msg.on').forEach(hide);
      if (!tagEdit.hidden) closeTag();
    }
  });

  return { move, saveCollection, addCollection, openTag, saveTag, addTag, refresh };
}
