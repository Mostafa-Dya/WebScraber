// POST /api/reactions logic (brief §3, §7), free of Astro so it can be tested directly.
//
// The client buffers reactions for 2–3 s and flushes them as ONE batch, so a burst of taps costs a
// single append against the 60 writes/min quota. Every row is append-only: clearing a like appends a
// `none` event rather than editing a row, and the current state is the newest event per
// (customer_slug, product_id). `source` records whether the reaction came from a grid card (like
// only) or the detail page (like and dislike).
import * as z from 'zod';
import type { CatalogueCache } from '../sheets/cache.ts';
import { serializeError, type Logger } from '../sheets/errors.ts';
import type { Reaction, ReactionRow, ReactionSource, Vote } from '../sheets/types.ts';
import type { RateLimiter } from './ratelimit.ts';

export type VisitorState = 'liked' | 'disliked' | 'none';

export interface ReactionOutcome {
  productId: string;
  state: VisitorState;
  likes: number;
  dislikes: number;
  rating: number;
}

export interface ReactionsResponseBody {
  ok: boolean;
  results?: ReactionOutcome[];
  error?: string;
}

export interface ReactionsResult {
  status: number;
  body: ReactionsResponseBody;
  retryAfterSec?: number;
}

export interface VoteLimits {
  /** Reactions per customer (or anonymous visitor) per window. */
  perVisitor: { limit: number; windowMs: number };
  perIp: { limit: number; windowMs: number };
  perRugPerIp: { limit: number; windowMs: number };
  /** Whole-site *batches* per minute: one flush is one write (brief §3 rule 2). */
  global: { limit: number; windowMs: number };
}

export const DEFAULT_LIMITS: VoteLimits = {
  perVisitor: { limit: 120, windowMs: 10 * 60_000 },
  perIp: { limit: 240, windowMs: 10 * 60_000 },
  perRugPerIp: { limit: 20, windowMs: 60 * 60_000 },
  global: { limit: 30, windowMs: 60_000 },
};

/** Growth breaker (ADR D4): above this many Reactions grid rows the endpoint stops accepting writes. */
export const MAX_VOTES_ROWS = 200_000;

/** Most reactions one flush may carry. */
export const MAX_BATCH = 25;

export interface VoteDeps {
  cache: CatalogueCache;
  insert: (rows: ReactionRow[]) => Promise<void>;
  limiter: RateLimiter;
  /** Actor|product keys currently being written; the guard is synchronous. */
  inflight: Set<string>;
  limits?: VoteLimits;
  maxVotesRows?: number;
  now?: () => number;
  /** Injectable for tests; defaults to crypto.randomUUID(). */
  eventId?: () => string;
  logger?: Logger;
}

export interface VoteInput {
  body: unknown;
  /**
   * Who reacted: a customer slug inside the gated preview, or `anon-<cookie hash>` on the public
   * catalogue. It is the `customer_slug` column and the key of the derived state.
   */
  visitorHash: string;
  /** Hash of the client IP for rate limiting only; never stored. */
  ipHash: string;
}

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const Item = z.object({
  productId: z.string().regex(PRODUCT_ID),
  reaction: z.enum(['like', 'dislike', 'none']),
  source: z.enum(['card', 'detail']).default('card'),
});

/** A single reaction or a flushed batch; the single form keeps the endpoint easy to curl. */
const Body = z.union([
  z.object({ items: z.array(Item).min(1).max(MAX_BATCH) }),
  Item.transform((i) => ({ items: [i] })),
]);

function toState(v: Vote | 'none'): VisitorState {
  return v === 'like' ? 'liked' : v === 'dislike' ? 'disliked' : 'none';
}

export async function handleReactions(input: VoteInput, deps: VoteDeps): Promise<ReactionsResult> {
  const limits = deps.limits ?? DEFAULT_LIMITS;
  const now = deps.now ?? Date.now;
  const newId = deps.eventId ?? ((): string => crypto.randomUUID());
  const parsed = Body.safeParse(input.body);
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'bad request' } };
  const items = parsed.data.items;

  // The card asks one question: a dislike can only come from the detail page (brief §7).
  if (items.some((i) => i.source === 'card' && i.reaction === 'dislike'))
    return { status: 400, body: { ok: false, error: 'a card cannot dislike' } };

  const ids = [...new Set(items.map((i) => i.productId))];
  const keys: Array<[string, { limit: number; windowMs: number }]> = [
    [`v:${input.visitorHash}`, limits.perVisitor],
    [`ip:${input.ipHash}`, limits.perIp],
    ...ids.map((id): [string, { limit: number; windowMs: number }] => [
      `rug:${id}:${input.ipHash}`,
      limits.perRugPerIp,
    ]),
    ['global', limits.global],
  ];
  for (const [key, l] of keys) {
    const d = deps.limiter.wouldAllow(key, l.limit, l.windowMs);
    if (!d.ok)
      return { status: 429, body: { ok: false, error: 'too many votes' }, retryAfterSec: d.retryAfterSec };
  }

  let snapshot;
  try {
    snapshot = await deps.cache.get();
  } catch {
    return { status: 503, body: { ok: false, error: 'catalogue unavailable' }, retryAfterSec: 60 };
  }

  const total = deps.cache.votesRowsTotal;
  if (total !== undefined && total > (deps.maxVotesRows ?? MAX_VOTES_ROWS)) {
    deps.logger?.error('reactions growth breaker tripped', { reactionRowsTotal: total });
    return { status: 503, body: { ok: false, error: 'voting is paused' }, retryAfterSec: 3600 };
  }

  // One guard per (actor, product) so parallel duplicates collapse instead of double-writing.
  const guards = ids.map((id) => `${input.visitorHash}|${id}`);
  if (guards.some((g) => deps.inflight.has(g)))
    return { status: 429, body: { ok: false, error: 'vote in progress' }, retryAfterSec: 1 };
  for (const g of guards) deps.inflight.add(g);
  try {
    const createdAt = new Date(now()).toISOString();
    const rows: ReactionRow[] = [];
    const applied: Array<{ delta: unknown; productId: string }> = [];
    const results: ReactionOutcome[] = [];
    let unknown = 0;

    for (const item of items) {
      const product = snapshot.catalogue.rugs.find((r) => r.id === item.productId && r.status === 'active');
      if (!product) {
        unknown++;
        continue;
      }
      const previous = deps.cache.currentVote(input.visitorHash, item.productId);
      const next: Reaction = item.reaction;
      const nextVote: Vote | 'none' = next === 'none' ? 'none' : next;
      if (nextVote !== previous) {
        rows.push({
          eventId: newId(),
          customerSlug: input.visitorHash,
          productId: item.productId,
          reaction: next,
          source: item.source as ReactionSource,
          createdAt,
        });
        // Optimistic in-memory update before the await, so parallel requests see it.
        const a = deps.cache.applyVote(item.productId, input.visitorHash, previous, nextVote);
        if (a) applied.push({ delta: a.delta, productId: item.productId });
      }
      const fresh = deps.cache.peek()?.catalogue.rugs.find((r) => r.id === item.productId) ?? product;
      results.push({
        productId: item.productId,
        state: toState(nextVote),
        likes: fresh.likes,
        dislikes: fresh.dislikes,
        rating: fresh.rating,
      });
    }

    if (results.length === 0 && unknown > 0)
      return { status: 400, body: { ok: false, error: 'unknown rug' } };

    if (rows.length === 0) {
      // Everything was already in the requested state: idempotent, nothing written, no budget spent.
      return { status: 200, body: { ok: true, results } };
    }

    for (const [key, l] of keys) deps.limiter.allow(key, l.limit, l.windowMs);
    try {
      await deps.insert(rows);
    } catch (e) {
      for (const a of applied) deps.cache.discardVote(a.delta as never);
      for (const [key] of keys) deps.limiter.refund(key);
      deps.logger?.error('reaction write failed', { error: serializeError(e), count: rows.length });
      return { status: 503, body: { ok: false, error: 'could not record the vote' }, retryAfterSec: 30 };
    }
    // Re-read the counts after the optimistic deltas landed.
    for (const r of results) {
      const fresh = deps.cache.peek()?.catalogue.rugs.find((p) => p.id === r.productId);
      if (fresh) {
        r.likes = fresh.likes;
        r.dislikes = fresh.dislikes;
        r.rating = fresh.rating;
      }
    }
    return { status: 200, body: { ok: true, results } };
  } finally {
    for (const g of guards) deps.inflight.delete(g);
  }
}
