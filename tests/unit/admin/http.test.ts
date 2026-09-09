import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

vi.mock('astro:env/server', () => ({
  SITE_URL: 'https://catalogue.example.test',
  VOTE_SALT: 'v'.repeat(40),
  CLIENT_IP_HEADER: '',
  TRUSTED_PROXY_HOPS: 1,
  ADMIN_PASSWORD_HASH: 'scrypt.4096.8.1.' + 'a'.repeat(22) + '.' + 'b'.repeat(86),
  ADMIN_SESSION_SECRET: 's'.repeat(40),
  ADMIN_USER: 'owner',
  RETAIL_MARKUP: 1.6,
  GOOGLE_SHEET_ID: undefined,
  GOOGLE_AUTH_MODE: 'service_account',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined,
  GOOGLE_PRIVATE_KEY: undefined,
  GOOGLE_OAUTH_CLIENT_ID: undefined,
  GOOGLE_OAUTH_CLIENT_SECRET: undefined,
  GOOGLE_OAUTH_REFRESH_TOKEN: undefined,
  SHEETS_CACHE_TTL: 60,
  DATA_DIR: undefined,
  REVALIDATE_SECRET: 'r'.repeat(40),
  // Customer realm + FX (brief §8, §10).
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

import type { APIContext } from 'astro';
import { UnauditableError } from '../../../src/lib/admin/audit.ts';
import { newSession } from '../../../src/lib/admin/auth.ts';
import {
  AdminError,
  adminGet,
  adminHealth,
  adminPost,
  adminRuntime,
  adminStats,
  errorToResponse,
  gateConfig,
  methodNotAllowed,
  parseBody,
  recordAuditEvent,
  sessionRateLimit,
} from '../../../src/lib/admin/http.ts';
import { VersionMismatchError } from '../../../src/lib/admin/write.ts';
import { SheetContractError, SheetsApiError, silentLogger } from '../../../src/lib/sheets/errors.ts';
import { rugRow } from '../../helpers/ranges.ts';

const session = newSession('owner', Date.now());

function ctx(init: RequestInit & { path?: string; admin?: boolean } = {}): APIContext {
  const { path = '/api/admin/rugs', admin = true, ...rest } = init;
  return {
    request: new Request(`https://catalogue.example.test${path}`, rest),
    locals: { requestId: 'c'.repeat(16), ...(admin ? { admin: session } : {}) },
    cache: { invalidate: async () => {} },
  } as unknown as APIContext;
}

const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...extra },
});

describe('admin runtime', () => {
  it('is configured from the env mock and exposes the gate config and health without secrets', () => {
    expect(adminRuntime.configured).toBe(true);
    expect(adminRuntime.user).toBe('owner');
    expect(adminRuntime.retailMarkup).toBe(1.6);
    const cfg = gateConfig();
    expect(cfg.secret).toBe('s'.repeat(40));
    expect(cfg.isSecureSite).toBe(true);
    expect(cfg.revoked).toBe(adminRuntime.revocations);
    expect(adminHealth()).toEqual({
      adminConfigured: true,
      adminWriteFailures: adminStats.writeFailures,
      driveScopeOk: null,
    });
  });
});

describe('parseBody', () => {
  const Schema = z.object({ name: z.string().min(1) });
  it('applies the cross-site posture, then JSON, then zod', async () => {
    const wrongType = await parseBody(
      ctx({ method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } }).request,
      Schema,
    );
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.response.status).toBe(415);
    const cross = await parseBody(
      ctx(json({ name: 'x' }, { 'sec-fetch-site': 'cross-site' })).request,
      Schema,
    );
    if (!cross.ok) expect(cross.response.status).toBe(403);
    const badJson = await parseBody(
      ctx({
        method: 'POST',
        body: '{nope',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }).request,
      Schema,
    );
    if (!badJson.ok) expect(badJson.response.status).toBe(400);
    const invalid = await parseBody(ctx(json({ name: '' })).request, Schema);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.response.status).toBe(400);
      expect(await invalid.response.json()).toMatchObject({
        ok: false,
        error: 'invalid body',
        issues: [{ path: 'name' }],
      });
    }
    const ok = await parseBody(ctx(json({ name: 'x' })).request, Schema);
    expect(ok).toEqual({ ok: true, data: { name: 'x' } });
  });
  it('refuses a body over 64 KiB by header and by actual length', async () => {
    const byHeader = await parseBody(
      ctx(json({ name: 'x' }, { 'content-length': String(70_000) })).request,
      Schema,
    );
    if (!byHeader.ok) expect(byHeader.response.status).toBe(413);
    const actual = await parseBody(ctx(json({ name: 'x'.repeat(70_000) })).request, Schema, 64 * 1024);
    expect(actual.ok).toBe(false);
    if (!actual.ok) expect(actual.response.status).toBe(413);
  });
});

describe('errorToResponse', () => {
  it('maps every failure shape to the §2.3 status and counts 5xx', async () => {
    const before = adminStats.writeFailures;
    const e1 = errorToResponse(
      new AdminError(422, 'unknown collection', 'Pick a collection', { collection: 'x' }),
      silentLogger,
    );
    expect(e1.status).toBe(422);
    expect(await e1.json()).toEqual({
      ok: false,
      error: 'unknown collection',
      message: 'Pick a collection',
      collection: 'x',
    });
    expect(errorToResponse(new UnauditableError('too big'), silentLogger).status).toBe(422);
    const fresh = rugRow({ id: 'SL-021' });
    const e409 = errorToResponse(new VersionMismatchError('Products', 31, fresh, 'changed'), silentLogger);
    expect(e409.status).toBe(409);
    expect(await e409.json()).toMatchObject({
      ok: false,
      error: 'version mismatch',
      row: 31,
      rug: { id: 'SL-021', row: 31 },
    });
    const e409b = errorToResponse(new VersionMismatchError('Tags', 3, ['kilim'], 'changed'), silentLogger);
    expect(await e409b.json()).toMatchObject({ error: 'version mismatch', tab: 'Tags', fresh: ['kilim'] });
    const e503 = errorToResponse(new SheetsApiError(503, 'backend'), silentLogger);
    expect(e503.status).toBe(503);
    expect(e503.headers.get('retry-after')).toBe('30');
    expect(await e503.json()).toEqual({ ok: false, error: 'sheet unavailable' });
    expect(errorToResponse(new SheetsApiError(429, 'quota'), silentLogger).status).toBe(503);
    expect(errorToResponse(new SheetContractError('Rugs', ['column B']), silentLogger).status).toBe(503);
    const e500 = errorToResponse(new Error('refresh_token=abc failed'), silentLogger);
    expect(e500.status).toBe(500);
    expect(JSON.stringify(await e500.json())).not.toContain('abc');
    expect(adminStats.writeFailures).toBe(before + 4);
  });
});

describe('route wrappers', () => {
  it('sessionRateLimit consumes per session and answers 429 with Retry-After', () => {
    const s = newSession('owner', Date.now());
    for (let i = 0; i < 30; i++) expect(sessionRateLimit('mutation', s)).toBeUndefined();
    const limited = sessionRateLimit('mutation', s)!;
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(sessionRateLimit('read', s)).toBeUndefined(); // separate window
    expect(sessionRateLimit('mutation', newSession('owner', Date.now()))).toBeUndefined(); // another session
  });
  it('adminGet requires the session and maps handler errors', async () => {
    const route = adminGet(async ({ session: s, requestId }) =>
      Response.json({ ok: true, sid: s.sid, requestId }),
    );
    const ok = await route(ctx({ path: '/api/admin/rugs' }));
    expect(await ok.json()).toEqual({ ok: true, sid: session.sid, requestId: 'c'.repeat(16) });
    const anon = await route(ctx({ admin: false }));
    expect(anon.status).toBe(401);
    const boom = adminGet(async () => {
      throw new SheetsApiError(503, 'down');
    });
    expect((await boom(ctx())).status).toBe(503);
  });
  it('adminPost runs posture → limit → body → handler', async () => {
    const Schema = z.object({ name: z.string().trim().min(1) });
    const seen: unknown[] = [];
    const route = adminPost(Schema, async ({ body, actor }) => {
      seen.push(body, actor);
      return Response.json({ ok: true });
    });
    expect(
      (await route(ctx({ method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } }))).status,
    ).toBe(415);
    expect((await route(ctx(json({ name: '' })))).status).toBe(400);
    expect((await route(ctx(json({ name: ' Winks ' })))).status).toBe(200);
    expect(seen).toEqual([{ name: 'Winks' }, 'owner']);
    expect((await route(ctx({ ...json({ name: 'x' }), admin: false }))).status).toBe(401);
    const m = await methodNotAllowed('POST')(ctx());
    expect(m.status).toBe(405);
    expect(m.headers.get('allow')).toBe('POST');
  });
});

describe('recordAuditEvent', () => {
  it('never throws when the sheet client is unavailable (not configured here) and logs instead', async () => {
    const errors: string[] = [];
    const logger = { ...silentLogger, error: (m: string) => void errors.push(m) };
    const row = await recordAuditEvent(
      {
        action: 'auth.login',
        targetTab: '-',
        targetId: 'owner',
        ipHash: 'a'.repeat(32),
        requestId: 'b'.repeat(16),
      },
      logger,
    );
    expect(row).toBeUndefined();
    expect(errors).toEqual(['audit event not written']);
    const bad = await recordAuditEvent(
      {
        action: 'auth.login',
        targetTab: '-',
        targetId: 'owner',
        ipHash: '203.0.113.7',
        requestId: 'b'.repeat(16),
      },
      logger,
    );
    expect(bad).toBeUndefined();
  });
});
