// Opt-in live test against the development spreadsheet (`npm run test:live`).
// Skips unless .env is present with GOOGLE_SHEET_ID and credentials for the configured auth mode.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SheetsClient } from '../../src/lib/sheets/client.ts';
import { authFromEnv, sheetIdFromEnv } from '../../src/lib/sheets/config.ts';
import { silentLogger } from '../../src/lib/sheets/errors.ts';
import { runRoundTrip } from '../../scripts/lib/roundtrip.ts';

function liveEnv(): Record<string, string | undefined> | null {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return null;
  try {
    process.loadEnvFile(envPath);
  } catch {
    return null;
  }
  const env = process.env;
  if (!env.GOOGLE_SHEET_ID) return null;
  const mode = env.GOOGLE_AUTH_MODE ?? 'service_account';
  if (mode === 'oauth_refresh' && !env.GOOGLE_OAUTH_REFRESH_TOKEN) return null;
  if (mode === 'service_account' && !env.GOOGLE_PRIVATE_KEY) return null;
  return env;
}

const env = liveEnv();

describe.skipIf(!env)('live: development spreadsheet round-trip', () => {
  it('reads every tab, inserts a literal vote row atomically, sees the formula recount, and undoes it', async () => {
    const client = new SheetsClient({
      spreadsheetId: sheetIdFromEnv(env!),
      auth: authFromEnv(env!),
      logger: silentLogger,
    });
    const lines: string[] = [];
    const result = await runRoundTrip(client, { log: (l) => lines.push(l) });
    console.log(lines.join('\n'));
    expect(result.literalCellOk).toBe(true);
    expect(result.recalcMs).not.toBeNull();
    expect(result.likesAfter).toBe(result.likesBefore + 1);
    expect(result.ok).toBe(true);
  });
});
