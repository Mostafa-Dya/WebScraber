// Per-supplier image fixes on the way into Drive (owner, 2026-09-13).
//
// The policy half is pure and cheap to test. The rotation half is tested against REAL sharp on a
// real image, because "did the pixels actually move" is the only question worth asking of it — a
// mocked sharp would prove nothing except that the call was made.
import { describe, expect, it } from 'vitest';
import {
  applyTransforms,
  removeBackground,
  rotate90,
  transformsFor,
} from '../../../src/lib/drive/transform.ts';

/** A 60×30 landscape PNG — deliberately not square, so a rotation is visible in the dimensions. */
async function landscapePng(): Promise<Uint8Array> {
  const { default: sharp } = await import('sharp');
  const buf = await sharp({
    create: { width: 60, height: 30, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

async function sizeOf(bytes: Uint8Array): Promise<{ width?: number; height?: number }> {
  const { default: sharp } = await import('sharp');
  const { width, height } = await sharp(bytes).metadata();
  return { width, height };
}

describe('transformsFor', () => {
  it('rotates only the FIRST Karavan photo', () => {
    expect(transformsFor('karavanrug', 0)).toContain('rotate90');
    expect(transformsFor('karavanrug', 1)).toEqual([]);
    expect(transformsFor('karavanrug', 7)).toEqual([]);
  });

  it('never rotates ecarpetgallery — only Karavan sends them the wrong way up', () => {
    expect(transformsFor('ecarpetgallery', 0)).not.toContain('rotate90');
  });

  it('asks for background removal on both suppliers first image', () => {
    expect(transformsFor('karavanrug', 0)).toContain('removeBackground');
    expect(transformsFor('ecarpetgallery', 0)).toContain('removeBackground');
  });

  it('leaves owned stock and unknown suppliers completely alone', () => {
    expect(transformsFor('', 0)).toEqual([]);
    expect(transformsFor('somewhere-else', 0)).toEqual([]);
  });
});

describe('rotate90', () => {
  it('actually turns the image a quarter turn', async () => {
    const before = await landscapePng();
    expect(await sizeOf(before)).toMatchObject({ width: 60, height: 30 });
    const after = await rotate90(before);
    // 60×30 landscape becomes 30×60 portrait. This is the whole point of the feature.
    expect(await sizeOf(after)).toMatchObject({ width: 30, height: 60 });
  });
});

describe('removeBackground', () => {
  it('is a no-op today, and says so by returning the very same bytes', async () => {
    // The owner chose to skip it (2026-09-13). Returning the input unchanged — rather than throwing
    // — is what keeps the pipeline a no-op instead of a broken step.
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await removeBackground(bytes)).toBe(bytes);
  });
});

describe('applyTransforms', () => {
  it('rotates the primary Karavan photo and reports what it did', async () => {
    const bytes = await landscapePng();
    const out = await applyTransforms(
      { bytes, contentType: 'image/png' },
      { supplier: 'karavanrug', index: 0 },
    );
    expect(out.applied).toEqual(['rotate90']);
    expect(out.skipped).toBeUndefined();
    expect(await sizeOf(out.bytes)).toMatchObject({ width: 30, height: 60 });
  });

  it('does not claim removeBackground ran while it is a no-op', async () => {
    const bytes = await landscapePng();
    const out = await applyTransforms(
      { bytes, contentType: 'image/png' },
      { supplier: 'karavanrug', index: 0 },
    );
    // transformsFor asks for it; applyTransforms must not report work that did not happen.
    expect(transformsFor('karavanrug', 0)).toContain('removeBackground');
    expect(out.applied).not.toContain('removeBackground');
  });

  it('passes a non-primary photo straight through, untouched and un-re-encoded', async () => {
    const bytes = await landscapePng();
    const out = await applyTransforms(
      { bytes, contentType: 'image/png' },
      { supplier: 'karavanrug', index: 2 },
    );
    expect(out.applied).toEqual([]);
    expect(out.bytes).toBe(bytes); // the same object: nothing was decoded or re-encoded
  });

  it('passes an ecarpetgallery primary through unchanged, since only removal was asked for', async () => {
    const bytes = await landscapePng();
    const out = await applyTransforms(
      { bytes, contentType: 'image/png' },
      { supplier: 'ecarpetgallery', index: 0 },
    );
    expect(out.applied).toEqual([]);
    expect(await sizeOf(out.bytes)).toMatchObject({ width: 60, height: 30 });
  });

  it('keeps the original when the format cannot be transformed, rather than failing the import', async () => {
    const bytes = new Uint8Array([0, 1, 2]);
    const out = await applyTransforms(
      { bytes, contentType: 'image/gif' },
      { supplier: 'karavanrug', index: 0 },
    );
    expect(out.bytes).toBe(bytes);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toMatch(/image\/gif/);
  });

  it('keeps the original when the bytes are not a decodable image', async () => {
    // A photo that cannot be rotated is still a photo the studio wants in Drive.
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const out = await applyTransforms(
      { bytes, contentType: 'image/png' },
      { supplier: 'karavanrug', index: 0 },
    );
    expect(out.bytes).toBe(bytes);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toBeTruthy();
  });

  it('reads the content type with its parameters attached', async () => {
    const bytes = await landscapePng();
    const out = await applyTransforms(
      { bytes, contentType: 'image/png; charset=binary' },
      { supplier: 'karavanrug', index: 0 },
    );
    expect(out.applied).toEqual(['rotate90']);
  });
});
