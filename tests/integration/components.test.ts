// Renders the ported components with Astro's container API and checks the reference markup contract
// (class names, attributes, formatting) that the screenshot comparison cannot assert precisely.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import CollectionNav from '../../src/components/CollectionNav.astro';
import Layout from '../../src/components/Layout.astro';
import RugCard from '../../src/components/RugCard.astro';
import type { RateTable } from '../../src/lib/currency.ts';
import type { CardView } from '../../src/lib/view.ts';

const rates: RateTable = {
  rates: { USD: 1, MXN: 17.5, CAD: 1.37, EUR: 0.92, AED: 3.67, SAR: 3.75 },
  symbols: { USD: '$', MXN: '$', CAD: '$', EUR: '€', AED: 'AED ', SAR: 'SAR ' },
};

const card: CardView = {
  id: 'SL-021',
  slug: 'winks',
  name: 'Winks "quoted" <b>bold</b>',
  collection: 'Kilims',
  collectionSlug: 'kilims',
  collections: ['Kilims'],
  collectionSlugs: ['kilims'],
  photoUrl: '/api/image/1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb?w=800',
  photoUrls: ['/api/image/1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb?w=1600'],
  rot: '1',
  widthCm: 135,
  lengthCm: 190,
  material: '100% Wool',
  age: 'Modern',
  origin: 'Denizli, Turkey',
  method: 'Hand-woven',
  pile: '',
  description: '',
  priceUsd: 576,
  likes: 18,
  dislikes: 5,
  rating: 3.91,
  tags: [{ name: 'Kilim', slug: 'kilim' }],
};

describe('RugCard (reference lines 172-196)', () => {
  it('renders the reference structure: photo box, placeholder, like pill, name, meta, price', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RugCard, { props: { card, rates } });
    expect(html).toContain('class="card"');
    expect(html).toContain('data-collection="kilims"');
    expect(html).toMatch(/<div class="photo"[^>]*>/);
    expect(html).toContain('data-rot="1"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<div class="ph">photo to come</div>');
    expect(html).toContain('class="like"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-vote="like"');
    expect(html).toContain('<span class="sr-only">Like this rug</span>');
    expect(html).toContain('data-source="card"');
    // A grid card never offers a dislike: rejecting forty rugs one by one is not the buyer's job.
    expect(html).not.toContain('data-vote="dislike"');
    expect(html).toMatch(/<ul class="meta"[^>]*>/);
    expect(html).toContain('135 × 190 cm');
    expect(html).toMatch(/<li[^>]*>100% Wool<\/li>/);
    expect(html).toMatch(/<li[^>]*>Modern<\/li>/);
    expect(html).toMatch(/<li[^>]*>Denizli, Turkey<\/li>/);
    expect(html).toMatch(/<div class="price"[^>]*>\$576<\/div>/);
    expect(html).toContain('3.9 · 23 votes');
    expect(html).toContain('href="/rugs/winks"');
    // Sheet text is escaped, never injected: text nodes fully, attribute values for quotes/ampersands.
    expect(html).not.toMatch(/>Winks "quoted" <b>bold<\/b></);
    expect(html).toContain('Winks &quot;quoted&quot; &lt;b&gt;bold&lt;/b&gt;</a>');
    expect(html).toMatch(/alt="Winks &quot;quoted&quot; [^"]*"/);
    expect(html).toContain('<span class="sr-only">Like this rug</span>');
  });
  it('omits the price and dims when unknown and hides the card outside the active collection', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RugCard, {
      props: {
        card: {
          ...card,
          priceUsd: undefined,
          widthCm: undefined,
          likes: 0,
          dislikes: 0,
          rating: 0,
          photoUrl: undefined,
        },
        rates,
        hidden: true,
      },
    });
    expect(html).toMatch(/<div class="card"[^>]*hidden/);
    expect(html).toMatch(/<li data-dims[^>]*hidden[^>]*>\s*<\/li>/);
    expect(html).toMatch(/<div class="price"[^>]*hidden[^>]*><\/div>/);
    expect(html).toMatch(/<div class="rating"[^>]*hidden/);
    expect(html).not.toContain('<img');
  });
  it('omits the whole meta list when every line is blank (reference line 195)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RugCard, {
      props: {
        card: { ...card, widthCm: undefined, lengthCm: undefined, material: '', age: '', origin: '' },
        rates,
      },
    });
    expect(html).not.toContain('class="meta"');
    expect(html).toMatch(/<div class="price"[^>]*>\$576<\/div>/);
  });
});

describe('CollectionNav (reference lines 157-168)', () => {
  it('renders tabs with counts and tab semantics, the active one marked with .on', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(CollectionNav, {
      props: {
        tabs: [
          { name: 'Classics', slug: 'classics', count: 4 },
          { name: 'Kilims', slug: 'kilims', count: 8 },
        ],
        active: 'classics',
      },
    });
    expect(html).toMatch(/<nav id="nav" role="tablist"/);
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*class="on"[^>]*data-collection="classics"[^>]*aria-selected="true"[^>]*>\s*Classics<span class="n">4<\/span>\s*<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*data-collection="kilims"[^>]*aria-selected="false"[^>]*tabindex="-1"[^>]*>\s*Kilims<span class="n">8<\/span>\s*<\/button>/,
    );
    expect(html).not.toMatch(/data-collection="kilims"[^>]*class="on"/);
  });
});

describe('Layout (reference lines 1-9)', () => {
  it('has the reference head and an escaped rates JSON block', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Layout, {
      props: {
        title: 'Serio Ludere — Catalogue',
        rates: { ...rates, symbols: { ...rates.symbols, XX: '</script><script>alert(1)</script>' } },
      },
      slots: { default: '<p>body</p>' },
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain(
      'fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400',
    );
    expect(html).toContain('<title>Serio Ludere — Catalogue</title>');
    expect(html).toContain('id="sl-rates"');
    expect(html).not.toContain('</script><script>alert');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('<p>body</p>');
  });
});
