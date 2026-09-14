import { describe, expect, it } from 'vitest';
import { SAVES_READ_RANGE, buildSavesReport } from '../../../src/lib/admin/saves.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';
import type { Rug } from '../../../src/lib/sheets/types.ts';

const PRODUCT_BASE = {
  imageSrc: '',
  imageAltText: '',
  sizeLabel: '',
  sizeBand: '',
  pile: '',
  shape: '',
  vendor: '',
  productCategory: '',
  productType: '',
  published: true,
  variantSku: '',
  variantInventoryPolicy: '',
  variantRequiresShipping: true,
  variantTaxable: true,
  seoTitle: '',
  seoDescription: '',
  sourceUrl: '',
  sourceSite: '',
  driveFolderId: '',
  driveFolderUrl: '',
  scrapedAt: '',
  commitStatus: '' as const,
  internalNotes: '',
};

function rug(id: string, name: string, status: Rug['status'] = 'active'): Rug {
  return {
    ...PRODUCT_BASE,
    id,
    slug: name.toLowerCase(),
    name,
    description: '',
    collections: [],
    collection: '',
    tags: [],
    photos: [],
    material: '',
    age: '',
    origin: '',
    method: '',
    rotate: 'false',
    featured: false,
    status,
    likes: 0,
    dislikes: 0,
    rating: 0,
  };
}
const V1 = 'nadia-k7m2pq';
const V2 = 'omar-aaaaaa';
const V3 = 'ghost-code';
type Row = [string, string, string, string, string, string];
let seq = 0;
/** One Reactions row: newest first in the fixtures, exactly as the tab is written. */
const row = (customer: string, productId: string, reaction: string, source = 'card'): Row => [
  `e${++seq}`,
  customer,
  productId,
  reaction,
  source,
  't',
];
const rugs = [rug('SL-021', 'Winks'), rug('SL-022', 'Yellow'), rug('SL-023', 'Old', 'archived')];
const clients = [{ code: 'nadia-k7m2pq', name: 'Nadia', status: 'active' as const }];

describe('buildSavesReport (ADMIN_SPEC §3.5)', () => {
  it('newest row decides per (customer, product); a clearing event wins; distinct customers are counted', () => {
    const report = buildSavesReport(
      [
        [...HEADERS.Reactions],
        row(V1, 'SL-021', 'none'), // newest: Nadia un-liked Winks
        row(V1, 'SL-021', 'like'),
        row(V2, 'SL-021', 'like'),
        row(V2, 'SL-021', 'like'), // duplicate, one customer
        row('anon', 'SL-022', 'like'),
        row(V2, 'SL-022', 'dislike', 'detail'),
        row(V3, 'SL-023', 'like'),
      ],
      rugs,
      clients,
      () => 0,
    );
    expect(report.generatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(report.rowsRead).toBe(7);
    expect(report.rowsDropped).toBe(0);
    expect(report.mostSaved.map((m) => [m.rugId, m.saves, m.dislikes])).toEqual([
      ['SL-023', 1, 0],
      ['SL-021', 1, 0],
      ['SL-022', 1, 1],
    ]);
    expect(report.mostSaved[0]).toMatchObject({ name: 'Old', status: 'archived' }); // archived still displays
    expect(report.byClient.map((c) => c.code).sort()).toEqual(['anon', 'ghost-code', 'omar-aaaaaa']);
    const omar = report.byClient.find((c) => c.code === 'omar-aaaaaa')!;
    expect(omar.liked.map((r) => r.rugId)).toEqual(['SL-021']);
    expect(omar.disliked.map((r) => r.rugId)).toEqual(['SL-022']);
    expect(report.byClient.find((c) => c.code === 'anon')).toMatchObject({
      name: 'anonymous',
      known: false,
    });
  });
  it('orders ties by name, references unknown rugs by id, drops malformed rows and tolerates blanks', () => {
    const report = buildSavesReport(
      [
        [...HEADERS.Reactions],
        row('anon', 'SL-022', 'like'),
        row('anon', 'SL-021', 'like'),
        row('anon2', 'SL-099', 'like'),
        row('anon', 'bad id!', 'like'),
        row('anon', 'SL-023', 'maybe'),
        row('bad customer!', 'SL-021', 'like'),
        [],
      ],
      rugs,
      [],
    );
    expect(report.rowsDropped).toBe(3);
    expect(report.mostSaved.map((m) => m.rugId).sort()).toEqual(['SL-021', 'SL-022', 'SL-099']);
    expect(report.mostSaved.find((m) => m.rugId === 'SL-099')).toMatchObject({
      name: 'SL-099',
      status: 'unknown',
      slug: '',
    });
    expect(report.byClient.map((c) => c.code).sort()).toEqual(['anon', 'anon2']);
  });
  it('validates the Reactions header and exposes the bounded read range', () => {
    expect(() => buildSavesReport([['when']], rugs, clients)).toThrow(/Reactions/);
    expect(buildSavesReport([[...HEADERS.Reactions]], rugs, clients).mostSaved).toEqual([]);
    expect(SAVES_READ_RANGE).toBe('Reactions!A1:F200001');
  });
});
