import { describe, expect, it } from 'vitest';
import {
  LADDER_ORDER,
  draftToRug,
  fillBlanks,
  finalisePartial,
  finaliseScraped,
  hasBlanks,
  htmlRungs,
  inferredHints,
  mergeRungs,
  present,
  type RungDraft,
} from '../../../src/lib/scrape/ladder.ts';
import { sizeBandOf, sizeLabelOf } from '../../../src/lib/size.ts';
import { SCRAPED_FIELDS, type ScrapedRug } from '../../../src/lib/scrape/types.ts';

const CDN = 'https://cdn.shopify.com/s/files';

function rug(over: Partial<ScrapedRug> = {}): ScrapedRug {
  return {
    supplier: 'karavanrug',
    supplierRef: '11103',
    sourceUrl: 'https://karavanrug.com/products/x',
    supplierTitle: 'A rug',
    tagsSuggested: [],
    photos: [],
    warnings: [],
    ...over,
  };
}

describe('the ladder order (brief §11)', () => {
  it('is Shopify JSON → JSON-LD → OpenGraph/microdata → per-source selectors', () => {
    expect(LADDER_ORDER).toEqual(['shopify', 'jsonld', 'opengraph', 'source']);
  });

  it('merges rungs in that order regardless of the order they were produced in', () => {
    const drafts: RungDraft[] = [
      { rung: 'opengraph', supplierTitle: 'OG title', description: 'og', seenCurrency: 'USD' },
      { rung: 'source', supplierTitle: 'Source title', material: 'Wool', age: 'Vintage' },
      { rung: 'jsonld', supplierTitle: 'LD title', description: 'ld', seenPrice: 685 },
      { rung: 'shopify', supplierTitle: 'Shopify title', seenPrice: 4000 },
    ];
    const merged = mergeRungs(drafts);
    expect(merged.values.supplierTitle).toBe('Shopify title');
    expect(merged.values.seenPrice).toBe(4000);
    expect(merged.values.description).toBe('ld');
    expect(merged.values.seenCurrency).toBe('USD');
    expect(merged.values.material).toBe('Wool');
    expect(merged.from).toMatchObject({
      supplierTitle: 'shopify',
      seenPrice: 'shopify',
      description: 'jsonld',
      seenCurrency: 'opengraph',
      material: 'source',
    });
  });

  it('skips blank values, so an empty string never beats a later rung', () => {
    const merged = mergeRungs([
      { rung: 'shopify', supplierTitle: '   ', tagsSuggested: [], seenPrice: Number.NaN },
      { rung: 'jsonld', supplierTitle: 'LD title', tagsSuggested: ['Red'], seenPrice: 12 },
    ]);
    expect(merged.values).toMatchObject({ supplierTitle: 'LD title', tagsSuggested: ['Red'], seenPrice: 12 });
    expect(merged.from.supplierTitle).toBe('jsonld');
  });

  it('carries the winning rung’s inferred marks and de-duplicates warnings', () => {
    const merged = mergeRungs([
      { rung: 'shopify', widthCm: 82, lengthCm: 300, inferred: ['widthCm'], warnings: ['w'] },
      { rung: 'jsonld', widthCm: 90, inferred: ['widthCm', 'lengthCm'], warnings: ['w', 'x'] },
    ]);
    expect(merged.inferred).toEqual({ widthCm: 'inferred' });
    expect(merged.warnings).toEqual(['w', 'x']);
  });

  it('present() is the blank test the whole ladder shares', () => {
    expect([present(''), present('  '), present(undefined), present([]), present(Number.NaN)]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect([present('a'), present(0), present([1]), present(false)]).toEqual([true, true, true, true]);
  });
});

describe('fillBlanks / hasBlanks', () => {
  it('only fills fields the per-source rung left empty', () => {
    const target = rug({ supplierTitle: 'Source title', material: '' });
    const filled = fillBlanks(target, { supplierTitle: 'LD title', material: 'Wool', age: 'Vintage' });
    expect(target.supplierTitle).toBe('Source title');
    expect(target.material).toBe('Wool');
    expect(target.age).toBe('Vintage');
    expect(filled).toEqual(['material', 'age']);
  });

  it('hasBlanks says whether running the generic rungs could still pay off', () => {
    expect(hasBlanks(rug())).toBe(true);
    const complete = rug({
      description: 'd',
      widthCm: 82,
      lengthCm: 300,
      sizeRaw: '82x300 cm',
      material: 'Wool',
      method: 'Kilim',
      age: 'Vintage',
      origin: 'Turkey',
      seenPrice: 685,
      seenCurrency: 'USD',
      retailEstimate: 'USD 900',
      tagsSuggested: ['Red'],
      photos: [{ url: `${CDN}/a.jpg` }],
    });
    expect(hasBlanks(complete)).toBe(false);
  });
});

describe('htmlRungs (rungs 2 and 3)', () => {
  const PAGE = `<!doctype html><html><head>
    <title>Ignored</title>
    <meta property="og:title" content="OG Rug 200 x 300 cm">
    <meta property="og:image" content="${CDN}/og.jpg">
    <meta property="product:price:currency" content="usd">
    <script type="application/ld+json">{"@type":"Product","name":"LD Rug","sku":"11103",
      "offers":{"price":"685.00","priceCurrency":"USD"},"image":["${CDN}/ld.jpg"]}</script>
  </head><body></body></html>`;

  it('produces a JSON-LD rung before an OpenGraph rung, and JSON-LD wins the merge', () => {
    const rungs = htmlRungs(PAGE);
    expect(rungs.map((r) => r.rung)).toEqual(['jsonld', 'opengraph']);
    const merged = mergeRungs(rungs);
    expect(merged.values.supplierTitle).toBe('LD Rug');
    expect(merged.values.supplierRef).toBe('11103');
    expect(merged.values.seenPrice).toBe(685);
    expect(merged.values.photos?.[0]?.url).toBe(`${CDN}/ld.jpg`);
    // The size only exists in the OG title, so it comes from rung 3 and is inferred.
    expect(merged.values).toMatchObject({ widthCm: 200, lengthCm: 300 });
    expect(merged.from.widthCm).toBe('opengraph');
    expect(merged.inferred.widthCm).toBe('inferred');
  });

  it('drops the JSON-LD rung when the page has no Product node', () => {
    expect(htmlRungs('<html><head><title>T</title></head></html>').map((r) => r.rung)).toEqual(['opengraph']);
  });
});

describe('draftToRug', () => {
  it('builds a usable rug from the generic rungs alone (a store with no adapter)', () => {
    const merged = mergeRungs([
      {
        rung: 'jsonld',
        supplierTitle: 'Generic Rug',
        seenPrice: 500,
        seenCurrency: 'USD',
        photos: [{ url: `${CDN}/a.jpg` }],
        widthCm: 100,
        lengthCm: 200,
        inferred: ['widthCm', 'lengthCm'],
      },
    ]);
    const out = draftToRug('karavanrug', 'https://karavanrug.com/products/x', merged, 'x');
    expect(out).toMatchObject({
      supplier: 'karavanrug',
      supplierRef: 'x',
      supplierTitle: 'Generic Rug',
      seenPrice: 500,
      primaryImage: `${CDN}/a.jpg`,
    });
    // No sku on any rung: the handle stands in for it, so it is flagged.
    expect(out.fieldStatus?.supplierRef).toBe('inferred');
    expect(out.fieldStatus?.widthCm).toBe('inferred');
  });
});

describe('finaliseScraped: Size Label, Size Band and field status (brief §11)', () => {
  it('composes the label and the band from src/lib/size.ts and marks both inferred', () => {
    const out = finaliseScraped(rug({ widthCm: 240, lengthCm: 170 }));
    expect(out.sizeLabel).toBe(sizeLabelOf(240, 170));
    expect(out.sizeLabel).toBe('240 × 170 cm');
    expect(out.sizeBand).toBe(sizeBandOf(240, 170));
    expect(out.sizeBand).toBe('M');
    expect(out.fieldStatus.sizeLabel).toBe('inferred');
    expect(out.fieldStatus.sizeBand).toBe('inferred');
  });

  it('bands the brief’s way: XS <0.75, S ≤2.5, M ≤5, L ≤10, XL >10 m²', () => {
    const band = (w: number, l: number): string => finaliseScraped(rug({ widthCm: w, lengthCm: l })).sizeBand;
    expect(band(60, 100)).toBe('XS'); // 0.6 m²
    expect(band(75, 100)).toBe('S'); // exactly 0.75
    expect(band(100, 250)).toBe('S'); // exactly 2.5
    expect(band(100, 251)).toBe('M');
    expect(band(200, 250)).toBe('M'); // exactly 5
    expect(band(200, 251)).toBe('L');
    expect(band(250, 400)).toBe('L'); // exactly 10
    expect(band(250, 401)).toBe('XL');
  });

  it('leaves both blank and missing when a side is unknown', () => {
    const out = finaliseScraped(rug({ widthCm: 240 }));
    expect(out.sizeLabel).toBe('');
    expect(out.sizeBand).toBe('');
    expect(out.fieldStatus.sizeLabel).toBe('missing');
    expect(out.fieldStatus.lengthCm).toBe('missing');
  });

  it('gives every field a status: found when read, missing when absent', () => {
    const out = finaliseScraped(
      rug({
        description: 'A rug',
        material: 'Wool',
        seenPrice: 685,
        seenCurrency: 'USD',
        priceUsd: 685,
        tagsSuggested: ['Red'],
        photos: [{ url: `${CDN}/a.jpg` }],
      }),
    );
    expect(Object.keys(out.fieldStatus).sort()).toEqual([...SCRAPED_FIELDS].sort());
    expect(out.fieldStatus).toMatchObject({
      supplierRef: 'found',
      supplierTitle: 'found',
      description: 'found',
      material: 'found',
      seenPrice: 'found',
      seenCurrency: 'found',
      priceUsd: 'found',
      tagsSuggested: 'found',
      photos: 'found',
      primaryImage: 'found',
      method: 'missing',
      age: 'missing',
      origin: 'missing',
      retailEstimate: 'missing',
      suggestedRetailUsd: 'missing',
    });
    expect(out.primaryImage).toBe(`${CDN}/a.jpg`);
  });

  it('marks an assumed currency, a converted price and a derived retail suggestion as inferred', () => {
    const assumed = finaliseScraped(
      rug({ seenPrice: 4000, seenCurrency: 'USD', currencyAssumed: true, priceUsd: 4000 }),
    );
    expect(assumed.fieldStatus.seenCurrency).toBe('inferred');
    expect(assumed.fieldStatus.priceUsd).toBe('inferred');

    const converted = finaliseScraped(
      rug({ seenPrice: 900, seenCurrency: 'EUR', priceUsd: 990, suggestedRetailUsd: 1585 }),
    );
    expect(converted.fieldStatus).toMatchObject({
      seenCurrency: 'found',
      priceUsd: 'inferred',
      suggestedRetailUsd: 'inferred',
    });
  });

  it('honours a hint only for a field that has a value, and never mutates the input', () => {
    const input = rug({ widthCm: 130, lengthCm: 226 });
    const out = finaliseScraped(input, { widthCm: 'inferred', material: 'found', age: 'inferred' });
    expect(out.fieldStatus.widthCm).toBe('inferred');
    expect(out.fieldStatus.lengthCm).toBe('found');
    expect(out.fieldStatus.material).toBe('missing');
    expect(out.fieldStatus.age).toBe('missing');
    expect(input.fieldStatus).toBeUndefined();
    expect(input.sizeLabel).toBeUndefined();
  });

  it('is idempotent: the inferred marks survive a second pass', () => {
    const once = finaliseScraped(rug({ widthCm: 130, lengthCm: 226 }), { widthCm: 'inferred' });
    const twice = finaliseScraped(once);
    expect(twice.fieldStatus).toEqual(once.fieldStatus);
    expect(twice.sizeBand).toBe(once.sizeBand);
  });

  it('finalisePartial flags what a failed parse still read, and leaves a stub untouched', () => {
    const partial = finalisePartial(rug({ widthCm: 130, lengthCm: 226 }));
    expect(partial.sizeBand).toBe('M');
    expect(partial.fieldStatus?.seenPrice).toBe('missing');
    const stub = { supplierTitle: 'Only a title' };
    expect(finalisePartial(stub)).toBe(stub);
  });

  it('inferredHints keeps only the inferred entries', () => {
    expect(inferredHints({ widthCm: 'inferred', material: 'found', age: 'missing' })).toEqual({
      widthCm: 'inferred',
    });
    expect(inferredHints(undefined)).toEqual({});
  });
});
