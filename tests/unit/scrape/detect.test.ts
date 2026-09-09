import { describe, expect, it } from 'vitest';
import { detectSupplier, manualFallback, manualFromDetected } from '../../../src/lib/scrape/detect.ts';

describe('detectSupplier (ADMIN_SPEC §4.2)', () => {
  it('rebuilds ECG links on the us_en store from any store code, host spelling or scheme', () => {
    for (const input of [
      'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
      'https://www.ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
      'http://ecarpetgallery.com/eu_en/red-5x8-andelz-area-rugs-380114',
      'https://ecarpetgallery.com/ca_fr/red-5x8-andelz-area-rugs-380114/',
      'https://ecarpetgallery.com/red-5x8-andelz-area-rugs-380114?utm_source=x#top',
      '  https://ECARPETGALLERY.com/ca_en/RED-5x8-andelz-area-rugs-380114  ',
    ]) {
      const det = detectSupplier(input);
      expect(det).toEqual({
        supplier: 'ecarpetgallery',
        sku: '380114',
        urlKey: 'red-5x8-andelz-area-rugs-380114',
        supplierRef: '380114',
        sourceUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
        htmlUrl: 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114',
      });
    }
  });

  it('takes the trailing digits as the sku even when the key contains numbers', () => {
    const det = detectSupplier('https://ecarpetgallery.com/us_en/red-10-ft-runner-andelz-runner-rug-425302');
    expect(det).toMatchObject({
      supplier: 'ecarpetgallery',
      sku: '425302',
      urlKey: 'red-10-ft-runner-andelz-runner-rug-425302',
    });
  });

  it('rebuilds KV links into the Shopify .js / .json / HTML endpoints', () => {
    for (const input of [
      'https://karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm',
      'http://www.karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm/?variant=1#x',
    ]) {
      expect(detectSupplier(input)).toEqual({
        supplier: 'karavanrug',
        handle: 'vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm',
        supplierRef: 'vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm',
        sourceUrl: 'https://karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm',
        jsUrl: 'https://karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm.js',
        jsonUrl: 'https://karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm.json',
        htmlUrl: 'https://karavanrug.com/products/vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm',
      });
    }
  });

  it('refuses hosts off the allow-list, including look-alikes', () => {
    for (const input of [
      'https://example.com/products/x',
      'https://ecarpetgallery.com.evil.example/us_en/red-5x8-andelz-area-rugs-380114',
      'https://notkaravanrug.com/products/x',
      'https://images.ecarpetwholesale.com/x-1234',
      'https://r.jina.ai/https://ecarpetgallery.com/us_en/x-1234',
    ]) {
      expect(detectSupplier(input)).toEqual({ error: 'unsupported_host' });
    }
  });

  it('refuses malformed or dangerous links', () => {
    for (const input of [
      '',
      'not a url',
      'ftp://ecarpetgallery.com/us_en/x-1234',
      'https://user:pw@ecarpetgallery.com/us_en/x-1234',
      'https://ecarpetgallery.com:8443/us_en/x-1234',
      'https://127.0.0.1/us_en/x-1234',
      'https://[::1]/products/x',
      'https://localhost/products/x',
    ]) {
      expect(detectSupplier(input)).toEqual({ error: 'invalid_url' });
    }
  });

  it('refuses non-product paths on the supplier hosts (never a listing or search page)', () => {
    for (const input of [
      'https://ecarpetgallery.com/us_en/catalogsearch/result/?q=380114',
      'https://ecarpetgallery.com/us_en/',
      'https://ecarpetgallery.com/us_en/our-story',
      'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-38',
      'https://karavanrug.com/collections/runners',
      'https://karavanrug.com/products/',
      'https://karavanrug.com/products/x.js',
    ]) {
      expect(detectSupplier(input)).toEqual({ error: 'invalid_url' });
    }
  });
});

describe('manualFallback (ADMIN_SPEC §4.8)', () => {
  it('derives supplier and reference from the pasted URL alone', () => {
    expect(manualFallback('https://ecarpetgallery.com/us_en/catalogsearch/result/?q=380114&x=1')).toEqual({
      supplier: 'ecarpetgallery',
      supplierRef: '',
      sourceUrl: 'https://ecarpetgallery.com/us_en/catalogsearch/result/',
    });
    expect(
      manualFallback('http://www.ecarpetgallery.com/eu_en/red-5x8-andelz-area-rugs-380114.html'),
    ).toEqual({
      supplier: 'ecarpetgallery',
      supplierRef: '380114',
      sourceUrl: 'https://www.ecarpetgallery.com/eu_en/red-5x8-andelz-area-rugs-380114.html',
    });
    expect(manualFallback('karavanrug.com/products/Some-Handle?variant=1')).toEqual({
      supplier: 'karavanrug',
      supplierRef: 'some-handle',
      sourceUrl: 'https://karavanrug.com/products/Some-Handle',
    });
    expect(manualFallback('https://example.com/products/x')).toBeUndefined();
    expect(manualFallback('')).toBeUndefined();
  });

  it('manualFromDetected mirrors the detection', () => {
    const det = detectSupplier('https://karavanrug.com/products/abc');
    expect('error' in det).toBe(false);
    if (!('error' in det)) {
      expect(manualFromDetected(det)).toEqual({
        supplier: 'karavanrug',
        supplierRef: 'abc',
        sourceUrl: 'https://karavanrug.com/products/abc',
      });
    }
  });
});
