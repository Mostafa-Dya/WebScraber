import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PHOTOS,
  SECONDARY_FAILED_WARNING,
  primaryImageOf,
  resolvePhotos,
} from '../../../src/lib/scrape/photos.ts';

const CDN = 'https://cdn.shopify.com/s/files';
const ECG = 'https://images.ecarpetwholesale.com';

describe('resolvePhotos (brief §11 photo-first)', () => {
  it('returns the gallery in order with its first entry as the primary image', () => {
    const r = resolvePhotos(() => [{ url: `${CDN}/a.jpg` }, { url: `${CDN}/b.jpg` }]);
    expect(r.primaryImage).toBe(`${CDN}/a.jpg`);
    expect(r.photos.map((p) => p.url)).toEqual([`${CDN}/a.jpg`, `${CDN}/b.jpg`]);
    expect(r.warning).toBeUndefined();
  });

  it('keeps an explicit primary first and never duplicates it', () => {
    const r = resolvePhotos(() => [{ url: `${CDN}/a.jpg` }, { url: `${CDN}/b.jpg` }], {
      primary: `${CDN}/b.jpg`,
    });
    expect(r.photos.map((p) => p.url)).toEqual([`${CDN}/b.jpg`, `${CDN}/a.jpg`]);
    expect(r.primaryImage).toBe(`${CDN}/b.jpg`);
  });

  it('keeps the primary when the gallery throws, and never lets that failure escape', () => {
    const onError = vi.fn();
    const r = resolvePhotos(
      () => {
        throw new Error('gallery JSON is broken');
      },
      { primary: `${ECG}/full/1.jpg`, onError },
    );
    expect(r.photos.map((p) => p.url)).toEqual([`${ECG}/full/1.jpg`]);
    expect(r.primaryImage).toBe(`${ECG}/full/1.jpg`);
    expect(r.warning).toBe(SECONDARY_FAILED_WARNING);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('uses the fallback only when the gallery produced nothing', () => {
    const empty = resolvePhotos(() => [], { fallback: `${ECG}/og.jpg` });
    expect(empty.photos.map((p) => p.url)).toEqual([`${ECG}/og.jpg`]);
    const full = resolvePhotos(() => [{ url: `${CDN}/a.jpg` }], { fallback: `${ECG}/og.jpg` });
    expect(full.photos.map((p) => p.url)).toEqual([`${CDN}/a.jpg`]);
  });

  it('drops photos on hosts that are not allow-listed, including the primary and the fallback', () => {
    const r = resolvePhotos(() => [{ url: 'https://evil.example/x.jpg' }, { url: `${CDN}/a.jpg` }], {
      primary: 'https://evil.example/p.jpg',
      fallback: 'https://evil.example/f.jpg',
    });
    expect(r.photos.map((p) => p.url)).toEqual([`${CDN}/a.jpg`]);
    expect(resolvePhotos(() => [], { fallback: 'https://evil.example/f.jpg' })).toMatchObject({
      photos: [],
      primaryImage: undefined,
    });
  });

  it('de-duplicates by the original URL and caps the list', () => {
    const dup = resolvePhotos(() => [
      { url: `${CDN}/a.jpg?width=1600`, original: `${CDN}/a.jpg` },
      { url: `${CDN}/a.jpg?width=800`, original: `${CDN}/a.jpg` },
    ]);
    expect(dup.photos).toHaveLength(1);

    const many = resolvePhotos(() => Array.from({ length: 20 }, (_, i) => ({ url: `${CDN}/${i}.jpg` })));
    expect(many.photos).toHaveLength(MAX_PHOTOS);
    expect(
      resolvePhotos(() => [{ url: `${CDN}/a.jpg` }], { max: 1, primary: `${CDN}/p.jpg` }).photos,
    ).toEqual([{ url: `${CDN}/p.jpg` }]);
  });

  it('primaryImageOf reads the head of an existing list', () => {
    expect(primaryImageOf([{ url: `${CDN}/a.jpg` }])).toBe(`${CDN}/a.jpg`);
    expect(primaryImageOf([])).toBeUndefined();
    expect(primaryImageOf(undefined)).toBeUndefined();
  });
});
