import { describe, expect, it } from 'vitest';
import { extractJsonLd, findLdProduct, jsonLdNodes } from '../../../src/lib/scrape/jsonld.ts';
import { loadHtml } from '../../../src/lib/scrape/generic.ts';
import * as generic from '../../../src/lib/scrape/generic.ts';

const ld = (body: string): string => `<script type="application/ld+json">${body}</script>`;

describe('ladder rung 2: JSON-LD Product (jsonld.ts)', () => {
  it('walks arrays and @graph, and survives a broken block', () => {
    const $ = loadHtml(
      ld('[{"@type":"BreadcrumbList"},{"@graph":[{"@type":"Product","name":"Deep"}]}]') + ld('{ nope'),
    );
    expect(jsonLdNodes($).map((n) => n['@type'])).toEqual(['BreadcrumbList', undefined, 'Product']);
    expect(extractJsonLd($)?.name).toBe('Deep');
  });

  it('accepts a @type array and flattens the first offer of an offers array', () => {
    const p = findLdProduct([
      {
        '@type': ['Thing', 'Product'],
        name: ' Oushak  Rug ',
        description: '  From LD  ',
        image: [{ url: 'https://cdn.shopify.com/a.jpg' }, 'https://cdn.shopify.com/b.jpg'],
        offers: ['not an object', { '@type': 'Offer', price: '4,000.00', priceCurrency: 'usd', sku: 'S1' }],
      },
    ]);
    expect(p).toEqual({
      name: 'Oushak Rug',
      description: 'From LD',
      sku: 'S1',
      price: 4000,
      currency: 'USD',
      images: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'],
    });
  });

  it('reads lowPrice, numeric prices and a numeric sku', () => {
    expect(findLdProduct([{ '@type': 'Product', sku: 11103, offers: { lowPrice: 685 } }])).toMatchObject({
      sku: '11103',
      price: 685,
      currency: undefined,
    });
  });

  it('is undefined without a Product node, and ignores a non-ISO currency', () => {
    expect(findLdProduct([{ '@type': 'WebSite' }])).toBeUndefined();
    expect(extractJsonLd(loadHtml('<html></html>'))).toBeUndefined();
    expect(
      findLdProduct([{ '@type': 'Product', name: 'n', offers: { price: 1, priceCurrency: 'dollars' } }])
        ?.currency,
    ).toBeUndefined();
  });

  it('stays reachable from generic.ts, the historic import path', () => {
    expect(generic.findLdProduct).toBe(findLdProduct);
    expect(generic.jsonLdNodes).toBe(jsonLdNodes);
  });
});

describe('ladder rung 3: OpenGraph/microdata alone (generic.ts)', () => {
  it('extractOpenGraph never falls back to JSON-LD, extractGeneric does', () => {
    const $ = loadHtml(
      `<html><head><title>T</title>${ld('{"@type":"Product","name":"LD Rug","sku":"11103","offers":{"price":9,"priceCurrency":"EUR"}}')}</head></html>`,
    );
    const og = generic.extractOpenGraph($);
    expect(og).toMatchObject({ title: 'T', price: undefined, currency: undefined, sku: undefined });
    const both = generic.extractGeneric($);
    expect(both).toMatchObject({ title: 'T', price: 9, currency: 'EUR', sku: '11103' });
  });
});
