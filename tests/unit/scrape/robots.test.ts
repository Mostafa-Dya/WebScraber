import { describe, expect, it } from 'vitest';
import {
  ALLOW_ALL,
  RobotsCache,
  isPathAllowed,
  parseRobots,
  parseRobotsGroups,
  patternMatch,
  robotsAllows,
  rulesFor,
} from '../../../src/lib/scrape/robots.ts';
import { fakeTransport, robotsRoute, type FakeCall } from '../../fixtures/scrape/index.ts';

const KV = 'https://karavanrug.com/robots.txt';
const KV_PRODUCT = 'https://karavanrug.com/products/some-rug';

const SAMPLE = `
# a comment
User-agent: BadBot
Disallow: /

User-agent: *
User-agent: Googlebot
Disallow: /cart
Disallow: /checkout
Allow: /products/
Disallow:            # empty value: contributes nothing
Sitemap: https://karavanrug.com/sitemap.xml
`;

describe('robots.txt parsing (RFC 9309, brief §11)', () => {
  it('splits groups, keeps consecutive user-agent lines together and ignores comments', () => {
    const groups = parseRobotsGroups(SAMPLE);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.agents).toEqual(['badbot']);
    expect(groups[0]?.rules).toEqual([{ allow: false, pattern: '/' }]);
    expect(groups[1]?.agents).toEqual(['*', 'googlebot']);
    expect(groups[1]?.rules).toEqual([
      { allow: false, pattern: '/cart' },
      { allow: false, pattern: '/checkout' },
      { allow: true, pattern: '/products/' },
    ]);
  });

  it('selects our group: a named token beats the catch-all, and unknown agents fall back to *', () => {
    const groups = parseRobotsGroups('User-agent: *\nDisallow: /\nUser-agent: serioludere\nAllow: /\n');
    expect(rulesFor(groups).agent).toBe('serioludere');
    expect(rulesFor(groups, ['*']).agent).toBe('*');
    expect(rulesFor(parseRobotsGroups('User-agent: BadBot\nDisallow: /')).rules).toEqual([]);
  });

  it('an empty or comment-only file allows everything', () => {
    expect(parseRobots('')).toEqual(ALLOW_ALL);
    expect(parseRobots('# nothing here\n\n')).toEqual(ALLOW_ALL);
    expect(isPathAllowed(ALLOW_ALL, '/anything')).toBe(true);
  });

  it('matches * and $ and reports the pattern length as its specificity', () => {
    expect(patternMatch('/products/', '/products/x')).toBe(10);
    expect(patternMatch('/*.json$', '/products/a.json')).toBe(8);
    expect(patternMatch('/*.json$', '/products/a.json?x=1')).toBeUndefined();
    expect(patternMatch('/cart', '/products/x')).toBeUndefined();
    expect(patternMatch('', '/x')).toBeUndefined();
  });

  it('the longest matching rule decides and a tie goes to Allow', () => {
    const rules = parseRobots(SAMPLE);
    expect(rules.agent).toBe('*');
    expect(isPathAllowed(rules, '/products/some-rug')).toBe(true);
    expect(isPathAllowed(rules, '/cart')).toBe(false);
    expect(isPathAllowed(rules, '/anything-else')).toBe(true);

    const tie = parseRobots('User-agent: *\nDisallow: /p\nAllow: /p\n');
    expect(isPathAllowed(tie, '/p')).toBe(true);

    const deep = parseRobots('User-agent: *\nDisallow: /products/\nAllow: /products/ok\n');
    expect(isPathAllowed(deep, '/products/ok')).toBe(true);
    expect(isPathAllowed(deep, '/products/no')).toBe(false);
  });

  it('a bare Disallow: / blocks everything (this is ecarpetgallery.com today)', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /\n');
    expect(isPathAllowed(rules, '/us_en/red-5x8-andelz-area-rugs-380114')).toBe(false);
  });
});

describe('RobotsCache', () => {
  it('expires after the TTL and drops the least recently used host over the cap', () => {
    let clock = 0;
    const cache = new RobotsCache({ ttlMs: 100, maxEntries: 2, now: () => clock });
    cache.set('a.example', ALLOW_ALL);
    expect(cache.get('A.EXAMPLE')).toEqual(ALLOW_ALL);
    clock = 100;
    expect(cache.get('a.example')).toBeUndefined();

    clock = 0;
    cache.set('a.example', ALLOW_ALL);
    cache.set('b.example', ALLOW_ALL);
    cache.get('a.example');
    cache.set('c.example', ALLOW_ALL);
    expect(cache.size).toBe(2);
    expect(cache.get('b.example')).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('robotsAllows (guarded fetch, cached per host)', () => {
  it('fetches /robots.txt once per host through the guarded fetch layer, then answers from cache', async () => {
    const calls: FakeCall[] = [];
    const cache = new RobotsCache();
    const transport = fakeTransport({ [KV]: robotsRoute('User-agent: *\nDisallow: /cart\n') }, calls);
    const first = await robotsAllows(KV_PRODUCT, { cache, client: 'impit', fetchOpts: { transport } });
    expect(first).toMatchObject({ allowed: true, cached: false, reason: 'allowed' });
    expect(calls.map((c) => [c.url, c.client])).toEqual([[KV, 'impit']]);

    const second = await robotsAllows(KV_PRODUCT, { cache, client: 'impit', fetchOpts: { transport } });
    expect(second).toMatchObject({ allowed: true, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('refuses a disallowed path', async () => {
    const transport = fakeTransport({ [KV]: robotsRoute('User-agent: *\nDisallow: /products/\n') });
    const verdict = await robotsAllows(KV_PRODUCT, {
      cache: new RobotsCache(),
      fetchOpts: { transport },
    });
    expect(verdict).toMatchObject({ allowed: false, reason: 'disallowed' });
  });

  it('treats a 404, a 5xx and a transport failure as "allowed" and caches that answer', async () => {
    const calls: FakeCall[] = [];
    const missing = fakeTransport({ [KV]: robotsRoute('Not found', 404) }, calls);
    expect(
      await robotsAllows(KV_PRODUCT, { cache: new RobotsCache(), fetchOpts: { transport: missing } }),
    ).toMatchObject({ allowed: true, reason: 'no-robots' });

    const broken = fakeTransport({ [KV]: { throws: new Error('ECONNRESET') } });
    expect(
      await robotsAllows(KV_PRODUCT, { cache: new RobotsCache(), fetchOpts: { transport: broken } }),
    ).toMatchObject({ allowed: true, reason: 'unreadable' });

    const cache = new RobotsCache();
    const failing = fakeTransport({ [KV]: { throws: new Error('boom') } });
    await robotsAllows(KV_PRODUCT, { cache, fetchOpts: { transport: failing } });
    const again = await robotsAllows(KV_PRODUCT, { cache, fetchOpts: { transport: failing } });
    expect(again.cached).toBe(true);
  });

  it('never throws on a malformed target and only ever asks the target host', async () => {
    const calls: FakeCall[] = [];
    const transport = fakeTransport({}, calls);
    expect(
      await robotsAllows('not a url', { cache: new RobotsCache(), fetchOpts: { transport } }),
    ).toMatchObject({ allowed: true, reason: 'unreadable' });
    expect(calls).toEqual([]);
  });
});
