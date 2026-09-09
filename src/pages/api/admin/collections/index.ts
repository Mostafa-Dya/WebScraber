// GET /api/admin/collections and POST (collection.create: id = slug = slugify(name), unique by slug,
// sort_order = max + 1, inserted at the bottom), docs/ADMIN_SPEC.md §2.3, §3.4.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { buildAuditRow } from '../../../../lib/admin/audit.ts';
import { CollectionInput } from '../../../../lib/admin/dto.ts';
import {
  AdminError,
  adminGet,
  adminPost,
  auditBase,
  invalidateAfterWrite,
  methodNotAllowed,
} from '../../../../lib/admin/http.ts';
import { insertRowAtBottom } from '../../../../lib/admin/write.ts';
import { getClient } from '../../../../lib/runtime.ts';
import { TABS } from '../../../../lib/sheets/contract.ts';
import { slugify } from '../../../../lib/text.ts';
import { checkCover, freshCollection, loadSnapshot, nowIso } from '../_shared.ts';

export const GET = adminGet(async () => {
  const snapshot = await loadSnapshot();
  return noStore({ ok: true, collections: snapshot.collections });
});

export const POST = adminPost(CollectionInput, async ({ context, body }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const slug = slugify(body.name);
  if (!slug) throw new AdminError(422, 'bad name', 'The name needs at least one letter or digit.');
  const clash = snapshot.collections.find(
    (c) => c.slug === slug || c.name.trim().toLowerCase() === body.name.toLowerCase(),
  );
  if (clash) {
    throw new AdminError(409, 'slug exists', `Collection "${clash.name}" already exists (${clash.slug}).`, {
      slug,
    });
  }
  const cover = checkCover(body.coverImageUrl);
  const sortOrder = Math.max(0, ...snapshot.collections.map((c) => c.sortOrder ?? 0)) + 1;
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'collection.create',
    targetTab: 'Collections',
    targetId: slug,
    after: {
      id: slug,
      slug,
      name: body.name,
      description: body.description,
      coverImageUrl: cover,
      sortOrder,
    },
  });
  const result = await insertRowAtBottom(client, {
    tab: TABS.collections,
    cells: [slug, body.name, slug, body.description, nowIso(), cover, sortOrder],
    audit,
  });
  await invalidateAfterWrite(context);
  const collection = await freshCollection(client, result.row);
  return noStore({ ok: true, collection, audit: result.audit }, 201);
});

export const ALL = methodNotAllowed('GET, POST');
