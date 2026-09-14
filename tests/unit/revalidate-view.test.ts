import { describe, expect, it } from 'vitest';
import { CatalogueCache } from '../../src/lib/sheets/cache.ts';
import { silentLogger } from '../../src/lib/sheets/errors.ts';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import { catalogueDto } from '../../src/lib/votes/dto.ts';
import { RateLimiter } from '../../src/lib/votes/ratelimit.ts';
import { authorize, bearerToken, handleRevalidate, secretsMatch } from '../../src/lib/votes/revalidate.ts';
import {
  cardView,
  collectionSlug,
  jsonForScript,
  navTabs,
  ratesTable,
  ratingText,
  rugsWithTag,
} from '../../src/lib/view.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

const SECRET = 'r'.repeat(40);

function cacheWith(now: () => number, loads: { n: number }, fail = { on: false }) {
  return new CatalogueCache({
    load: async () => {
      loads.n++;
      if (fail.on) throw new Error('Sheets down');
      return rangesWith({
        rugs: [
          rugRow({ id: 'SL-021', likes: 2, dislikes: 1, rating: 3.75 }),
          rugRow({ id: 'd1', name: 'Draft', status: 'draft' }),
          rugRow({ id: 'T-1', name: 'Tulu', collection: 'Tulu', tags: 'Kilim|Signed' }),
          rugRow({ id: 'k-lower', name: 'Lower', collection: 'kilims' }),
          rugRow({ id: 'no-col', name: 'Orphan', collection: '' }),
        ],
        collections: [
          ['tulu', 'Tulu', 'tulu', '', '', '', 1],
          ['kilims', 'Kilims', 'kilims', '', '', '', 2],
        ],
        tags: [['kilim', 'kilim', 'Kilim', '']],
        rates: [['AED', 3.67, 'AED ', '']], // no USD row on purpose
        votes: [['t', 'SL-021', 'like', 'anon', 'visitor-1'.padEnd(32, '0'), 'ua', 'add']],
      });
    },
    parse: (r) => snapshotFromRanges(r, now),
    ttlMs: 60_000,
    now,
    logger: silentLogger,
  });
}

function deps(cache: CatalogueCache, now: () => number, purges: { n: number } = { n: 0 }) {
  return {
    secret: SECRET,
    getCache: () => cache,
    invalidateRoutes: async () => {
      purges.n++;
    },
    failLimiter: new RateLimiter({ now }),
    state: { lastBustAt: 0 },
    now,
  };
}

describe('handleRevalidate (ADR D5.4)', () => {
  it('rejects bad or missing tokens with a constant body, caps failures per ip, and never touches the cache first', async () => {
    const t = 1_000_000;
    const loads = { n: 0 };
    const d = deps(
      cacheWith(() => t, loads),
      () => t,
    );
    expect(await handleRevalidate({ token: undefined, ipHash: 'ip1' }, d)).toEqual({
      status: 401,
      body: { ok: false },
    });
    expect(await handleRevalidate({ token: 'wrong', ipHash: 'ip1' }, d)).toEqual({
      status: 401,
      body: { ok: false },
    });
    for (let i = 0; i < 10; i++) await handleRevalidate({ token: 'wrong', ipHash: 'ip1' }, d);
    expect(loads.n).toBe(0);
    // Even the right secret is refused while the failure cap is active for that ip.
    expect((await handleRevalidate({ token: SECRET, ipHash: 'ip1' }, d)).status).toBe(401);
    expect((await handleRevalidate({ token: SECRET, ipHash: 'ip2' }, d)).status).toBe(200);
    expect(loads.n).toBe(1);
    expect(authorize({ token: SECRET, ipHash: 'ip3' }, d)).toBe(true);
  });
  it('busts once, coalesces bursts within 4 s, purges the route cache, and reports a failed refresh as 503', async () => {
    let t = 1_000_000;
    const loads = { n: 0 };
    const fail = { on: false };
    const purges = { n: 0 };
    const cache = cacheWith(() => t, loads, fail);
    await cache.get();
    const d = deps(cache, () => t, purges);
    const first = await handleRevalidate({ token: SECRET, ipHash: 'ip', source: 'edit:Rugs' }, d);
    expect(first).toMatchObject({
      status: 200,
      body: { ok: true, refreshed: true, source: 'edit:Rugs', rugs: 5 },
    });
    expect(loads.n).toBe(2);
    expect(purges.n).toBe(1);
    t += 3000;
    expect(await handleRevalidate({ token: SECRET, ipHash: 'ip', source: 'x'.repeat(100) }, d)).toMatchObject(
      { status: 202, body: { coalesced: true, source: 'x'.repeat(32) } },
    );
    expect(loads.n).toBe(2);
    t += 2000;
    expect((await handleRevalidate({ token: SECRET, ipHash: 'ip' }, d)).status).toBe(200);
    expect(loads.n).toBe(3);
    t += 5000;
    fail.on = true;
    const failed = await handleRevalidate({ token: SECRET, ipHash: 'ip' }, d);
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ ok: false, refreshed: false, rugs: 5 });
    expect(failed.body.lastError).toMatch(/Sheets down/);
  });
  it('answers 503 (after auth) when the site is not configured', async () => {
    const d = {
      ...deps(
        cacheWith(() => 1, { n: 0 }),
        () => 1,
      ),
      getCache: () => {
        throw new Error('GOOGLE_SHEET_ID is not set');
      },
    };
    expect((await handleRevalidate({ token: SECRET, ipHash: 'ip' }, d)).status).toBe(503);
    expect((await handleRevalidate({ token: 'nope', ipHash: 'ip' }, d)).status).toBe(401);
  });
  it('helpers', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer   abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeUndefined();
    expect(bearerToken(null)).toBeUndefined();
    expect(secretsMatch(SECRET, SECRET)).toBe(true);
    expect(secretsMatch('', SECRET)).toBe(false);
    expect(secretsMatch(SECRET + 'x', SECRET)).toBe(false);
  });
});

describe('catalogueDto', () => {
  it('exposes only active rugs and public fields', async () => {
    const snap = await cacheWith(() => 5000, { n: 0 }).get();
    const dto = catalogueDto(snap);
    expect(dto.count).toBe(4);
    expect(dto.rugs.map((r) => r.id)).toEqual(['SL-021', 'T-1', 'k-lower', 'no-col']);
    const text = JSON.stringify(dto);
    expect(text).not.toContain('visitor');
    expect(text).not.toContain('voteState');
    expect(dto.rugs[0]?.photos[0]).toMatch(/^\/api\/image\/[A-Za-z0-9_-]+\?w=1600$/);
    expect(dto.rates[0]).toEqual({ currency: 'AED', rateToBase: 3.67, symbol: 'AED ' });
  });

  it('never publishes a like count below the threshold', async () => {
    // `/api/catalogue` is on the PUBLIC allowlist (customer/gate.ts) whenever PUBLIC_CATALOGUE is on,
    // which is the default. It was serving every rug's exact like count to anyone who asked, while
    // the card that displays the number was carefully hiding it below five (owner requirement,
    // 2026-09-13). Hiding a count in the UI and serving it raw from an unauthenticated JSON endpoint
    // is not hiding it.
    const snap = await cacheWith(() => 5000, { n: 0 }).get();
    const dto = catalogueDto(snap);
    for (const rug of dto.rugs) {
      if (rug.likes !== null) expect(rug.likes).toBeGreaterThanOrEqual(5);
      // `rating` and `dislikes` go with it: rating is likes / (likes + dislikes) x 5, so publishing
      // those two alongside hands back the number the threshold just removed.
      if (rug.likes === null) {
        expect(rug.rating).toBeNull();
        expect(rug.dislikes).toBeNull();
      }
    }
    // Non-vacuous: the fixture has rugs under the threshold, so something must actually be nulled.
    expect(dto.rugs.some((r) => r.likes === null)).toBe(true);
  });
});

describe('view helpers (ADR D12)', () => {
  it('ratingText', () => {
    expect(ratingText(0, 0, 0)).toBeNull();
    expect(ratingText(1, 0, 5)).toBe('5.0 · 1 vote');
    expect(ratingText(18, 5, 3.91)).toBe('3.9 · 23 votes');
  });
  it('navTabs: sort_order first, case variants merged, blank collections under "More", counts by slug', async () => {
    const snap = await cacheWith(() => 5000, { n: 0 }).get();
    const rugs = snap.catalogue.rugs.filter((r) => r.status === 'active');
    expect(navTabs(rugs, snap.catalogue)).toEqual([
      { name: 'Tulu', slug: 'tulu', count: 1, description: '' },
      { name: 'Kilims', slug: 'kilims', count: 2, description: '' },
      { name: 'More', slug: 'more', count: 1, description: '' },
    ]);
    expect(cardView(rugs[3]!, snap.catalogue)).toMatchObject({
      id: 'no-col',
      collection: 'More',
      collectionSlug: 'more',
    });
    expect(collectionSlug('日本', [])).toBe('other');
  });
  it('cardView builds photo URLs and tag slugs; ratesTable always has USD', async () => {
    const snap = await cacheWith(() => 5000, { n: 0 }).get();
    const rugs = snap.catalogue.rugs.filter((r) => r.status === 'active');
    const card = cardView(rugs[1]!, snap.catalogue);
    expect(card).toMatchObject({ id: 'T-1', collectionSlug: 'tulu', rot: '0' });
    expect(card.photoUrl).toMatch(/\?w=800$/);
    expect(card.tags).toEqual([
      { name: 'Kilim', slug: 'kilim' },
      { name: 'Signed', slug: 'signed' },
    ]);
    expect(rugsWithTag(rugs, 'signed', snap.catalogue)?.rugs.map((r) => r.id)).toEqual(['T-1']);
    expect(rugsWithTag(rugs, 'nope', snap.catalogue)).toBeUndefined();
    const table = ratesTable(snap.catalogue);
    expect(table.rates.USD).toBe(1);
    expect(table.symbols.USD).toBe('$');
    expect(table.symbols.AED).toBe('AED ');
  });
  it('navTabs: a spelling that collides at slug level ("Wabi-sabi") joins the "Wabi Sabi" tab, count and slot', () => {
    const snap = snapshotFromRanges(
      rangesWith({
        rugs: [
          rugRow({ id: 'a', name: 'A', collection: 'Tulu' }),
          rugRow({ id: 'b', name: 'B', collection: 'Wabi-sabi' }), // owner-typed legacy spelling
          rugRow({ id: 'c', name: 'C', collection: 'Wabi Sabi' }),
          rugRow({ id: 'd', name: 'D', collection: 'More' }),
          rugRow({ id: 'e', name: 'E', collection: 'Art-Deco' }), // unknown collection, two spellings
          rugRow({ id: 'f', name: 'F', collection: 'Art Deco' }),
        ],
        collections: [
          ['tulu', 'Tulu', 'tulu', '', '', '', 1],
          ['wabi-sabi', 'Wabi Sabi', 'wabi-sabi', '', '', '', 2],
          ['more', 'More', 'more', '', '', '', 3],
        ],
      }),
    );
    const rugs = snap.catalogue.rugs;
    const tabs = navTabs(rugs, snap.catalogue);
    expect(tabs).toEqual([
      { name: 'Tulu', slug: 'tulu', count: 1, description: '' },
      { name: 'Wabi Sabi', slug: 'wabi-sabi', count: 2, description: '' },
      { name: 'More', slug: 'more', count: 1, description: '' },
      { name: 'Art Deco', slug: 'art-deco', count: 2, description: '' }, // variants sort A→Z, the first names the tab,
    ]);
    // Every card is reachable from the tabs it claims, and the counts add up to the cards shown.
    //
    // This reads `collectionSlugs`, not the primary `collectionSlug`. Since a rug may belong to
    // several collections (owner, 2026-09-13) the primary-only version of this check passes
    // vacuously on any single-collection fixture — which is worse than failing, because it looks
    // like coverage. The multi-collection case is asserted separately below.
    for (const tab of tabs) {
      const shown = rugs.filter((r) => cardView(r, snap.catalogue).collectionSlugs.includes(tab.slug)).length;
      expect(shown).toBe(tab.count);
    }
    // A rug in two collections is counted under BOTH tabs and reachable from either. Without this
    // fixture the loop above never sees a rug whose membership differs from its primary.
    const multi = snapshotFromRanges(
      rangesWith({
        rugs: [
          rugRow({ id: 'm1', name: 'M1', collection: 'Tulu | Wabi Sabi' }),
          rugRow({ id: 'm2', name: 'M2', collection: 'Tulu' }),
        ],
        collections: [
          ['tulu', 'Tulu', 'tulu', '', '', '', 1],
          ['wabi-sabi', 'Wabi Sabi', 'wabi-sabi', '', '', '', 2],
        ],
      }),
    );
    const multiTabs = navTabs(multi.catalogue.rugs, multi.catalogue);
    expect(multiTabs.map((t) => [t.slug, t.count])).toEqual([
      ['tulu', 2],
      ['wabi-sabi', 1],
    ]);
    for (const tab of multiTabs) {
      const shown = multi.catalogue.rugs.filter((r) =>
        cardView(r, multi.catalogue).collectionSlugs.includes(tab.slug),
      ).length;
      expect(shown).toBe(tab.count);
    }
    // The two-collection rug keeps ONE primary — the canonical route — while appearing in two tabs.
    const m1 = cardView(
      multi.catalogue.rugs.find((r) => r.id === 'm1')!,
      multi.catalogue,
    );
    expect(m1.collectionSlugs).toEqual(['tulu', 'wabi-sabi']);
    expect(m1.collectionSlug).toBe('tulu');

    // Only the variant spelling present: it still takes the Collections row's slot and name.
    const only = snapshotFromRanges(
      rangesWith({
        rugs: [
          rugRow({ id: 'b', name: 'B', collection: 'Wabi-sabi' }),
          rugRow({ id: 'd', name: 'D', collection: 'More' }),
        ],
        collections: [
          ['wabi-sabi', 'Wabi Sabi', 'wabi-sabi', '', '', '', 1],
          ['more', 'More', 'more', '', '', '', 2],
        ],
      }),
    );
    expect(navTabs(only.catalogue.rugs, only.catalogue).map((t) => t.name)).toEqual(['Wabi Sabi', 'More']);
  });
  it('jsonForScript neutralises </script> and line separators', () => {
    const out = jsonForScript({ symbols: { X: '</script><script>alert(1)</script>', Y: 'a b' } });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain(' ');
    expect(JSON.parse(out).symbols.X).toBe('</script><script>alert(1)</script>');
  });
});
