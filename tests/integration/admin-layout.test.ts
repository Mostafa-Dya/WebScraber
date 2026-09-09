// The admin shell rendered with Astro's container API (docs/ADMIN_SPEC.md §8.1): noindex head, the
// same fonts link as the site, tabs as links with aria-current, a logout form, and nothing the
// hash-based CSP would refuse (no inline handlers, no style attributes, no inline scripts).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import AdminLayout from '../../src/components/admin/AdminLayout.astro';

describe('AdminLayout', () => {
  it('renders the legacy header, link tabs with the active one marked, and the logout form', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AdminLayout, {
      props: { title: 'Serio Ludere — Admin', active: 'rugs' },
      slots: { default: '<p id="body">body</p>' },
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono');
    expect(html).toContain('<title>Serio Ludere — Admin</title>');
    expect(html).toContain('<h1><a href="/admin">Serio Ludere</a></h1>');
    expect(html).toContain('<p class="sub">Admin — private</p>');
    expect(html).toMatch(/<nav class="tabs" aria-label="Admin">/);
    expect(html).toMatch(/<a href="\/admin\/rugs\/new"[^>]*>\s*Add rug\s*<\/a>/);
    expect(html).toMatch(/<a href="\/admin\/rugs" class="on" aria-current="page">\s*Catalogue\s*<\/a>/);
    expect(html).toMatch(/<a href="\/admin\/collections"[^>]*>\s*Collections\s*<\/a>/);
    expect(html).toMatch(/<a href="\/admin\/clients"[^>]*>\s*Clients\s*<\/a>/);
    expect(html).toMatch(/<a href="\/admin\/audit"[^>]*>\s*Audit log\s*<\/a>/);
    expect(html).not.toMatch(/href="\/admin\/collections"[^>]*aria-current/);
    expect(html).toMatch(
      /<form method="post" action="\/admin\/logout" class="logout">\s*<button class="chip" type="submit">\s*Log out\s*<\/button>\s*<\/form>/,
    );
    expect(html).toMatch(/<main>\s*<p id="body">body<\/p>\s*<\/main>/);
    // hash CSP: nothing inline
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>[^<]/);
    expect(html).not.toContain('sl-rates');
  });
  it('hides the nav on the login page and takes a custom sub line', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(AdminLayout, {
      props: { title: 'Login', nav: false, sub: 'Admin — sign in' },
      slots: { default: '<form></form>' },
    });
    expect(html).not.toContain('class="tabs"');
    expect(html).not.toContain('/admin/logout');
    expect(html).toContain('<p class="sub">Admin — sign in</p>');
  });
});
