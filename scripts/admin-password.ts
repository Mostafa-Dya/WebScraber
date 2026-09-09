// Derives ADMIN_PASSWORD_HASH for the admin panel (docs/ADMIN_SPEC.md §9.2).
//
//   npm run admin:password             prompt (echo off), print ADMIN_PASSWORD_HASH=scrypt.131072.8.1.<salt>.<key>
//   npm run admin:password -- --write  also store it in .env (upsertEnv)
//   echo 'p@ss…' | npm run admin:password   piped: the whole stdin (trailing newline stripped) is the password
//
// The password never leaves the process: nothing is logged but the hash. Requires ≥ 12 characters.
import { createInterface } from 'node:readline';
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../src/lib/admin/auth.ts';
import { flag, upsertEnv } from './lib/env.ts';

const CTRL_C = '\u0003';
const DEL = '\u007f';

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

/** Interactive prompt with echo disabled (raw mode); Ctrl+C aborts. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;
    output.write(prompt);
    const rl = createInterface({ input, terminal: true });
    let value = '';
    const cleanup = (): void => {
      input.setRawMode?.(false);
      input.removeListener('data', onData);
      rl.close();
      output.write('\n');
    };
    const onData = (buf: Buffer): void => {
      const s = buf.toString('utf8');
      for (const ch of s) {
        if (ch === CTRL_C) {
          cleanup();
          reject(new Error('aborted'));
          return;
        }
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === DEL || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    input.setRawMode?.(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main(): Promise<void> {
  const password = process.stdin.isTTY
    ? await readHidden('Admin password (not echoed): ')
    : await readPiped();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`the password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (process.stdin.isTTY) {
    const again = await readHidden('Repeat it: ');
    if (again !== password) throw new Error('the two entries differ');
  }
  const started = Date.now();
  const hash = hashPassword(password);
  const ms = Date.now() - started;
  if (!verifyPassword(hash, password)) throw new Error('self-check failed');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.error(`(scrypt N=2^17 r=8 p=1, derived in ${ms} ms; verification costs the same on every login)`);
  if (flag('write') === 'true') {
    upsertEnv('ADMIN_PASSWORD_HASH', hash);
    console.error(
      'Wrote ADMIN_PASSWORD_HASH to .env. Set ADMIN_SESSION_SECRET (≥ 32 chars) as well to enable /admin.',
    );
  } else {
    console.error(
      'Add it to .env (or re-run with --write). ADMIN_SESSION_SECRET (≥ 32 chars) is needed too.',
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
