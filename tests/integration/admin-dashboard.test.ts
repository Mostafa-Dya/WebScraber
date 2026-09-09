// /admin dashboard rendered through the container with a scripted Sheets client (ADMIN_SPEC §2.1):
// counts and audit rows from the admin read, the health strip, the sheet:init hint, and a
// non-500 failure state when the sheet cannot be read.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it, vi } from 'vitest';
import type { CellValue, ValueRange } from '../../src/lib/sheets/client.ts';
import { HEADERS } from '../../src/lib/sheets/contract.ts';
import { rugRow } from '../helpers/ranges.ts';

const state: { mode: 'ok' | 'missing' | 'down' } = { mode: 'ok' };

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
  SHEETS_CACHE_TTL: 60,
  DATA_DIR: undefined,
  // Customer realm + FX (brief §8, §10).
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

vi.mock('../../src/lib/runtime.ts', () => ({
  getClient: () => ({
    batchGet: async (ranges: readonly string[]): Promise<ValueRange[]> => {
      if (state.mode === 'down') throw new Error('Sheets down: refresh_token=secret');
      const rugsHeader: CellValue[] = state.mode === 'missing' ? [] : [...HEADERS.Products];
      return [
        {
          range: ranges[0]!,
          values: [
            rugsHeader,
            rugRow({ id: 'SL-021' }),
            rugRow({ id: 'SL-022', name: 'Yellow <b>x</b>', status: 'draft' }),
            rugRow({ id: 'SL-023', name: 'Old', status: 'archived' }),
            rugRow({ id: 'bad', name: '' }),
          ],
        },
        {
          range: ranges[1]!,
          values: [[...HEADERS.Collections], ['kilims', 'Kilims', 'kilims', '', '', '', 1]],
        },
        {
          range: ranges[2]!,
          values: [[...HEADERS.Tags], ['kilim', 'kilim', 'Kilim', ''], ['tulu', 'tulu', 'Tulu', '']],
        },
        { range: ranges[3]!, values: [[...HEADERS.Settings], ['price_round_step', 'five', '', '']] },
        {
          range: ranges[4]!,
          values: [
            [...HEADERS.Customers],
            ['nadia-k7m2pq', 'Nadia', 'scrypt.1.2.3.aa.bb', '', '', true],
            ['omar-aaaaaa', 'Omar', 'scrypt.1.2.3.cc.dd', '', '', false],
          ],
        },
        {
          range: ranges[5]!,
          values: [
            [...HEADERS.AuditLog],
            [
              '2026-09-07T10:00:00Z',
              'owner',
              'rug.update',
              'Products',
              'SL-021',
              '{}',
              '{"a":1}',
              'h',
              'r',
              '<script>x</script>',
            ],
          ],
        },
      ];
    },
  }),
  getCache: () => ({ health: () => ({ snapshotAgeSec: 12, lastRefreshOk: true }) }),
}));

import Dashboard from '../../src/pages/admin/index.astro';

const locals = {
  requestId: 'c'.repeat(16),
  admin: { sid: 'a'.repeat(32), user: 'owner', iat: 0, exp: 1, abs: 2 },
};

describe('/admin dashboard', () => {
  it('renders counts, health and the newest audit rows from the admin read, escaping sheet text', async () => {
    state.mode = 'ok';
    const container = await AstroContainer.create();
    const res = await container.renderToResponse(Dashboard, {
      request: new Request('https://catalogue.example.test/admin'),
      locals,
      partial: false,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('aria-current="page"'); // the dashboard is the wordmark link, not a tab
    expect(html).toContain('Active rugs');
    expect(html).toMatch(/Active rugs<\/div>\s*<div class="v">1<\/div>/);
    expect(html).toMatch(/Drafts<\/div>\s*<div class="v">1<\/div>/);
    expect(html).toMatch(/Archived<\/div>\s*<div class="v">1<\/div>/);
    expect(html).toMatch(/Collections<\/div>\s*<div class="v">1<\/div>/);
    expect(html).toMatch(/Tags<\/div>\s*<div class="v">2<\/div>/);
    expect(html).toMatch(/Clients<\/div>\s*<div class="v">\s*1\s*<small>\+1 revoked<\/small>/);
    expect(html).toContain('12 s');
    expect(html).toContain('not checked');
    expect(html).toMatch(/Rows dropped by validation<\/div>\s*<div class="v">1<\/div>/);
    expect(html).toContain('<td class="mono">rug.update</td>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('price_round_step must be a positive whole number');
    expect(html).not.toContain('npm run sheet:init');
    expect(html).not.toMatch(/\sstyle="/);
  });
  it('tells the owner to run sheet:init when W1:Z1 are blank', async () => {
    state.mode = 'missing';
    const container = await AstroContainer.create();
    const res = await container.renderToResponse(Dashboard, {
      request: new Request('https://catalogue.example.test/admin'),
      locals,
      partial: false,
    });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('npm run sheet:init');
    // No header row means no parsable products, so the tiles read zero, not stale.
    expect(html).toMatch(/Active rugs<\/div>\s*<div class="v">0<\/div>/);
  });
  it('renders the shell with a scrubbed error (never a 500, never a secret) when the sheet is unreachable', async () => {
    state.mode = 'down';
    const container = await AstroContainer.create();
    const res = await container.renderToResponse(Dashboard, {
      request: new Request('https://catalogue.example.test/admin'),
      locals,
      partial: false,
    });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('Could not read the sheet');
    expect(html).toContain('[redacted]');
    expect(html).not.toContain('refresh_token=secret');
    expect(html).toMatch(/Active rugs<\/div>\s*<div class="v">—<\/div>/);
    expect(html).toContain('<a href="/admin/rugs/new"');
  });
});
