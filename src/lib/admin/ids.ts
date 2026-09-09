// Id and slug rules (docs/ADMIN_SPEC.md §3.4), pure. New rug ids are `SL-nnn` (min 3 digits,
// growing past 999); supplier numbers go to `supplier_ref`, never `id`.
import { slugify } from '../text.ts';

export const RUG_ID_SEQ_RE = /^SL-(\d{3,})$/;

export function zeroPad(n: number, width = 3): string {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/** Highest numeric suffix over every `SL-nnn` id in `ids` (other id shapes are ignored); 0 when none. */
export function maxSequence(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const m = RUG_ID_SEQ_RE.exec(String(id).trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * `SL-` + zero-padded (max suffix over ALL Rugs rows of any status and the `target_id`s of
 * `rug.create` audit rows, + 1). `SL-029` → `SL-030`; `SL-999` → `SL-1000`.
 */
export function nextRugId(rugIds: Iterable<string>, reservedIds: Iterable<string> = []): string {
  const max = Math.max(maxSequence(rugIds), maxSequence(reservedIds));
  return `SL-${zeroPad(max + 1)}`;
}

/**
 * An owner-typed id is refused when it reuses the sequence below the current maximum (`SL-012`
 * when `SL-029` exists) or already exists (case-insensitive) in `existingIds`.
 */
export function idProblem(
  id: string,
  existingIds: Iterable<string>,
  reservedIds: Iterable<string> = [],
): string | undefined {
  const wanted = id.trim();
  const lower = wanted.toLowerCase();
  for (const e of existingIds)
    if (String(e).trim().toLowerCase() === lower) return `id "${wanted}" already exists`;
  const m = /^SL-(\d+)$/.exec(wanted);
  if (m) {
    const max = Math.max(maxSequence(existingIds), maxSequence(reservedIds));
    if (Number(m[1]) <= max) return `id "${wanted}" is below the current sequence (SL-${zeroPad(max)})`;
  }
  return undefined;
}

/** `slugify(base)`, then `-2`, `-3`, … until it is not in `existing` (case-insensitive); `keep` is allowed as is. */
export function uniqueSlug(base: string, existing: Iterable<string>, keep?: string): string {
  const taken = new Set<string>();
  for (const s of existing) taken.add(String(s).trim().toLowerCase());
  if (keep) taken.delete(keep.toLowerCase());
  let root = slugify(base);
  if (!root) root = 'rug';
  if (!taken.has(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${root.slice(0, 80 - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('uniqueSlug: could not find a free slug');
}
