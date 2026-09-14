// Pure helpers added by the design pass (docs/DESIGN.md §10.1).
import { describe, expect, it } from 'vitest';
import { snapshotFromRanges } from '../../src/lib/sheets/read.ts';
import {
  cardView,
  enquiryLinks,
  navTabs,
  plateRatio,
  relatedCards,
  siblings,
  withLeads,
  type CardView,
} from '../../src/lib/view.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

const base: CardView = {
  id: 'x',
  slug: 'x',
  name: 'X',
  collection: 'Kilims',
  collectionSlug: 'kilims',
  collections: ['Kilims'],
  collectionSlugs: ['kilims'],
  photoUrls: [],
  rot: '0',
  material: '',
  age: '',
  origin: '',
  method: '',
  pile: '',
  description: '',
  likes: 0,
  dislikes: 0,
  rating: 0,
  tags: [],
};
const c = (id: string, over: Partial<CardView> = {}): CardView => {
  const merged = { ...base, id, slug: id, name: id.toUpperCase(), ...over };
  // Keep membership in step with a primary-only override. Every fixture below sets `collection` /
  // `collectionSlug`; a card whose plural list disagreed with its primary would be a shape the
  // parser cannot produce, so the grouping helpers would be exercised against fiction.
  return {
    ...merged,
    collections: over.collections ?? [merged.collection],
    collectionSlugs: over.collectionSlugs ?? [merged.collectionSlug],
  };
};

describe('plateRatio (docs/DESIGN.md §5.2)', () => {
  it('snaps the displayed width ÷ height to the nearest bucket in log space', () => {
    expect(plateRatio(300, 400, '0')).toBe('3-4');
    expect(plateRatio(100, 400, '0')).toBe('1-2');
    expect(plateRatio(400, 100, '0')).toBe('2-1');
    expect(plateRatio(200, 200, '0')).toBe('1-1');
    expect(plateRatio(400, 300, '0')).toBe('4-3');
    expect(plateRatio(400, 300, '1')).toBe('3-4'); // the sheet says portrait: the file is turned
    expect(plateRatio(135, 190, '1')).toBe('3-4');
    expect(plateRatio(58, 100, '0')).toBe('2-3'); // the log midpoint between 1/2 and 2/3 is 0.577
  });
  it('falls back to the reference 3/4 plate when a dimension is unknown', () => {
    expect(plateRatio(undefined, 400, '0')).toBe('3-4');
    expect(plateRatio(0, 0, 'force')).toBe('3-4');
  });
});

describe('withLeads (docs/DESIGN.md §3.5)', () => {
  const cards = [
    c('a'),
    c('b', { featured: true, ar: '3-2' }),
    c('c'),
    c('d', { collection: 'Tulu', collectionSlug: 'tulu', featured: true, ar: '4-3' }),
    c('e', { collection: 'Tulu', collectionSlug: 'tulu' }),
  ];
  it('moves the first featured landscape rug of a ≥3-rug collection to the front and marks it', () => {
    const out = withLeads(cards);
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(out[0]?.lead).toBe(true);
    expect(out.filter((x) => x.lead)).toHaveLength(1); // Tulu has only two rugs
    expect(withLeads(out).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd', 'e']); // idempotent
  });
  it('never leads with a portrait plate and leaves unfeatured collections alone', () => {
    const portrait = withLeads([c('a'), c('b', { featured: true, ar: '3-4' }), c('c')]);
    expect(portrait.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(portrait.some((x) => x.lead)).toBe(false);
    expect(withLeads([c('a'), c('b'), c('c')]).some((x) => x.lead)).toBe(false);
  });
});

describe('siblings / relatedCards (docs/DESIGN.md §4)', () => {
  const cards = [c('a'), c('b'), c('c'), c('d', { collection: 'Tulu', collectionSlug: 'tulu' })];
  it('positions a rug within its collection in grid order, no wrap-around', () => {
    expect(siblings(cards, 'b')).toMatchObject({ index: 1, total: 3, prev: { id: 'a' }, next: { id: 'c' } });
    expect(siblings(cards, 'a')?.prev).toBeUndefined();
    expect(siblings(cards, 'c')?.next).toBeUndefined();
    expect(siblings(cards, 'd')).toMatchObject({ index: 0, total: 1 });
    expect(siblings(cards, 'nope')).toBeUndefined();
  });
  it('lists the rest of the collection after the current one, wrapping and capped', () => {
    expect(relatedCards(cards, 'b').map((x) => x.id)).toEqual(['c', 'a']);
    expect(relatedCards(cards, 'b', 1).map((x) => x.id)).toEqual(['c']);
    expect(relatedCards(cards, 'd')).toEqual([]);
    expect(relatedCards(cards, 'nope')).toEqual([]);
  });
});

describe('enquiryLinks', () => {
  it('pre-fills the rug name and reference id', () => {
    const l = enquiryLinks('Winks "quoted"', 'SL-021');
    expect(l.whatsapp).toBe(
      'https://wa.me/525535760978?text=' +
        encodeURIComponent('Hi Serio Ludere, I am interested in Winks "quoted" (ref SL-021).'),
    );
    expect(l.mailto).toBe(
      'mailto:hello@serioludere.com?subject=' + encodeURIComponent('Winks "quoted" (ref SL-021)'),
    );
    expect(l.askPhotos).toContain(encodeURIComponent('Photos of Winks "quoted" (ref SL-021)'));
  });
});

describe('cardView + navTabs design fields', () => {
  it('derives the plate bucket, photo ids and the standfirst description from the snapshot', () => {
    const snap = snapshotFromRanges(
      rangesWith({
        rugs: [
          rugRow({
            id: 'SL-021',
            width_cm: 400,
            length_cm: 300,
            photos: '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb|1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0',
          }),
        ],
        collections: [['kilims', 'Kilims', 'kilims', 'Flatweaves from Denizli', '', '', 1]],
      }),
    );
    const card = cardView(snap.catalogue.rugs[0]!, snap.catalogue);
    expect(card.ar).toBe('4-3');
    // Image Src holds the primary only; the rest live in the Drive folder (brief §9).
    expect(card.photoIds).toEqual(['1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb']);
    expect(card.altPhotoUrl).toBeUndefined();
    expect(navTabs(snap.catalogue.rugs, snap.catalogue)).toEqual([
      { name: 'Kilims', slug: 'kilims', count: 1, description: 'Flatweaves from Denizli' },
    ]);
  });
});
