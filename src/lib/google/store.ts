// Where the refresh token lives once the owner has connected from /admin.
//
// `.env` is not the answer any more: a container has no writable `.env`, and a value read at boot
// cannot be replaced without a restart — which is exactly what made re-authorising painful. So the
// token is written to `DATA_DIR/google-oauth.json` with owner-only permissions, and the runtime
// re-reads it, so connecting in the browser takes effect on the next request.
//
// Precedence, deliberately: **the stored token wins over the environment variable.** The owner
// clicking Connect is a more recent statement of intent than a value baked into the image, and the
// alternative — an env var that silently overrides what the admin just did — is the kind of thing
// nobody debugs twice.
//
// With no `DATA_DIR` the store falls back to memory, which works until the process restarts. The
// admin says so rather than pretending otherwise.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface StoredGoogleAuth {
  refreshToken: string;
  scopes: string[];
  /** The Google account that consented, for display only. */
  account?: string;
  connectedAt: string;
  /** Stamped whenever an access token is successfully minted from this refresh token. */
  lastRefreshAt?: string;
}

export interface GoogleTokenStore {
  read(): StoredGoogleAuth | undefined;
  write(value: StoredGoogleAuth): void;
  clear(): void;
  /** Where the value lives, for the admin to show; undefined when it is memory-only. */
  readonly path?: string;
  readonly durable: boolean;
}

export const STORE_FILENAME = 'google-oauth.json';

function isStored(v: unknown): v is StoredGoogleAuth {
  const o = v as StoredGoogleAuth | null;
  return Boolean(o && typeof o.refreshToken === 'string' && o.refreshToken.length > 0);
}

/** Survives a restart. The file holds a credential, so it is written 0600 and never logged. */
export function fileStore(dataDir: string): GoogleTokenStore {
  const path = join(dataDir, STORE_FILENAME);
  let cache: StoredGoogleAuth | undefined;
  let cachedAt = 0;
  // A tiny window: the value changes about once a year, but a fresh read per request would mean a
  // stat on every sheet call.
  const TTL_MS = 2_000;
  return {
    path,
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
      mkdirSync(dirname(path), { recursive: true });
      // Write-then-rename so a crash mid-write cannot leave a truncated credential behind.
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

/** No DATA_DIR: the connection works now and is lost on restart. The admin warns about it. */
export function memoryStore(): GoogleTokenStore {
  let value: StoredGoogleAuth | undefined;
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

export function createTokenStore(dataDir: string | undefined): GoogleTokenStore {
  return dataDir ? fileStore(dataDir) : memoryStore();
}
