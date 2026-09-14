// Per-supplier image fixes applied on the way into Drive (owner, 2026-09-13).
//
//   "rotate first image by 90 degrees that is coming from https://karavanrug.com/"
//   "remove background of the first image from both karavan and ecarpet gallery"
//
// Applied to the BYTES at import, not with a CSS transform at display. The rug's photos are the
// studio's own asset afterwards — they are re-used in exports, sent to buyers, and opened straight
// out of Drive — so a file that is correct only inside this website is not actually correct. It also
// means the fix happens once per photo rather than on every page view.
//
// This is deliberately separate from the existing `rotate` flag (ADR D6), which is a DISPLAY hint
// for portrait plates and applies to the whole rug. That flag answers "how should this rug be shown
// in its plate"; this module answers "did the supplier hand us the file the wrong way up".

/** What can be done to a supplier photo before it is stored. */
export type ImageTransform = 'rotate90' | 'removeBackground';

/**
 * The media type without its parameters.
 *
 * Duplicated from upload.ts's `mimeOf` rather than imported: upload.ts imports THIS module, and a
 * two-line normaliser is a far smaller cost than a circular import between them.
 */
function bareMime(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Formats sharp can decode and re-encode losslessly enough to be worth rewriting. */
const TRANSFORMABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']);

/**
 * The transforms a given photo earns.
 *
 * `index` is the photo's position in the import, so "first image" means exactly that — the one the
 * card shows. Everything after it is left as the supplier sent it.
 */
export function transformsFor(supplier: string, index: number): ImageTransform[] {
  if (index !== 0) return [];
  const out: ImageTransform[] = [];
  if (supplier === 'karavanrug') out.push('rotate90');
  // Background removal is requested for BOTH suppliers' first image, but is not implemented: see
  // removeBackground() below. Listing it here keeps the policy honest and in one place — when the
  // owner picks an approach, only that function changes.
  if (supplier === 'karavanrug' || supplier === 'ecarpetgallery') out.push('removeBackground');
  return out;
}

/**
 * Rotates a quarter turn clockwise.
 *
 * Clockwise because the owner did not say which way and every Karavan plate this was checked
 * against is a landscape file of a portrait rug lying on its right side. If it turns out to be the
 * other way, this is a one-character change (90 → 270).
 *
 * sharp is imported dynamically: it is a native module that Astro already pulls in, and loading it
 * eagerly would drag it into every context that touches Drive, tests included.
 */
export async function rotate90(bytes: Uint8Array): Promise<Uint8Array> {
  const { default: sharp } = await import('sharp');
  // `withMetadata()` keeps the EXIF orientation flag consistent with the pixels we just moved;
  // without it a viewer that honours EXIF would helpfully rotate the image back again.
  const out = await sharp(bytes).rotate(90).withMetadata().toBuffer();
  return new Uint8Array(out);
}

/**
 * Background removal — NOT IMPLEMENTED, by the owner's decision of 2026-09-13.
 *
 * sharp cannot do this: separating a rug from its backdrop needs a segmentation model, not an image
 * filter. The two real options were a hosted API (remove.bg / Photoroom — around $0.20 an image, and
 * every supplier photo leaves the studio's control) or a local ONNX model (rembg / BiRefNet — a
 * ~180MB download and materially more CPU per import). The owner chose neither for now.
 *
 * This is the seam where it plugs in: return the new bytes and every caller already handles it. It
 * returns the input unchanged rather than throwing, so the transform pipeline stays a no-op until
 * there is something real to do.
 */
export async function removeBackground(bytes: Uint8Array): Promise<Uint8Array> {
  return bytes;
}

export interface TransformInput {
  bytes: Uint8Array;
  contentType: string;
}

export interface TransformOutcome extends TransformInput {
  /** What actually ran — `removeBackground` is omitted while it is a no-op. */
  applied: ImageTransform[];
  /** Set when a transform was wanted but could not run; the ORIGINAL bytes are returned. */
  skipped?: string;
}

/**
 * Runs the transforms this photo earns, and never fails the import.
 *
 * A photo that cannot be rotated is still a photo the owner wants in Drive. Losing an import because
 * sharp could not decode an unusual file — or is not installed on the host at all — would trade a
 * cosmetic problem for a missing product image, so every failure falls back to the original bytes
 * and reports itself through `skipped`.
 */
export async function applyTransforms(
  input: TransformInput,
  opts: { supplier: string; index: number },
): Promise<TransformOutcome> {
  const wanted = transformsFor(opts.supplier, opts.index);
  if (wanted.length === 0) return { ...input, applied: [] };

  const mime = bareMime(input.contentType);
  if (!TRANSFORMABLE.has(mime)) {
    return { ...input, applied: [], skipped: `cannot transform ${mime || 'unknown type'}` };
  }

  let bytes = input.bytes;
  const applied: ImageTransform[] = [];
  try {
    for (const t of wanted) {
      if (t === 'rotate90') {
        bytes = await rotate90(bytes);
        applied.push(t);
      } else if (t === 'removeBackground') {
        const next = await removeBackground(bytes);
        // Only claim it ran if it actually changed something — today it never does.
        if (next !== bytes) {
          bytes = next;
          applied.push(t);
        }
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ...input, applied: [], skipped: detail };
  }
  return { bytes, contentType: input.contentType, applied };
}
