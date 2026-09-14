// Where the catalogue spreadsheet's id lives when the STUDIO created it, rather than a developer.
//
// `GOOGLE_SHEET_ID` is an astro:env variable, which is read-only at runtime — fine when a developer
// runs `npm run sheet:init` locally and pastes the id into `.env` before deploying. It is no use at
// all when the person setting the site up is the client: they connect Google from `/admin/google`,
// press one button, and the sheet is created in their own Drive. That id has to be remembered
// somewhere the running server can write.
//
// So: the same shape as the Google token store next door (write-then-rename, 0600, small read cache),
// for the same reason — it is a value the server learns after it started.
//
// PRECEDENCE. The env variable still wins. A deployment that pins `GOOGLE_SHEET_ID` is making a
// deliberate statement about which sheet is live, and a button in the admin must not quietly move
// the site to a different one.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A spreadsheet id as Google issues them: 40-odd URL-safe characters. */
const ID_RE = /^[A-Za-z0-9_-]{20,120}$/;

export interface StoredSheet {
  id: string;
  /** ISO timestamp, for the admin to show "created 3 April". Never used for logic. */
  createdAt: string;
  /** The account that owns it, so the admin can say whose Drive it is in. */
  createdBy?: string;
}

export interface SheetIdStore {
  /** False when there is no DATA_DIR: the id survives until the process restarts and no longer. */
  durable: boolean;
  read(): StoredSheet | undefined;
  write(value: StoredSheet): void;
  clear(): void;
}

function isStored(v: unknown): v is StoredSheet {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && ID_RE.test(o.id) && typeof o.createdAt === 'string';
}

const TTL_MS = 5_000;

function fileStore(dataDir: string): SheetIdStore {
  const path = join(dataDir, 'sheet.json');
  let cache: StoredSheet | undefined;
  let cachedAt = 0;
  return {
    durable: true,
    read() {
      const now = Date.now();
      if (cache && now - cachedAt < TTL_MS) return cache;
      try {
        if (!existsSync(path)) {
          cache = undefined;
          cachedAt = now;
          return undefined;
        }
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        cache = isStored(parsed) ? parsed : undefined;
      } catch {
        cache = undefined;
      }
      cachedAt = now;
      return cache;
    },
    write(value) {
      if (!ID_RE.test(value.id)) throw new Error('sheet id store: refusing to write a malformed id');
      mkdirSync(dirname(path), { recursive: true });
      // Write-then-rename, so a crash mid-write cannot leave a truncated id behind — which would
      // read back as "no sheet" and invite the studio to create a second one.
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
      renameSync(tmp, path);
      try {
        chmodSync(path, 0o600);
      } catch {
        /* Windows and some volumes do not support this; the directory is the real boundary there. */
      }
      cache = value;
      cachedAt = Date.now();
    },
    clear() {
      try {
        if (existsSync(path)) writeFileSync(path, '{}', { mode: 0o600 });
      } catch {
        /* ignore */
      }
      cache = undefined;
      cachedAt = Date.now();
    },
  };
}

/**
 * No DATA_DIR. The id is remembered for this process only — so a restart would show the studio an
 * empty "no sheet yet" screen and invite them to create ANOTHER spreadsheet, leaving the first one
 * orphaned with their data in it. The provisioning endpoint refuses to run against this store for
 * exactly that reason; it exists so the rest of the code has something to talk to.
 */
export function memoryStore(): SheetIdStore {
  let value: StoredSheet | undefined;
  return {
    durable: false,
    read: () => value,
    write: (v) => {
      value = v;
    },
    clear: () => {
      value = undefined;
    },
  };
}

export function createSheetIdStore(dataDir: string | undefined): SheetIdStore {
  return dataDir ? fileStore(dataDir) : memoryStore();
}
