import { describe, expect, it } from 'vitest';
import {
  AuditQuery,
  CLIENT_CODE_RE,
  CollectionReorder,
  PhotoImportRequest,
  RugInput,
  RugUpdate,
  SettingsUpdate,
  TagInput,
  issuesOf,
} from '../../../src/lib/admin/dto.ts';

describe('admin DTO schemas (ADMIN_SPEC §2.3)', () => {
  it('RugInput applies the defaults, trims text and enforces the field rules', () => {
    const r = RugInput.parse({ name: '  Khal Mohammadi ', collections: ['Classics'] });
    expect(r).toMatchObject({
      name: 'Khal Mohammadi',
      description: '',
      tags: [],
      photos: [],
      rotate: 'false',
      featured: false,
      status: 'active',
      supplier: '',
      supplierRef: '',
      notes: '',
      roundPrice: false,
    });
    expect(r.id).toBeUndefined();
    expect(r.priceUsd).toBeUndefined();
    const bad = RugInput.safeParse({
      name: '',
      collections: ['x'],
      tags: ['a|b'],
      photos: ['short'],
      widthCm: 5,
      priceUsd: 12.345,
      sourceUrl: 'http://ecarpetgallery.com/x',
      supplier: 'ikea',
      id: 'SL 030',
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = issuesOf(bad.error).map((i) => i.path);
      for (const p of ['name', 'tags.0', 'photos.0', 'widthCm', 'priceUsd', 'sourceUrl', 'supplier', 'id']) {
        expect(paths).toContain(p);
      }
      expect(JSON.stringify(issuesOf(bad.error))).not.toContain('ikea'); // never echoes the input
    }
    expect(
      RugInput.safeParse({ name: 'x', collections: ['y'], sourceUrl: 'https://user:pw@karavanrug.com/p' })
        .success,
    ).toBe(false);
    expect(
      RugInput.safeParse({ name: 'x', collections: ['y'], sourceUrl: 'https://karavanrug.com/p' }).success,
    ).toBe(true);
    expect(RugInput.safeParse({ name: 'x', collections: ['y'], priceUsd: 705 }).success).toBe(true);
    expect(RugInput.safeParse({ name: 'x', collections: ['y'], priceUsd: 705.5 }).success).toBe(true);
  });
  it('RugUpdate drops id and requires the 16-hex version', () => {
    expect(RugUpdate.safeParse({ name: 'x', collections: ['y'], version: 'abcdef0123456789' }).success).toBe(
      true,
    );
    expect(RugUpdate.safeParse({ name: 'x', collections: ['y'], version: 'xyz' }).success).toBe(false);
    expect('id' in RugUpdate.shape).toBe(false);
  });
  it('tags, collections, settings, photos and audit paging', () => {
    expect(TagInput.safeParse({ name: 'Kilim', color: '#A32020' }).success).toBe(true);
    expect(TagInput.safeParse({ name: 'Kilim', color: 'red' }).success).toBe(false);
    expect(CollectionReorder.safeParse({ order: [] }).success).toBe(false);
    expect(CollectionReorder.safeParse({ order: ['kilims', 'tulu'] }).success).toBe(true);
    expect(SettingsUpdate.safeParse({ key: 'price_round_step', value: ' 50 ' })).toMatchObject({
      success: true,
      data: { value: '50' },
    });
    expect(SettingsUpdate.safeParse({ key: 'other', value: '1' }).success).toBe(false);
    expect(
      PhotoImportRequest.safeParse({ urls: ['https://cdn.shopify.com/a.jpg'], namePrefix: 'winks' }).success,
    ).toBe(true);
    expect(PhotoImportRequest.safeParse({ urls: [], namePrefix: 'winks' }).success).toBe(false);
    expect(PhotoImportRequest.safeParse({ urls: ['https://x/a.jpg'], namePrefix: 'a b' }).success).toBe(
      false,
    );
    expect(AuditQuery.parse({})).toEqual({ offset: 0, limit: 100 });
    expect(AuditQuery.parse({ offset: '100', limit: '50' })).toEqual({ offset: 100, limit: 50 });
    expect(AuditQuery.safeParse({ limit: 500 }).success).toBe(false);
    expect('nadia-k7m2pq').toMatch(CLIENT_CODE_RE);
    expect('-bad').not.toMatch(CLIENT_CODE_RE);
  });
});
