// GET /api/admin/rugs/[id] (one rug with its version) and POST (rug.update with optimistic
// concurrency: 409 + the fresh row on a version mismatch), docs/ADMIN_SPEC.md §2.3, §3.4.
export const prerender = false;

import { noStore } from '../../../../../lib/api.ts';
import { buildAuditRow, diffFields } from '../../../../../lib/admin/audit.ts';
import { ID_RE, RugUpdate } from '../../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminGet,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../../lib/admin/http.ts';
import { uniqueSlug } from '../../../../../lib/admin/ids.ts';
import { findRugById, type AdminRug, type AdminSnapshot } from '../../../../../lib/admin/read.ts';
import { roundStepOf } from '../../../../../lib/admin/settings.ts';
import { productFieldsToCells, updateRug } from '../../../../../lib/admin/write.ts';
import { roundUpToStep } from '../../../../../lib/price.ts';
import { getClient } from '../../../../../lib/runtime.ts';
import { consoleLogger } from '../../../../../lib/sheets/errors.ts';
import {
  auditable,
  fieldsOfRug,
  freshRug,
  loadSnapshot,
  requireAdminHeaders,
  resolveCollections,
  resolveTags,
  rugFieldsFrom,
} from '../../_shared.ts';

function requireRug(snapshot: AdminSnapshot, id: string | undefined): AdminRug {
  if (!id || !ID_RE.test(id)) throw new AdminError(404, 'not found', 'no such rug');
  const rug = findRugById(snapshot, id);
  if (!rug) throw new AdminError(404, 'not found', `rug "${id}" is not in the sheet`);
  return rug;
}

export const GET = adminGet(async ({ context }) => {
  const snapshot = await loadSnapshot();
  return noStore({ ok: true, rug: requireRug(snapshot, context.params.id) });
});

export const POST = adminPost(RugUpdate, async ({ context, body }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  requireAdminHeaders(snapshot);
  const rug = requireRug(snapshot, context.params.id);
  const otherSlugs = snapshot.rugs.filter((r) => r.id !== rug.id).map((r) => r.slug);
  let slug = rug.slug; // kept on rename (stable URLs) unless the form sends a regenerated one
  if (body.slug && body.slug !== rug.slug) {
    const wanted = body.slug.toLowerCase();
    if (otherSlugs.some((s) => s.toLowerCase() === wanted)) {
      throw new AdminError(409, 'slug exists', `Slug "${body.slug}" is already used by another rug.`, {
        slug: body.slug,
      });
    }
    slug = body.slug;
  } else if (!slug) {
    slug = uniqueSlug(body.name, otherSlugs);
  }
  const collections = resolveCollections(snapshot, body.collections);
  const tags = resolveTags(snapshot, body.tags);
  const priceUsd = body.roundPrice
    ? roundUpToStep(body.priceUsd, roundStepOf(snapshot.settings))
    : body.priceUsd;
  const before = fieldsOfRug(rug);
  // `scrapedAt` comes from the ROW, never the body: it is provenance, and the full-width write
  // would otherwise blank it on every edit.
  const after = rugFieldsFrom(body, { slug, collections, tags, priceUsd, scrapedAt: rug.scrapedAt });
  const diff = diffFields(auditable(before), auditable(after));
  if (diff.changed.length === 0) {
    return noStore({ ok: true, rug, unchanged: true });
  }
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'rug.update',
    targetTab: 'Products',
    targetId: rug.id,
    before: diff.before,
    after: diff.after,
    note: `row ${rug.row}`,
  });
  const result = await updateRug(client, {
    row: rug.row,
    id: rug.id,
    version: body.version,
    cells: { all: productFieldsToCells(after, rug.id) },
    audit,
    logger: consoleLogger,
  });
  await invalidateAfterWrite(context);
  const fresh = await freshRug(client, rug.row, rug.id);
  return noStore({
    ok: true,
    rug: fresh,
    audit: result.audit,
    verified: result.verified,
    changed: diff.changed,
  });
});

export const ALL = methodNotAllowed('GET, POST');
