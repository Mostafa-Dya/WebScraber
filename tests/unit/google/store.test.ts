// Where the refresh token lives (src/lib/google/store.ts). The file store is what makes a
// connection survive a restart; the memory store is the honest fallback when there is nowhere to
// write, and the admin says so rather than pretending the connection is durable.
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STORE_FILENAME,
  createTokenStore,
  fileStore,
  memoryStore,
  type StoredGoogleAuth,
} from '../../../src/lib/google/store.ts';

const dirs: string[] = [];
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'sl-google-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const value = (over: Partial<StoredGoogleAuth> = {}): StoredGoogleAuth => ({
  refreshToken: 'rt-1',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  account: 'studio@example.com',
  connectedAt: '2026-09-09T10:00:00Z',
  ...over,
});

describe('fileStore', () => {
  it('round-trips through a file that survives a new store, which is the whole point', () => {
    const dir = tempDir();
    fileStore(dir).write(value());
    // A brand-new store, as if the process had restarted.
    expect(fileStore(dir).read()).toMatchObject({ refreshToken: 'rt-1', account: 'studio@example.com' });
  });

  it('reports its path and that it is durable', () => {
    const dir = tempDir();
    const s = fileStore(dir);
    expect(s.durable).toBe(true);
    expect(s.path).toBe(join(dir, STORE_FILENAME));
  });

  it('writes owner-only permissions, because the file holds a credential', () => {
    const dir = tempDir();
    const s = fileStore(dir);
    s.write(value());
    const mode = statSync(s.path!).mode & 0o777;
    // Windows does not implement POSIX modes; there the directory is the boundary.
    if (process.platform !== 'win32') expect(mode).toBe(0o600);
    // Whatever the platform, nothing but this file's own JSON is written.
    expect(JSON.parse(readFileSync(s.path!, 'utf8')).refreshToken).toBe('rt-1');
  });

  it('reads nothing rather than throwing on a corrupt or half-written file', () => {
    const dir = tempDir();
    const s = fileStore(dir);
    writeFileSync(join(dir, STORE_FILENAME), '{ not json');
    expect(s.read()).toBeUndefined();
    writeFileSync(join(dir, STORE_FILENAME), '{"scopes":[]}'); // no refresh token
    expect(fileStore(dir).read()).toBeUndefined();
  });

  it('reads nothing before anything has been written', () => {
    expect(fileStore(tempDir()).read()).toBeUndefined();
  });

  it('forgets on clear', () => {
    const dir = tempDir();
    const s = fileStore(dir);
    s.write(value());
    s.clear();
    expect(s.read()).toBeUndefined();
    expect(fileStore(dir).read()).toBeUndefined();
  });

  it('sees a write made through another handle within its short cache window', async () => {
    const dir = tempDir();
    const reader = fileStore(dir);
    expect(reader.read()).toBeUndefined();
    fileStore(dir).write(value({ refreshToken: 'rt-2' }));
    // The read cache is two seconds; a connection made in one request is picked up by the next.
    await new Promise((r) => setTimeout(r, 2100));
    expect(reader.read()?.refreshToken).toBe('rt-2');
  });
});

describe('memoryStore', () => {
  it('works for the life of the process and admits it is not durable', () => {
    const s = memoryStore();
    expect(s.durable).toBe(false);
    expect(s.path).toBeUndefined();
    s.write(value());
    expect(s.read()?.refreshToken).toBe('rt-1');
    s.clear();
    expect(s.read()).toBeUndefined();
  });
});

describe('createTokenStore', () => {
  it('picks the file store when DATA_DIR is set and memory when it is not', () => {
    expect(createTokenStore(tempDir()).durable).toBe(true);
    expect(createTokenStore(undefined).durable).toBe(false);
    expect(createTokenStore('').durable).toBe(false);
  });
});
