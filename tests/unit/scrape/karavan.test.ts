import { describe, expect, it } from 'vitest';
import {
  karavanPhotos,
  parseKaravan,
  parseKaravanProduct,
  parseKaravanSpecs,
  withWidth,
} from '../../../src/lib/scrape/karavan.ts';
import { KV_OUSHAK_HANDLE, KV_RUNNER_HANDLE, fixture } from '../../fixtures/scrape/index.ts';

const oushak = {
  js: fixture(`kv-${KV_OUSHAK_HANDLE}.js.json`),
  json: fixture(`kv-${KV_OUSHAK_HANDLE}.json`),
  html: fixture(`kv-${KV_OUSHAK_HANDLE}.html`),
};
const runner = {
  js: fixture(`kv-${KV_RUNNER_HANDLE}.js.json`),
  json: fixture(`kv-${KV_RUNNER_HANDLE}.json`),
  html: fixture(`kv-${KV_RUNNER_HANDLE}.html`),
};

describe('parseKaravan on the real .js + HTML (ADMIN_SPEC §4.4)', () => {
  it('reads the Oushak rug: Stock Code, cm pair, heading blocks, cents price, JSON-LD currency', () => {
    const rug = parseKaravan(KV_OUSHAK_HANDLE, { js: oushak.js, html: oushak.html });
    expect(rug).toBeDefined();
    expect(rug).toMatchObject({
      supplier: 'karavanrug',
      supplierRef: '11103',
      sourceUrl: `https://karavanrug.com/products/${KV_OUSHAK_HANDLE}`,
      supplierTitle: '60+ Years Old Vintage Turkish Oushak Rug , 305 x 370 cm / 10.0 x 12.1 ft',
      widthCm: 305,
      lengthCm: 370,
      sizeRaw: '305 x 370 cm (10.0 x 12.1 ft)',
      material: '100% hand-spun wool-on-wool',
      method: 'Handwoven',
      age: 'Approximately 60+ years old',
      seenPrice: 4000,
      seenCurrency: 'USD',
      currencyAssumed: false,
      tagsSuggested: ['Vintage Large Rugs'],
    });
    expect(rug?.origin).toBeUndefined();
    expect(rug?.description).toMatch(/^Vintage Turkish Oushak Rug – 305 x 370 cm/);
    expect(rug?.description).toContain('Stock Code: 11103');
    expect(rug?.warnings).toEqual(['Condition: Professionally washed']);
    expect(rug?.photos).toHaveLength(5);
    expect(rug?.photos[0]).toEqual({
      url: 'https://cdn.shopify.com/s/files/1/0759/3807/0707/files/60--years-old-vintage-turkish-oushak-rug---305-x-370-cm---10-0-x-resim-7321.jpg?v=1783502063&width=1600',
      original:
        'https://cdn.shopify.com/s/files/1/0759/3807/0707/files/60--years-old-vintage-turkish-oushak-rug---305-x-370-cm---10-0-x-resim-7321.jpg?v=1783502063',
      width: 2000,
      height: 2000,
    });
    for (const p of rug?.photos ?? [])
      expect(p.url).toMatch(/^https:\/\/cdn\.shopify\.com\/.*[?&]width=1600$/);
  });

  it('reads the runner: the "Details:" block with Label: value lines, colours and styles as tags', () => {
    const rug = parseKaravan(KV_RUNNER_HANDLE, { js: runner.js, html: runner.html });
    expect(rug).toMatchObject({
      supplierRef: '21063',
      supplierTitle: 'Vintage Turkish Runner Rug, 2.7x9.8 ft, 82x300 cm',
      widthCm: 82,
      lengthCm: 300,
      sizeRaw: '82x300 cm / 2.7x9.8 ft',
      material: 'Wool',
      method: 'Handmade pile rug',
      age: 'Vintage',
      origin: 'Turkey',
      seenPrice: 685,
      seenCurrency: 'USD',
      currencyAssumed: false,
    });
    expect(rug?.tagsSuggested).toEqual([
      'Brown',
      'Terracotta',
      'Coral',
      'Orange',
      'Ivory',
      'Gray',
      'Dusty pink',
      'Mustard yellow',
      'Anatolian',
      'Geometric',
      'Tribal',
      'Faded',
      'Boho',
      'Vintage Runner Rugs',
    ]);
    expect(rug?.warnings).toEqual(['Condition: Vintage condition with natural age and handmade character']);
    expect(rug?.photos).toHaveLength(6);
    expect(rug?.photos[1]).toMatchObject({ width: 2048, height: 1185 });
  });

  it('falls back to the .json payload and assumes USD without the HTML', () => {
    const rug = parseKaravan(KV_OUSHAK_HANDLE, { json: oushak.json });
    expect(rug).toMatchObject({
      supplierRef: '11103',
      seenPrice: 4000,
      seenCurrency: 'USD',
      currencyAssumed: true,
      widthCm: 305,
      lengthCm: 370,
      tagsSuggested: ['Vintage Large Rugs'],
    });
    expect(rug?.warnings[0]).toMatch(/currency USD assumed/);
    expect(rug?.photos).toHaveLength(5);
    expect(rug?.photos[0]?.width).toBe(2000);
  });

  it('flags an assumed currency even with the HTML when it states none', () => {
    const rug = parseKaravan(KV_OUSHAK_HANDLE, {
      js: oushak.js,
      html: '<html><title>no meta</title></html>',
    });
    expect(rug?.currencyAssumed).toBe(true);
    expect(rug?.warnings[0]).toMatch(/not stated/);
  });

  it('returns undefined when neither payload is a Shopify product', () => {
    expect(parseKaravan('x', { js: 'not json', json: '{"product":{}}' })).toBeUndefined();
    expect(parseKaravan('x', {})).toBeUndefined();
    expect(parseKaravanProduct('{"title":"only title"}')).toBeUndefined();
  });

  it('parseKaravanProduct reads both shapes', () => {
    expect(parseKaravanProduct(oushak.js)).toMatchObject({
      source: 'js',
      priceCents: 400000,
      variantSku: '11103-7321',
      tags: ['RUGS', 'VINTAGE LARGE RUGS'],
    });
    expect(parseKaravanProduct(undefined, oushak.json)).toMatchObject({
      source: 'json',
      variantPrice: 4000,
      variantSku: '11103-7321',
    });
    expect(parseKaravanProduct(undefined, oushak.json)?.tags).toEqual(['RUGS', 'VINTAGE LARGE RUGS']);
  });

  it('parseKaravanSpecs handles heading-on-its-own-line blocks and Material & Design', () => {
    const { specs } = parseKaravanSpecs(
      '<p><strong>Material &amp; Design</strong></p><p>100% wool<br>Handwoven</p><p><strong>Size</strong></p><p>65 x 362 cm</p><p>Stock Code: 5</p>',
    );
    expect(specs.get('material')).toBe('100% wool');
    expect(specs.get('size')).toBe('65 x 362 cm');
    expect(specs.get('stock code')).toBe('5');
  });

  it('uses the variant sku when there is no Stock Code and the method keyword fallback', () => {
    const js = JSON.stringify({
      title: 'Tulu rug',
      handle: 'tulu',
      description: '<p>Soft pile</p>',
      tags: ['RUGS'],
      price: 91000,
      variants: [{ sku: 'V-1', price: 91000 }],
      images: ['//cdn.shopify.com/s/files/1/x.jpg'],
      media: [],
    });
    const rug = parseKaravan('tulu', { js });
    expect(rug).toMatchObject({ supplierRef: 'V-1', method: 'Tulu', seenPrice: 910, tagsSuggested: [] });
    expect(rug?.photos).toEqual([
      {
        url: 'https://cdn.shopify.com/s/files/1/x.jpg?width=1600',
        original: 'https://cdn.shopify.com/s/files/1/x.jpg',
        width: undefined,
        height: undefined,
      },
    ]);
  });

  it('karavanPhotos drops foreign hosts, de-duplicates and caps at 12', () => {
    const media = Array.from({ length: 15 }, (_, i) => ({
      src: `https://cdn.shopify.com/s/files/${i}.jpg`,
      width: 10,
      height: 10,
    }));
    media.push({ src: 'https://evil.example/x.jpg', width: 1, height: 1 });
    media.push({ src: 'https://cdn.shopify.com/s/files/0.jpg', width: 10, height: 10 });
    const photos = karavanPhotos({
      title: 't',
      handle: 'h',
      descriptionHtml: '',
      tags: [],
      images: [],
      media,
      source: 'js',
    });
    expect(photos).toHaveLength(12);
    expect(photos.every((p) => p.url.startsWith('https://cdn.shopify.com/'))).toBe(true);
    expect(withWidth('https://cdn.shopify.com/a.jpg?v=1', 1600)).toBe(
      'https://cdn.shopify.com/a.jpg?v=1&width=1600',
    );
    expect(withWidth('https://cdn.shopify.com/a.jpg', 1600)).toBe('https://cdn.shopify.com/a.jpg?width=1600');
  });

  it('truncates very long descriptions with a warning', () => {
    const js = JSON.stringify({
      title: 'Long',
      handle: 'long',
      description: `<p>${'word '.repeat(1200)}</p>`,
      tags: [],
      price: 100,
      variants: [],
      images: [],
      media: [],
    });
    const rug = parseKaravan('long', { js });
    expect(rug?.description?.length).toBe(4000);
    expect(rug?.warnings).toContain('description truncated to 4000 characters');
  });
});
