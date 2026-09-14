import { describe, expect, it } from 'vitest';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { SheetContractError } from '../../src/lib/sheets/errors.ts';
import {
  assertHeaders,
  columnLetter,
  orderedCollectionNames,
  parseCollections,
  parseRates,
  parseProducts,
  parseSnapshot,
  parseTags,
  parseReactions,
} from '../../src/lib/sheets/parse.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

const rugHeaders = [...HEADERS.Products];
const ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';

describe('header contract', () => {
  it('accepts the exact headers (case-insensitive, extra trailing columns allowed)', () => {
    expect(() => assertHeaders('Products', [...rugHeaders, 'notes'])).not.toThrow();
    expect(() => assertHeaders('Rates', ['Currency', 'rate_to_base', 'symbol', 'updated_at'])).not.toThrow();
  });
  it('fails loudly naming the wrong column', () => {
    const bad = [...rugHeaders];
    bad[1] = 'title';
    expect(() => assertHeaders('Products', bad)).toThrow(SheetContractError);
    expect(() => assertHeaders('Products', bad)).toThrow(/column B should be "handle"/);
  });
  it('throws when a tab has no header row at all (values absent or empty)', () => {
    expect(() => parseProducts(undefined)).toThrow(SheetContractError);
    expect(() => parseProducts([])).toThrow(/column A should be "product id" but is ""/);
    expect(() => parseRates([])).toThrow(SheetContractError);
    expect(() => parseReactions(undefined)).toThrow(SheetContractError);
  });
  it('a header-only tab parses to zero rows', () => {
    expect(parseProducts([rugHeaders]).items).toEqual([]);
    expect(parseReactions([[...HEADERS.Reactions]]).state.size).toBe(0);
  });
  it('columnLetter', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(16)).toBe('Q');
    expect(columnLetter(21)).toBe('V');
    expect(columnLetter(26)).toBe('AA');
  });
});

describe('parseProducts', () => {
  it('maps a row with the ADR defaults and trims strings', () => {
    const { items, dropped, warnings } = parseProducts([rugHeaders, rugRow()]);
    expect(dropped).toEqual([]);
    expect(warnings).toEqual([]);
    expect(items).toHaveLength(1);
    const r = items[0]!;
    expect(r.id).toBe('SL-021');
    expect(r.slug).toBe('winks');
    expect(r.tags).toEqual(['Kilim', 'Denizli', 'Plant Dyes']);
    expect(r.photos).toEqual([ID]);
    expect(r.material).toBe('100% Wool');
    expect(r.origin).toBe('Denizli, Turkey');
    expect(r.rotate).toBe('false');
    expect(r.featured).toBe(false);
    expect(r.status).toBe('active');
    // Counts come from the Reactions log now; parseProducts alone reports zero (brief §3).
    expect(r.likes).toBe(0);
    expect(r.rating).toBe(0);
    expect(r.method).toBe('Hand-woven');
    expect(r.scrapedAt).toBe('');
  });
  it('keeps numeric-looking ids as strings', () => {
    const { items } = parseProducts([rugHeaders, rugRow({ id: 1389, name: 'Door // Beige & Brown Tulu' })]);
    expect(items[0]?.id).toBe('1389');
    expect(items[0]?.slug).toBe('door-beige-brown-tulu');
  });
  it('treats 0 / blank / whitespace dimensions and prices as unknown', () => {
    const { items } = parseProducts([rugHeaders, rugRow({ width_cm: 0, length_cm: '', price_usd: '   ' })]);
    expect(items[0]?.widthCm).toBeUndefined();
    expect(items[0]?.lengthCm).toBeUndefined();
    expect(items[0]?.priceUsd).toBeUndefined();
  });
  it('accepts checkbox booleans and TRUE/FALSE text; whitespace-only cells take the blank default', () => {
    expect(parseProducts([rugHeaders, rugRow({ featured: true, rotate: 'force' })]).items[0]).toMatchObject({
      featured: true,
      rotate: 'force',
    });
    expect(parseProducts([rugHeaders, rugRow({ featured: 'TRUE', rotate: 'True' })]).items[0]).toMatchObject({
      featured: true,
      rotate: 'true',
    });
    expect(
      parseProducts([rugHeaders, rugRow({ featured: 'FALSE', rotate: '  ', status: '  ' })]).items[0],
    ).toMatchObject({
      featured: false,
      rotate: 'false',
      status: 'active',
    });
  });
  it('treats an unknown flag as an ordinary tag rather than dropping the row', () => {
    const { items, dropped } = parseProducts([rugHeaders, rugRow({ tags: 'Kilim|yes', rotate: '' })]);
    expect(dropped).toEqual([]);
    expect(items[0]?.rotate).toBe('false');
    expect(items[0]?.tags).toEqual(['Kilim', 'yes']);
  });

  it('drops a bad row with its row number and keeps the rest', () => {
    const { items, dropped } = parseProducts([
      rugHeaders,
      rugRow({ price_usd: 'ask' }),
      rugRow({ id: 'SL-022', name: 'Yellow' }),
    ]);
    expect(items.map((r) => r.id)).toEqual(['SL-022']);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ tab: 'Products', row: 2 });
    expect(dropped[0]?.issues[0]).toMatch(/variant_price/);
  });
  it('never reinterprets a comma: a text price "1,250" is dropped, not read as 1.25', () => {
    const { items, dropped } = parseProducts([rugHeaders, rugRow({ price_usd: '1,250' })]);
    expect(items).toEqual([]);
    expect(dropped[0]?.issues[0]).toMatch(/variant_price/);
  });
  it('ignores rows without an id (including whitespace-only ids) and fully blank rows', () => {
    const { items, dropped } = parseProducts([
      rugHeaders,
      rugRow({ id: '' }),
      rugRow({ id: '   ' }),
      [],
      ['', ' '],
      rugRow({ id: 'SL-030', name: 'Dobag' }),
    ]);
    expect(items.map((r) => r.id)).toEqual(['SL-030']);
    expect(dropped).toEqual([]);
  });
  it('drops a duplicate id and reports it', () => {
    const { items, dropped } = parseProducts([
      rugHeaders,
      rugRow({ id: 'SL-1' }),
      rugRow({ id: 'SL-1', name: 'Again' }),
    ]);
    expect(items).toHaveLength(1);
    expect(dropped[0]?.issues[0]).toMatch(/duplicates an earlier row/);
  });
  it('de-duplicates slugs and warns about an invalid slug cell', () => {
    const { items, warnings } = parseProducts([
      rugHeaders,
      rugRow({ id: 'a', name: 'Isparta' }),
      rugRow({ id: 'b', name: 'Isparta', slug: 'Not Valid!' }),
    ]);
    expect(items.map((r) => r.slug)).toEqual(['isparta', 'isparta-2']);
    expect(warnings[0]?.issues[0]).toMatch(/^handle:/);
  });
  it('warns about an Image Src that is neither a Drive id nor an https URL', () => {
    const { items, warnings, dropped } = parseProducts([
      rugHeaders,
      rugRow({ photos: 'ftp://example.com/x.jpg' }),
    ]);
    expect(dropped).toEqual([]);
    expect(items[0]?.photos).toEqual([]);
    expect(warnings[0]?.issues[0]).toMatch(/^image src:/);
  });
  it('a broken formula cell (#REF!) still fails loudly', () => {
    const { dropped } = parseProducts([rugHeaders, rugRow({ width_cm: '#REF!' })]);
    expect(dropped[0]?.issues[0]).toMatch(/width_cm/);
  });
});

describe('parseCollections / parseTags', () => {
  it('normalises cover URLs through the image allow-list and warns otherwise', () => {
    const { items, warnings, dropped } = parseCollections([
      [...HEADERS.Collections],
      ['kilims', 'Kilims', 'kilims', '', '', `https://drive.google.com/file/d/${ID}/view`, 4],
      ['classics', 'Classics', 'classics', '', '', 'https://evil.example/x.png', 1],
      ['x', '', 'x', '', '', '', 2],
    ]);
    expect(dropped).toHaveLength(1); // nameless row
    expect(items[0]?.coverImageUrl).toBe(`/api/image/${ID}?w=1600`);
    expect(items[1]?.coverImageUrl).toBeUndefined();
    expect(warnings[0]?.issues[0]).toMatch(/cover_image_url: host "evil.example" is not allow-listed/);
  });
  it('validates tag colours and slugs with warnings', () => {
    const { items, warnings } = parseTags([[...HEADERS.Tags], ['kilim', 'Kilim!', 'Kilim', 'red']]);
    expect(items[0]).toMatchObject({ slug: 'kilim', color: undefined });
    expect(warnings[0]?.issues).toHaveLength(2);
  });
});

describe('parseRates', () => {
  it('keeps the trailing space in symbols and rejects comma decimals', () => {
    const { items, dropped } = parseRates([
      [...HEADERS.Rates],
      ['USD', 1, '$', ''],
      ['AED', 3.67, 'AED ', '2026-09-05'],
      ['MXN', '17,5', '$', ''],
    ]);
    expect(items[1]).toMatchObject({ currency: 'AED', rateToBase: 3.67, symbol: 'AED ' });
    expect(dropped[0]?.issues[0]).toMatch(/rate_to_base/);
  });
});

describe('parseReactions (newest-first window)', () => {
  const h = [...HEADERS.Reactions];
  it('newest row per (visitor, rug, vote) decides; removals clear the state', () => {
    const { state, rowsRead, dropped } = parseReactions([
      h,
      ['e-t3-visitor-1', 'visitor-1', 'SL-021', 'dislike', 'detail', 't3'], // newest: v1 now dislikes SL-021
      ['e-t2-visitor-1', 'visitor-1', 'SL-021', 'none', 'card', 't2'],
      ['e-t1-visitor-1', 'visitor-1', 'SL-021', 'like', 'card', 't1'],
      ['e-t1-visitor-1', 'visitor-1', 'SL-022', 'like', 'card', 't1'],
      ['e-t2-visitor-2', 'visitor-2', 'SL-022', 'none', 'card', 't2'], // v2's latest on SL-022 clears it
      ['e-t1-visitor-2', 'visitor-2', 'SL-022', 'like', 'card', 't1'],
    ]);
    expect(rowsRead).toBe(6);
    expect(dropped).toEqual([]);
    expect(state.get('visitor-1')?.get('SL-021')).toBe('dislike');
    expect(state.get('visitor-1')?.get('SL-022')).toBe('like');
    expect(state.get('visitor-2')?.has('SL-022') ?? false).toBe(false);
  });
  it('is order-independent within a flip batch (dislike/remove + like/add in either order)', () => {
    const a = parseReactions([
      h,
      ['e-t-visitor-1', 'visitor-1', 'SL-1', 'like', 'detail', 't'],
      ['e-t0-visitor-1', 'visitor-1', 'SL-1', 'dislike', 'detail', 't0'],
    ]);
    const b = parseReactions([
      h,
      ['e-b1', 'visitor-1', 'SL-1', 'like', 'detail', 't'],
      ['e-b2', 'visitor-1', 'SL-1', 'dislike', 'detail', 't0'],
    ]);
    expect(a.state.get('visitor-1')?.get('SL-1')).toBe('like');
    expect(b.state.get('visitor-1')?.get('SL-1')).toBe('like');
  });
  it('keys numeric product ids as strings, defaults a blank source to card, drops bad rows', () => {
    const { state, dropped } = parseReactions([
      h,
      ['e1', 'visitor-9', 1389, 'like', '', 't'],
      ['e2', 'visitor-9', 'SL-1', 'like', 'detail', 't'],
      ['e3', 'visitor-9', 'SL-3', 'love', 'card', 't'],
      ['e4', '', 'SL-2', 'like', 'card', 't'],
      ['e5', 'bad slug', 'SL-2', 'like', 'card', 't'],
    ]);
    expect(state.get('visitor-9')?.get('1389')).toBe('like');
    expect(state.get('visitor-9')?.get('SL-1')).toBe('like');
    expect(dropped.map((d) => d.issues[0])).toEqual([
      expect.stringMatching(/reaction/),
      expect.stringMatching(/customer_slug/),
      expect.stringMatching(/customer_slug/),
    ]);
  });
});

describe('orderedCollectionNames', () => {
  const rugs = [
    { collection: 'Kilims' },
    { collection: 'Classics' },
    { collection: 'Signed' },
    { collection: 'Patchwork' },
    { collection: 'Aubusson' },
  ] as Parameters<typeof orderedCollectionNames>[0];
  it('uses the reference ORDER list when Collections is empty, then A→Z', () => {
    expect(orderedCollectionNames(rugs, [])).toEqual([
      'Classics',
      'Kilims',
      'Signed',
      'Aubusson',
      'Patchwork',
    ]);
  });
  it('uses Collections.sort_order when present (case-insensitive match)', () => {
    const cols = [
      { id: 'a', slug: 'signed', name: 'signed', description: '', sortOrder: 1 },
      { id: 'b', slug: 'kilims', name: 'Kilims', description: '', sortOrder: 2 },
    ];
    expect(orderedCollectionNames(rugs, cols)).toEqual([
      'Signed',
      'Kilims',
      'Aubusson',
      'Classics',
      'Patchwork',
    ]);
  });
});

describe('parseSnapshot', () => {
  it('parses the five positional ranges and reports per-tab stats', () => {
    const snap = parseSnapshot(
      rangesWith({
        rugs: [rugRow(), rugRow({ id: 'bad', price_usd: 'ask' })],
        collections: [['kilims', 'Kilims', 'kilims', '', '', '', 4]],
        tags: [['kilim', 'kilim', 'Kilim', '#BB3E03']],
      }),
    );
    expect(snap.catalogue.rugs).toHaveLength(1);
    expect(snap.catalogue.collections[0]).toMatchObject({ name: 'Kilims', sortOrder: 4 });
    expect(snap.catalogue.tags[0]).toMatchObject({ slug: 'kilim', color: '#BB3E03' });
    expect(snap.catalogue.rates[0]?.symbol).toBe('$');
    // The fixture rugs carry likes/dislikes, so the helper synthesised reaction rows for them.
    expect(snap.voteState.size).toBeGreaterThan(0);
    expect(snap.report.votesRowsRead).toBeGreaterThanOrEqual(0);
    expect(snap.report.stats.Products).toEqual({ kept: 1, dropped: 1 });
    expect(snap.report.stats.Rates).toEqual({ kept: 1, dropped: 0 });
  });
  it('throws when a content tab lost its header row', () => {
    const ranges = rangesWith();
    ranges[3] = { range: ranges[3]!.range }; // Rates cleared
    expect(() => parseSnapshot(ranges)).toThrow(SheetContractError);
  });
});
