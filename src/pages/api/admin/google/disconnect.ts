// POST /api/admin/google/disconnect — forgets the stored authorisation and asks Google to revoke it.
//
// Revoking is best effort: if Google is unreachable the local copy is still cleared, because leaving
// a credential behind because a network call failed is the wrong way round.
export const prerender = false;

import * as z from 'zod';
import { noStore } from '../../../../lib/api.ts';
import { adminPost, auditBase, methodNotAllowed, recordAuditEvent } from '../../../../lib/admin/http.ts';
import { revokeToken } from '../../../../lib/google/oauth.ts';
import { getGoogleConnection, getGoogleStore } from '../../../../lib/runtime.ts';

export const POST = adminPost(z.object({}).passthrough(), async ({ context }) => {
  const store = getGoogleStore();
  const stored = store.read();
  const revoked = stored?.refreshToken ? await revokeToken(stored.refreshToken) : false;
  store.clear();
  getGoogleConnection()?.invalidate();

  await recordAuditEvent({
    ...auditBase(context),
    action: 'auth.google',
    targetTab: '-',
    targetId: 'google',
    after: { disconnected: true, revokedAtGoogle: revoked },
  });

  return noStore({ ok: true, revoked });
});

export const ALL = methodNotAllowed('POST');
