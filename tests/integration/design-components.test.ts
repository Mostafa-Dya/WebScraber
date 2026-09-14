// Design-pass markup contracts rendered with Astro's container API (docs/DESIGN.md §10.1).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CollectionNav from '../../src/components/CollectionNav.astro';
import Gallery from '../../src/components/Gallery.astro';
import Pager from '../../src/components/Pager.astro';
import RugCard from '../../src/components/RugCard.astro';
import RugGrid from '../../src/components/RugGrid.astro';
import Specs from '../../src/components/Specs.astro';
import type { RateTable } from '../../src/lib/currency.ts';
import type { CardView } from '../../src/lib/view.ts';

const rates: RateTable = { rates: { USD: 1 }, symbols: { USD: '$' } };
const card: CardView = {
  id: 'SL-021',
  slug: 'winks',
  name: 'Winks',
  collection: 'Kilims',
  collectionSlug: 'kilims',
  collections: ['Kilims'],
  collectionSlugs: ['kilims'],
  photoUrl: '/api/image/1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb?w=800',
  photoUrls: ['/api/image/1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb?w=1600'],
  photoIds: ['1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb', '1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0'],
  altPhotoUrl: '/api/image/1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0?w=800',
  rot: '1',
  ar: '4-3',
  widthCm: 135,
  lengthCm: 190,
  material: '100% Wool',
  age: 'Modern',
  origin: 'Denizli, Turkey',
  method: 'Hand-woven',
  pile: '',
  description: '',
  priceUsd: 576,
  likes: 1,
  dislikes: 0,
  rating: 5,
  tags: [],
};

describe('RugCard (design pass)', () => {
  it('renders the plate, slug, ratio bucket, price row and eager attributes', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RugCard, {
      props: { card, rates, eager: true, priority: true },
    });
    expect(html).toMatch(/<div class="card"[^>]*data-card[^>]*data-slug="winks"/);
    expect(html).toMatch(/<div class="photo"[^>]*data-plate/);
    expect(html).toMatch(/class="ph-art"[^>]*data-ar="4-3"/);
    expect(html).toMatch(/<div class="price-row"[^>]*>[\s\S]*class="price"[\s\S]*class="rating"/);
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('data-plate-img');
    expect(html).toMatch(/data-alt="[^"]*1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0\?w=800"/);
    expect(html).not.toContain('style=');
  });
  it('marks empty plates, leads, and related cards without data-card', async () => {
    const container = await AstroContainer.create();
    const empty = await container.renderToString(RugCard, {
      props: { card: { ...card, photoUrl: undefined, photoIds: [] }, rates },
    });
    expect(empty).toMatch(/<div class="photo"[^>]*data-empty/);
    expect(empty).toContain('<div class="ph">photo to come</div>');
    const lead = await container.renderToString(RugCard, { props: { card: { ...card, lead: true }, rates } });
    expect(lead).toContain('class="card lead"');
    const related = await container.renderToString(RugCard, { props: { card, rates, related: true } });
    expect(related).not.toMatch(/<div class="card"[^>]*data-card/);
  });
});

describe('CollectionNav (design pass)', () => {
  it('adds the ink bar and one standfirst per tab, only the active one visible', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CollectionNav, {
      props: {
        tabs: [
          { name: 'Classics', slug: 'classics', count: 4, description: 'City workshop pieces.' },
          { name: 'Kilims', slug: 'kilims', count: 1, description: '' },
        ],
        active: 'classics',
      },
    });
    expect(html).toMatch(/<span class="ink" aria-hidden="true"><\/span>\s*<\/nav>/);
    expect(html.match(/data-standfirst/g)).toHaveLength(2);
    expect(html).toMatch(/data-standfirst data-collection="classics"(?![^>]*hidden)[^>]*>/);
    expect(html).toMatch(/data-standfirst data-collection="kilims"[^>]*hidden/);
    expect(html).toContain('Classics · 4 rugs');
    expect(html).toContain('City workshop pieces.');
    expect(html).toContain('Kilims · 1 rug');
    expect(html).toContain('Classics<span class="n">4</span>'); // the tested no-space contract
  });
});

describe('RugGrid (design pass)', () => {
  it('renders a status with Try again and eight aria-hidden ghost cards on error', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RugGrid, {
      props: { cards: [], rates, state: 'Sheets down', error: true },
      request: new Request('http://localhost/?collection=kilims'),
    });
    expect(html).toMatch(
      /<div id="state" class="state" role="status">\s*Sheets down\s*<a class="retry" href="\/\?collection=kilims">/,
    );
    expect(html).toMatch(/<div class="grid ghost" aria-hidden="true">/);
    expect(html.match(/class="sk sk-plate"/g)).toHaveLength(8);
    expect(html).not.toContain('plate-empty');
  });
  it('renders one empty plate (no ghosts) for an empty catalogue and eager flags for the active tab', async () => {
    const container = await AstroContainer.create();
    const empty = await container.renderToString(RugGrid, {
      props: { cards: [], rates, state: 'No rugs published yet.' },
    });
    expect(empty).toContain('plate-empty');
    expect(empty).not.toContain('ghost');
    const grid = await container.renderToString(RugGrid, {
      props: {
        cards: [
          card,
          { ...card, id: 'b', slug: 'b', collectionSlug: 'tulu' },
          { ...card, id: 'c', slug: 'c' },
        ],
        rates,
        active: 'kilims',
        eager: 1,
      },
    });
    expect(grid.match(/loading="eager"/g)).toHaveLength(1);
    expect(grid.match(/fetchpriority="high"/g)).toHaveLength(1);
    expect(grid).toContain('id="grid-live"');
  });
});

describe('Gallery / Specs / Pager', () => {
  it('renders the hero plate, base + full layers, thumbs and the dialog', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Gallery, { props: { card } });
    expect(html).toMatch(/<div class="hero"[^>]*data-plate[^>]*data-ar="4-3"[^>]*data-slug="winks"/);
    expect(html).toMatch(/class="hero-base"[^>]*fetchpriority="high"/);
    expect(html).toMatch(/class="hero-full"[^>]*srcset="[^"]*\?w=800 800w, [^"]*\?w=1600 1600w"/);
    expect(html.match(/class="thumb"/g)).toHaveLength(2);
    expect(html).toMatch(/class="thumb"[^>]*aria-pressed="true"/);
    expect(html).toContain('<dialog id="lightbox" class="lb" aria-label="Photo viewer">');
    expect(html).toContain('class="lb-prev"');
    expect(html).toContain('Photo 1 of 2 · click to enlarge');
    const single = await container.renderToString(Gallery, {
      props: { card: { ...card, photoIds: ['1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb'] } },
    });
    expect(single).not.toContain('class="thumb"');
    expect(single).not.toContain('class="lb-prev"');
    expect(single).toContain('class="hero-open"');
    const none = await container.renderToString(Gallery, {
      props: { card: { ...card, photoIds: [], photoUrl: undefined } },
    });
    expect(none).not.toContain('<dialog');
    expect(none).not.toContain('hero-open');
    expect(none).toContain('No photo yet');
    expect(none).toMatch(/<div class="hero"[^>]*data-empty/);
  });
  it('renders spec rows only for present values, with the reference id, and a stable pager', async () => {
    const container = await AstroContainer.create();
    const specs = await container.renderToString(Specs, {
      props: { card: { ...card, age: '', method: '' } },
    });
    expect(specs).toMatch(
      /<dt>Size<\/dt>\s*<dd data-dims data-w="135" data-l="190">\s*135 × 190 cm\s*<\/dd>/,
    );
    expect(specs).toContain('<dt>Material</dt>');
    expect(specs).not.toContain('<dt>Age</dt>');
    expect(specs).toMatch(/<dt>Reference<\/dt>\s*<dd class="ref">SL-021<\/dd>/);
    const pager = await container.renderToString(Pager, {
      props: { next: { ...card, slug: 'pool', name: 'Pool' }, index: 1, total: 5 },
    });
    expect(pager).toMatch(/<span class="is-off" aria-hidden="true">/);
    expect(pager).toMatch(/<a rel="next" href="\/rugs\/pool" aria-label="Next: Pool">/);
    expect(pager).toContain('1 / 5');
  });
});
