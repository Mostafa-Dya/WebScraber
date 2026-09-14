// The fetch modal's five states — Figma P5 (81:1865), P6 (81:1974), P7 (85:2332), P8 (85:2508),
// P9 (85:2652).
//
// One dialog, five states, driven from here rather than five blocks of markup toggled by `hidden`:
// the states share almost no structure (a progress list, a photo, a field list, an error), and a
// page carrying all four at once would be four times the DOM for one that is ever visible.
//
// THE REVEAL ORDER IS THE POINT. P6 exists as its own frame because the first photo lands BEFORE the
// fields: a buyer of the wrong rug is recognised from the picture in a glance, and the whole scrape
// is cancelled before a single field has been read. So `photo()` is a state, not a detail of
// `result()`.
//
// Nothing here writes. Cancel is available throughout and costs nothing, which is exactly what P5's
// footnote promises — "3-10 seconds. Cancel is available throughout — nothing has been written yet."
import { el } from './dom.ts';

export type FetchStage = 'reaching' | 'parsing' | 'images';

/** The three stages P5 lists, in order, with the copy the frame uses. */
const STAGES: ReadonlyArray<{ key: FetchStage; label: (host: string) => string }> = [
  { key: 'reaching', label: (host) => `Reaching ${host}` },
  { key: 'parsing', label: () => 'Parsing the page' },
  { key: 'images', label: () => 'Resolving images' },
];

export interface FetchedField {
  label: string;
  value: string;
  /** Set when the page carried no usable value — P8 flags it rather than leaving a blank row. */
  missing?: boolean;
  /** Set when a value was found but could not be read, e.g. a price of "POA" (P8). */
  error?: string;
}

export interface FetchedResult {
  id: string;
  title: string;
  /** Fields the page yielded, in the order P7 lists them. */
  fields: FetchedField[];
  tags: string[];
  photoUrl?: string;
  photoCount: number;
  found: number;
  total: number;
}

export interface FetchModalParts {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  bar: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
}

/** Resolves the modal's four regions, or undefined when the page has no fetch modal. */
export function fetchModalParts(doc: Document = document, id = 'fetch-result'): FetchModalParts | undefined {
  const dialog = doc.getElementById(id) as HTMLDialogElement | null;
  const title = dialog?.querySelector<HTMLElement>('[data-fetch-title]');
  const bar = dialog?.querySelector<HTMLElement>('[data-fetch-bar]');
  const body = dialog?.querySelector<HTMLElement>('[data-fetch-body]');
  const footer = dialog?.querySelector<HTMLElement>('[data-fetch-footer]');
  if (!dialog || !title || !bar || !body || !footer) return undefined;
  return { dialog, title, bar, body, footer };
}

function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** A footer button. `style` maps to the Button component's classes; nothing is rendered inline. */
function action(
  label: string,
  style: 'primary' | 'ghost',
  onClick: () => void,
  doc: Document,
): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `btn btn--${style}` }, label, doc) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

export interface FetchModalHandlers {
  /** P5/P9: abandon the scrape. Nothing has been written, so this only closes. */
  onCancel: () => void;
  /** P7/P8: take these values into the form behind. */
  onUse: () => void;
  /** P9: give up on scraping and fill the form by hand, keeping the link as attribution. */
  onManual: () => void;
  /** P9: the supplier may simply have been busy. */
  onRetry: () => void;
}

export class FetchModalView {
  // Explicit fields, not constructor parameter properties: tsconfig sets `erasableSyntaxOnly`, so
  // every construct here has to survive type-stripping with no emit.
  private readonly parts: FetchModalParts;
  private readonly on: FetchModalHandlers;
  private readonly doc: Document;

  constructor(parts: FetchModalParts, on: FetchModalHandlers, doc: Document = document) {
    this.parts = parts;
    this.on = on;
    this.doc = doc;
  }

  private open(): void {
    if (!this.parts.dialog.open) this.parts.dialog.showModal();
  }

  close(): void {
    if (this.parts.dialog.open) this.parts.dialog.close();
  }

  /**
   * P5 · fetching. The stage list is rendered once and advanced by `stage()`, so the rows do not
   * re-mount underneath a screen reader mid-announcement.
   */
  fetching(id: string, host: string): void {
    const { title, bar, body, footer } = this.parts;
    title.textContent = `Fetching ${id}`;
    bar.hidden = false;
    clear(body);

    body.append(el('p', { class: 'fetch__lede' }, 'Waiting for the first photo…', this.doc));

    const list = el('ol', { class: 'steps', 'data-fetch-steps': '' }, [], this.doc);
    for (const s of STAGES) {
      const row = el('li', { class: 'step', 'data-step': s.key }, [], this.doc);
      row.append(
        el('span', { class: 'step__marker' }, [], this.doc),
        el('span', { class: 'step__label' }, s.label(host), this.doc),
        el('span', { class: 'step__detail', 'data-step-detail': '' }, '—', this.doc),
      );
      list.append(row);
    }
    body.append(list);

    body.append(
      el(
        'p',
        { class: 'hint' },
        '3–10 seconds. Cancel is available throughout — nothing has been written yet.',
        this.doc,
      ),
    );

    clear(footer);
    footer.append(action('Cancel', 'ghost', this.on.onCancel, this.doc));
    this.open();
  }

  /** Marks a stage done, with the elapsed time P5 shows beside it, and lights the next one. */
  stage(key: FetchStage, detail?: string): void {
    const rows = [...this.parts.body.querySelectorAll<HTMLElement>('[data-step]')];
    const at = rows.findIndex((r) => r.dataset.step === key);
    if (at < 0) return;
    rows.forEach((r, i) => {
      r.classList.toggle('step--done', i < at);
      r.classList.toggle('step--active', i === at);
    });
    const d = rows[at]?.querySelector<HTMLElement>('[data-step-detail]');
    if (d) d.textContent = detail ?? '—';
  }

  /**
   * P6 · photo revealed, fields still loading. Deliberately its own state: the photo is the cheapest
   * possible check that the scrape found the right rug, and it arrives while the rest is still in
   * flight.
   */
  photo(url: string): void {
    const existing = this.parts.body.querySelector('[data-fetch-photo]');
    if (existing) return;
    const wrap = el('div', { class: 'fetch__photo', 'data-fetch-photo': '' }, [], this.doc);
    const img = el('img', { src: url, alt: '', loading: 'eager' }, [], this.doc);
    wrap.append(img);
    this.parts.body.prepend(wrap);
    const lede = this.parts.body.querySelector<HTMLElement>('.fetch__lede');
    if (lede) lede.textContent = 'Is this the right rug? The fields are still loading.';
  }

  /**
   * P7 · result, editable — and P8 when fields are missing or unreadable. One method, because the
   * two frames differ only in what the field rows carry; branching them would duplicate the layout.
   */
  result(r: FetchedResult): void {
    const { title, bar, body, footer } = this.parts;
    const partial = r.found < r.total;
    title.textContent = 'Fetched result';
    bar.hidden = true;

    const photo = body.querySelector('[data-fetch-photo]');
    clear(body);
    if (photo) body.append(photo);

    const head = el('div', { class: 'fetch__meta' }, [], this.doc);
    head.append(el('p', { class: 'fetch__subject' }, `${r.id} · ${r.title}`, this.doc));
    if (partial) head.append(el('span', { class: 'badge badge--warning' }, 'Partial', this.doc));
    body.append(head);

    body.append(
      el(
        'p',
        { class: 'fetch__lede' },
        partial
          ? `${r.found} of ${r.total} fields found. The rest are flagged below — fill what you can, or save without them.`
          : `${r.found} of ${r.total} fields found. Everything below is editable before you save.`,
        this.doc,
      ),
    );
    if (partial) {
      body.append(
        el(
          'p',
          { class: 'hint' },
          'The photo came through, so the right product was found — only some metadata is missing.',
          this.doc,
        ),
      );
    }

    const fields = el('dl', { class: 'fetch__fields', 'data-fetch-fields': '' }, [], this.doc);
    for (const f of r.fields) {
      fields.append(el('dt', {}, f.label, this.doc));
      const dd = el('dd', {}, [], this.doc);
      if (f.error) {
        dd.append(el('span', { class: 'fetch__value' }, f.value, this.doc));
        dd.append(el('span', { class: 'fetch__flag fetch__flag--error' }, f.error, this.doc));
      } else if (f.missing) {
        dd.append(el('span', { class: 'fetch__flag' }, 'Not found on the page.', this.doc));
      } else {
        dd.append(el('span', { class: 'fetch__value' }, f.value, this.doc));
      }
      fields.append(dd);
    }
    body.append(fields);

    if (r.tags.length) {
      const tags = el('ul', { class: 'fetch__tags' }, [], this.doc);
      for (const t of r.tags) tags.append(el('li', { class: 'tag' }, t, this.doc));
      body.append(tags);
    }

    if (r.photoCount > 0) {
      body.append(
        el(
          'p',
          { class: 'hint' },
          `${r.photoCount} image${r.photoCount === 1 ? '' : 's'} will be uploaded to Drive on save.`,
          this.doc,
        ),
      );
    }

    clear(footer);
    footer.append(
      action('Cancel', 'ghost', this.on.onCancel, this.doc),
      action('Use these', 'primary', this.on.onUse, this.doc),
    );
    this.open();
  }

  /**
   * P9 · fetch failed, manual fallback.
   *
   * The reassurance is load-bearing and verbatim: nothing was written, and the three things the
   * owner typed are still in the panel behind. Without that line the natural assumption after a
   * failure is that the work is gone.
   */
  failed(reason: string, host: string): void {
    const { title, bar, body, footer } = this.parts;
    title.textContent = "Couldn't fetch that page";
    bar.hidden = true;
    clear(body);

    body.append(el('p', { class: 'fetch__lede' }, `${host} ${reason}`, this.doc));
    body.append(
      el(
        'p',
        { class: 'hint' },
        'Nothing was written. Your ID, name and link are still in the panel behind this.',
        this.doc,
      ),
    );
    body.append(
      el(
        'p',
        { class: 'hint' },
        'The link is kept as source attribution either way. Save works exactly the same.',
        this.doc,
      ),
    );

    clear(footer);
    footer.append(
      action('Enter it manually instead', 'ghost', this.on.onManual, this.doc),
      action('Try fetching again', 'primary', this.on.onRetry, this.doc),
    );
    this.open();
  }
}
