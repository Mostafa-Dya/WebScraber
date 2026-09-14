// The private preview rendered through Astro's container (brief §7, §10): the password gate for a
// buyer without a session, their catalog with it, a 404 for a slug that is not an active customer,
// and the asymmetric reactions (card = like only, detail = like and dislike, `source` recorded).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../src/lib/admin/auth.ts';
import { parseSnapshot } from '../../src/lib/sheets/parse.ts';
import { rangesWith, rugRow } from '../helpers/ranges.ts';

vi.mock('astro:env/server', () => ({
  SITE_URL: 'https://preview.example.test',
  VOTE_SALT: 'v'.repeat(40),
  REVALIDATE_SECRET: 'r'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  AUTH_SECRET: 's'.repeat(40),
  PUBLIC_CATALOGUE: true,
  ADMIN_PASSWORD_HASH: undefined,
  ADMIN_SESSION_SECRET: undefined,
  ADMIN_USER: 'owner',
  RETAIL_MARKUP: undefined,
  GOOGLE_SHEET_ID: 'dev',
  GOOGLE_AUTH_MODE: 'service_account',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined,
  GOOGLE_PRIVATE_KEY: undefined,
  GOOGLE_OAUTH_CLIENT_ID: undefined,
  GOOGLE_OAUTH_CLIENT_SECRET: undefined,
  GOOGLE_OAUTH_REFRESH_TOKEN: undefined,
  GOOGLE_DRIVE_FOLDER_ID: undefined,
  SCRAPE_JINA_FALLBACK: true,
  SCRAPE_ECG_GRAPHQL: false,
  SCRAPE_RESPECT_ROBOTS: true,
  SHEETS_CACHE_TTL: 60,
  DATA_DIR: undefined,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

const state = vi.hoisted(() => ({ down: false }));

vi.mock('../../src/lib/runtime.ts', async () => {
  const { rangesWith: build, rugRow: row } = await import('../helpers/ranges.ts');
  const { parseSnapshot: parse } = await import('../../src/lib/sheets/parse.ts');
  const { hashPassword: hash } = await import('../../src/lib/admin/auth.ts');
  const cheap = { N: 2 ** 12 } as const;
  return {
    loadCatalogue: async () => {
      if (state.down) return { error: 'could not load the catalogue' };
      const parsed = parse(
        build({
          rugs: [
            row({ id: 'SL-021' }),
            row({ id: 'SL-022', name: 'Yellow', slug: 'yellow', collection: 'Kilims' }),
          ],
          collections: [['c1', 'Kilims', 'kilims', 'Flatweaves from Denizli.', '', '', 1]],
          customers: [
            ['hala', 'Hala', hash('amber-loom-serai-47', cheap), 'VIP', '2026-09-01', true],
            ['omar', 'Omar', hash('cedar-quarry-tulip-11', cheap), '', '2026-09-01', false],
          ],
        }),
      );
      return { snapshot: { ...parsed, fetchedAt: Date.now() } };
    },
    getClient: () => ({}),
    getCache: () => ({}),
    photoMonitor: { schedule: () => {} },
    // The FX layer has its own suite; here the sheet's own table is enough.
    baseCurrency: 'USD',
    ratesFor: (c: { rates: Array<{ currency: string; rateToBase: number; symbol: string }> }) => ({
      rates: Object.fromEntries([['USD', 1], ...c.rates.map((r) => [r.currency, r.rateToBase])]),
      symbols: Object.fromEntries([['USD', '$'], ...c.rates.map((r) => [r.currency, r.symbol])]),
    }),
  };
});

import CustomerCatalog from '../../src/pages/[slug]/index.astro';
import CustomerDetail from '../../src/pages/[slug]/[productId].astro';

/** The fixture, parsed once, so a test can assert against the same data the page sees. */
const fixture = parseSnapshot(
  rangesWith({
    rugs: [rugRow({ id: 'SL-021' })],
    customers: [['hala', 'Hala', hashPassword('amber-loom-serai-47', { N: 2 ** 12 }), '', '', true]],
  }),
);

async function render(
  Component: Parameters<AstroContainer['renderToResponse']>[0],
  path: string,
  params: Record<string, string>,
  locals: Record<string, unknown> = {},
): Promise<{ status: number; html: string; location: string | null }> {
  const container = await AstroContainer.create();
  const res = await container.renderToResponse(Component, {
    request: new Request(`https://preview.example.test${path}`),
    params,
    locals: { requestId: 'r'.repeat(16), ...locals },
    partial: false,
  });
  return { status: res.status, html: await res.text(), location: res.headers.get('location') };
}

describe('/{slug} — the gate', () => {
  it('asks only for the password and never names the buyer', async () => {
    state.down = false;
    const { status, html } = await render(CustomerCatalog, '/hala', { slug: 'hala' });
    expect(status).toBe(200);
    // Owner, 2026-09-14: the buyer's name appears nowhere in the customer realm. Figma 53:3 draws
    // "Welcome, {name}." above the form; printing it in front of the password turns a shared screen
    // into an identification, and the studio already has the name in the admin.
    expect(html).not.toContain('Welcome, Hala.');
    expect(html).not.toContain('Hala');
    // The page still says whose it is, without saying who they are.
    expect(html).toContain('A private preview, prepared for you');
    expect(html).toContain('View the catalogue');
    expect(html).toContain('action="/api/customers/hala/login"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('data-gate-reveal');
    // The buyer is told, on the gate itself, that their reactions are shared.
    expect(html).toContain('The rugs you like and dislike are shared with Serio Ludere.');
    // No username, no reset, no account: the brief's one-field form (§10).
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('Forgot');
    // Nothing of the catalogue leaks before the password is right.
    expect(html).not.toContain('Winks');
    expect(html).not.toContain('id="grid"');
  });

  it('404s for an unknown slug and for a customer whose access was switched off', async () => {
    state.down = false;
    const missing = await render(CustomerCatalog, '/nobody', { slug: 'nobody' });
    expect(missing.status).toBe(404);
    expect(missing.html).toContain('This preview link is not active.');
    // `active = FALSE` keeps the row (and their reaction history) but ends their access.
    const inactive = await render(CustomerCatalog, '/omar', { slug: 'omar' });
    expect(inactive.status).toBe(404);
    expect(inactive.html).not.toContain('Welcome, Omar.');
  });

  it('answers 503 with a retry, never a 500, when the sheet is unreachable', async () => {
    state.down = true;
    const { status, html } = await render(CustomerCatalog, '/hala', { slug: 'hala' });
    state.down = false;
    expect(status).toBe(503);
    expect(html).toContain('Could not load the catalogue.');
  });
});

describe('/{slug} — the signed-in catalog', () => {
  it('renders the buyer’s grid with like-only cards that link inside the realm', async () => {
    state.down = false;
    const { status, html } = await render(CustomerCatalog, '/hala', { slug: 'hala' }, { customer: 'hala' });
    expect(status).toBe(200);
    // The header used to carry `<span class="pv-who">Hala</span>` (Figma 53:37). Removed with the
    // gate greeting on the owner's instruction: no buyer name anywhere in this realm.
    expect(html).not.toContain('pv-who');
    expect(html).not.toContain('Hala');
    expect(html).toContain('The collection');
    expect(html).not.toContain('action="/api/customers/hala/login"');
    expect(html).toContain('Winks');
    // Cards stay inside the realm and are keyed by Product ID, not by handle (brief §7).
    expect(html).toContain('href="/hala/SL-021"');
    expect(html).not.toContain('href="/rugs/winks"');
    // Card = like only.
    expect(html).toMatch(/class="sr-only"[^>]*>Like this rug</);
    expect(html).not.toContain('data-vote="dislike"');
    expect(html).toContain('data-source="card"');
    // The realm is published for the reaction batch; the server still verifies the cookie.
    expect(html).toContain('data-customer="hala"');
    // Brief §7: the disclaimer is mandatory, the enquiry actions are forbidden.
    expect(html).toContain('Prices are indicative and convert at an approximate rate.');
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('Enquire');
    // A private preview is never indexed.
    expect(html).toContain('noindex');
  });

  it('never ships a like count below the threshold — not even in an attribute', async () => {
    // Owner requirement 2026-09-13: the count is visible only at >= 5. The fixture rug sits at 3
    // (tests/helpers/ranges.ts), so this is non-vacuous: until 2026-09-14 the page served
    // `data-like-count="3"` and `data-likes="3"` with the badge correctly blank, which published
    // the exact number to View Source and published the whole hidden ranking to the "Most liked"
    // sort. "Not painted" is not the requirement; "not present" is.
    state.down = false;
    const { html } = await render(CustomerCatalog, '/hala', { slug: 'hala' }, { customer: 'hala' });
    expect(html).not.toMatch(/data-like-count="[0-4]"/);
    expect(html).not.toMatch(/data-likes="[0-4]"/);
    // …and the attribute is absent entirely rather than emptied, so the sort reads it as 0 and
    // leaves the rug in served order instead of ranking it.
    expect(html).not.toContain('data-likes=""');
    expect(html).toContain('pv-card-likes');
  });

  it('offers a type filter strip closing with the buyer’s own shortlist', async () => {
    state.down = false;
    const { html } = await render(CustomerCatalog, '/hala', { slug: 'hala' }, { customer: 'hala' });
    // The design replaced the collection tabs with rug-type chips, so the standfirst is gone too.
    expect(html).not.toContain('Flatweaves from Denizli.');
    expect(html).toContain('data-filter="all"');
    expect(html).toContain('data-filter="liked"');
    expect(html).toContain('data-liked-count');
    expect(html).toMatch(/data-filter="kilim"/);
    // Each card publishes its tags so the strip can filter without a round trip.
    expect(html).toMatch(/data-card[^>]*data-tags="[^"]*kilim/);
  });
});

describe('the buyer’s name never reaches the customer realm', () => {
  // Owner instruction, 2026-09-14: remove the name from everything client-facing, keep it in the
  // admin. Checked across ALL THREE customer-facing renders in one place, because the leak was in
  // three unrelated spots at once — the gate heading (PreviewGate), the header chip (PreviewHeader)
  // and the <title> — and a per-component assertion would not have caught the third.
  //
  // The fixture buyer is "Hala Nasser" on slug "hala", so the SLUG is deliberately not asserted
  // against: the scrambled route is derived from the name by design (owner requirement, D20) and is
  // the one place half those letters still appear. This checks the DISPLAY NAME.
  it.each([
    ['the gate (signed out)', () => render(CustomerCatalog, '/hala', { slug: 'hala' })],
    [
      'the catalog (signed in)',
      () => render(CustomerCatalog, '/hala', { slug: 'hala' }, { customer: 'hala' }),
    ],
    [
      'the detail page',
      () =>
        render(
          CustomerDetail,
          '/hala/SL-021',
          { slug: 'hala', productId: 'SL-021' },
          { customer: 'hala' },
        ),
    ],
  ])('%s never prints the display name', async (_label, go) => {
    state.down = false;
    const { html } = await go();
    expect(html).not.toContain('Hala');
    expect(html).not.toContain('Nasser');
    expect(html).not.toContain('Welcome,');
    expect(html).not.toContain('pv-who');
    // …including the tab title, which is read over a shoulder and lands in browser history.
    expect(html).not.toMatch(/<title>[^<]*Hala[^<]*<\/title>/);
  });
});

describe('/{slug}/{productId} — the detail page', () => {
  it('offers like AND dislike, records the source, and shows no enquiry action', async () => {
    state.down = false;
    const { status, html } = await render(
      CustomerDetail,
      '/hala/SL-021',
      { slug: 'hala', productId: 'SL-021' },
      { customer: 'hala' },
    );
    expect(status).toBe(200);
    expect(html).toContain('Winks');
    expect(html).toMatch(/class="sr-only"[^>]*>Like this rug</);
    expect(html).toMatch(/class="sr-only"[^>]*>Not for me</);
    expect(html).toContain('data-source="detail"');
    expect(html).toContain('Specification');
    expect(html).toContain('135 · 190 cm'); // a middle dot, as drawn, not the reference's cross
    expect(html).not.toContain('Shape'); // stored, deliberately never shown
    expect(html).not.toContain('Enquire on WhatsApp');
    expect(html).not.toContain('Email the studio');
    expect(html).toContain('Prices are indicative and convert at an approximate rate.');
  });

  it('sends a deep link into someone else’s preview back to their own gate', async () => {
    state.down = false;
    const { status, location } = await render(CustomerDetail, '/hala/SL-021', {
      slug: 'hala',
      productId: 'SL-021',
    });
    expect(status).toBe(303);
    expect(location).toBe('/hala');
  });

  it('404s for a product that is not in the catalogue', async () => {
    state.down = false;
    const { status, html } = await render(
      CustomerDetail,
      '/hala/SL-999',
      { slug: 'hala', productId: 'SL-999' },
      { customer: 'hala' },
    );
    expect(status).toBe(404);
    expect(html).toContain('This rug is not in your preview.');
  });
});

describe('the fixture itself', () => {
  it('parses customers with their hash, which never reaches a rendered page', () => {
    expect(fixture.catalogue.customers.map((c) => c.slug)).toEqual(['hala']);
    expect(fixture.catalogue.customers[0]?.passwordHash).toContain('scrypt.');
  });
});
