import { describe, expect, it } from 'vitest';
import {
  NON_SHOPIFY_HOSTS,
  looksLikeJson,
  parseShopifyProduct,
  shopifyEndpoints,
  shopifyHandle,
  shopifyPhotos,
  shopifyPrice,
  shopifyRung,
  shouldProbeShopify,
  withWidth,
  type ShopifyProduct,
} from '../../../src/lib/scrape/shopify.ts';
import { ECG_380114_URL, KV_OUSHAK_HANDLE, fixture } from '../../fixtures/scrape/index.ts';

const CDN = 'https://cdn.shopify.com/s/files';
const KV_URL = `https://karavanrug.com/products/${KV_OUSHAK_HANDLE}`;
const js = fixture(`kv-${KV_OUSHAK_HANDLE}.js.json`);
const json = fixture(`kv-${KV_OUSHAK_HANDLE}.json`);

function product(over: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    title: 'A rug',
    handle: 'a-rug',
    descriptionHtml: '',
    tags: [],
    images: [],
    media: [],
    source: 'js',
    ...over,
  };
}

describe('rung 1 endpoints (brief §11: Shopify JSON first for every URL)', () => {
  it('derives <url>.js and <url>.json, trailing slash tolerated', () => {
    expect(shopifyEndpoints(KV_URL)).toEqual({ js: `${KV_URL}.js`, json: `${KV_URL}.json` });
    expect(shopifyEndpoints(`${KV_URL}/`).json).toBe(`${KV_URL}.json`);
  });

  it('reads the Shopify product handle out of the path, locale prefixes included', () => {
    expect(shopifyHandle(KV_URL)).toBe(KV_OUSHAK_HANDLE);
    expect(shopifyHandle('https://shop.example/en-gb/products/Tulu-Rug/')).toBe('tulu-rug');
    expect(shopifyHandle('https://shop.example/collections/rugs')).toBeUndefined();
    expect(shopifyHandle('nonsense')).toBeUndefined();
  });

  it('probes every host except the ones verified not to be Shopify', () => {
    expect(shouldProbeShopify(KV_URL)).toBe(true);
    expect(shouldProbeShopify('https://any-other-store.example/rugs/x')).toBe(true);
    expect(shouldProbeShopify(ECG_380114_URL)).toBe(false);
    expect(NON_SHOPIFY_HOSTS).toContain('ecarpetgallery.com');
    expect(shouldProbeShopify('not a url')).toBe(false);
  });

  it('looksLikeJson is the cheap check before parsing', () => {
    expect([
      looksLikeJson('  {"a":1}'),
      looksLikeJson('[]'),
      looksLikeJson('<html>'),
      looksLikeJson(''),
    ]).toEqual([true, true, false, false]);
    expect(looksLikeJson(undefined)).toBe(false);
  });
});

describe('parseShopifyProduct', () => {
  it('reads the .js shape (price in cents) and the .json shape (variant price)', () => {
    expect(parseShopifyProduct(js)).toMatchObject({
      source: 'js',
      priceCents: 400000,
      variantSku: '11103-7321',
      tags: ['RUGS', 'VINTAGE LARGE RUGS'],
    });
    expect(shopifyPrice(parseShopifyProduct(js)!)).toBe(4000);
    expect(parseShopifyProduct(undefined, json)).toMatchObject({ source: 'json', variantPrice: 4000 });
    expect(shopifyPrice(parseShopifyProduct(undefined, json)!)).toBe(4000);
  });

  it('falls through from a broken .js body to the .json body', () => {
    expect(parseShopifyProduct('not json', json)?.source).toBe('json');
    expect(parseShopifyProduct('{"nope":true}', json)?.source).toBe('json');
  });

  it('returns undefined when neither body is a product', () => {
    expect(parseShopifyProduct('{"title":"only title"}')).toBeUndefined();
    expect(parseShopifyProduct(undefined, '{"product":{}}')).toBeUndefined();
    expect(parseShopifyProduct('[]', '[]')).toBeUndefined();
    expect(parseShopifyProduct()).toBeUndefined();
  });
});

describe('shopifyPhotos', () => {
  it('prefers media[], appends the resize parameter and keeps the original', () => {
    // Protocol-relative sources are absolutised while the payload is parsed, not here.
    expect(
      parseShopifyProduct('{"title":"t","handle":"h","images":["//cdn.shopify.com/a.jpg"]}')?.images,
    ).toEqual(['https://cdn.shopify.com/a.jpg']);
    const photos = shopifyPhotos(
      product({ media: [{ src: 'https://cdn.shopify.com/a.jpg', width: 2000, height: 1200 }] }),
    );
    expect(photos).toEqual([
      {
        url: 'https://cdn.shopify.com/a.jpg?width=1600',
        original: 'https://cdn.shopify.com/a.jpg',
        width: 2000,
        height: 1200,
      },
    ]);
    expect(withWidth('https://cdn.shopify.com/a.jpg?v=1', 1600)).toBe(
      'https://cdn.shopify.com/a.jpg?v=1&width=1600',
    );
  });

  it('falls back to images[], drops foreign hosts, de-duplicates and caps', () => {
    expect(shopifyPhotos(product({ images: [`${CDN}/a.jpg`, 'https://evil.example/b.jpg'] }))).toHaveLength(
      1,
    );
    const many = shopifyPhotos(
      product({ media: Array.from({ length: 15 }, (_, i) => ({ src: `${CDN}/${i}.jpg` })) }),
    );
    expect(many).toHaveLength(12);
    expect(
      shopifyPhotos(product({ media: [{ src: `${CDN}/a.jpg` }, { src: `${CDN}/a.jpg` }] })),
    ).toHaveLength(1);
    expect(shopifyPhotos(product({ media: [{ src: `${CDN}/a.jpg` }] }), 0)).toEqual([]);
  });
});

describe('shopifyRung (rung 1 as a ladder draft)', () => {
  it('carries title, sku, price, tags and photos, and flags the size it read out of the title', () => {
    const draft = shopifyRung(parseShopifyProduct(js)!);
    expect(draft.rung).toBe('shopify');
    expect(draft).toMatchObject({
      supplierRef: '11103-7321',
      seenPrice: 4000,
      widthCm: 305,
      lengthCm: 370,
    });
    expect(draft.supplierTitle).toContain('Oushak');
    expect(draft.tagsSuggested).toEqual(['Vintage Large Rugs']);
    expect(draft.inferred).toEqual(['widthCm', 'lengthCm', 'sizeRaw']);
    expect(draft.photos?.length).toBeGreaterThan(0);
  });

  it('leaves the size out when neither the title nor the description states one', () => {
    const draft = shopifyRung(product({ title: 'Plain rug', descriptionHtml: '<p>Nice</p>' }));
    expect(draft.widthCm).toBeUndefined();
    expect(draft.description).toBe('Nice');
    expect(draft.warnings).toBeUndefined();
  });

  it('reads the size out of the description when the title has none, with the conversion warning', () => {
    const draft = shopifyRung(
      product({ title: 'Plain rug', descriptionHtml: `<p>Size</p><p>4'3" x 7'5"</p>` }),
    );
    expect(draft).toMatchObject({ widthCm: 130, lengthCm: 226 });
    expect(draft.warnings?.[0]).toMatch(/converted/);
  });
});
