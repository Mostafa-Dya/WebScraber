// GET /api/admin/google/start — begins the Google authorisation from inside the admin.
//
// Admin-gated like everything under /api/admin, so only a signed-in owner can start it. Mints a
// PKCE pair and a state value, keeps both in process memory behind a short-lived cookie, and
// redirects to Google's consent screen.
//
// `prompt=consent` is deliberate (see src/lib/google/oauth.ts): without it a second authorisation
// returns an access token and no refresh token, and the connection stops surviving restarts.
export const prerender = false;

import type { APIRoute } from 'astro';
import { GOOGLE_OAUTH_CLIENT_ID } from 'astro:env/server';
import { noStore } from '../../../../lib/api.ts';
import { adminRuntime, methodNotAllowed, requireSession } from '../../../../lib/admin/http.ts';
import { handshakes } from '../../../../lib/google/runtime.ts';
import { HANDSHAKE_COOKIE, HANDSHAKE_TTL_MS, sanitiseNext } from '../../../../lib/google/handshake.ts';
import { buildAuthUrl, createPkce, createState, redirectUriFor } from '../../../../lib/google/oauth.ts';

export const GET: APIRoute = async (context) => {
  requireSession(context);
  if (!GOOGLE_OAUTH_CLIENT_ID) {
    return noStore(
      {
        ok: false,
        error: 'not configured',
        message: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set before connecting.',
      },
      503,
    );
  }

  const redirectUri = redirectUriFor(adminRuntime.siteUrl);
  const { verifier, challenge } = createPkce();
  const state = createState();
  const id = handshakes.create({
    state,
    verifier,
    redirectUri,
    next: sanitiseNext(context.url.searchParams.get('next')),
  });

  context.cookies.set(HANDSHAKE_COOKIE, id, {
    httpOnly: true,
    secure: adminRuntime.isSecureSite,
    // `lax` on purpose: Google returns the owner by a top-level GET, and `strict` would withhold the
    // cookie on exactly that navigation.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(HANDSHAKE_TTL_MS / 1000),
  });

  return context.redirect(
    buildAuthUrl({ clientId: GOOGLE_OAUTH_CLIENT_ID, redirectUri, state, challenge }),
    302,
  );
};

export const ALL = methodNotAllowed('GET');
