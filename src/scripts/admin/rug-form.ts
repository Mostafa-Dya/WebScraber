// Add + edit rug form (docs/ADMIN_SPEC.md §8.3), the legacy "Add rug" flow rebuilt: Fetch →
// preview → photos strip → Add to sheet (photos first, then the row), manual entry on any scrape
// failure, "Round to 5", swap sides, suggested tags, "+ new tag"; in edit mode Save with the version
// token (409 → the form reloads the fresh row), Archive / Restore behind a <dialog>. Keyboard:
// Enter in the link field fetches, Enter in "your name" moves to the link, Escape hides the
// banner, Ctrl/⌘+S saves. Buttons are disabled while a request is in flight.
import { extractDriveId } from '../../lib/images.ts';
import { slugify } from '../../lib/text.ts';
import {
  PHOTOS_TIMEOUT_MS,
  SCRAPE_TIMEOUT_MS,
  issuesText,
  post,
  type ApiFail,
  type ApiOptions,
} from './api.ts';
import { initChips, type ChipGroup } from './chips.ts';
import { append, byId, clear, el, maybe, money, readJson, setDisabled } from './dom.ts';
import { hide, hideVisible, msg } from './msg.ts';
import { parsePrice, roundUpToStep } from './price.ts';

/* ---------- data shapes (mirrors of the server types, kept structural) ---------- */

export interface RugLike {
  id: string;
  slug: string;
  name: string;
  description: string;
  collection: string;
  tags: string[];
  photos: string[];
  widthCm?: number;
  lengthCm?: number;
  material: string;
  age: string;
  origin: string;
  method: string;
  priceUsd?: number;
  rotate: 'force' | 'true' | 'false';
  featured: boolean;
  status: 'active' | 'draft' | 'archived';
  likes: number;
  dislikes: number;
  rating: number;
  sourceUrl: string;
  supplier: string;
  supplierRef: string;
  notes: string;
  row: number;
  version: string;
}

export interface FormData {
  mode: 'add' | 'edit';
  rug?: RugLike;
  collections: Array<{ id: string; slug: string; name: string }>;
  tags: Array<{ id: string; slug: string; name: string; color?: string }>;
  nextId?: string;
  defaultStatus: 'active' | 'draft';
  roundStep: number;
  driveScopeOk: boolean | null;
}

export interface ScrapedLike {
  supplier: string;
  supplierRef: string;
  sourceUrl: string;
  supplierTitle: string;
  description?: string;
  widthCm?: number;
  lengthCm?: number;
  sizeRaw?: string;
  material?: string;
  method?: string;
  age?: string;
  origin?: string;
  seenPrice?: number;
  seenCurrency?: string;
  priceUsd?: number;
  suggestedRetailUsd?: number;
  markupApplied?: number;
  roundStep?: number;
  retailEstimate?: string;
  tagsSuggested: string[];
  photos: Array<{ url: string; width?: number; height?: number }>;
  warnings: string[];
}

interface ManualLike {
  supplier: string;
  supplierRef: string;
  sourceUrl: string;
}

export interface RugBody {
  id?: string;
  slug?: string;
  name: string;
  description: string;
  collection: string;
  tags: string[];
  photos: string[];
  widthCm?: number;
  lengthCm?: number;
  material: string;
  method: string;
  age: string;
  origin: string;
  priceUsd?: number;
  rotate: string;
  featured: boolean;
  status: string;
  sourceUrl?: string;
  supplier: string;
  supplierRef: string;
  notes: string;
  roundPrice: boolean;
  version?: string;
}

export interface RugFormOptions extends ApiOptions {
  /** Replaces window.confirm for "use these" tag creation (tests). */
  confirmImpl?: (text: string) => boolean;
}

export interface RugForm {
  mode: 'add' | 'edit';
  fetchUrl(force?: boolean): Promise<void>;
  manualEntry(): void;
  add(): Promise<void>;
  save(): Promise<void>;
  setStatus(status: 'active' | 'draft' | 'archived'): Promise<void>;
  collect(): RugBody;
  fill(rug: RugLike): void;
  applyScrape(data: Partial<ScrapedLike>): void;
  reset(): void;
  busy(): boolean;
  /** The last scrape result applied to the form (undefined after manual entry / reset). */
  scraped(): Partial<ScrapedLike> | undefined;
  chips: ChipGroup;
}

/** Drive ids from the photos textarea: bare ids or any Drive/lh3 link, one per line, de-duplicated. */
export function parsePhotoLines(text: string): { ids: string[]; bad: string[] } {
  const ids: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const id = extractDriveId(line);
    if (id && !ids.includes(id)) ids.push(id);
    else if (!id) bad.push(line);
  }
  return { ids, bad };
}

function intOf(text: string): number | undefined {
  const s = text.trim();
  if (!s) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export function initRugForm(doc: Document = document, opts: RugFormOptions = {}): RugForm {
  const data = readJson<FormData>('admin-data', doc);
  const mode = data.mode;
  const edit = mode === 'edit';
  const api: ApiOptions = {
    fetchImpl: opts.fetchImpl,
    location: opts.location,
    onUnauthorized: opts.onUnauthorized,
  };
  const confirmImpl =
    opts.confirmImpl ?? ((text: string) => (typeof confirm === 'function' ? confirm(text) : true));

  /* ---------- elements ---------- */
  const input = (id: string): HTMLInputElement => byId<HTMLInputElement>(id, doc);
  const yourName = maybe<HTMLInputElement>('yourName', doc);
  const collection = byId<HTMLSelectElement>('f_collection', doc);
  const chips = initChips(byId('tagChips', doc), { multi: true });
  const newTag = input('newTag');
  const btnNewTag = byId<HTMLButtonElement>('btnNewTag', doc);
  const url = maybe<HTMLInputElement>('url', doc);
  const btnFetch = maybe<HTMLButtonElement>('btnFetch', doc);
  const supplierTitle = maybe('supplierTitle', doc);
  const m1 = maybe('m1', doc);
  const preview = byId('preview', doc);
  const f = {
    id: input('f_id'),
    slug: input('f_slug'),
    name: input('f_name'),
    description: byId<HTMLTextAreaElement>('f_description', doc),
    width: input('f_width'),
    length: input('f_length'),
    material: input('f_material'),
    method: input('f_method'),
    age: input('f_age'),
    origin: input('f_origin'),
    price: input('f_price'),
    rotate: byId<HTMLSelectElement>('f_rotate', doc),
    status: byId<HTMLSelectElement>('f_status', doc),
    featured: input('f_featured'),
    sourceUrl: input('f_sourceUrl'),
    supplier: byId<HTMLSelectElement>('f_supplier', doc),
    supplierRef: input('f_supplierRef'),
    notes: byId<HTMLTextAreaElement>('f_notes', doc),
    photos: byId<HTMLTextAreaElement>('f_photos', doc),
    version: input('f_version'),
  };
  const btnSlug = byId<HTMLButtonElement>('btnSlug', doc);
  const btnSwap = byId<HTMLButtonElement>('btnSwap', doc);
  const btnRound = byId<HTMLButtonElement>('btnRound', doc);
  const ftHint = byId('ftHint', doc);
  const priceHint = byId('priceHint', doc);
  const tagHint = byId('tagHint', doc);
  const warnings = byId('warnings', doc);
  const photoStrip = byId('photoStrip', doc);
  const photoCount = maybe('photoCount', doc);
  const photoHint = maybe('photoHint', doc);
  const savePhotos = maybe<HTMLInputElement>('savePhotos', doc);
  const roundOnSave = input('roundOnSave');
  const btnAdd = maybe<HTMLButtonElement>('btnAdd', doc);
  const btnClear = maybe<HTMLButtonElement>('btnClear', doc);
  const btnSave = maybe<HTMLButtonElement>('btnSave', doc);
  const btnArchive = maybe<HTMLButtonElement>('btnArchive', doc);
  const btnRestore = maybe<HTMLButtonElement>('btnRestore', doc);
  const openSite = maybe<HTMLAnchorElement>('openSite', doc);
  const m2 = byId('m2', doc);
  const dialog = maybe<HTMLDialogElement>('confirm', doc);

  const actionButtons = [btnFetch, btnAdd, btnSave, btnArchive, btnRestore, btnNewTag].filter(
    (b): b is HTMLButtonElement => b !== null,
  );
  let inflight = false;
  const setBusy = (on: boolean): void => {
    inflight = on;
    setDisabled(actionButtons, on);
    if (!on && btnArchive && btnRestore) {
      // status buttons follow the current status, not the busy flag
      btnArchive.hidden = f.status.value === 'archived';
      btnRestore.hidden = f.status.value !== 'archived';
    }
  };

  let manual = false;
  let lastManual: ManualLike | undefined;
  let scraped: Partial<ScrapedLike> | undefined;
  let rugId = data.rug?.id ?? '';

  if (photoHint) photoHint.hidden = data.driveScopeOk !== false || edit;

  /* ---------- helpers ---------- */

  const setHint = (node: HTMLElement, text: string | null): void => {
    node.textContent = text ?? '';
    node.hidden = !text;
  };

  const auditLink = (audit: { row: number; action?: string } | undefined): Array<string | Node> =>
    audit ? [' · ', el('a', { href: '/admin/audit' }, `audit row ${audit.row}`, doc)] : [];

  const hasTag = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    return chips
      .buttons()
      .map((b) => b.dataset.value ?? '')
      .find((v) => v.toLowerCase() === key);
  };

  const selectedPhotoUrls = (): string[] =>
    [...photoStrip.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-url]')]
      .filter((c) => c.checked)
      .map((c) => c.dataset.url ?? '');

  const renderPhotoStrip = (photos: Array<{ url: string }>): void => {
    clear(photoStrip);
    photos.slice(0, 12).forEach((p, i) => {
      const box = el(
        'div',
        { class: 'ph' },
        el('img', { src: p.url, alt: '', loading: 'lazy' }, [], doc),
        doc,
      );
      const check = el(
        'input',
        { type: 'checkbox', 'data-url': p.url, checked: true, 'aria-label': `Photo ${i + 1}` },
        [],
        doc,
      );
      check.checked = true;
      check.addEventListener('change', updatePhotoCount);
      photoStrip.appendChild(
        el(
          'label',
          { class: 'card tile' },
          [box, el('span', { class: 'mt' }, [check, ` ${i + 1}`], doc)],
          doc,
        ),
      );
    });
    updatePhotoCount();
  };

  function updatePhotoCount(): void {
    if (!photoCount) return;
    const total = photoStrip.querySelectorAll('input[data-url]').length;
    const n = selectedPhotoUrls().length;
    photoCount.textContent = total ? `${n} of ${total} selected` : '';
  }

  const regenerateSlug = (): void => {
    f.slug.value = slugify(f.name.value.trim() || (yourName?.value.trim() ?? '')) || '';
  };

  const applyStatusUi = (): void => {
    if (btnArchive) btnArchive.hidden = f.status.value === 'archived';
    if (btnRestore) btnRestore.hidden = f.status.value !== 'archived';
    if (openSite) {
      openSite.href = `/rugs/${encodeURIComponent(f.slug.value.trim())}`;
      if (f.status.value === 'active') openSite.removeAttribute('aria-disabled');
      else openSite.setAttribute('aria-disabled', 'true');
    }
  };

  /* ---------- fill / collect ---------- */

  const fill = (rug: RugLike): void => {
    rugId = rug.id;
    f.id.value = rug.id;
    f.slug.value = rug.slug;
    f.name.value = rug.name;
    f.description.value = rug.description;
    collection.value =
      data.collections.find((c) => c.name.toLowerCase() === rug.collection.trim().toLowerCase())?.name ?? '';
    chips.set(rug.tags.map((t) => hasTag(t) ?? t));
    f.width.value = rug.widthCm === undefined ? '' : String(rug.widthCm);
    f.length.value = rug.lengthCm === undefined ? '' : String(rug.lengthCm);
    f.material.value = rug.material;
    f.method.value = rug.method;
    f.age.value = rug.age;
    f.origin.value = rug.origin;
    f.price.value = rug.priceUsd === undefined ? '' : String(rug.priceUsd);
    f.rotate.value = rug.rotate;
    f.status.value = rug.status;
    f.featured.checked = rug.featured;
    f.sourceUrl.value = rug.sourceUrl;
    f.supplier.value = rug.supplier;
    f.supplierRef.value = rug.supplierRef;
    f.notes.value = rug.notes;
    f.photos.value = rug.photos.join('\n');
    f.version.value = rug.version;
    applyStatusUi();
  };

  const collect = (): RugBody => {
    const { ids } = parsePhotoLines(f.photos.value);
    const body: RugBody = {
      name: f.name.value.trim() || (yourName?.value.trim() ?? ''),
      description: f.description.value.trim(),
      collection: collection.value,
      tags: chips.values(),
      photos: ids,
      widthCm: intOf(f.width.value),
      lengthCm: intOf(f.length.value),
      material: f.material.value.trim(),
      method: f.method.value.trim(),
      age: f.age.value.trim(),
      origin: f.origin.value.trim(),
      priceUsd: parsePrice(f.price.value),
      rotate: f.rotate.value,
      featured: f.featured.checked,
      status: f.status.value,
      supplier: f.supplier.value,
      supplierRef: f.supplierRef.value.trim(),
      notes: f.notes.value.trim(),
      roundPrice: roundOnSave.checked,
    };
    const slug = f.slug.value.trim();
    if (slug) body.slug = slug;
    const sourceUrl = f.sourceUrl.value.trim();
    if (sourceUrl) body.sourceUrl = sourceUrl;
    if (!edit) {
      const id = f.id.value.trim();
      if (id) body.id = id;
    } else {
      body.version = f.version.value;
    }
    return body;
  };

  /* ---------- scrape → preview ---------- */

  const applyScrape = (d: Partial<ScrapedLike>): void => {
    scraped = d;
    manual = false;
    const mine = yourName?.value.trim() ?? '';
    if (mine) f.name.value = mine;
    if (!f.slug.value.trim() && f.name.value.trim()) regenerateSlug();
    f.description.value = d.description ?? '';
    f.width.value = d.widthCm === undefined ? '' : String(d.widthCm);
    f.length.value = d.lengthCm === undefined ? '' : String(d.lengthCm);
    f.material.value = d.material ?? '';
    f.method.value = d.method ?? '';
    f.age.value = d.age ?? '';
    f.origin.value = d.origin ?? '';
    f.price.value = d.suggestedRetailUsd === undefined ? '' : String(d.suggestedRetailUsd);
    f.sourceUrl.value = d.sourceUrl ?? '';
    f.supplier.value = d.supplier ?? '';
    f.supplierRef.value = d.supplierRef ?? '';
    if (supplierTitle)
      setHint(supplierTitle, d.supplierTitle ? `Supplier calls it: ${d.supplierTitle}` : null);
    setHint(ftHint, d.sizeRaw ? `Supplier measurement: ${d.sizeRaw}` : null);
    if (d.seenPrice !== undefined) {
      const seen = `${money(d.seenPrice)}${d.seenCurrency && d.seenCurrency !== 'USD' ? ` ${d.seenCurrency}` : ''}`;
      if (d.suggestedRetailUsd !== undefined && d.markupApplied !== undefined && d.priceUsd !== undefined) {
        setHint(
          priceHint,
          `Supplier price ${seen} → ×${d.markupApplied} → ${money(d.priceUsd * d.markupApplied)} → rounded ${money(d.suggestedRetailUsd)}`,
        );
      } else {
        setHint(priceHint, `Supplier price ${seen} — set retail_markup in Settings to derive retail prices`);
      }
    } else setHint(priceHint, 'No supplier price found — enter the retail price by hand.');
    clear(tagHint);
    const suggested = (d.tagsSuggested ?? []).filter((t) => t.trim());
    if (suggested.length) {
      const use = el('button', { type: 'button', class: 'chip', id: 'btnUseTags' }, 'use these', doc);
      use.addEventListener('click', () => void useSuggestedTags(suggested));
      append(tagHint, [`Suggested tags: ${suggested.join(', ')} · `, use]);
      tagHint.hidden = false;
    } else tagHint.hidden = true;
    clear(warnings);
    for (const w of d.warnings ?? []) warnings.appendChild(el('li', {}, w, doc));
    warnings.hidden = (d.warnings ?? []).length === 0;
    renderPhotoStrip(d.photos ?? []);
    preview.classList.add('on');
  };

  const useSuggestedTags = async (suggested: string[]): Promise<void> => {
    const wanted = new Set(chips.values());
    const missing: string[] = [];
    for (const s of suggested) {
      const existing = hasTag(s);
      if (existing) wanted.add(existing);
      else missing.push(s);
    }
    chips.set([...wanted]);
    if (missing.length === 0) return;
    if (
      !confirmImpl(
        `Create ${missing.length} new tag${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}?`,
      )
    )
      return;
    for (const name of missing) await createTag(name, true);
  };

  const createTag = async (name: string, press: boolean): Promise<boolean> => {
    const r = await post<{ tag: { name: string } }>('/api/admin/tags', { name }, api);
    if (!r.ok) {
      if (r.status === 409) {
        const existing = hasTag(name);
        if (existing && press) chips.set([...new Set([...chips.values(), existing])]);
        return Boolean(existing);
      }
      msg(m2, `Tag "${name}": ${r.status === 400 ? issuesText(r) : r.message}`, 'err');
      return false;
    }
    const tagName = r.data.tag.name;
    if (!hasTag(tagName)) chips.add(tagName, tagName, press);
    else if (press) chips.set([...new Set([...chips.values(), tagName])]);
    return true;
  };

  const showFetchError = (fail: ApiFail): void => {
    if (!m1) return;
    const link = el('a', { href: '#', id: 'btnManual' }, 'Enter manually', doc);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      manualEntry();
    });
    const text = fail.status === 400 ? issuesText(fail) : fail.message;
    msg(m1, [text, '  |  ', link], 'err');
  };

  const fetchUrl = async (force = false): Promise<void> => {
    if (!url || !m1 || inflight) return;
    const link = url.value.trim();
    if (!link) {
      msg(m1, 'Paste a link first.', 'err');
      return;
    }
    hide(m2);
    setBusy(true);
    msg(m1, 'Reading the supplier page…', 'busy');
    const r = await post<{ data: ScrapedLike; via: string; cached: boolean; ms: number }>(
      '/api/admin/scrape',
      { url: link, force },
      { ...api, timeoutMs: SCRAPE_TIMEOUT_MS },
    );
    setBusy(false);
    if (!r.ok) {
      lastManual = (r.body?.manual as ManualLike | null | undefined) ?? undefined;
      const partial = r.body?.data as Partial<ScrapedLike> | null | undefined;
      if (partial && r.status === 422) applyScrape(partial);
      showFetchError(r);
      return;
    }
    applyScrape(r.data.data);
    const n = r.data.data.photos.length;
    msg(
      m1,
      `Found it${n ? ` — ${n} photo${n > 1 ? 's' : ''} on the page` : ''}${r.data.cached ? ' (cached)' : ''}. Check the fields, then add.`,
      'ok',
    );
    f.name.focus();
  };

  const manualEntry = (): void => {
    manual = true;
    scraped = undefined;
    const mine = yourName?.value.trim() ?? '';
    if (mine) f.name.value = mine;
    if (!f.slug.value.trim() && f.name.value.trim()) regenerateSlug();
    f.sourceUrl.value = lastManual?.sourceUrl ?? url?.value.trim() ?? '';
    f.supplier.value = lastManual?.supplier ?? '';
    f.supplierRef.value = lastManual?.supplierRef ?? '';
    if (supplierTitle) setHint(supplierTitle, null);
    setHint(ftHint, null);
    setHint(priceHint, null);
    tagHint.hidden = true;
    warnings.hidden = true;
    renderPhotoStrip([]);
    preview.classList.add('on');
    if (m1) msg(m1, 'Manual entry — fill what you need, then Add. No photos will be saved.', 'busy');
    f.name.focus();
  };

  /* ---------- add / save / status ---------- */

  const validate = (): boolean => {
    if (!collection.value) {
      msg(m2, "Pick a collection first — without it the rug won't appear anywhere.", 'err');
      collection.focus();
      return false;
    }
    if (!(f.name.value.trim() || yourName?.value.trim())) {
      msg(m2, 'Give the rug a name.', 'err');
      f.name.focus();
      return false;
    }
    const { bad } = parsePhotoLines(f.photos.value);
    if (bad.length) {
      msg(m2, `Not a Drive id or link: ${bad[0]}`, 'err');
      f.photos.focus();
      return false;
    }
    if (f.price.value.trim() && parsePrice(f.price.value) === undefined) {
      msg(m2, 'The price must be a number such as 1335 or 1335.50.', 'err');
      f.price.focus();
      return false;
    }
    return true;
  };

  const add = async (): Promise<void> => {
    if (!btnAdd || inflight) return;
    hide(m2);
    if (!validate()) return;
    setBusy(true);
    let imported: string[] = [];
    let photoNote = '';
    const urls = savePhotos?.checked && !manual ? selectedPhotoUrls() : [];
    if (urls.length) {
      msg(m2, `Saving ${urls.length} photo${urls.length > 1 ? 's' : ''} to Drive…`, 'busy');
      const prefix = (f.slug.value.trim() || slugify(f.name.value.trim()) || f.id.value.trim() || 'rug')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .slice(0, 60);
      const p = await post<{ photos: Array<{ url: string; id?: string; error?: string }>; imported: number }>(
        '/api/admin/photos',
        { urls, namePrefix: prefix },
        { ...api, timeoutMs: PHOTOS_TIMEOUT_MS },
      );
      const outcome = p.ok
        ? p.data.photos
        : ((p.body?.photos as Array<{ id?: string; error?: string }> | undefined) ?? []);
      imported = outcome.filter((x) => x.id && !x.error).map((x) => x.id!);
      const failed = outcome.filter((x) => x.error).length;
      if (p.ok)
        photoNote = `${imported.length} photo${imported.length === 1 ? '' : 's'} saved to Drive${failed ? `, ${failed} failed` : ''}.`;
      else if (p.status === 409) photoNote = 'Drive is not authorised — no photos saved.';
      else photoNote = `Photos not saved: ${p.message}`;
    }
    const body = collect();
    body.photos = [...new Set([...imported, ...body.photos])];
    msg(m2, 'Writing the row…', 'busy');
    const r = await post<{ rug: RugLike; row: number; audit: { row: number; action: string } }>(
      '/api/admin/rugs',
      body,
      api,
    );
    setBusy(false);
    if (!r.ok) {
      msg(m2, `${r.status === 400 ? issuesText(r) : r.message}${photoNote ? ` (${photoNote})` : ''}`, 'err');
      return;
    }
    const link = el('a', { href: `/admin/rugs/${encodeURIComponent(r.data.rug.id)}` }, r.data.rug.id, doc);
    msg(
      m2,
      ['Added ', link, ` at row ${r.data.row}. ${photoNote}`.trimEnd(), ...auditLink(r.data.audit)],
      'ok',
    );
    reset(true);
  };

  const save = async (): Promise<void> => {
    if (!btnSave || inflight) return;
    hide(m2);
    if (!validate()) return;
    setBusy(true);
    msg(m2, 'Saving…', 'busy');
    const r = await post<{ rug: RugLike; audit?: { row: number }; unchanged?: boolean; changed?: string[] }>(
      `/api/admin/rugs/${encodeURIComponent(rugId)}`,
      collect(),
      api,
    );
    setBusy(false);
    if (r.ok) {
      if (r.data.unchanged) {
        msg(m2, 'Nothing changed.', 'busy');
        return;
      }
      fill(r.data.rug);
      msg(m2, [`Saved ${r.data.changed?.join(', ') ?? ''}.`, ...auditLink(r.data.audit)], 'ok');
      return;
    }
    if (r.status === 409 && r.body?.rug) {
      fill(r.body.rug as RugLike);
      msg(m2, 'Someone changed this row — reloaded the latest values; re-apply your edit.', 'err');
      return;
    }
    msg(m2, r.status === 400 ? issuesText(r) : r.message, 'err');
  };

  const setStatus = async (status: 'active' | 'draft' | 'archived'): Promise<void> => {
    if (!edit || inflight) return;
    hide(m2);
    setBusy(true);
    msg(m2, status === 'archived' ? 'Archiving…' : 'Restoring…', 'busy');
    const r = await post<{ rug: RugLike; audit?: { row: number }; unchanged?: boolean }>(
      `/api/admin/rugs/${encodeURIComponent(rugId)}/status`,
      { status, version: f.version.value },
      api,
    );
    setBusy(false);
    if (r.ok) {
      fill(r.data.rug);
      msg(m2, [`Status is now ${r.data.rug.status}.`, ...auditLink(r.data.audit)], 'ok');
      return;
    }
    if (r.status === 409 && r.body?.rug) {
      fill(r.body.rug as RugLike);
      msg(m2, 'Someone changed this row — reloaded the latest values; try again.', 'err');
      return;
    }
    msg(m2, r.message, 'err');
  };

  const confirmStatus = (status: 'archived' | 'active'): void => {
    const text =
      status === 'archived'
        ? `Archive ${rugId}? It disappears from the site and stops taking votes; you can restore it later.`
        : `Restore ${rugId} to active?`;
    const confirmText = maybe('confirmText', doc);
    const yes = maybe<HTMLButtonElement>('confirmYes', doc);
    const no = maybe<HTMLButtonElement>('confirmNo', doc);
    if (dialog && confirmText && yes && no && typeof dialog.showModal === 'function') {
      confirmText.textContent = text;
      const onYes = (): void => {
        cleanup();
        dialog.close();
        void setStatus(status);
      };
      const onNo = (): void => {
        cleanup();
        dialog.close();
      };
      const cleanup = (): void => {
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
      };
      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      dialog.showModal();
      return;
    }
    if (confirmImpl(text)) void setStatus(status);
  };

  const reset = (keepCollection = false): void => {
    manual = false;
    scraped = undefined;
    lastManual = undefined;
    if (yourName) yourName.value = '';
    if (url) url.value = '';
    if (!keepCollection) collection.value = '';
    chips.set([]);
    for (const node of [
      f.id,
      f.slug,
      f.name,
      f.width,
      f.length,
      f.material,
      f.method,
      f.age,
      f.origin,
      f.price,
      f.sourceUrl,
      f.supplierRef,
    ]) {
      node.value = '';
    }
    f.description.value = '';
    f.notes.value = '';
    f.photos.value = '';
    f.supplier.value = '';
    f.rotate.value = 'false';
    f.featured.checked = false;
    f.status.value = data.defaultStatus;
    f.id.value = data.nextId ?? '';
    if (supplierTitle) setHint(supplierTitle, null);
    setHint(ftHint, null);
    setHint(priceHint, null);
    tagHint.hidden = true;
    warnings.hidden = true;
    renderPhotoStrip([]);
    preview.classList.remove('on');
    if (m1) hide(m1);
    yourName?.focus();
  };

  /* ---------- wiring ---------- */

  btnFetch?.addEventListener('click', () => void fetchUrl(false));
  url?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void fetchUrl(false);
    }
  });
  yourName?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && url) {
      e.preventDefault();
      url.focus();
    }
  });
  yourName?.addEventListener('input', () => {
    if (!edit) f.name.value = yourName.value;
  });
  btnSlug.addEventListener('click', regenerateSlug);
  f.name.addEventListener('input', () => {
    if (!edit && !f.slug.dataset.touched) regenerateSlug();
  });
  f.slug.addEventListener('input', () => {
    f.slug.dataset.touched = '1';
  });
  btnSwap.addEventListener('click', () => {
    const w = f.width.value;
    f.width.value = f.length.value;
    f.length.value = w;
  });
  btnRound.addEventListener('click', () => {
    const n = roundUpToStep(parsePrice(f.price.value), data.roundStep);
    if (n !== undefined) f.price.value = String(n);
  });
  btnNewTag.addEventListener('click', () => void addNewTag());
  newTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addNewTag();
    }
  });
  const addNewTag = async (): Promise<void> => {
    const name = newTag.value.trim();
    if (!name) return;
    btnNewTag.disabled = true;
    const ok = await createTag(name, true);
    btnNewTag.disabled = false;
    if (ok) newTag.value = '';
  };
  btnAdd?.addEventListener('click', () => void add());
  btnClear?.addEventListener('click', () => {
    reset(false);
    hide(m2);
  });
  btnSave?.addEventListener('click', () => void save());
  btnArchive?.addEventListener('click', () => confirmStatus('archived'));
  btnRestore?.addEventListener('click', () => confirmStatus('active'));
  f.status.addEventListener('change', applyStatusUi);
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideVisible(doc);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (edit) void save();
      else if (preview.classList.contains('on')) void add();
    }
  });

  if (edit && data.rug) fill(data.rug);
  else if (!edit) {
    f.status.value = data.defaultStatus;
    if (!f.id.value) f.id.value = data.nextId ?? '';
  }
  applyStatusUi();

  return {
    mode,
    fetchUrl,
    manualEntry,
    add,
    save,
    setStatus,
    collect,
    fill,
    applyScrape,
    reset,
    busy: () => inflight,
    scraped: () => scraped,
    chips,
  };
}
