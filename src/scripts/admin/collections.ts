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

export function collectionRow(c: CollectionLike, index: number, doc: Document = document): HTMLElement {
  const input = (field: string, value: string, label: string): HTMLInputElement =>
    el('input', { 'data-field': field, value, 'aria-label': label, class: 'input' }, [], doc);

  /**
   * A reorder control, cloned from the `#moveTpl` template the page renders with the Icon component.
   *
   * This used to insert the literal character ▲ / ▼ as the button's text, so a rebuilt row showed a
   * bare triangle in the heading font where the server had rendered an icon. `chevron-up` is not in
   * the handoff's icon set, so "up" is the same chevron rotated by `.crow__move--up`.
   */
  const moveButton = (act: 'up' | 'down', aria: string, d: Document): HTMLButtonElement => {
    const tpl = d.getElementById('moveTpl');
    const node = tpl instanceof HTMLTemplateElement ? tpl.content.firstElementChild?.cloneNode(true) : undefined;
    if (node instanceof HTMLButtonElement) {
      node.setAttribute('data-act', act);
      node.setAttribute('aria-label', aria);
      if (act === 'up') node.classList.add('crow__move--up');
      return node;
    }
    // No template (an older page, or a test fixture): still a working, labelled control.
    return el(
      'button',
      { type: 'button', class: `btn btn--ghost crow__move${act === 'up' ? ' crow__move--up' : ''}`, 'data-act': act, 'aria-label': aria },
      '',
      d,
    );
  };

  const ghost = (act: string, label: string, aria?: string): HTMLButtonElement =>
    el(
      'button',
      { type: 'button', class: 'btn btn--ghost', 'data-act': act, ...(aria ? { 'aria-label': aria } : {}) },
      label,
      doc,
    );

  const description = c.description ?? '';

  const head = el(
    'div',
    { class: 'crow__head' },
    [
      el('span', { class: 'crow__name' }, c.name, doc),
      el('span', { class: 'crow__rule' }, [], doc),
      el(
        'span',
        { class: 'crow__count' },
        `${c.rugs ?? 0} ${(c.rugs ?? 0) === 1 ? 'product' : 'products'}`,
        doc,
      ),
      moveButton('up', `Move ${c.name} up`, doc),
      moveButton('down', `Move ${c.name} down`, doc),
      ghost('edit', 'Edit'),
    ],
    doc,
  );

  const children: HTMLElement[] = [head];

  if (description) {
    children.push(el('p', { class: 'crow__description' }, description, doc));
    // "See more expands that row in place; it never navigates away, so comparing two collections'
    // descriptions is a matter of expanding both."
    children.push(
      el('button', { type: 'button', class: 'crow__more', 'data-act': 'expand' }, 'See more', doc),
    );
  }

  children.push(
    el(
      'div',
      { class: 'crow__edit', hidden: 'hidden' },
      [
        input('name', c.name, `Name of ${c.name}`),
        input('description', description, `Description of ${c.name}`),
        input('cover', c.coverImageUrl ?? '', `Cover of ${c.name}`),
        el('button', { type: 'button', class: 'btn btn--primary', 'data-act': 'save' }, 'Save', doc),
        ghost('cancel', 'Cancel'),
      ],
      doc,
    ),
  );

  return el(
    'li',
    {
      class: 'crow',
      'data-id': c.id,
      'data-version': c.version,
      'data-name': c.name,
      'data-order': String(c.sortOrder ?? index + 1),
      'data-slug': c.slug,
    },
    children,
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

  const list = byId('collectionList', doc);
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
    clear(list);
    ordered().forEach((c, i) =>
      list.appendChild(collectionRow({ ...c, rugs: rugCounts.get(c.id) ?? 0 }, i, doc)),
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

  const rowInputs = (tr: HTMLElement): { name: string; description: string; cover: string } => {
    const v = (field: string): string =>
      tr.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)?.value.trim() ?? '';
    return { name: v('name'), description: v('description'), cover: v('cover') };
  };

  const move = async (id: string, dir: 'up' | 'down'): Promise<void> => {
    const rows = [...list.querySelectorAll<HTMLElement>('[data-id]')];
    const i = rows.findIndex((r) => r.dataset.id === id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const me = rows[i]!;
    const other = rows[j]!;
    if (dir === 'up') list.insertBefore(me, other);
    else list.insertBefore(other, me);
    const order = [...list.querySelectorAll<HTMLElement>('[data-id]')].map((r) => r.dataset.id ?? '');
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
    list.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(id)}"] button[data-act="${dir}"]`)?.focus();
  };

  const saveCollection = async (id: string): Promise<void> => {
    const tr = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
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

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    const tr = b?.closest<HTMLElement>('[data-id]');
    if (!b || !tr?.dataset.id) return;
    const id = tr.dataset.id;
    const act = b.dataset.act;
    if (act === 'up' || act === 'down') void move(id, act);
    else if (act === 'save') void saveCollection(id);
    else if (act === 'edit' || act === 'cancel') {
      const panel = tr.querySelector<HTMLElement>('.crow__edit');
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening) panel.querySelector<HTMLInputElement>('input')?.focus();
      else b.closest<HTMLElement>('.crow')?.querySelector<HTMLButtonElement>('[data-act="edit"]')?.focus();
    } else if (act === 'expand') {
      // The clamp is released in place and the label follows, so the control always says what it
      // will do next rather than what it just did.
      const expanded = tr.classList.toggle('crow--expanded');
      b.textContent = expanded ? 'See less' : 'See more';
    }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    const tr = e.target.closest<HTMLElement>('[data-id]');
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
