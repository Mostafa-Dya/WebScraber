import { describe, expect, it } from 'vitest';
import {
  ecgGalleryPhotos,
  ecgSku,
  ecgSpecRows,
  isCloudflareChallenge,
  parseEcg,
} from '../../../src/lib/scrape/ecg.ts';
import { fixture } from '../../fixtures/scrape/index.ts';

const page380114 = fixture('ecg-380114.html');
const page425302 = fixture('ecg-425302.html');
const challenge = fixture('cf-challenge.html');

describe('parseEcg on the real product pages (ADMIN_SPEC §4.4)', () => {
  it('reads 380114: sku, title, USD price, retail hint, spec table, feet-inches → cm, tags, gallery', () => {
    const rug = parseEcg({ sku: '380114', urlKey: 'red-5x8-andelz-area-rugs-380114' }, page380114);
    expect(rug).toMatchObject({
      supplier: 'ecarpetgallery',
      supplierRef: '380114',
      sourceUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
      supplierTitle: `Persian Style 4'3" x 7'5" Hand-knotted Wool Rug`,
      widthCm: 130,
      lengthCm: 226,
      sizeRaw: `4'3" x 7'5"`,
      material: '100% Wool',
      method: 'Hand-Knotted',
      age: 'Semi-Antique',
      origin: 'Turkey',
      seenPrice: 700,
      seenCurrency: 'USD',
      currencyAssumed: false,
      retailEstimate: 'USD $2,000 Estimated Retail',
      tagsSuggested: ['Persian Style', 'Persian', 'Tribal', 'Medallion', 'Red', 'Turkish Wool Rug'],
      warnings: [`no cm on page; converted 4'3" × 7'5" → 130 × 226 cm`],
    });
    expect(rug.description).toMatch(/^Splendid piece of work that is woven in Turkey/);
    expect(rug.photos).toHaveLength(9);
    expect(rug.photos[0]).toEqual({
      url: 'https://images.ecarpetwholesale.com/dev/catalog/product/cache/33e026746392a202f311c455e4542ed6/3/8/380114-1_fmgmspwszpre0ve8.jpg',
      original: 'https://images.ecarpetwholesale.com/dev/catalog/product/3/8/380114-1_fmgmspwszpre0ve8.jpg',
    });
    for (const p of rug.photos) expect(p.url).toMatch(/^https:\/\/images\.ecarpetwholesale\.com\//);
  });

  it('reads 425302 (a runner, 10\'0")', () => {
    const rug = parseEcg({ sku: '425302', urlKey: 'red-10-ft-runner-andelz-runner-rug-425302' }, page425302);
    expect(rug).toMatchObject({
      supplierRef: '425302',
      supplierTitle: `Persian Style 3'1" x 10'0" Hand-knotted Wool Runner Rug`,
      widthCm: 94,
      lengthCm: 305,
      seenPrice: 375,
      seenCurrency: 'USD',
      retailEstimate: 'USD $1,100 Estimated Retail',
      tagsSuggested: [
        'Persian Style',
        'Persian',
        'Traditional',
        'Medallion Corners',
        'Red',
        'Turkish Wool Runner Rug',
      ],
    });
    expect(rug.photos).toHaveLength(7);
  });

  it('ignores the junk "New" row and "Remarks: NA"', () => {
    const specs = ecgSpecRows(page380114);
    expect(specs.has('new')).toBe(false);
    expect(specs.has('remarks')).toBe(false);
    expect(specs.get('width')).toBe(`4'3"`);
    expect(specs.get('length')).toBe(`7'5"`);
    expect(specs.get('weave')).toBe('Hand-Knotted');
  });
});

describe('isCloudflareChallenge', () => {
  it('recognises the block page and not a product page', () => {
    expect(isCloudflareChallenge(403, challenge)).toBe(true);
    expect(isCloudflareChallenge(200, challenge)).toBe(true);
    expect(isCloudflareChallenge(200, page380114)).toBe(false);
    expect(isCloudflareChallenge(403, '<html><title>Forbidden</title></html>')).toBe(false);
    expect(isCloudflareChallenge(503, '<html><title>Just a moment...</title></html>')).toBe(true);
    expect(isCloudflareChallenge(200, '', new Headers({ 'cf-mitigated': 'challenge' }))).toBe(true);
  });
});

describe('ecgSku / ecgGalleryPhotos / fallbacks', () => {
  it('prefers the view_item dataLayer sku, then the URL sku', () => {
    expect(ecgSku(page380114, '380114')).toBe('380114');
    expect(ecgSku('"event":"view_item_stape","ecommerce":{"items":[{"item_sku":"999"}]}', '380114')).toBe(
      '999',
    );
    expect(ecgSku('"item_sku":"111","item_sku":"380114"', '380114')).toBe('380114');
    expect(ecgSku('"item_sku":"111"', '380114')).toBe('380114');
    expect(ecgSku('"item_sku":"111"', '')).toBe('111');
    expect(ecgSku('nothing', '380114')).toBe('380114');
  });

  it('parses the gallery JSON, strips /cache/<hash>/ for the original, de-duplicates and filters hosts', () => {
    const html = `x-data="initGallery" initialImages: [{"full":"a"}], images: [{"thumb":"t","img":"i","full":"https://images.ecarpetwholesale.com/dev/catalog/product/cache/33e026746392a202f311c455e4542ed6/3/8/a.jpg","type":"image"},{"full":"https://images.ecarpetwholesale.com/dev/catalog/product/cache/ffffffffffffffffffffffffffffffff/3/8/a.jpg"},{"full":"https://evil.example/x.jpg"},{"full":"https://images.ecarpetwholesale.com/v.mp4","type":"video"},{"img":"https://images.ecarpetwholesale.com/only-img.jpg"}], activeImage: 0`;
    expect(ecgGalleryPhotos(html)).toEqual([
      {
        url: 'https://images.ecarpetwholesale.com/dev/catalog/product/cache/33e026746392a202f311c455e4542ed6/3/8/a.jpg',
        original: 'https://images.ecarpetwholesale.com/dev/catalog/product/3/8/a.jpg',
      },
      { url: 'https://images.ecarpetwholesale.com/only-img.jpg', original: undefined },
    ]);
    expect(ecgGalleryPhotos('images: [broken', 12)).toEqual([]);
    expect(ecgGalleryPhotos('no gallery')).toEqual([]);
  });

  it('falls back to og:image, the final-price text, the description div and the title size', () => {
    const html = `<html><head>
      <meta property="og:title" content="Persian Style 6'8&quot; x 10'4&quot; Rug | ECARPETGALLERY">
      <meta property="og:image" content="https://images.ecarpetwholesale.com/dev/catalog/product/3/8/x.jpg">
      </head><body>
      <div class="product attribute"><div class="value">From the div.</div></div>
      <div class="pricing-div"><span class="final-price">USD $700 ECARPETGALLERY</span><span class="retail-price">USD $1,290 <span>Estimated Retail</span></span></div>
      <table class="additional-attributes"><tr><th>Made In</th><td>Turkey</td></tr><tr><th>Remarks</th><td>NA</td></tr></table>
      </body></html>`;
    const rug = parseEcg({ sku: '1234', urlKey: 'x-1234' }, html);
    expect(rug).toMatchObject({
      supplierRef: '1234',
      supplierTitle: `Persian Style 6'8" x 10'4" Rug`,
      description: 'From the div.',
      seenPrice: 700,
      seenCurrency: 'USD',
      retailEstimate: 'USD $1,290 Estimated Retail',
      origin: 'Turkey',
      widthCm: 203,
      lengthCm: 315,
      tagsSuggested: [],
    });
    expect(rug.photos).toEqual([
      { url: 'https://images.ecarpetwholesale.com/dev/catalog/product/3/8/x.jpg' },
    ]);
  });

  it('leaves the price undefined (parse_failed material) and flags an assumed currency', () => {
    const noPrice = parseEcg({ sku: '1', urlKey: 'x-1' }, '<html><title>T | ECARPETGALLERY</title></html>');
    expect(noPrice.seenPrice).toBeUndefined();
    expect(noPrice.supplierTitle).toBe('T');
    const bare = parseEcg(
      { sku: '1', urlKey: 'x-1' },
      '<html><title>T</title><meta itemprop="price" content="450"></html>',
    );
    expect(bare).toMatchObject({ seenPrice: 450, seenCurrency: 'USD', currencyAssumed: true });
  });
});
