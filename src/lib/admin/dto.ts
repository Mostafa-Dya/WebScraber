// Shared Zod 4 schemas for the admin JSON API (docs/ADMIN_SPEC.md §2.3). Every endpoint validates
// its body with `Schema.safeParse` and answers 400 `{ ok:false, error:'invalid body', issues }`.
import * as z from 'zod';
import { DRIVE_ID_RE } from '../images.ts';

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // parse.ts ID_RE (excludes * ? = < > by construction)
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;
export const CLIENT_CODE_RE = /^[a-z0-9]([a-z0-9-]{0,26})[a-z0-9]$/; // subset of the site's ^[A-Za-z0-9_-]{1,64}$
export const VERSION_RE = /^[a-f0-9]{16}$/;

const Id = z.string().regex(ID_RE);
const Slug = z.string().regex(SLUG_RE);
const Text = (max: number) => z.string().trim().max(max).default('');
const TagName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((t) => !t.includes('|'), 'tags may not contain "|"');

function isHttpsUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
const HttpsUrl = z.string().trim().max(500).refine(isHttpsUrl, 'https only');
export const Version = z.string().regex(VERSION_RE);

export const RugInput = z.object({
  id: Id.optional(), // create only; absent → server allocates the next SL-nnn
  slug: Slug.optional(), // absent → derived from name (create) / kept (update)
  name: z.string().trim().min(1).max(120),
  description: Text(4000),
  collection: z.string().trim().min(1).max(80), // must match a Collections.name (case-insensitive)
  tags: z.array(TagName).max(20).default([]),
  photos: z.array(z.string().regex(DRIVE_ID_RE)).max(12).default([]), // src/lib/images.ts DRIVE_ID_RE
  widthCm: z.number().int().min(10).max(2000).optional(),
  lengthCm: z.number().int().min(10).max(2000).optional(),
  material: Text(80),
  method: Text(80),
  age: Text(80),
  origin: Text(80),
  priceUsd: z.number().min(0).max(1_000_000).multipleOf(0.01).optional(),
  rotate: z.enum(['force', 'true', 'false']).default('false'),
  featured: z.boolean().default(false),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  sourceUrl: HttpsUrl.optional(),
  supplier: z.enum(['ecarpetgallery', 'karavanrug', '']).default(''),
  supplierRef: Text(40),
  notes: Text(2000),
  roundPrice: z.boolean().default(false), // apply roundUpToStep(priceUsd) server-side before writing (§7)
});
export type RugInputT = z.infer<typeof RugInput>;
export const RugUpdate = RugInput.omit({ id: true }).extend({ version: Version });
export type RugUpdateT = z.infer<typeof RugUpdate>;
export const RugStatus = z.object({ status: z.enum(['active', 'draft', 'archived']), version: Version });
export type RugStatusT = z.infer<typeof RugStatus>;

export const CollectionInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: Text(1000),
  coverImageUrl: z.string().trim().max(500).default(''), // validated with normaliseImageUrl(); '' clears
});
export type CollectionInputT = z.infer<typeof CollectionInput>;
export const CollectionUpdate = CollectionInput.extend({ version: Version });
export type CollectionUpdateT = z.infer<typeof CollectionUpdate>;
export const CollectionReorder = z.object({ order: z.array(Id).min(1).max(200) }); // ids in the new sort order
export type CollectionReorderT = z.infer<typeof CollectionReorder>;
export const TagInput = z.object({
  name: TagName,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type TagInputT = z.infer<typeof TagInput>;
export const TagUpdate = TagInput.extend({ version: Version });
export type TagUpdateT = z.infer<typeof TagUpdate>;

/** Blank means "generate one for me"; anything else is the owner's own choice, floored at 8. */
const ChosenPassword = z
  .union([z.literal(''), z.string().trim().min(8, 'A password needs at least 8 characters.').max(200)])
  .optional();

export const ClientInput = z.object({
  name: z.string().trim().min(1).max(60),
  note: Text(200),
  password: ChosenPassword,
});
export type ClientInputT = z.infer<typeof ClientInput>;
export const ClientPassword = z.object({ version: Version, password: ChosenPassword });
export type ClientPasswordT = z.infer<typeof ClientPassword>;
export const ClientStatus = z.object({ status: z.enum(['active', 'revoked']), version: Version });
export type ClientStatusT = z.infer<typeof ClientStatus>;

export const ScrapeRequest = z.object({
  url: z.string().trim().min(8).max(500),
  force: z.boolean().default(false),
});
export type ScrapeRequestT = z.infer<typeof ScrapeRequest>;
export const PhotoImportRequest = z.object({
  urls: z.array(HttpsUrl).min(1).max(12),
  namePrefix: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_-]+$/), // e.g. the slug; files are <prefix>-<n>.jpg
});
export type PhotoImportRequestT = z.infer<typeof PhotoImportRequest>;
export const SettingsUpdate = z.object({
  key: z.enum([
    'retail_markup',
    'retail_markup.ecarpetgallery',
    'retail_markup.karavanrug',
    'price_round_step',
    'default_status',
  ]),
  value: z.string().trim().max(40), // parsed per key server-side (§3.3); '' clears
});
export type SettingsUpdateT = z.infer<typeof SettingsUpdate>;
/**
 * POST /api/admin/compact-reactions takes no input (brief §14). The empty object still runs the
 * shared POST wrapper's JSON posture — content-type, 64 KiB cap, same-origin check — over the
 * request, and leaves room for a future `dryRun` without changing the route's shape.
 */
export const CompactReactionsRequest = z.object({});
export type CompactReactionsRequestT = z.infer<typeof CompactReactionsRequest>;

export const AuditQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type AuditQueryT = z.infer<typeof AuditQuery>;

/** Compact issue list for the 400 body (path + message; never the input value). */
export function issuesOf(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}
