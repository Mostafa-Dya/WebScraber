// POST /api/reactions — a flushed batch of reactions (brief §3 rule 2, §7, §14):
//   { customer?: "hala", items: [{ productId, reaction: "like"|"dislike"|"none", source: "card"|"detail" }] }
// A single item may also be posted unwrapped.
//
// Identity is the customer slug inside the gated preview and `anon-<cookie hash>` on the public
// catalogue. `customer` is a CLAIM, not a credential: it names which realm the page belonged to, and
// this route only believes it after verifying that slug's own session cookie. A forged or expired
// claim silently degrades to the anonymous identity rather than failing, so a buyer whose session
// lapsed mid-visit still has their taps recorded — just not against their name.
export const prerender = false;

import type { APIRoute } from 'astro';
import { VOTE_SALT } from 'astro:env/server';
import { inflight, isSecureSite, limiter, noStore, rejectCrossSite, requestIpHash } from '../../lib/api.ts';
import { customerCookieName, isReservedSlug, SLUG_RE, verifyCustomerToken } from '../../lib/customer/auth.ts';
import { customerRuntime } from '../../lib/customer/http.ts';
import { getCache, getClient } from '../../lib/runtime.ts';
import { consoleLogger } from '../../lib/sheets/errors.ts';
import { insertReactionRows } from '../../lib/sheets/write.ts';
import { handleReactions, type ReactionsResponseBody } from '../../lib/votes/handler.ts';
import { visibleLikes } from '../../lib/view.ts';
import { VISITOR_ID_RE, newVisitorId, visitorCookieName, visitorHash } from '../../lib/votes/identity.ts';

const ONE_YEAR = 365 * 24 * 3600;

/** The verified customer slug this batch belongs to, or undefined. */
function claimedCustomer(
  body: unknown,
  cookies: { get(name: string): { value: string } | undefined },
): string | undefined {
  if (!customerRuntime.configured || !customerRuntime.secret) return undefined;
  const claim = (body as { customer?: unknown } | null)?.customer;
  if (typeof claim !== 'string') return undefined;
  const slug = claim.toLowerCase();
  if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return undefined;
  const token = cookies.get(customerCookieName(slug, customerRuntime.isSecureSite))?.value;
  return verifyCustomerToken(token, slug, customerRuntime.secret, Date.now())?.slug;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ ok: false, error: 'bad request' }, 400);
  }

  // Identity = a server-issued cookie; minted here and only here (cached GET pages cannot set cookies).
  const cookieName = visitorCookieName(isSecureSite);
  let visitorId = cookies.get(cookieName)?.value;
  if (!visitorId || !VISITOR_ID_RE.test(visitorId)) visitorId = newVisitorId();

  let deps;
  try {
    const cache = getCache();
    const client = getClient();
    deps = {
      cache,
      insert: (rows: Parameters<typeof insertReactionRows>[1]) => insertReactionRows(client, rows),
      limiter,
      inflight,
      logger: consoleLogger,
    };
  } catch {
    return noStore({ ok: false, error: 'catalogue unavailable' }, 503, { 'retry-after': '60' });
  }

  const customer = claimedCustomer(body, cookies);
  const result = await handleReactions(
    {
      body,
      // A named buyer writes their slug into `customer_slug`; a public visitor writes their own
      // cookie hash, prefixed so the admin report groups these under "anonymous" (brief §6.3).
      visitorHash: customer ?? `anon-${visitorHash(VOTE_SALT, visitorId)}`,
      ipHash: requestIpHash(request),
    },
    deps,
  );

  cookies.set(cookieName, visitorId, {
    httpOnly: true,
    secure: isSecureSite,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR,
  });
  const headers: Record<string, string> = {};
  if (result.retryAfterSec) headers['retry-after'] = String(result.retryAfterSec);
  return noStore(withVisibleCounts(result.body, customer !== undefined), result.status, headers);
};

/**
 * Apply the >= 5 like threshold to what a NAMED BUYER is told (owner requirement, 2026-09-13).
 *
 * The endpoint echoed every product's exact `likes`, `dislikes` and `rating` back to whoever asked.
 * That made it a read oracle rather than a side effect of voting: a body of 25 `reaction: "none"`
 * items writes nothing, spends no rate-limit budget, and returns 25 exact counts — so hiding the
 * number on the card achieved nothing.
 *
 * The split is by realm, because the two realms genuinely differ. A named buyer is in the private
 * preview, where the threshold applies and where nothing reads these fields anyway (the preview card
 * has no `[data-rating-for]`, which is all `paintCounts` updates). An anonymous visitor is on the
 * public catalogue, whose card renders a real "4.6 · 23 votes" line and needs the totals to repaint
 * it. `rating` goes with `likes`: it is `likes / (likes + dislikes) x 5`, so returning it alongside
 * `dislikes` hands back the count the threshold just removed.
 */
function withVisibleCounts(body: ReactionsResponseBody, isNamedCustomer: boolean): ReactionsResponseBody {
  if (!isNamedCustomer || !body.results) return body;
  return {
    ...body,
    results: body.results.map((r) => {
      const shown = visibleLikes(r.likes);
      return shown === undefined
        ? { ...r, likes: 0, dislikes: 0, rating: 0 }
        : { ...r, likes: shown };
    }),
  };
}

export const ALL: APIRoute = () =>
  noStore({ ok: false, error: 'method not allowed' }, 405, { allow: 'POST' });
