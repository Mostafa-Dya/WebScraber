// Like / dislike buttons and the reaction buffer (brief §3 rule 2, §7; Figma component 18:100).
//
// Every tap paints immediately from `localStorage` and drops the intent into a buffer keyed by
// product id, so a visitor who changes their mind three times still sends one row. The buffer is
// flushed after BUFFER_MS of quiet, when the tab is hidden (`visibilitychange`, `pagehide`) or when
// it reaches MAX_BATCH — one POST /api/reactions carrying every pending item, which the server turns
// into a single append. That is the rule the brief calls "requirements, not advice": the Sheets
// write quota is 60 writes/min/user, so one flush must never mean one write per tap.
//
// Three visible states come from the Figma component documentation, which is more specific than the
// brief was:
//
//   * **syncing** — buffered but not yet stored. The circle keeps its filled state, the glyph drops
//     to 45%, and a 4px muted dot appears. Common by design, since every tap waits out the buffer.
//   * **failed** — "the optimistic state is HELD and a 12px alert glyph appears. Retry is automatic."
//     So a dropped network does NOT undo the buyer's tap: the state stands and the batch is retried
//     with backoff. Only a definitive rejection from the server reverts it.
//   * **pressed** — `aria-pressed`.
//
// The pending state is deliberately NOT announced: the dot and the alert are `aria-hidden`, so a
// screen reader hears a button that is pressed or not, and nothing about the network.
export type State = 'liked' | 'disliked' | 'none';
export type Reaction = 'like' | 'dislike' | 'none';
export type Source = 'card' | 'detail';

interface Outcome {
  productId: string;
  state: State;
  likes: number;
  dislikes: number;
  rating: number;
}

interface ReactionsResponse {
  ok: boolean;
  results?: Outcome[];
  error?: string;
}

const SAVED_KEY = 'sl-saved';
const REQUEST_TIMEOUT_MS = 10_000;
/** The brief's 2–3 s window; the midpoint, so a burst of taps coalesces without feeling stale. */
export const BUFFER_MS = 2500;
/** Mirrors MAX_BATCH in src/lib/votes/handler.ts: a fuller buffer flushes early rather than 400. */
export const MAX_BATCH = 25;
/** Retry backoff for a transient failure: 2s, 4s, 8s, 16s, then hold at 30s. */
export const RETRY_MS = [2_000, 4_000, 8_000, 16_000, 30_000];

export function readSaved(storage: Storage = localStorage): Record<string, State> {
  try {
    const raw = JSON.parse(storage.getItem(SAVED_KEY) || '{}') as Record<string, unknown>;
    const out: Record<string, State> = {};
    for (const [id, v] of Object.entries(raw)) {
      if (v === true || v === 'liked')
        out[id] = 'liked'; // `true` = the reference's old format
      else if (v === 'disliked') out[id] = 'disliked';
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSaved(saved: Record<string, State>, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* private mode */
  }
}

/** The reaction event a state change appends: the state itself, or `none` when it is cleared. */
export function reactionFor(next: State): Reaction {
  return next === 'liked' ? 'like' : next === 'disliked' ? 'dislike' : 'none';
}

/**
 * A 4xx other than 429 means the server will never accept this batch, so the optimistic state is
 * wrong and must be undone. Anything else — offline, a timeout, a 5xx, a rate limit — is transient,
 * and the documented behaviour is to hold the state and retry.
 */
export function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/** The sentence beside the detail page's control (Figma 57:265); empty when there is no reaction. */
export function noteFor(state: State): string {
  return state === 'liked' ? 'You liked this rug' : state === 'disliked' ? 'Not for you' : '';
}

export function paint(rugId: string, state: State, doc: Document = document): void {
  const sel = CSS.escape(rugId);
  doc.querySelectorAll<HTMLButtonElement>(`button[data-vote][data-rug="${sel}"]`).forEach((b) => {
    const pressed =
      (b.dataset.vote === 'like' && state === 'liked') ||
      (b.dataset.vote === 'dislike' && state === 'disliked');
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
  // The note lives next to the control, so it is scoped to the same product's group.
  doc.querySelectorAll<HTMLElement>(`[data-react][data-rug="${sel}"]`).forEach((g) => {
    const note = g.parentElement?.querySelector<HTMLElement>('[data-react-note]');
    if (note) note.textContent = noteFor(state);
  });
}

/** Marks a product's controls as buffered-but-not-stored, or clears the mark. Never announced. */
export function paintSync(rugId: string, syncing: boolean, doc: Document = document): void {
  const sel = CSS.escape(rugId);
  doc.querySelectorAll<HTMLElement>(`button[data-vote][data-rug="${sel}"]`).forEach((b) => {
    if (syncing) b.dataset.sync = '';
    else delete b.dataset.sync;
  });
  doc.querySelectorAll<HTMLElement>(`[data-react][data-rug="${sel}"]`).forEach((g) => {
    if (syncing) g.dataset.syncing = '';
    else delete g.dataset.syncing;
  });
}

/** Shows or hides the alert glyph beside a product's controls. Never announced. */
export function paintFailed(rugId: string, failed: boolean, doc: Document = document): void {
  doc.querySelectorAll<HTMLElement>(`[data-react][data-rug="${CSS.escape(rugId)}"]`).forEach((g) => {
    if (failed) g.dataset.failed = '';
    else delete g.dataset.failed;
  });
}

export function paintCounts(
  rugId: string,
  likes: number,
  dislikes: number,
  rating: number,
  doc: Document = document,
): void {
  const votes = likes + dislikes;
  doc.querySelectorAll<HTMLElement>(`[data-rating-for="${CSS.escape(rugId)}"]`).forEach((el) => {
    if (votes === 0) {
      el.hidden = true;
      el.textContent = '';
    } else {
      el.hidden = false;
      el.textContent = `${rating.toFixed(1)} · ${votes} ${votes === 1 ? 'vote' : 'votes'}`;
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
      el.addEventListener('animationend', () => el.classList.remove('tick'), { once: true });
    }
  });
}

export interface PendingItem {
  productId: string;
  reaction: Reaction;
  source: Source;
  /** The state to fall back to if the server rejects this outright. */
  previous: State;
}

/**
 * The buffer itself, free of the DOM so it can be tested directly. `add` keeps only the newest
 * intent per product (three taps on one rug are one row) but preserves the ORIGINAL `previous`, so
 * an undo returns to what the visitor saw before the burst, not to a mid-burst state.
 */
export class ReactionBuffer {
  private readonly items = new Map<string, PendingItem>();

  add(item: PendingItem): void {
    const existing = this.items.get(item.productId);
    this.items.set(item.productId, existing ? { ...item, previous: existing.previous } : { ...item });
  }

  /**
   * Puts a failed batch back for the next attempt, but never over a newer intent: if the visitor
   * tapped again while the request was in flight, that tap is the truth and the stale one is dropped.
   */
  restore(items: readonly PendingItem[]): void {
    for (const item of items) if (!this.items.has(item.productId)) this.items.set(item.productId, item);
  }

  get size(): number {
    return this.items.size;
  }

  /** Empties the buffer and returns what it held. */
  take(): PendingItem[] {
    const out = [...this.items.values()];
    this.items.clear();
    return out;
  }
}

export interface VoteBindings {
  doc?: Document;
  storage?: Storage;
  fetchImpl?: typeof fetch;
  /** Test seam for the buffer window; defaults to BUFFER_MS. */
  bufferMs?: number;
  /** Test seams for the timers so a suite never has to wait out a buffer or a backoff. */
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
  /** `sendBeacon`, when the browser has it: the only way a flush survives an unload. */
  beacon?: (url: string, body: BodyInit) => boolean;
}

/**
 * Wires the click handling and returns the unbind function; exported for tests (all environment
 * access is injectable).
 */
export function bindVotes(opts: VoteBindings = {}): () => void {
  const doc = opts.doc ?? document;
  // Set by the preview layout inside a private realm. The server re-verifies that realm's cookie, so
  // a forged value cannot write to another buyer's row — it falls back to the anonymous identity.
  const customer = doc.documentElement.dataset.customer || undefined;
  const storage = opts.storage ?? localStorage;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const bufferMs = opts.bufferMs ?? BUFFER_MS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  const beacon =
    opts.beacon ??
    (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      ? (url: string, body: BodyInit) => navigator.sendBeacon(url, body)
      : undefined);

  const saved = readSaved(storage);
  for (const [id, state] of Object.entries(saved)) paint(id, state, doc);

  // bfcache restore (Back from a detail page where the visitor reacted): repaint from storage.
  const onPageShow = (e: PageTransitionEvent): void => {
    if (!e.persisted) return;
    for (const k of Object.keys(saved)) delete saved[k];
    Object.assign(saved, readSaved(storage));
    const ids = new Set<string>();
    doc.querySelectorAll<HTMLButtonElement>('button[data-vote][data-rug]').forEach((b) => {
      if (b.dataset.rug) ids.add(b.dataset.rug);
    });
    for (const id of ids) paint(id, saved[id] ?? 'none', doc);
  };
  if (typeof addEventListener === 'function') addEventListener('pageshow', onPageShow);

  const buffer = new ReactionBuffer();
  let timer: number | undefined;
  let attempt = 0;

  const remember = (rugId: string, state: State): void => {
    if (state === 'none') delete saved[rugId];
    else saved[rugId] = state;
    writeSaved(saved, storage);
    paint(rugId, state, doc);
    // The filter strip's "Liked" chip counts the same stored state, so it is told rather than polled.
    try {
      doc.dispatchEvent(new CustomEvent('sl:reaction', { detail: { productId: rugId, state } }));
    } catch {
      /* CustomEvent is missing in a very old engine; the count simply stays as rendered. */
    }
  };

  const cancelTimer = (): void => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  };

  const flush = async (viaBeacon = false): Promise<void> => {
    cancelTimer();
    const items = buffer.take();
    if (items.length === 0) return;
    const payload = JSON.stringify({
      ...(customer ? { customer } : {}),
      items: items.map((i) => ({ productId: i.productId, reaction: i.reaction, source: i.source })),
    });

    // Unloading: sendBeacon is the only request the browser promises to finish. There is no response
    // to read, so the optimistic state simply stands — it is already in localStorage.
    if (viaBeacon && beacon) {
      beacon('/api/reactions', new Blob([payload], { type: 'application/json' }));
      for (const i of items) paintSync(i.productId, false, doc);
      return;
    }

    try {
      const res = await fetchImpl('/api/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as ReactionsResponse;
      if (!res.ok || !data.ok || !data.results) {
        if (isPermanent(res.status)) {
          // The server will never take this batch: undo it rather than leave a lie on screen.
          for (const i of items) {
            remember(i.productId, i.previous);
            paintSync(i.productId, false, doc);
            paintFailed(i.productId, false, doc);
          }
          attempt = 0;
          return;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      attempt = 0;
      for (const r of data.results) {
        // The server's state wins: a stale localStorage is corrected here, not argued with.
        remember(r.productId, r.state);
        paintSync(r.productId, false, doc);
        paintFailed(r.productId, false, doc);
        paintCounts(r.productId, r.likes, r.dislikes, r.rating, doc);
      }
    } catch {
      // Transient. Hold the optimistic state, show the alert, put the batch back and try again.
      buffer.restore(items);
      for (const i of items) paintFailed(i.productId, true, doc);
      const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]!;
      attempt += 1;
      cancelTimer();
      timer = setTimer(() => void flush(), wait);
    }
  };

  const schedule = (): void => {
    if (buffer.size >= MAX_BATCH) {
      void flush();
      return;
    }
    cancelTimer();
    timer = setTimer(() => void flush(), bufferMs);
  };

  const onClick = (e: Event): void => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-vote][data-rug]');
    if (!b) return;
    e.preventDefault();
    const rugId = b.dataset.rug!;
    const vote = b.dataset.vote as 'like' | 'dislike';
    const source: Source = b.dataset.source === 'detail' ? 'detail' : 'card';
    const previous: State = saved[rugId] ?? 'none';
    const wanted: State = vote === 'like' ? 'liked' : 'disliked';
    const next: State = previous === wanted ? 'none' : wanted; // toggle, like the reference's un-save
    b.classList.remove('just');
    void b.offsetWidth;
    b.classList.add('just');
    b.addEventListener('animationend', () => b.classList.remove('just'), { once: true });
    remember(rugId, next);
    paintFailed(rugId, false, doc);
    paintSync(rugId, true, doc);
    buffer.add({ productId: rugId, reaction: reactionFor(next), source, previous });
    schedule();
  };

  const onHide = (): void => {
    if (doc.visibilityState === 'hidden') void flush(true);
  };
  const onPageHide = (): void => void flush(true);

  doc.addEventListener('click', onClick);
  doc.addEventListener('visibilitychange', onHide);
  if (typeof addEventListener === 'function') addEventListener('pagehide', onPageHide);

  return () => {
    void flush();
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('visibilitychange', onHide);
    if (typeof removeEventListener === 'function') {
      removeEventListener('pageshow', onPageShow);
      removeEventListener('pagehide', onPageHide);
    }
  };
}

export function initVotes(): void {
  bindVotes();
}
