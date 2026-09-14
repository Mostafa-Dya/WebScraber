// The product commit (src/lib/drive/commit.ts) and the folder tree it uses. Brief §12.
//
// The behaviour under test is the failure behaviour: a half-finished import must leave a partial,
// retryable result rather than an exception, and the primary must be duplicated without a copy
// failure counting as a failed import.
import { describe, expect, it, vi } from 'vitest';
import { commitPhotos, photoName } from '../../../src/lib/drive/commit.ts';
import { productFolderName } from '../../../src/lib/drive/folder.ts';
import type { ProductFolders } from '../../../src/lib/drive/folder.ts';
import type { UploadResult } from '../../../src/lib/drive/types.ts';

const silent = { info: () => {}, warn: () => {}, error: () => {} };

const FOLDERS: ProductFolders = {
  productId: 'folder-product',
  allImagesId: 'folder-all-images',
  name: 'SL-021 — Winks',
  url: 'https://drive.google.com/drive/folders/folder-product',
};

/** A Drive stand-in whose every call is recorded. */
function fakeDrive(over: Partial<Record<'upload' | 'copy' | 'folders' | 'list', unknown>> = {}) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  let n = 0;
  return {
    calls,
    drive: {
      ensureProductFolders: vi.fn(async (...args: unknown[]) => {
        calls.push({ op: 'folders', args });
        if (typeof over.folders === 'function') return (over.folders as () => Promise<ProductFolders>)();
        return FOLDERS;
      }),
      uploadFromUrl: vi.fn(async (...args: unknown[]): Promise<UploadResult> => {
        calls.push({ op: 'upload', args });
        if (typeof over.upload === 'function') return (over.upload as (i: number) => UploadResult)(n++);
        n++;
        return { id: `file-${n}`, name: String(args[1]) };
      }),
      copyFile: vi.fn(async (...args: unknown[]): Promise<UploadResult> => {
        calls.push({ op: 'copy', args });
        if (typeof over.copy === 'function') return (over.copy as () => UploadResult)();
        return { id: 'copy-1', name: '01-primary' };
      }),
      listFolder: vi.fn(async (...args: unknown[]): Promise<Map<string, string>> => {
        calls.push({ op: 'list', args });
        if (typeof over.list === 'function') return (over.list as () => Promise<Map<string, string>>)();
        return new Map();
      }),
    },
  };
}

describe('productFolderName', () => {
  it('leads with the id so the folder list sorts by it', () => {
    expect(productFolderName('SL-021', 'Winks')).toBe('SL-021 — Winks');
  });

  it('replaces characters Drive dislikes rather than dropping them', () => {
    // Two rugs whose names differ only in punctuation must not collapse onto one folder.
    expect(productFolderName('SL-1', 'A/B')).toBe('SL-1 — A-B');
    expect(productFolderName('SL-1', 'A:B')).toBe('SL-1 — A-B');
    expect(productFolderName('SL-1', '  spaced   out  ')).toBe('SL-1 — spaced out');
  });

  it('falls back to the id alone when there is no usable name', () => {
    expect(productFolderName('SL-021', '')).toBe('SL-021');
    expect(productFolderName('', '')).toBe('unknown');
  });

  it('caps a very long name so the folder name stays usable', () => {
    expect(productFolderName('SL-1', 'x'.repeat(200))).toHaveLength('SL-1 — '.length + 80);
  });
});

describe('photoName', () => {
  it('numbers the files so the folder sorts in the studio’s order, primary first', () => {
    expect(photoName('winks', 0, true)).toBe('01-primary');
    expect(photoName('winks', 1, false)).toBe('winks-02');
    expect(photoName('winks', 9, false)).toBe('winks-10');
  });
});

describe('commitPhotos', () => {
  it('creates the folders, uploads into All Images in order, and duplicates the primary', async () => {
    const { drive, calls } = fakeDrive();
    const out = await commitPhotos(
      {
        productId: 'SL-021',
        productName: 'Winks',
        urls: ['https://s/a.jpg', 'https://s/b.jpg'],
        namePrefix: 'winks',
      },
      { drive, logger: silent },
    );
    expect(out.complete).toBe(true);
    expect(out.ids).toEqual(['file-1', 'file-2']);
    expect(out.folders).toEqual(FOLDERS);

    // Folders first, then each upload into All Images, with the primary copied up.
    expect(calls.map((c) => c.op)).toEqual(['folders', 'upload', 'copy', 'upload']);
    // The 4th argument carries the per-supplier first-image fixes (owner, 2026-09-13): the index
    // is what makes "first image" mean the primary rather than whichever photo uploads first.
    expect(calls[1]?.args).toEqual([
      'https://s/a.jpg',
      '01-primary',
      'folder-all-images',
      { supplier: '', index: 0 },
    ]);
    expect(calls[2]?.args).toEqual(['file-1', '01-primary', 'folder-product']);
    expect(calls[3]?.args).toEqual([
      'https://s/b.jpg',
      'winks-02',
      'folder-all-images',
      { supplier: '', index: 1 },
    ]);
  });

  it('keeps going past one bad photo and reports it as incomplete', async () => {
    const { drive } = fakeDrive({
      upload: (i: number) =>
        i === 1 ? { error: 'download_failed', detail: '404' } : { id: `file-${i + 1}`, name: 'x' },
    });
    const out = await commitPhotos(
      { productId: 'SL-021', productName: 'Winks', urls: ['a', 'b', 'c'], namePrefix: 'w' },
      { drive, logger: silent },
    );
    // Two of three landed: the row stays pending and a retry can finish it.
    expect(out.ids).toEqual(['file-1', 'file-3']);
    expect(out.complete).toBe(false);
    expect(out.photos[1]).toMatchObject({ url: 'b', error: 'download_failed', detail: '404' });
    expect(out.photos[0]?.id).toBe('file-1');
  });

  it('treats a failed duplicate as cosmetic: the photo is stored, so the import stands', async () => {
    const { drive } = fakeDrive({ copy: () => ({ error: 'upload_failed', detail: 'nope' }) });
    const out = await commitPhotos(
      { productId: 'SL-021', productName: 'Winks', urls: ['a'], namePrefix: 'w' },
      { drive, logger: silent },
    );
    expect(out.complete).toBe(true);
    expect(out.ids).toEqual(['file-1']);
  });

  it('uploads nothing when the folders cannot be made, and says why', async () => {
    const { drive, calls } = fakeDrive({
      folders: async () => {
        throw new Error('Drive refused');
      },
    });
    const out = await commitPhotos(
      { productId: 'SL-021', productName: 'Winks', urls: ['a', 'b'], namePrefix: 'w' },
      { drive, logger: silent },
    );
    expect(out.complete).toBe(false);
    expect(out.ids).toEqual([]);
    expect(out.folderError).toMatch(/Drive refused/);
    // Every url is reported, so the admin can show which photos did not make it.
    expect(out.photos.map((p) => p.error)).toEqual(['folder_failed', 'folder_failed']);
    expect(calls.filter((c) => c.op === 'upload')).toHaveLength(0);
  });

  it('an empty list is not a complete commit', async () => {
    const { drive } = fakeDrive();
    const out = await commitPhotos(
      { productId: 'SL-021', productName: 'Winks', urls: [], namePrefix: 'w' },
      { drive, logger: silent },
    );
    expect(out.complete).toBe(false);
    expect(out.ids).toEqual([]);
  });
});

describe('commitPhotos — retry (reuseExisting)', () => {
  const input = {
    productId: 'SL-021',
    productName: 'Winks',
    urls: ['a', 'b', 'c'],
    namePrefix: 'winks',
    reuseExisting: true,
  };

  it('does not list the folder on a first import', async () => {
    const { drive, calls } = fakeDrive();
    await commitPhotos({ ...input, reuseExisting: false }, { drive, logger: silent });
    expect(calls.some((c) => c.op === 'list')).toBe(false);
  });

  it('skips the photos already in All Images and uploads only the rest', async () => {
    // A previous run got the first two up before it died.
    const { drive, calls } = fakeDrive({
      list: async () =>
        new Map([
          ['01-primary', 'old-1'],
          ['winks-02', 'old-2'],
        ]),
    });
    const out = await commitPhotos(input, { drive, logger: silent });

    expect(calls.filter((c) => c.op === 'upload')).toHaveLength(1);
    expect(calls.find((c) => c.op === 'upload')?.args).toEqual([
      'c',
      'winks-03',
      'folder-all-images',
      { supplier: '', index: 2 },
    ]);
    // The reused ids still count towards the row, so the import can complete.
    expect(out.ids).toEqual(['old-1', 'old-2', 'file-1']);
    expect(out.complete).toBe(true);
    expect(out.photos[0]).toMatchObject({ url: 'a', id: 'old-1', name: '01-primary', reused: true });
    expect(out.photos[2]?.reused).toBeUndefined();
  });

  it('is a no-op the second time: everything is already there, so nothing uploads or copies', async () => {
    const { drive, calls } = fakeDrive({
      list: async () =>
        new Map([
          ['01-primary', 'old-1'],
          ['winks-02', 'old-2'],
          ['winks-03', 'old-3'],
        ]),
    });
    const out = await commitPhotos(input, { drive, logger: silent });
    expect(out.complete).toBe(true);
    expect(out.ids).toEqual(['old-1', 'old-2', 'old-3']);
    expect(calls.map((c) => c.op)).toEqual(['folders', 'list']);
  });

  it('re-uploads rather than refusing when the folder cannot be listed', async () => {
    // A duplicate is a smaller problem than a retry button that does not work.
    const { drive, calls } = fakeDrive({
      list: async () => {
        throw new Error('rate limited');
      },
    });
    const out = await commitPhotos(input, { drive, logger: silent });
    expect(out.complete).toBe(true);
    expect(calls.filter((c) => c.op === 'upload')).toHaveLength(3);
  });
});
