// Security headers on every response (docs/ADR.md D1), then the admin gate (docs/ADMIN_SPEC.md
// §2.2), then the customer realm gate (brief §10). Cached responses keep the headers they were
// rendered with, so cache hits carry them too; admin and customer responses are never cached at all.
//
// The customer gate is last because it default-denies: anything that is neither an allowlisted
// public path nor a well-formed `/{slug}` is a 404 before a page runs. It never reads the sheet.
import { defineMiddleware, sequence } from 'astro:middleware';
import { adminGate } from './lib/admin/gate.ts';
import { gateConfig } from './lib/admin/http.ts';
import { customerGate } from './lib/customer/gate.ts';
import { customerGateConfig } from './lib/customer/http.ts';

const securityHeaders = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  response.headers.set('x-frame-options', 'DENY');
  return response;
});

const admin = defineMiddleware((context, next) => adminGate(context, () => next(), gateConfig()));

const customer = defineMiddleware(async (context, next) => {
  const { route } = customerGate(context, customerGateConfig());
  if (route.kind === 'deny') {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    });
  }
  if (route.kind === 'customer') {
    // A private preview is never cached and never indexed, signed in or not.
    context.cache.set(false);
    const response = await next();
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
    return response;
  }
  return next();
});

export const onRequest = sequence(securityHeaders, admin, customer);
