// GET /api/admin/tags and POST (tag.create: id = slug = slugify(name), optional colour, unique),
// docs/ADMIN_SPEC.md §2.3, §3.4.
export const prerender = false;

import { noStore } from '../../../../lib/api.ts';
import { buildAuditRow } from '../../../../lib/admin/audit.ts';
import { TagInput } from '../../../../lib/admin/dto.ts';
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
import { freshTag, loadSnapshot } from '../_shared.ts';

export const GET = adminGet(async () => {
  const snapshot = await loadSnapshot();
  return noStore({ ok: true, tags: snapshot.tags });
});

export const POST = adminPost(TagInput, async ({ context, body }) => {
  const client = getClient();
  const snapshot = await loadSnapshot(client);
  const slug = slugify(body.name);
  if (!slug) throw new AdminError(422, 'bad name', 'The name needs at least one letter or digit.');
  const clash = snapshot.tags.find(
    (t) => t.slug === slug || t.name.trim().toLowerCase() === body.name.toLowerCase(),
  );
  if (clash) {
    throw new AdminError(409, 'slug exists', `Tag "${clash.name}" already exists (${clash.slug}).`, { slug });
  }
  const color = body.color ?? '';
  const audit = buildAuditRow({
    ...auditBase(context),
    action: 'tag.create',
    targetTab: 'Tags',
    targetId: slug,
    after: { id: slug, slug, name: body.name, color },
  });
  const result = await insertRowAtBottom(client, {
    tab: TABS.tags,
    cells: [slug, slug, body.name, color],
    audit,
  });
  await invalidateAfterWrite(context);
  const tag = await freshTag(client, result.row);
  return noStore({ ok: true, tag, audit: result.audit }, 201);
});

export const ALL = methodNotAllowed('GET, POST');
