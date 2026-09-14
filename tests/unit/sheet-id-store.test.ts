// Where a STUDIO-created spreadsheet's id lives (src/lib/sheets/id-store.ts).
//
// `GOOGLE_SHEET_ID` is an astro:env variable and read-only at runtime — fine when a developer runs
// `npm run sheet:init` and pastes the id into .env before deploying, useless when the person setting
// the site up is the client, pressing a button on a server that cannot write its own environment.
//
// The failure this guards against is specific and expensive: if the id is NOT durable, the next
// restart shows "no catalogue yet", the studio presses the button again, and their first sheet is
// orphaned in Drive with their data in it. That is why the provisioning endpoint refuses to run
// against a memory store rather than quietly accepting one.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSheetIdStore, memoryStore } from '../../src/lib/sheets/id-store.ts';

const dirs: string[] = [];
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'sl-sheet-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const ID = '1BxiMVs0XRA5nFMdKvBd_2ndoxjSHrZ7bL3fDqLuvz9A';

describe('the sheet id store', () => {
  it('survives a restart — the whole reason it exists', () => {
    const dir = tempDir();
    createSheetIdStore(dir).write({ id: ID, createdAt: '2026-09-14T10:00:00Z' });
    // A brand new store object, as a restarted process would build.
    expect(createSheetIdStore(dir).read()?.id).toBe(ID);
  });

  it('reports whether it is durable, so the admin can refuse to provision', () => {
    expect(createSheetIdStore(tempDir()).durable).toBe(true);
    expect(createSheetIdStore(undefined).durable).toBe(false);
    expect(memoryStore().durable).toBe(false);
  });

  it('remembers nothing across processes without a data directory', () => {
    const a = memoryStore();
    a.write({ id: ID, createdAt: '2026-09-14T10:00:00Z' });
    expect(a.read()?.id).toBe(ID);
    expect(memoryStore().read()).toBeUndefined();
  });

  it('refuses to write an id that is not a spreadsheet id', () => {
    const store = createSheetIdStore(tempDir());
    expect(() => store.write({ id: 'nope', createdAt: '2026-09-14T10:00:00Z' })).toThrow();
    expect(() => store.write({ id: '../../etc/passwd', createdAt: 'x' })).toThrow();
    expect(store.read()).toBeUndefined();
  });

  it('treats a corrupt or truncated file as "no sheet" rather than throwing', () => {
    // A half-written file must not take the whole admin down; it reads as absent and the studio is
    // offered the button again. Write-then-rename makes this rare, not impossible.
    const dir = tempDir();
    writeFileSync(join(dir, 'sheet.json'), '{"id": "1Bx');
    expect(createSheetIdStore(dir).read()).toBeUndefined();
  });

  it('ignores a file whose id would not survive the round trip', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'sheet.json'), JSON.stringify({ id: '!!', createdAt: 'x' }));
    expect(createSheetIdStore(dir).read()).toBeUndefined();
  });

  it('keeps the account that owns it, so the admin can say whose Drive it is in', () => {
    const dir = tempDir();
    createSheetIdStore(dir).write({
      id: ID,
      createdAt: '2026-09-14T10:00:00Z',
      createdBy: 'studio@serioludere.com',
    });
    expect(createSheetIdStore(dir).read()?.createdBy).toBe('studio@serioludere.com');
    expect((JSON.parse(readFileSync(join(dir, 'sheet.json'), 'utf8')) as { id: string }).id).toBe(ID);
  });

  it('clears without deleting the file', () => {
    const dir = tempDir();
    const store = createSheetIdStore(dir);
    store.write({ id: ID, createdAt: '2026-09-14T10:00:00Z' });
    store.clear();
    expect(store.read()).toBeUndefined();
    expect(createSheetIdStore(dir).read()).toBeUndefined();
  });
});
