// The first five minutes on a freshly provisioned sheet.
//
// `/admin/google` now creates the catalogue itself (ADR D29) and does so with `seed: 'none'` —
// deliberately empty, because nobody wants twenty reference rugs in a real client's catalogue. That
// leaves the Collections tab empty too, and `CollectionList` is `.min(1)`: every product must belong
// to at least one collection.
//
// So the order of operations is forced, and the admin has to say so. Sending the studio to "Add
// product" first means filling the whole form, pressing Save, and being told "Pick a collection
// first" — then hunting for where collections live. On their very first action.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import EmptyState from '../../src/components/ui/EmptyState.astro';

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(EmptyState, { props });
}

describe('the first-run empty state', () => {
  it('sends the studio to collections when there are none, not to a form they cannot submit', async () => {
    const html = await render({
      type: 'first-run',
      title: 'Start with a collection',
      message:
        'Collections group the catalogue for the buyer, and every product belongs to at least one — so the first one comes before the first rug.',
      href: '/admin/collections',
    });
    expect(html).toContain('/admin/collections');
    expect(html).toContain('Start with a collection');
    expect(html).not.toContain('/admin/rugs/new');
  });

  it('sends them to Add product once a collection exists', async () => {
    const html = await render({ type: 'first-run', href: '/admin/rugs/new' });
    expect(html).toContain('/admin/rugs/new');
  });
});
