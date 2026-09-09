// POST /api/reactions (brief §3 rule 1–2, §7): append-only events, one append per flushed batch,
// `none` clears, a card may like but never dislike, and the counts come back derived.
import { describe, expect, it } from 'vitest';
import { CatalogueCache } from '../../src/lib/sheets/cache.ts';
import { silentLogger } from '../../src/lib/sheets/errors.ts';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import type { ReactionRow } from '../../src/lib/sheets/types.ts';
import { DEFAULT_LIMITS, handleReactions, type VoteDeps } from '../../src/lib/votes/handler.ts';
import { RateLimiter } from '../../src/lib/votes/ratelimit.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

function setup(
  opts: {
    failInsert?: boolean;
    slowInsert?: boolean;
    now?: () => number;
    votesRowsTotal?: number;
    failLoad?: boolean;
  } = {},
) {
  const now = opts.now ?? (() => 1_000_000);
  const cache = new CatalogueCache({
    load: async () => {
      if (opts.failLoad) throw new Error('Sheets down');
      return rangesWith({
        rugs: [
          rugRow({ id: 'SL-021', likes: 2, dislikes: 1 }),
          rugRow({ id: 'SL-022', name: 'Second', likes: 0, dislikes: 0 }),
          rugRow({ id: 'draft-1', name: 'Hidden', status: 'draft', likes: 0, dislikes: 0 }),
        ],
      });
    },
    loadMeta: async () => ({ votesRowsTotal: opts.votesRowsTotal }),
    parse: (r) => snapshotFromRanges(r, now),
    ttlMs: 60_000,
    now,
    logger: silentLogger,
  });
  const inserted: ReactionRow[][] = [];
  const limiter = new RateLimiter({ now });
  let n = 0;
  const deps: VoteDeps = {
    cache,
    insert: async (rows) => {
      if (opts.slowInsert) await new Promise((r) => setTimeout(r, 10));
      if (opts.failInsert) throw new Error('Sheets down');
      inserted.push(rows);
    },
    limiter,
    inflight: new Set(),
    now,
    eventId: () => `e${++n}`,
    logger: silentLogger,
  };
  return { cache, deps, inserted, limiter };
}

const visitor = (n: number) => ({ visitorHash: `customer-${n}`, ipHash: `ip-${n}` });
const one = (productId: string, reaction: string, source = 'detail') => ({
  items: [{ productId, reaction, source }],
});

describe('handleReactions', () => {
  it('appends one event per change, clears with `none`, and returns the derived counts', async () => {
    const { deps, inserted, cache } = setup();
    const v = visitor(1);
    let r = await handleReactions({ body: one('SL-021', 'like'), ...v }, deps);
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([
      { productId: 'SL-021', state: 'liked', likes: 3, dislikes: 1, rating: 3.75 },
    ]);
    expect(inserted[0]).toEqual([
      {
        eventId: 'e1',
        customerSlug: v.visitorHash,
        productId: 'SL-021',
        reaction: 'like',
        source: 'detail',
        createdAt: new Date(1_000_000).toISOString(),
      },
    ]);

    r = await handleReactions({ body: one('SL-021', 'dislike'), ...v }, deps); // flip
    expect(r.body.results?.[0]).toMatchObject({ state: 'disliked', likes: 2, dislikes: 2 });
    expect(inserted[1]?.[0]?.reaction).toBe('dislike');

    r = await handleReactions({ body: one('SL-021', 'none'), ...v }, deps); // clear
    expect(r.body.results?.[0]).toMatchObject({ state: 'none', likes: 2, dislikes: 1 });
    expect(inserted[2]?.[0]?.reaction).toBe('none');
    expect(cache.currentVote(v.visitorHash, 'SL-021')).toBe('none');
  });

  it('writes a flushed batch as ONE append (brief §3 rule 2)', async () => {
    const { deps, inserted } = setup();
    const r = await handleReactions(
      {
        body: {
          items: [
            { productId: 'SL-021', reaction: 'like', source: 'card' },
            { productId: 'SL-022', reaction: 'like', source: 'card' },
          ],
        },
        ...visitor(2),
      },
      deps,
    );
    expect(r.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toHaveLength(2);
    expect(r.body.results?.map((x) => x.productId)).toEqual(['SL-021', 'SL-022']);
  });

  it('refuses a dislike from a card: the card asks one question (brief §7)', async () => {
    const { deps, inserted } = setup();
    const r = await handleReactions({ body: one('SL-021', 'dislike', 'card'), ...visitor(3) }, deps);
    expect(r).toMatchObject({ status: 400, body: { error: 'a card cannot dislike' } });
    expect(inserted).toHaveLength(0);
  });

  it('is idempotent when the state already matches: no row, no budget', async () => {
    const { deps, inserted, limiter } = setup();
    const v = visitor(4);
    await handleReactions({ body: one('SL-021', 'like'), ...v }, deps);
    const again = await handleReactions({ body: one('SL-021', 'like'), ...v }, deps);
    expect(again.status).toBe(200);
    expect(inserted).toHaveLength(1);
    expect(
      limiter.wouldAllow(
        `v:${v.visitorHash}`,
        DEFAULT_LIMITS.perVisitor.limit,
        DEFAULT_LIMITS.perVisitor.windowMs,
      ).remaining,
    ).toBe(DEFAULT_LIMITS.perVisitor.limit - 1);
  });

  it('validates the body and rejects unknown or draft products', async () => {
    const { deps } = setup();
    expect((await handleReactions({ body: one('SL-021', 'love'), ...visitor(5) }, deps)).status).toBe(400);
    expect((await handleReactions({ body: null, ...visitor(5) }, deps)).status).toBe(400);
    expect((await handleReactions({ body: one('=1+1', 'like'), ...visitor(5) }, deps)).status).toBe(400);
    expect((await handleReactions({ body: one('nope', 'like'), ...visitor(5) }, deps)).body.error).toBe(
      'unknown rug',
    );
    expect((await handleReactions({ body: one('draft-1', 'like'), ...visitor(5) }, deps)).body.error).toBe(
      'unknown rug',
    );
  });

  it('reverts the optimistic count, refunds the budgets and answers 503 when the append fails', async () => {
    const { deps, cache, limiter } = setup({ failInsert: true });
    const v = visitor(6);
    const r = await handleReactions({ body: one('SL-021', 'like'), ...v }, deps);
    expect(r).toMatchObject({ status: 503, retryAfterSec: 30 });
    expect((await cache.get()).catalogue.rugs[0]?.likes).toBe(2);
    expect(cache.currentVote(v.visitorHash, 'SL-021')).toBe('none');
    expect(
      limiter.wouldAllow('global', DEFAULT_LIMITS.global.limit, DEFAULT_LIMITS.global.windowMs).remaining,
    ).toBe(DEFAULT_LIMITS.global.limit);
  });

  it('answers 503 without touching budgets when the catalogue cannot be loaded', async () => {
    const { deps, limiter } = setup({ failLoad: true });
    const r = await handleReactions({ body: one('SL-021', 'like'), ...visitor(7) }, deps);
    expect(r).toMatchObject({ status: 503, retryAfterSec: 60 });
    expect(limiter.size).toBe(0);
  });

  it('pauses writing above the growth breaker', async () => {
    const { deps } = setup({ votesRowsTotal: 250_000 });
    const r = await handleReactions({ body: one('SL-021', 'like'), ...visitor(8) }, deps);
    expect(r).toMatchObject({ status: 503, body: { error: 'voting is paused' }, retryAfterSec: 3600 });
  });

  it('collapses parallel duplicates from one customer into a single append', async () => {
    const { deps, inserted } = setup({ slowInsert: true });
    const v = visitor(9);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => handleReactions({ body: one('SL-021', 'like'), ...v }, deps)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429 && r.body.error === 'vote in progress')).toHaveLength(4);
    expect(inserted).toHaveLength(1);
  });

  it('enforces the global batch budget without burning it on rejections', async () => {
    let t = 1_000_000;
    const { deps } = setup({ now: () => t });
    deps.limits = { ...DEFAULT_LIMITS, global: { limit: 3, windowMs: 60_000 } };
    for (let i = 0; i < 3; i++) {
      expect((await handleReactions({ body: one('SL-021', 'like'), ...visitor(20 + i) }, deps)).status).toBe(
        200,
      );
    }
    const blocked = await handleReactions({ body: one('SL-021', 'like'), ...visitor(99) }, deps);
    expect(blocked).toMatchObject({ status: 429, body: { error: 'too many votes' } });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    t += 61_000;
    expect((await handleReactions({ body: one('SL-021', 'like'), ...visitor(99) }, deps)).status).toBe(200);
  });
});
