// Brief §12: a rug whose photo import did not finish says so, and the list offers to finish it.
//
// "The list" is BOTH views. `RugCardAdmin` has rendered the pending badge and its retry button since
// it shipped; `RugRow` rendered neither — and the row is the DEFAULT view, because view-switch.ts
// rests on 'list'. So the only route to a half-imported rug was to switch to cards and scroll the
// catalogue hunting for badges. A state that exists at one view and silently not at another is the
// failure the "every state ships" rule is for.
//
// Both components are rendered here from the SAME rug, so the two views cannot drift apart again.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import RugRow from '../../src/components/admin/RugRow.astro';
import RugCardAdmin from '../../src/components/admin/RugCardAdmin.astro';
import type { AdminRug } from '../../src/lib/admin/read.ts';

const base = {
  id: 'SL-024',
  row: 2,
  version: 'a1b2c3d4e5f60718',
  slug: 'half',
  name: 'Half',
  description: '',
  collections: ['Kilims'],
  collection: 'Kilims',
  tags: [],
  photos: [],
  widthCm: 135,
  lengthCm: 190,
  material: '',
  method: '',
  age: '',
  origin: '',
  priceUsd: 576,
  rotate: 'false',
  featured: false,
  status: 'active',
  sourceUrl: '',
  supplier: 'karavanrug',
  supplierRef: '1389',
  notes: '',
  commitStatus: '',
  driveFolderId: '',
  driveFolderUrl: '',
  scrapedAt: '',
} as unknown as AdminRug;

const collections = [{ id: 'kilims', name: 'Kilims', slug: 'kilims' }] as never;

async function render(rug: AdminRug): Promise<{ row: string; card: string }> {
  const c = await AstroContainer.create();
  return {
    row: await c.renderToString(RugRow, { props: { rug, collections } }),
    card: await c.renderToString(RugCardAdmin, { props: { rug, collections } }),
  };
}

describe('a half-imported rug', () => {
  it('offers to finish the import in BOTH views, not only in the cards', async () => {
    const { row, card } = await render({ ...base, commitStatus: 'pending' } as AdminRug);
    expect(row).toContain('data-retry="SL-024"');
    expect(card).toContain('data-retry="SL-024"');
    expect(row).toContain('Finish photo import');
  });

  it('carries the filter flag in both views, so one filter drives both', async () => {
    const { row, card } = await render({ ...base, commitStatus: 'pending' } as AdminRug);
    expect(row).toContain('data-attention="photos"');
    expect(card).toContain('data-attention="photos"');
  });

  it('leaves the flag empty and offers no retry once the import finished', async () => {
    const { row, card } = await render(base);
    // Astro renders a bare `data-attention` for an empty string rather than `=""`. Either way
    // `dataset.attention` reads as '' in the browser, which is falsy, so the filter excludes it —
    // that is what the assertion below is really about.
    expect(row).not.toContain('data-attention="photos"');
    expect(card).not.toContain('data-attention="photos"');
    expect(row).not.toContain('data-retry');
    expect(card).not.toContain('data-retry');
  });

  it('puts the supplier in the search haystack in both views', async () => {
    // Figma's "All sources" dropdown, delivered without a control.
    const { row, card } = await render(base);
    expect(row).toMatch(/data-search="[^"]*karavanrug/);
    expect(card).toMatch(/data-search="[^"]*karavanrug/);
  });
});
