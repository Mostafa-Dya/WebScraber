// Runs in the NODE environment on purpose: Astro's container renders RugFields here, and the DOM
// comes from tests/helpers/dom.ts (see the note there about happy-dom vs. .astro resolution).
// The add / edit form script (docs/ADMIN_SPEC.md §8.3) against the RugFields markup rendered by
// Astro's container: Fetch → preview → photos strip → Add (photos first, then the row), manual
// entry on a failed scrape, "use these" tags, Round to 5, swap, Enter / Escape / Ctrl+S,
// disabled-while-busy, and the 409 reload in edit mode.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDom } from '../../helpers/dom.ts';
import RugFields from '../../../src/components/admin/RugFields.astro';
import type { AdminRug } from '../../../src/lib/admin/read.ts';
import { jsonForScript } from '../../../src/lib/view.ts';
import { initRugForm, parsePhotoLines, type RugForm } from '../../../src/scripts/admin/rug-form.ts';

const PHOTO = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';
const collections = [
  {
    id: 'kilims',
    slug: 'kilims',
    name: 'Kilims',
    description: '',
    sortOrder: 1,
    row: 2,
    version: 'a'.repeat(16),
  },
  { id: 'tulu', slug: 'tulu', name: 'Tulu', description: '', sortOrder: 2, row: 3, version: 'a'.repeat(16) },
];
const tags = [
  { id: 'kilim', slug: 'kilim', name: 'Kilim', row: 2, version: 'a'.repeat(16) },
  { id: 'red', slug: 'red', name: 'Red', row: 3, version: 'a'.repeat(16) },
];
const PRODUCT_BASE = {
  imageSrc: '',
  imageAltText: '',
  sizeLabel: '',
  sizeBand: '',
  pile: '',
  shape: '',
  vendor: '',
  productCategory: '',
  productType: '',
  published: true,
  variantSku: '',
  variantInventoryPolicy: '',
  variantRequiresShipping: true,
  variantTaxable: true,
  seoTitle: '',
  seoDescription: '',
  sourceSite: '',
  driveFolderId: '',
  driveFolderUrl: '',
  scrapedAt: '',
  commitStatus: '' as const,
  internalNotes: '',
};
const rug: AdminRug = {
  ...PRODUCT_BASE,
  id: 'SL-021',
  slug: 'winks',
  name: 'Winks',
  description: 'A kilim',
  collections: ['Kilims'],
  collection: 'Kilims',
  tags: ['Kilim'],
  photos: [PHOTO],
  widthCm: 135,
  lengthCm: 190,
  material: '100% Wool',
  age: 'Modern',
  origin: 'Denizli, Turkey',
  method: 'Hand-woven',
  priceUsd: 576,
  rotate: 'false',
  featured: false,
  status: 'active',
  likes: 3,
  dislikes: 1,
  rating: 3.75,
  scrapedAt: '',
  row: 2,
  version: 'b'.repeat(16),
  sourceUrl: 'https://karavanrug.com/products/winks',
  supplier: 'karavanrug',
  supplierRef: '1389',
  notes: '',
};

let addHtml = '';
let editHtml = '';
let dom: ReturnType<typeof installDom>;
afterAll(() => dom?.restore());
beforeAll(async () => {
  const container = await AstroContainer.create();
  addHtml = await container.renderToString(RugFields, {
    props: {
      mode: 'add',
      collections,
      tags,
      defaultStatus: 'draft',
      roundStep: 5,
      driveScopeOk: true,
      nextId: 'SL-030',
    },
  });
  editHtml = await container.renderToString(RugFields, {
    props: {
      mode: 'edit',
      rug,
      collections,
      tags,
      defaultStatus: 'active',
      roundStep: 5,
      driveScopeOk: null,
    },
  });
  dom = installDom('http://localhost/admin/rugs/new');
});

const dataBlock = (data: unknown): string =>
  `<script type="application/json" id="admin-data">${jsonForScript(data)}</script>`;
const stripStyles = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, '');

type Handler = (
  url: string,
  body: Record<string, unknown>,
) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
function fakeFetch(
  handler: Handler,
  calls: Array<{ url: string; body: Record<string, unknown> }>,
): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    const r = await handler(url, body);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const val = (id: string): string => (document.getElementById(id) as HTMLInputElement).value;
const set = (id: string, v: string): void => {
  (document.getElementById(id) as HTMLInputElement).value = v;
};
const text = (id: string): string => document.getElementById(id)?.textContent?.trim() ?? '';
const cls = (id: string): string => document.getElementById(id)?.className ?? '';

const scraped = {
  supplier: 'ecarpetgallery',
  supplierRef: '380114',
  sourceUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
  supplierTitle: 'Red 5x8 Andelz Area Rug',
  description: 'Hand-knotted in Afghanistan',
  widthCm: 130,
  lengthCm: 226,
  sizeRaw: `4'3" x 7'5"`,
  material: 'Wool',
  method: 'Hand-knotted',
  age: 'New',
  origin: 'Afghanistan',
  seenPrice: 700,
  seenCurrency: 'USD',
  priceUsd: 700,
  suggestedRetailUsd: 1120,
  markupApplied: 1.6,
  roundStep: 5,
  tagsSuggested: ['Red', 'Geometric'],
  photos: [
    { url: 'https://images.ecarpetwholesale.com/a.jpg' },
    { url: 'https://images.ecarpetwholesale.com/b.jpg' },
  ],
  warnings: ['no cm on page; converted'],
};

/**
 * Tick a collection in the multi-select, the way a user does.
 *
 * The control is no longer a <select> with a `.value` (owner requirement 2026-09-13: a rug can be in
 * several collections), so the test has to check the box and let the change event reach the binder
 * that maintains the summary line — exactly the path a click takes.
 */
function pickCollection(name: string, on = true): void {
  const box = document.querySelector<HTMLInputElement>(
    `#f_collection input[type="checkbox"][value="${name}"]`,
  );
  if (!box) throw new Error(`no collection option "${name}" in the multi-select`);
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The collections currently ticked, in DOM order. */
function pickedCollections(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#f_collection input[type="checkbox"]')]
    .filter((b) => b.checked)
    .map((b) => b.value);
}

describe('parsePhotoLines', () => {
  it('accepts bare ids and Drive / lh3 links, de-duplicates, reports junk', () => {
    const r = parsePhotoLines(
      `${PHOTO}\nhttps://drive.google.com/file/d/${PHOTO}/view\n\nnot-an-id\nhttps://lh3.googleusercontent.com/d/1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=w800`,
    );
    expect(r.ids).toEqual([PHOTO, '1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']);
    expect(r.bad).toEqual(['not-an-id']);
  });
});

/**
 * The fetch modal (P5-P9) is server-rendered on the real pages but not in the `addHtml` fixture, so
 * rug-form falls back to applying the scrape directly. These tests mount the modal too, which turns
 * the GATED path on: nothing reaches the form until "Use these" is pressed.
 */
const FETCH_MODAL = `
  <dialog id="fetch-result" class="fetch">
    <h2 class="fetch__title" data-fetch-title>Fetching</h2>
    <div class="fetch__bar" role="progressbar" data-fetch-bar hidden></div>
    <div class="fetch__body" data-fetch-body></div>
    <div class="fetch__footer" data-fetch-footer></div>
  </dialog>`;

function stubDialogs(): void {
  for (const el of document.querySelectorAll('dialog')) {
    const d = el as HTMLDialogElement & { showModal: () => void; close: () => void };
    d.showModal = () => d.setAttribute('open', '');
    d.close = () => d.removeAttribute('open');
  }
}

describe('add mode', () => {
  let calls: Array<{ url: string; body: Record<string, unknown> }>;
  let form: RugForm;
  const mount = (handler: Handler, confirmImpl?: (t: string) => boolean): RugForm => {
    document.body.innerHTML =
      stripStyles(addHtml) +
      dataBlock({
        mode: 'add',
        collections,
        tags: tags.map((t) => ({ ...t, color: '' })),
        nextId: 'SL-030',
        defaultStatus: 'draft',
        roundStep: 5,
        driveScopeOk: true,
      });
    calls = [];
    return initRugForm(document, {
      fetchImpl: fakeFetch(handler, calls),
      confirmImpl: confirmImpl ?? (() => true),
    });
  };
  beforeEach(() => {
    calls = [];
  });

  it('renders the legacy layout with no inline handlers, prefilled id and default status', () => {
    form = mount(() => ({ status: 500, body: {} }));
    expect(form.mode).toBe('add');
    expect(addHtml).not.toMatch(/\son[a-z]+=/i);
    expect(addHtml).not.toMatch(/\sstyle="/);
    expect(val('f_id')).toBe('SL-030');
    expect((document.getElementById('f_status') as HTMLSelectElement).value).toBe('draft');
    expect((document.getElementById('savePhotos') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('roundOnSave') as HTMLInputElement).checked).toBe(true);
    expect(cls('preview')).toBe('preview');
  });

  it('refuses to fetch without a rug number, and spends no request doing it', async () => {
    // The rug number keys the sheet row and names the Drive folder, so a scrape has nowhere to land
    // without one. It is the drawer's first field (P3 80:1480) and used to be checked only on SAVE
    // — by which point the scrape had already run and the owner had already reviewed the modal.
    // It also used to be rendered inside `#preview`, which is display:none until a scrape succeeds,
    // so the field the drawer opens on was not on screen at all.
    form = mount(() => ({ status: 200, body: { ok: true, data: scraped, via: 'impit', cached: false, ms: 5 } }));
    const id = document.getElementById('f_id') as HTMLInputElement;
    const url = document.getElementById('url') as HTMLInputElement;
    id.value = '';
    url.value = 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114';
    (document.getElementById('btnFetch') as HTMLButtonElement).click();

    expect(cls('m1')).toBe('msg on err');
    expect(text('m1')).toContain('rug a number');
    expect(calls).toHaveLength(0); // nothing was sent
    expect(document.activeElement).toBe(id); // and the cursor is in the field that needs filling
  });

  it('Enter in "your name" moves to the link, Enter in the link fetches, the preview fills from the scrape', async () => {
    form = mount((url) =>
      url === '/api/admin/scrape'
        ? { status: 200, body: { ok: true, data: scraped, via: 'impit', cached: false, ms: 5 } }
        : { status: 500, body: {} },
    );
    const yourName = document.getElementById('yourName') as HTMLInputElement;
    const url = document.getElementById('url') as HTMLInputElement;
    yourName.value = 'Khal Mohammadi';
    yourName.dispatchEvent(new Event('input'));
    yourName.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(url);
    url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(cls('m1')).toBe('msg on err'); // "Paste a link first."
    url.value = 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114';
    url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(form.busy()).toBe(true);
    expect((document.getElementById('btnFetch') as HTMLButtonElement).disabled).toBe(true);
    await vi.waitFor(() => expect(form.busy()).toBe(false));
    expect(calls[0]).toEqual({ url: '/api/admin/scrape', body: { url: url.value, force: false } });
    expect(cls('preview')).toBe('preview on');
    expect(cls('m1')).toBe('msg on ok');
    expect(text('m1')).toContain('2 photos');
    expect(val('f_name')).toBe('Khal Mohammadi'); // the owner's name wins
    expect(val('f_slug')).toBe('khal-mohammadi');
    expect(val('f_description')).toBe('Hand-knotted in Afghanistan');
    expect(val('f_width')).toBe('130');
    expect(val('f_length')).toBe('226');
    expect(val('f_price')).toBe('1120');
    expect(val('f_sourceUrl')).toBe(scraped.sourceUrl);
    expect(val('f_supplier')).toBe('ecarpetgallery');
    expect(val('f_supplierRef')).toBe('380114');
    expect(text('supplierTitle')).toBe('Supplier calls it: Red 5x8 Andelz Area Rug');
    expect(text('ftHint')).toBe(`Supplier measurement: 4'3" x 7'5"`);
    expect(text('priceHint')).toBe('Supplier price $700 → ×1.6 → $1,120 → rounded $1,120');
    expect(text('tagHint')).toContain('Suggested tags: Red, Geometric');
    expect(document.querySelectorAll('#warnings li')).toHaveLength(1);
    expect(document.querySelectorAll('#photoStrip input[data-url]')).toHaveLength(2);
    expect(text('photoCount')).toBe('2 of 2 selected');
    expect(document.querySelector('#photoStrip img')?.getAttribute('src')).toBe(
      'https://images.ecarpetwholesale.com/a.jpg',
    );
    expect(document.body.innerHTML).not.toMatch(/\son[a-z]+=/i);
    // swap + round
    (document.getElementById('btnSwap') as HTMLButtonElement).click();
    expect(val('f_width')).toBe('226');
    set('f_price', '1332.4');
    (document.getElementById('btnRound') as HTMLButtonElement).click();
    expect(val('f_price')).toBe('1335');
  });

  it('"use these" presses existing tags and creates the missing ones through tag.create after confirmation', async () => {
    const created = {
      status: 201,
      body: { ok: true, tag: { id: 'geometric', slug: 'geometric', name: 'Geometric' }, audit: { row: 2 } },
    };
    form = mount((u) => (u === '/api/admin/tags' ? created : { status: 500, body: {} }));
    form.applyScrape(scraped);
    (document.getElementById('btnUseTags') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(form.chips.values()).toEqual(['Red', 'Geometric']));
    expect(calls).toEqual([{ url: '/api/admin/tags', body: { name: 'Geometric' } }]);
    expect(form.chips.has('Geometric')).toBe(true);
    // declined confirmation: only the existing tag is pressed
    form = mount(
      (u) => (u === '/api/admin/tags' ? created : { status: 500, body: {} }),
      () => false,
    );
    form.applyScrape(scraped);
    (document.getElementById('btnUseTags') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(form.chips.values()).toEqual(['Red']);
    expect(calls).toEqual([]);
    // "+ new tag" input creates and presses
    const newTag = document.getElementById('newTag') as HTMLInputElement;
    newTag.value = 'Geometric';
    newTag.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(form.chips.values()).toEqual(['Red', 'Geometric']));
    expect(newTag.value).toBe('');
  });

  it('a failed scrape offers "Enter manually", which pre-fills supplier / ref / link and opens the preview', async () => {
    form = mount(() => ({
      status: 502,
      body: {
        ok: false,
        error: 'blocked',
        message: 'ecarpetgallery.com refused the request',
        manual: { supplier: 'ecarpetgallery', supplierRef: '380114', sourceUrl: scraped.sourceUrl },
      },
    }));
    set('yourName', 'Red one');
    set('url', 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114');
    await form.fetchUrl();
    expect(cls('m1')).toBe('msg on err');
    expect(text('m1')).toContain('ecarpetgallery.com refused the request');
    expect(cls('preview')).toBe('preview');
    (document.getElementById('btnManual') as HTMLAnchorElement).click();
    expect(cls('preview')).toBe('preview on');
    expect(text('m1')).toContain('Manual entry');
    expect(val('f_supplier')).toBe('ecarpetgallery');
    expect(val('f_supplierRef')).toBe('380114');
    expect(val('f_sourceUrl')).toBe(scraped.sourceUrl);
    expect(val('f_name')).toBe('Red one');
    expect(form.scraped()).toBeUndefined();
    // Escape hides the banner
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cls('m1')).toBe('msg');
  });

  it('Add: validates the collection, imports the selected photos first, then creates the row; resets keeping the collection', async () => {
    form = mount((url) => {
      if (url === '/api/admin/scrape')
        return { status: 200, body: { ok: true, data: scraped, via: 'impit', cached: true, ms: 1 } };
      if (url === '/api/admin/photos')
        return {
          status: 200,
          body: {
            ok: true,
            imported: 1,
            photos: [
              { url: scraped.photos[0]!.url, id: PHOTO },
              { url: scraped.photos[1]!.url, error: 'too_large' },
            ],
          },
        };
      if (url === '/api/admin/rugs')
        return {
          status: 201,
          body: {
            ok: true,
            rug: { id: 'SL-030', slug: 'khal' },
            row: 31,
            audit: { row: 2, action: 'rug.create' },
          },
        };
      return { status: 500, body: {} };
    });
    set('yourName', 'Khal Mohammadi');
    set('url', 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114');
    await form.fetchUrl();
    await form.add();
    expect(cls('m2')).toBe('msg on err');
    expect(text('m2')).toContain('Pick a collection first');
    pickCollection('Kilims');
    set('f_photos', `https://drive.google.com/file/d/1cccccccccccccccccccccccccccccccc/view`);
    (document.getElementById('f_notes') as HTMLTextAreaElement).value = 'note';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    expect(form.busy()).toBe(true);
    expect((document.getElementById('btnAdd') as HTMLButtonElement).disabled).toBe(true);
    await vi.waitFor(() => expect(form.busy()).toBe(false));
    const photos = calls.find((c) => c.url === '/api/admin/photos');
    expect(photos?.body).toMatchObject({
      urls: scraped.photos.map((p) => p.url),
      namePrefix: 'khal-mohammadi',
      productId: 'SL-030',
    });
    const create = calls.find((c) => c.url === '/api/admin/rugs');
    // Every photo landed, so the row is written complete rather than pending.
    expect(create?.body).toMatchObject({ commitStatus: 'complete' });
    expect(create?.body).toMatchObject({
      id: 'SL-030',
      slug: 'khal-mohammadi',
      name: 'Khal Mohammadi',
      collections: ['Kilims'],
      tags: [],
      photos: [PHOTO, '1cccccccccccccccccccccccccccccccc'],
      widthCm: 130,
      lengthCm: 226,
      priceUsd: 1120,
      status: 'draft',
      supplier: 'ecarpetgallery',
      supplierRef: '380114',
      sourceUrl: scraped.sourceUrl,
      notes: 'note',
      roundPrice: true,
    });
    expect(calls.map((c) => c.url)).toEqual(['/api/admin/scrape', '/api/admin/photos', '/api/admin/rugs']);
    expect(cls('m2')).toBe('msg on ok');
    expect(text('m2')).toContain('Added SL-030 at row 31. 1 photo saved to Drive, 1 failed.');
    expect(document.querySelector('#m2 a')?.getAttribute('href')).toBe('/admin/rugs/SL-030');
    // reset: name/url cleared, collection kept, preview closed
    expect(val('yourName')).toBe('');
    expect(val('url')).toBe('');
    expect(pickedCollections()).toEqual(['Kilims']);
    expect(cls('preview')).toBe('preview');
    expect(val('f_id')).toBe('SL-030');
  });

  it('shows the server validation issues and keeps the form when the create fails', async () => {
    form = mount(() => ({
      status: 400,
      body: { ok: false, error: 'invalid body', issues: [{ path: 'widthCm', message: 'Too small' }] },
    }));
    pickCollection('Tulu');
    set('f_name', 'Small');
    (document.getElementById('savePhotos') as HTMLInputElement).checked = false;
    form.manualEntry();
    await form.add();
    expect(cls('m2')).toBe('msg on err');
    expect(text('m2')).toBe('widthCm: Too small');
    expect(val('f_name')).toBe('Small');
    expect(calls.map((c) => c.url)).toEqual(['/api/admin/rugs']);
  });
});

describe('edit mode', () => {
  let calls: Array<{ url: string; body: Record<string, unknown> }>;
  const mount = (handler: Handler): RugForm => {
    document.body.innerHTML =
      stripStyles(editHtml) +
      dataBlock({
        mode: 'edit',
        rug,
        collections,
        tags: tags.map((t) => ({ ...t, color: '' })),
        defaultStatus: 'active',
        roundStep: 5,
        driveScopeOk: null,
      });
    calls = [];
    return initRugForm(document, { fetchImpl: fakeFetch(handler, calls), confirmImpl: () => true });
  };

  it('renders the rug (id readonly, hidden version, pressed tag chips, photo thumbnails) and saves with the version', async () => {
    const form = mount((url) =>
      url === '/api/admin/rugs/SL-021'
        ? {
            status: 200,
            body: {
              ok: true,
              rug: { ...rug, name: 'Winks II', version: 'c'.repeat(16) },
              audit: { row: 2, action: 'rug.update' },
              changed: ['name'],
            },
          }
        : { status: 500, body: {} },
    );
    expect(form.mode).toBe('edit');
    expect((document.getElementById('f_id') as HTMLInputElement).readOnly).toBe(true);
    expect(val('f_version')).toBe('b'.repeat(16));
    expect(form.chips.values()).toEqual(['Kilim']);
    expect(document.querySelectorAll('#photoStrip img')).toHaveLength(1);
    expect(val('f_photos')).toBe(PHOTO);
    expect((document.getElementById('roundOnSave') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('btnArchive') as HTMLButtonElement).hidden).toBe(false);
    expect((document.getElementById('btnRestore') as HTMLButtonElement).hidden).toBe(true);
    expect(document.getElementById('openSite')?.getAttribute('href')).toBe('/rugs/winks');
    set('f_name', 'Winks II');
    await form.save();
    expect(calls[0]?.url).toBe('/api/admin/rugs/SL-021');
    expect(calls[0]?.body).toMatchObject({
      name: 'Winks II',
      slug: 'winks',
      version: 'b'.repeat(16),
      roundPrice: false,
      photos: [PHOTO],
    });
    expect(val('f_version')).toBe('c'.repeat(16));
    expect(cls('m2')).toBe('msg on ok');
    expect(text('m2')).toContain('Saved name');
  });

  it('409 reloads the fresh row and tells the owner to re-apply the edit', async () => {
    const fresh = { ...rug, name: 'Changed elsewhere', priceUsd: 999, version: 'd'.repeat(16) };
    const form = mount(() => ({
      status: 409,
      body: { ok: false, error: 'version mismatch', row: 2, rug: fresh },
    }));
    set('f_name', 'Mine');
    await form.save();
    expect(cls('m2')).toBe('msg on err');
    expect(text('m2')).toBe('Someone changed this row — reloaded the latest values; re-apply your edit.');
    expect(val('f_name')).toBe('Changed elsewhere');
    expect(val('f_price')).toBe('999');
    expect(val('f_version')).toBe('d'.repeat(16));
  });

  it('archive / restore go through the status endpoint and flip the buttons', async () => {
    const form = mount((url, body) =>
      url === '/api/admin/rugs/SL-021/status'
        ? {
            status: 200,
            body: {
              ok: true,
              rug: { ...rug, status: body.status, version: 'e'.repeat(16) },
              audit: { row: 2, action: 'rug.status' },
            },
          }
        : { status: 500, body: {} },
    );
    await form.setStatus('archived');
    expect(calls[0]).toEqual({
      url: '/api/admin/rugs/SL-021/status',
      body: { status: 'archived', version: 'b'.repeat(16) },
    });
    expect((document.getElementById('f_status') as HTMLSelectElement).value).toBe('archived');
    expect((document.getElementById('btnArchive') as HTMLButtonElement).hidden).toBe(true);
    expect((document.getElementById('btnRestore') as HTMLButtonElement).hidden).toBe(false);
    expect(document.getElementById('openSite')?.getAttribute('aria-disabled')).toBe('true');
    expect(text('m2')).toContain('Status is now archived');
    await form.setStatus('active');
    expect(calls[1]?.body).toEqual({ status: 'active', version: 'e'.repeat(16) });
    expect((document.getElementById('btnRestore') as HTMLButtonElement).hidden).toBe(true);
  });
});

describe('the fetch modal gates the form (P5-P9)', () => {
  let calls: Array<{ url: string; body: Record<string, unknown> }>;

  const mountWithModal = (handler: Handler): RugForm => {
    document.body.innerHTML =
      stripStyles(addHtml) +
      FETCH_MODAL +
      dataBlock({
        mode: 'add',
        collections,
        tags: tags.map((t) => ({ ...t, color: '' })),
        nextId: 'SL-030',
        defaultStatus: 'draft',
        roundStep: 5,
        driveScopeOk: true,
      });
    stubDialogs();
    calls = [];
    return initRugForm(document, { fetchImpl: fakeFetch(handler, calls), confirmImpl: () => true });
  };

  const ok = (): { status: number; body: unknown } => ({
    status: 200,
    body: { ok: true, data: scraped, via: 'impit', cached: false, ms: 12 },
  });

  it('shows P5 while the request is out, naming the product and the host', async () => {
    const form = mountWithModal(ok);
    set('url', scraped.sourceUrl);
    const pending = form.fetchUrl();
    // The modal opens before the response lands — that is what makes Cancel meaningful.
    expect(document.getElementById('fetch-result')?.hasAttribute('open')).toBe(true);
    expect(text('fetch-result')).toContain('Reaching ecarpetgallery.com');
    await pending;
  });

  it('does NOT touch the form until the result is accepted', async () => {
    const form = mountWithModal(ok);
    set('url', scraped.sourceUrl);
    await form.fetchUrl();

    // P7 is on screen with the values…
    expect(document.querySelector('[data-fetch-body]')?.textContent).toContain('Hand-knotted');
    // …and the form behind it is still untouched. This is the whole point of the modal: a scrape of
    // the wrong rug is thrown away before a single field has been read.
    expect(val('f_material')).toBe('');
    expect(val('f_method')).toBe('');

    form.useFetched();
    expect(val('f_material')).toBe('Wool');
    expect(val('f_method')).toBe('Hand-knotted');
    expect(document.getElementById('fetch-result')?.hasAttribute('open')).toBe(false);
  });

  it('cancelling leaves the form exactly as it was, and says nothing was written', async () => {
    const form = mountWithModal(ok);
    set('url', scraped.sourceUrl);
    await form.fetchUrl();
    document.querySelector<HTMLButtonElement>('[data-fetch-footer] .btn--ghost')!.click();
    expect(val('f_material')).toBe('');
    expect(text('m1')).toContain('nothing was written');
    expect(document.getElementById('fetch-result')?.hasAttribute('open')).toBe(false);
  });

  it('a refused fetch shows P9 with the host named, and manual entry still works', async () => {
    const form = mountWithModal(() => ({
      status: 502,
      body: {
        ok: false,
        error: 'blocked',
        message: 'blocked the request.',
        manual: { supplier: 'ecarpetgallery', supplierRef: '380114', sourceUrl: scraped.sourceUrl },
      },
    }));
    set('url', scraped.sourceUrl);
    await form.fetchUrl();

    const modalText = text('fetch-result');
    expect(modalText).toContain("Couldn't fetch that page");
    expect(modalText).toContain('ecarpetgallery.com blocked the request.');
    // Load-bearing reassurance: after a failure the natural assumption is that the typing is gone.
    expect(modalText).toContain('still in the panel behind this');

    document.querySelector<HTMLButtonElement>('[data-fetch-footer] .btn--ghost')!.click();
    expect(cls('preview')).toBe('preview on');
    expect(val('f_supplier')).toBe('ecarpetgallery');
  });
});
