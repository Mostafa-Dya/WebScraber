// The admin shell rendered with Astro's container API — now Figma App Shell 25:200 (`04 · Admin`):
// a 220px left nav with the three drawn destinations, Audit log and Google below a rule as
// secondary, and a topbar carrying the page title plus logout. Nothing the hash-based CSP would
// refuse: no inline handlers, no style attributes, no inline scripts.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import AdminLayout from '../../src/components/admin/AdminLayout.astro';

describe('AdminLayout', () => {
  it('renders the drawn shell with the active destination marked', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AdminLayout, {
      props: { title: 'Serio Ludere — Products', active: 'rugs', meta: 'Sheet synced 4 min ago' },
      slots: { default: '<p id="body">body</p>' },
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain(
      'fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400',
    );
    expect(html).toContain('<title>Serio Ludere — Products</title>');

    // The shell, not the legacy header.
    expect(html).toContain('<div class="shell">');
    expect(html).toMatch(/<nav class="shell__nav" aria-label="Admin sections">/);
    expect(html).toContain('<span class="shell__realm">preview admin</span>');

    // The topbar title is the page name, with the document-title prefix stripped.
    expect(html).toMatch(/<h1 class="shell__title">Products<\/h1>/);
    expect(html).toContain('<span class="shell__meta">Sheet synced 4 min ago</span>');

    // Figma's three destinations, using the file's labels rather than the old ones.
    expect(html).toMatch(/href="\/admin\/rugs" aria-current="page">[\s\S]*?<span>Products<\/span>/);
    expect(html).toMatch(/href="\/admin\/collections">[\s\S]*?<span>Collections<\/span>/);
    expect(html).toMatch(/href="\/admin\/clients">[\s\S]*?<span>Customers<\/span>/);

    // Secondary routes the file does not draw, kept reachable and visually subordinate.
    expect(html).toMatch(/class="shell__link shell__link--secondary" href="\/admin\/audit"/);
    expect(html).toMatch(/class="shell__link shell__link--secondary" href="\/admin\/google"/);

    // Exactly one active destination — the double-highlight the file's own revision log calls out.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);

    expect(html).toMatch(/<form method="post" action="\/admin\/logout" class="logout">/);
    expect(html).toMatch(/<main class="shell__content">\s*<p id="body">body<\/p>\s*<\/main>/);

    // hash CSP: nothing inline
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>[^<]/);
    expect(html).not.toContain('sl-rates');
  });

  it('maps the add-product tab onto Products, because adding is an action on the list', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AdminLayout, {
      props: { title: 'Serio Ludere — Add rug', active: 'add' },
      slots: { default: '<p>body</p>' },
    });
    expect(html).toMatch(/href="\/admin\/rugs" aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('renders the login page as ONE card — no shell, no second wordmark, no strapline', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AdminLayout, {
      props: { title: 'Login', nav: false, sub: 'Admin — sign in' },
      slots: { default: '<form></form>' },
    });
    expect(html).not.toContain('class="shell__nav"');
    expect(html).not.toContain('/admin/logout');
    expect(html).toContain('<div class="bare">');
    // A1 (47:3) draws a single centred card. This branch used to print the wordmark above the slot
    // and the `sub` line under it, so the login page showed "SERIO LUDERE" twice with
    // "ADMIN — SIGN IN" in brand red between them — the only red in the panel, on the first screen
    // the owner sees each session. The card carries its own brand block, so the shell carries none.
    expect(html).not.toContain('bare__wordmark');
    expect(html).not.toContain('<p class="sub">');
    // …and the prop is still accepted, so no caller breaks; it simply renders nothing.
    expect(html).not.toContain('Admin — sign in');
  });
});
