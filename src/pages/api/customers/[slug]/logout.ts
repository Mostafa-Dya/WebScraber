// POST /api/customers/[slug]/logout — clears that slug's session cookie and nothing else. A buyer
// signed into two previews on the same device stays signed into the other one (brief §10).
export const prerender = false;

import type { APIRoute } from 'astro';
import { noStore, rejectCrossSite } from '../../../../lib/api.ts';
import { customerCookieName, isReservedSlug, SLUG_RE } from '../../../../lib/customer/auth.ts';
import { customerRuntime } from '../../../../lib/customer/http.ts';

export const POST: APIRoute = async ({ request, cookies, params }) => {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const slug = (params.slug ?? '').toLowerCase();
  if (!SLUG_RE.test(slug) || isReservedSlug(slug)) return noStore({ ok: false, error: 'not found' }, 404);
  // __Host- cookies can only be cleared with the same Path=/ and Secure attributes.
  cookies.delete(customerCookieName(slug, customerRuntime.isSecureSite), {
    path: '/',
    secure: customerRuntime.isSecureSite,
    httpOnly: true,
    sameSite: 'lax',
  });
  return noStore({ ok: true, redirect: `/${slug}` });
};

export const ALL: APIRoute = () =>
  noStore({ ok: false, error: 'method not allowed' }, 405, { allow: 'POST' });
