// F5 · Customer detail (Figma 52:1207) — /admin/clients/[code].
//
// This screen is a JOIN of two reports that already existed and were never rendered: what a buyer
// liked (saves) and whether they ever arrived (visits). The things worth guarding are the ones a
// join gets wrong — a buyer present in one report and absent from the other, and a count that is
// derived rather than read.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it, vi } from 'vitest';
import type { CellValue, ValueRange } from '../../src/lib/sheets/client.ts';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { rugRow } from '../helpers/ranges.ts';

vi.mock('astro:env/server', () => ({
  SITE_URL: 'https://catalogue.example.test',
  VOTE_SALT: 'v'.repeat(40),
  REVALIDATE_SECRET: 'r'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  ADMIN_PASSWORD_HASH: 'scrypt.4096.8.1.' + 'a'.repeat(22) + '.' + 'b'.repeat(86),
  ADMIN_SESSION_SECRET: 's'.repeat(40),
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
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

/** Three active rugs; SL-021 liked, SL-022 disliked, SL-023 untouched. */
vi.mock('../../src/lib/runtime.ts', () => ({
  getClient: () => ({
    batchGet: async (ranges: readonly string[]): Promise<ValueRange[]> => {
      const out: ValueRange[] = ranges.map((r) => ({ range: r, values: [] }));
      out[0] = {
        range: ranges[0]!,
        values: [
          [...HEADERS.Products] as CellValue[],
          rugRow({ id: 'SL-021', name: 'Winks' }),
          rugRow({ id: 'SL-022', name: 'Yellow' }),
          rugRow({ id: 'SL-023', name: 'Old' }),
        ],
      };
      out[1] = {
        range: ranges[1]!,
        values: [[...HEADERS.Collections], ['kilims', 'Kilims', 'kilims', '', '', '', 1]],
      };
      out[2] = { range: ranges[2]!, values: [[...HEADERS.Tags]] };
      out[3] = { range: ranges[3]!, values: [[...HEADERS.Settings]] };
      out[4] = {
        range: ranges[4]!,
        values: [
          [...HEADERS.Customers],
          ['a1b-2c', 'Hala Nasser', 'VIP', 'active', '2026-09-01', 'owner', 'https://old/?c=x'],
          ['n0v-1s', 'Never Visited', '', 'active', '2026-09-02', 'owner', ''],
        ],
      };
      out[5] = { range: ranges[5]!, values: [[...HEADERS.AuditLog]] };
      // Reactions (saves) and Visits are appended after the admin ranges, in that order.
      out[6] = {
        range: ranges[6]!,
        values: [
          [...HEADERS.Reactions],
          // event_id, customer_slug, product_id, reaction, source, created_at
          ['e1', 'a1b-2c', 'SL-021', 'like', 'detail', '2026-09-10T10:00:00Z'],
          ['e2', 'a1b-2c', 'SL-022', 'dislike', 'detail', '2026-09-10T10:05:00Z'],
        ],
      };
      out[7] = {
        range: ranges[7]!,
        values: [
          [...HEADERS.Visits],
          // event_id, customer_slug, occurred_at, user_agent, referrer
          ['v1', 'a1b-2c', '2026-09-02T08:00:00Z', 'desktop', ''],
          ['v2', 'a1b-2c', '2026-09-12T08:00:00Z', 'desktop', ''],
        ],
      };
      return out;
    },
  }),
  getCache: () => ({ health: () => ({ snapshotAgeSec: 12, lastRefreshOk: true }) }),
  getAdminDeps: () => ({
    authMode: 'service_account',
    drive: undefined,
    scrape: {},
    convertToUsd: () => undefined,
  }),
}));

import Detail from '../../src/pages/admin/clients/[code].astro';

const locals = {
  requestId: 'c'.repeat(16),
  admin: { sid: 'a'.repeat(32), user: 'owner', iat: 0, exp: 1, abs: 2 },
};

/**
 * The Stat Blocks as {label: value}. Parsed rather than regex-matched across the two spans: Astro
 * puts scoping attributes and whitespace between them, so adjacency is not something to assert on.
 */
function stats(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of html.matchAll(/<div class="statblock[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    const label = /statblock__label[^>]*>([^<]*)</.exec(block[1]!)?.[1]?.trim();
    const value = /statblock__value[^>]*>([^<]*)</.exec(block[1]!)?.[1]?.trim();
    if (label) out[label] = value ?? '';
  }
  return out;
}

async function render(code: string): Promise<{ status: number; html: string }> {
  const container = await AstroContainer.create();
  const res = await container.renderToResponse(Detail, {
    request: new Request(`https://catalogue.example.test/admin/clients/${code}`),
    locals,
    params: { code },
    partial: false,
  });
  return { status: res.status, html: await res.text() };
}

describe('/admin/clients/[code]', () => {
  it('refuses a malformed code before it costs a sheet read', async () => {
    // CLIENT_CODE_RE is checked first: a bad code is a 404, not a round trip.
    expect((await render('Bad Code')).status).toBe(404);
    expect((await render('-leading-dash')).status).toBe(404);
  });

  it('404s a code that matches the shape but belongs to nobody', async () => {
    expect((await render('z9q-4w')).status).toBe(404);
  });

  it('shows the four stat blocks with the drawn tones', async () => {
    const { status, html } = await render('a1b-2c');
    expect(status).toBe(200);
    expect(html).toContain('Hala Nasser');
    // Sessions comes from Visits, liked/disliked from Reactions — the join this page exists for.
    expect(stats(html)).toMatchObject({
      Sessions: '2',
      Liked: '1',
      Disliked: '1',
      // Derived, not read: 3 active rugs − 1 liked − 1 disliked.
      'Not yet reviewed': '1',
    });
    expect(html).toContain('statblock--positive');
    expect(html).toContain('statblock--muted');
  });

  it('puts the liked product IDs on one copy control — the real export', async () => {
    const { html } = await render('a1b-2c');
    expect(html).toContain('data-copy="SL-021"');
    expect(html).toContain('Copy 1 product ID'); // singular, not "1 product IDs"
  });

  it('renders a buyer who has a link but has never opened it', async () => {
    // This is the row the owner most wants to see, and the one a naive join drops.
    const { status, html } = await render('n0v-1s');
    expect(status).toBe(200);
    expect(html).toContain('Never Visited');
    expect(html).toContain('never opened');
    expect(stats(html).Sessions).toBe('0');
    expect(html).toContain('Nothing liked yet.');
    // Nothing reviewed, so every active rug is still outstanding.
    expect(stats(html)['Not yet reviewed']).toBe('3');
  });

  it('escapes sheet text and carries no inline handlers', async () => {
    const { html } = await render('a1b-2c');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle="/);
  });
});
