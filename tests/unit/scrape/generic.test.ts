import { describe, expect, it } from 'vitest';
import {
  collapse,
  dedupeStrings,
  extractGeneric,
  findLdProduct,
  firstKeyword,
  htmlToText,
  jsonLdNodes,
  labelValueLines,
  loadHtml,
  splitList,
  tidyTag,
} from '../../../src/lib/scrape/generic.ts';

const PAGE = `<!doctype html><html><head>
<title>Some Rug | SHOP</title>
<meta property="og:title" content="Some&#x20;Rug&#x20;4&#x27;5&quot;">
<meta property="og:description" content=" A  lovely   rug. ">
<meta property="og:image" content="https://cdn.shopify.com/a.jpg">
<meta property="product:price:amount" content="1,290.50"/>
<meta property="product:price:currency"
      content="cad"/>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":["Thing","Product"],"name":"LD Rug","sku":"11103","description":"From LD","image":["https://cdn.shopify.com/ld.jpg"],"offers":[{"@type":"Offer","price":"685.00","priceCurrency":"usd"}]}]}</script>
<script type="application/ld+json">not json</script>
</head><body></body></html>`;

describe('JSON-LD helpers', () => {
  it('walks @graph and arrays and flattens the first Product/Offer', () => {
    const $ = loadHtml(PAGE);
    const nodes = jsonLdNodes($);
    expect(nodes.map((n) => n['@type'])).toEqual([undefined, 'WebSite', ['Thing', 'Product']]);
    expect(findLdProduct(nodes)).toEqual({
      name: 'LD Rug',
      description: 'From LD',
      sku: '11103',
      price: 685,
      currency: 'USD',
      images: ['https://cdn.shopify.com/ld.jpg'],
    });
    expect(findLdProduct([{ '@type': 'WebSite' }])).toBeUndefined();
  });

  it('extractGeneric prefers meta over JSON-LD and decodes entities', () => {
    const g = extractGeneric(loadHtml(PAGE));
    expect(g.title).toBe(`Some Rug 4'5"`);
    expect(g.description).toBe('A lovely rug.');
    expect(g.image).toBe('https://cdn.shopify.com/a.jpg');
    expect(g.price).toBe(1290.5);
    expect(g.currency).toBe('CAD');
    expect(g.sku).toBe('11103');
    expect(g.ld?.price).toBe(685);
  });

  it('falls back to <title> and JSON-LD when the meta tags are missing', () => {
    const g = extractGeneric(
      loadHtml(
        '<title> T </title><script type="application/ld+json">{"@type":"Product","name":"N","offers":{"price":12,"priceCurrency":"EUR"}}</script>',
      ),
    );
    expect(g.title).toBe('T');
    expect(g.price).toBe(12);
    expect(g.currency).toBe('EUR');
  });
});

describe('text heuristics', () => {
  it('htmlToText breaks on <br> (with attributes), blocks and decodes entities', () => {
    const text = htmlToText(
      '<p><strong>Details:</strong><br data-start="1" data-end="2">Origin: Turkey<br/>Size: 82x300 cm</p><p>Second &amp; last</p><ul><li>a</li><li>b</li></ul>',
    );
    expect(text.split('\n')).toEqual([
      'Details:',
      'Origin: Turkey',
      'Size: 82x300 cm',
      'Second & last',
      'a',
      'b',
    ]);
    expect(htmlToText('')).toBe('');
    expect(htmlToText(undefined)).toBe('');
  });

  it('labelValueLines keeps the first value per label, lowercased keys', () => {
    const m = labelValueLines(
      'Details:\nStock Code: 21063\nSize: 82x300 cm / 2.7x9.8 ft\nsize: other\nNot a label\nMaterial & Design: wool',
    );
    expect([...m.entries()]).toEqual([
      ['stock code', '21063'],
      ['size', '82x300 cm / 2.7x9.8 ft'],
      ['material & design', 'wool'],
    ]);
  });

  it('firstKeyword tolerates hyphen/space spelling and returns the canonical form', () => {
    const kws = ['Kilim', 'Cicim', 'Soumak', 'Tulu', 'Handwoven', 'Hand-knotted'];
    expect(firstKeyword('A hand knotted wool rug', kws)).toBe('Hand-knotted');
    expect(firstKeyword('Handwoven kilim', kws)).toBe('Kilim');
    expect(firstKeyword('Tulus are plural', kws)).toBeUndefined();
    expect(firstKeyword('nothing', kws)).toBeUndefined();
  });

  it('splitList / tidyTag / dedupeStrings / collapse', () => {
    expect(splitList('Persian, Tribal | Red / Blue ,, ')).toEqual(['Persian', 'Tribal', 'Red', 'Blue']);
    expect(splitList(undefined)).toEqual([]);
    expect(tidyTag('VINTAGE LARGE RUGS')).toBe('Vintage Large Rugs');
    expect(tidyTag('HAND-KNOTTED')).toBe('Hand-Knotted');
    expect(tidyTag('terracotta')).toBe('Terracotta');
    expect(tidyTag('Persian Style')).toBe('Persian Style');
    expect(tidyTag('1970s')).toBe('1970s');
    expect(dedupeStrings(['Red', ' red ', 'Blue', '', 'BLUE', 'Green'], 2)).toEqual(['Red', 'Blue']);
    expect(collapse('  a \n b  ')).toBe('a b');
    expect(collapse(undefined)).toBe('');
  });
});
