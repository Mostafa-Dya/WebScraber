// One-time OAuth consent helper for GOOGLE_AUTH_MODE=oauth_refresh (development).
//
//   npm run google:auth                   start the local callback server and print the consent URL
//   npm run google:auth -- --print-url    only print the URL for the currently pending flow
//   npm run google:auth -- --no-drive     request a sheets-only token (no photo import, ADMIN_SPEC §5.1)
//
// Web-server flow with PKCE (S256) and a random state, both kept in .oauth-state while a flow is
// pending (so --print-url can reproduce the URL); the file is removed on success, timeout or Ctrl-C
// and ignored when older than the timeout. The authorization code is exchanged with plain fetch and
// GOOGLE_OAUTH_REFRESH_TOKEN is written into .env. Nothing secret is ever printed.
//
// Scopes: `spreadsheets` always, plus `drive.file` (the app sees only files it created) so the admin
// can save supplier photos to Drive. A refresh can never add a scope (RFC 6749 §6), so widening the
// scope means re-running this script; `include_granted_scopes=true` keeps earlier grants on the token.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { readEnvFile, upsertEnv } from './lib/env.ts';

const PORT = Number(process.env.OAUTH_CALLBACK_PORT ?? 53682);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2/callback`;
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const NO_DRIVE = process.argv.includes('--no-drive');
const SCOPES = NO_DRIVE ? [SHEETS_SCOPE] : [SHEETS_SCOPE, DRIVE_FILE_SCOPE];
const STATE_FILE = process.env.OAUTH_STATE_FILE ?? resolve(process.cwd(), '.oauth-state');
const TIMEOUT_MS = Number(process.env.OAUTH_TIMEOUT_MIN ?? 20) * 60 * 1000;

interface PendingFlow {
  state: string;
  verifier: string;
  createdAt: number;
}

function loadOrCreateFlow(): PendingFlow {
  if (existsSync(STATE_FILE)) {
    try {
      const fresh = Date.now() - statSync(STATE_FILE).mtimeMs < TIMEOUT_MS;
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<PendingFlow>;
      if (fresh && typeof data.state === 'string' && typeof data.verifier === 'string') {
        return { state: data.state, verifier: data.verifier, createdAt: data.createdAt ?? Date.now() };
      }
    } catch {
      /* fall through: regenerate */
    }
  }
  const flow: PendingFlow = {
    state: randomBytes(16).toString('hex'),
    verifier: randomBytes(32).toString('base64url'),
    createdAt: Date.now(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(flow), { mode: 0o600 });
  return flow;
}

function clearFlow(): void {
  try {
    unlinkSync(STATE_FILE);
  } catch {
    /* ignore */
  }
}

const fileEnv = readEnvFile();
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? fileEnv.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? fileEnv.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in .env');
  process.exit(1);
}

const flow = loadOrCreateFlow();
const challenge = createHash('sha256').update(flow.verifier).digest('base64url');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
  state: flow.state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

if (process.argv.includes('--print-url')) {
  console.log(authUrl.toString());
  process.exit(0);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2/callback') {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end(`Google returned an error: ${error}`);
    console.error(`Consent failed: ${error}`);
    return;
  }
  const code = url.searchParams.get('code');
  const gotState = url.searchParams.get('state');
  if (!code || gotState !== flow.state) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('state mismatch or missing code');
    console.error('State mismatch or missing code; ignoring callback');
    return;
  }
  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await r.json()) as TokenResponse;
    if (!r.ok || !json.refresh_token) {
      throw new Error(
        `token exchange failed: ${json.error ?? r.status} ${json.error_description ?? ''} ` +
          '(no refresh_token in the response; the consent screen must grant offline access)',
      );
    }
    upsertEnv('GOOGLE_OAUTH_REFRESH_TOKEN', json.refresh_token);
    upsertEnv('GOOGLE_AUTH_MODE', 'oauth_refresh');
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end('<p>Done. The refresh token was saved to <code>.env</code>. You can close this tab.</p>');
    const granted = (json.scope ?? '').split(/\s+/).filter(Boolean);
    console.log(`Refresh token saved to .env (granted scope: ${json.scope ?? 'unknown'})`);
    if (!granted.includes(SHEETS_SCOPE)) {
      console.warn(
        'Warning: the spreadsheets scope was not granted; the site cannot read the sheet with this token.',
      );
    }
    if (!NO_DRIVE && !granted.includes(DRIVE_FILE_SCOPE)) {
      console.warn(
        'Warning: the drive.file scope was not granted (unticked on the consent screen?). Photo import stays disabled; re-run `npm run google:auth` and allow both permissions, or use --no-drive on purpose.',
      );
    } else if (NO_DRIVE) {
      console.log(
        'Sheets-only token (--no-drive): photo import to Drive is disabled until you re-consent without the flag.',
      );
    } else {
      console.log(
        'Drive photo import is authorised. Copy the new GOOGLE_OAUTH_REFRESH_TOKEN to production too (SHEET_SETUP §6).',
      );
    }
    clearFlow();
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 300);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.writeHead(500, { 'content-type': 'text/plain' }).end(msg);
    console.error(msg);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    // The redirect URI registered in Google Cloud pins this port, so it cannot simply move.
    console.error(
      [
        `Port ${PORT} is busy: an earlier "npm run google:auth" is probably still waiting for the callback.`,
        'Either open the link that run printed, or stop it (close its terminal, or in PowerShell:',
        `  Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }`,
        ') and run this command again.',
      ].join('\n'),
    );
    clearFlow();
    process.exit(3);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Waiting for the Google consent callback on ${REDIRECT_URI}`);
  console.log('Open this URL in a browser signed in to the development Google account:');
  console.log(authUrl.toString());
});

const timer = setTimeout(() => {
  console.error(
    `Timed out waiting for consent (${TIMEOUT_MS / 60000} minutes). Run \`npm run google:auth\` again.`,
  );
  clearFlow();
  process.exit(2);
}, TIMEOUT_MS);
timer.unref();

process.on('SIGINT', () => {
  clearFlow();
  process.exit(130);
});
