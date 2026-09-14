// /admin/login and /admin/logout rendered through Astro's container API with the environment and
// the Sheets runtime mocked (docs/ADMIN_SPEC.md §2.1, §9.3): the form works without JS, a wrong
// password gets the generic 401, the right one sets the HttpOnly cookie, audits and redirects 303,
// `next` is sanitised, and logout revokes + clears + redirects.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { App } from 'astro/app';
import { describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above every import and top-level const, so shared state lives here.
const { PASSWORD, writes } = vi.hoisted(() => ({
  PASSWORD: 'correct horse battery staple',
  writes: [] as unknown[][],
}));

vi.mock('astro:env/server', async () => {
  const { hashPassword } = await import('../../src/lib/admin/auth.ts');
  return {
    SITE_URL: 'https://catalogue.example.test',
    VOTE_SALT: 'v'.repeat(40),
    REVALIDATE_SECRET: 'r'.repeat(40),
    CLIENT_IP_HEADER: '',
    TRUSTED_PROXY_HOPS: 1,
    ADMIN_PASSWORD_HASH: hashPassword(PASSWORD, { N: 4096 }),
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
  };
});

vi.mock('../../src/lib/runtime.ts', () => ({
  getClient: () => ({
    sheetIdByTitle: async () => 22,
    batchUpdate: async (reqs: unknown[]) => {
      writes.push(reqs);
      return { replies: [] };
    },
    batchGet: async () => [],
    getSpreadsheet: async () => ({ sheets: [] }),
    forgetSheetIds: () => {},
  }),
  getCache: () => {
    throw new Error('no cache in this test');
  },
  // Customer realm + FX (brief §8, §10).
  AUTH_SECRET: undefined,
  PUBLIC_CATALOGUE: true,
  BASE_CURRENCY: 'USD',
  FX_API_URL: 'https://api.frankfurter.dev/v1/latest',
  FX_REFRESH_HOURS: 24,
}));

import Login from '../../src/pages/admin/login.astro';
import Logout from '../../src/pages/admin/logout.astro';
import { makeToken, newSession, verifyToken } from '../../src/lib/admin/auth.ts';
import { adminRuntime } from '../../src/lib/admin/http.ts';

const ORIGIN = 'https://catalogue.example.test';
const locals = { requestId: 'c'.repeat(16) };

function form(fields: Record<string, string>, path = '/admin/login'): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    body: new URLSearchParams(fields).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
  });
}

/** The audit row's action cell from the last batchUpdate (AuditLog insert = [insertDimension, updateCells]). */
function lastAuditAction(): string | undefined {
  const reqs = writes.at(-1) as
    | Array<{
        updateCells?: { rows: Array<{ values: Array<{ userEnteredValue?: { stringValue?: string } }> }> };
      }>
    | undefined;
  return reqs?.[1]?.updateCells?.rows[0]?.values[2]?.userEnteredValue?.stringValue;
}

describe('/admin/login', () => {
  it('GET renders the password form (no JS needed) with a sanitised hidden next', async () => {
    const container = await AstroContainer.create();
    const res = await container.renderToResponse(Login, {
      request: new Request(`${ORIGIN}/admin/login?next=%2Fadmin%2Frugs%2FSL-030`),
      locals,
      partial: false,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // A1 (Figma 47:3). The form still posts without JavaScript — that is the property under test,
    // not the class names, so these assert the contract rather than the markup of the day.
    expect(html).toMatch(/<form method="post" action="\/admin\/login"/);
    expect(html).toMatch(/<input type="hidden" name="next" value="\/admin\/rugs\/SL-030"/);
    expect(html).toMatch(
      /<input class="input input--password" type="password" id="password" name="password"[^>]*required[^>]*autocomplete="current-password"/,
    );
    expect(html).toContain('<label class="field__label" for="password">Password</label>');
    expect(html).toMatch(/<button type="submit" class="btn btn--primary[^"]*"[^>]*>\s*Enter\s*<\/button>/);
    // Resting state says nothing: no message element at all, rather than an empty one.
    expect(html).not.toContain('field__message');
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('class="tabs"');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    const evil = await container.renderToResponse(Login, {
      request: new Request(`${ORIGIN}/admin/login?next=https://evil.test/`),
      locals,
      partial: false,
    });
    expect(await evil.text()).toContain('name="next" value="/admin"');
  });
  it('POST with a wrong password answers 401, marks the field invalid, and sets no cookie', async () => {
    const container = await AstroContainer.create();
    const res = await container.renderToResponse(Login, {
      request: form({ password: 'wrong password!!', next: '/admin' }),
      locals,
      partial: false,
    });
    expect(res.status).toBe(401);
    const html = await res.text();
    // A2 (47:28/47:44): the message is the field's own description, announced, and the field is
    // marked invalid. Copy is Figma's — ADMIN_SPEC records why it supersedes the old generic line.
    expect(html).toMatch(
      /<p class="field__message field__message--danger" id="password-error" role="alert">/,
    );
    expect(html).toContain('That password is not correct.');
    expect(html).toContain('aria-describedby="password-error"');
    expect(html).toContain('aria-invalid="true"');
    // Whatever the message says, it must never echo what was typed.
    expect(html).not.toContain('wrong password');
    expect([...App.getSetCookieFromResponse(res)]).toHaveLength(0);
  });
  it('POST with the right password sets the HttpOnly session cookie, audits auth.login and redirects 303 to next', async () => {
    const container = await AstroContainer.create();
    const before = writes.length;
    const res = await container.renderToResponse(Login, {
      request: form({ password: PASSWORD, next: '/admin/rugs' }),
      locals,
      partial: false,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/rugs');
    const cookies = [...App.getSetCookieFromResponse(res)];
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0]!;
    expect(cookie).toMatch(/^__Host-sl_admin=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=43200/);
    const token = decodeURIComponent(cookie.split(';')[0]!.split('=').slice(1).join('='));
    const session = verifyToken(token, 's'.repeat(40), Date.now());
    expect(session?.user).toBe('owner');
    expect(writes.length).toBe(before + 1);
    expect(lastAuditAction()).toBe('auth.login');
  });
  it('POST after repeated failures is throttled with Retry-After before scrypt runs', async () => {
    const container = await AstroContainer.create();
    for (let i = 0; i < 3; i++) {
      await container.renderToResponse(Login, {
        request: form({ password: 'still wrong!!!' }),
        locals,
        partial: false,
      });
    }
    const res = await container.renderToResponse(Login, {
      request: form({ password: PASSWORD }),
      locals,
      partial: false,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
    // A3 (47:51/47:67). Locked, not invalid: the attempt never reached the password, so the field
    // is disabled with a WARNING-toned line and the button reads "Locked" rather than "Enter".
    const throttled = await res.text();
    expect(throttled).toMatch(/Too many attempts — wait 60s\. \d+s remaining\./);
    expect(throttled).toMatch(/<p class="field__message field__message--warning"/);
    expect(throttled).not.toContain('aria-invalid');
    expect(throttled).toMatch(/<button type="submit"[^>]*disabled[^>]*>\s*Locked\s*<\/button>/);
    // the session cookie is not minted while throttled, even with the right password
    expect([...App.getSetCookieFromResponse(res)]).toHaveLength(0);
    adminRuntime.throttle.succeed('a'.repeat(32)); // not this ip; state is per ip hash
  });
  it('an already logged-in visitor is bounced to next', async () => {
    const container = await AstroContainer.create();
    const session = newSession('owner', Date.now());
    const res = await container.renderToResponse(Login, {
      request: new Request(`${ORIGIN}/admin/login?next=%2Fadmin%2Faudit`),
      locals: { ...locals, admin: session },
      partial: false,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/audit');
  });
});

describe('/admin/logout', () => {
  it('GET is 405, POST revokes the sid, clears the cookie, audits and redirects to the login page', async () => {
    const container = await AstroContainer.create();
    const get = await container.renderToResponse(Logout, {
      request: new Request(`${ORIGIN}/admin/logout`),
      locals,
      partial: false,
    });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');

    const session = newSession('owner', Date.now());
    const token = makeToken(session, 's'.repeat(40));
    expect(verifyToken(token, 's'.repeat(40), Date.now(), adminRuntime.revocations)).toBeDefined();
    const before = writes.length;
    const res = await container.renderToResponse(Logout, {
      request: form({}, '/admin/logout'),
      locals: { ...locals, admin: session },
      partial: false,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/login');
    const cookies = [...App.getSetCookieFromResponse(res)];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^__Host-sl_admin=/);
    expect(cookies[0]).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(verifyToken(token, 's'.repeat(40), Date.now(), adminRuntime.revocations)).toBeUndefined();
    expect(writes.length).toBe(before + 1);
    expect(lastAuditAction()).toBe('auth.logout');
    // without a session it still clears and redirects, without auditing
    const anon = await container.renderToResponse(Logout, {
      request: form({}, '/admin/logout'),
      locals,
      partial: false,
    });
    expect(anon.status).toBe(303);
    expect(writes.length).toBe(before + 1);
  });
});
