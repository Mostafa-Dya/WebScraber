// Google Drive photo handling (docs/ADR.md D6). The sheet stores share URLs or bare file ids;
// this module is the ONLY place that formats an image URL, so the mirror can replace it later.

export const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** Hosts an editor-supplied https image URL may point at (cover images, ADR §5). */
export const IMAGE_HOSTS: readonly string[] = ['lh3.googleusercontent.com', 'drive.google.com'];

/** Extracts a Drive file id from a bare id or any common Drive / lh3 URL shape; null when none. */
export function extractDriveId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (DRIVE_ID_RE.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const fromQuery = url.searchParams.get('id'); // uc?id=, thumbnail?id=, open?id=
  if (fromQuery && DRIVE_ID_RE.test(fromQuery)) return fromQuery;
  const m = url.pathname.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]{20,128})(?:[/=]|$)/); // /file/d/<id>/view, lh3 /d/<id>=w…
  return m?.[1] ?? null;
}

export type PhotoSize = 800 | 1600;

/** Direct lh3 URL (200 image/jpeg, no redirect, downscale-only; verified 2026-09-05). */
export function driveImageUrl(fileId: string, width: PhotoSize = 800): string {
  if (!DRIVE_ID_RE.test(fileId)) throw new Error('driveImageUrl: invalid Drive file id');
  return `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;
}

/** Normalises an editor-typed image cell: Drive id/URL → lh3, allow-listed https URL → as is, else a reason. */
export function normaliseImageUrl(input: string): { url?: string; reason?: string } {
  const id = extractDriveId(input);
  if (id) return { url: driveImageUrl(id, 1600) };
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { reason: 'not a Drive id/URL or https URL' };
  }
  if (url.protocol !== 'https:') return { reason: 'only https URLs are allowed' };
  if (!IMAGE_HOSTS.includes(url.hostname)) return { reason: `host "${url.hostname}" is not allow-listed` };
  return { url: url.toString() };
}
