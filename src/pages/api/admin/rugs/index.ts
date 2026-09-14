// GET /api/admin/rugs (list, `?status=` / `?q=` optional) and POST /api/admin/rugs (rug.create),
// docs/ADMIN_SPEC.md §2.3, §3.4. The row and its audit entry land in one batchUpdate (write.ts).
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { RugInput } from '../../../../lib/admin/dto.ts';
import { buildAuditRow } from '../../../../lib/admin/audit.ts';
import {
  AdminError,
  adminGet,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../lib/admin/http.ts';
import { idProblem, nextRugId, uniqueSlug } from '../../../../lib/admin/ids.ts';
import { roundStepOf } from '../../../../lib/admin/settings.ts';
import { insertRug, productFieldsToCells } from '../../../../lib/admin/write.ts';
import { roundUpToStep } from '../../../../lib/price.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { consoleLogger } from '../../../../lib/sheets/errors.ts';
import {
  auditable,
  filterRugs,
  freshRug,
  loadSnapshot,
  nowIso,
  requireAdminHeaders,
  reservedIds,
  resolveCollections,
  resolveTags,
  rugFieldsFrom,
} from '../_shared.ts';

export const GET = adminGet(async ({ context }) => {
  const snapshot = await loadSnapshot();
  const { searchParams } = context.url;
  return noStore({
    ok: true,
    rugs: filterRugs(snapshot.rugs, searchParams.get('status'), searchParams.get('q')),
    collections: snapshot.collections,
    tags: snapshot.tags,
    adminHeaders: snapshot.report.adminHeaders,
  });
});

export const POST = adminPost(RugInput, async ({ context, body }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  requireAdminHeaders(snapshot);
  const allIds = snapshot.rugs.map((r) => r.id);
  const reserved = reservedIds(snapshot);
  let id: string;
  if (body.id) {
    const problem = idProblem(body.id, allIds, reserved);
    if (problem) {
      throw new AdminError(problem.includes('already exists') ? 409 : 422, 'id problem', problem, {
        id: body.id,
      });
    }
    id = body.id;
  } else {
    id = nextRugId(allIds, reserved);
  }
  const allSlugs = snapshot.rugs.map((r) => r.slug);
  let slug: string;
  if (body.slug) {
    const wanted = body.slug.toLowerCase();
    if (allSlugs.some((s) => s.toLowerCase() === wanted)) {
      throw new AdminError(409, 'slug exists', `Slug "${body.slug}" is already used by another rug.`, {
        slug: body.slug,
      });
    }
    slug = body.slug;
  } else {
    slug = uniqueSlug(body.name, allSlugs);
  }
  const collections = resolveCollections(snapshot, body.collections);
  const tags = resolveTags(snapshot, body.tags);
  const priceUsd = body.roundPrice
    ? roundUpToStep(body.priceUsd, roundStepOf(snapshot.settings))
    : body.priceUsd;
  const fields = rugFieldsFrom(body, { slug, collections, tags, priceUsd });
  const now = nowIso();
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'rug.create',
    targetTab: 'Products',
    targetId: id,
    after: { id, ...auditable(fields), roundPrice: body.roundPrice, requestedPrice: body.priceUsd ?? null },
  });
  const result = await insertRug(client, {
    cells: { all: productFieldsToCells({ ...fields, scrapedAt: fields.scrapedAt ?? now }, id) },
    audit,
    logger: consoleLogger,
  });
  await invalidateAfterWrite(context);
  const rug = await freshRug(client, result.row, id);
  return noStore({ ok: true, rug, row: result.row, audit: result.audit, verified: result.verified }, 201);
});

export const ALL = methodNotAllowed('GET, POST');
