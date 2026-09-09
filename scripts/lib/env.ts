// Script-side helpers: .env is loaded by `node --env-file=.env`; this only edits it.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ENV_PATH = resolve(process.cwd(), '.env');

/** Values we ever write (sheet ids, refresh tokens, mode names) are url-safe; refuse anything else. */
const SAFE_VALUE = /^[A-Za-z0-9_\-./]+$/;

export function upsertEnv(key: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`refusing to write .env key "${key}"`);
  if (!SAFE_VALUE.test(value))
    throw new Error(`refusing to write ${key}: value contains unexpected characters`);
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx >= 0) lines[idx] = entry;
  else lines.push(entry);
  writeFileSync(ENV_PATH, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  try {
    chmodSync(ENV_PATH, 0o600); // no-op on Windows
  } catch {
    /* ignore */
  }
}

export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const hash = value.indexOf(' #');
    if (hash >= 0 && !value.startsWith('"') && !value.startsWith("'")) value = value.slice(0, hash).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? 'true' : undefined;
}
