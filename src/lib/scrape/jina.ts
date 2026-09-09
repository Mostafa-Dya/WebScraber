// Keyless Jina Reader fallback (docs/ADMIN_SPEC.md §4.3): `GET https://r.jina.ai/<outbound url>` with
// `X-Return-Format: html` through the guarded undici client, fed to the same parsers. Never with an
// API key (an ECG page is ~1.4 MB ≈ 350k billed tokens); the free tier allows 20 requests per minute.
import { JINA_HOST } from './guard.ts';
import { fetchText, type FetchTextOptions } from './fetch.ts';
import type { FetchedText } from './types.ts';

export const JINA_BASE = 'https://r.jina.ai/';

export function jinaUrl(outbound: string): string {
  return `${JINA_BASE}${outbound}`;
}

/** Jina answers with `text/plain` even for the raw-HTML format, so that type is accepted here only. */
export const JINA_ACCEPT: readonly string[] = ['text/plain', 'text/html', 'application/json'];

export async function fetchViaJina(
  outbound: string,
  opts: Omit<FetchTextOptions, 'kind' | 'allowHosts' | 'accept' | 'maxHops'>,
): Promise<FetchedText> {
  const result = await fetchText(jinaUrl(outbound), 'undici', {
    ...opts,
    kind: 'html',
    allowHosts: [JINA_HOST],
    accept: JINA_ACCEPT,
    maxHops: 0,
    headers: { 'X-Return-Format': 'html', ...opts.headers },
  });
  return { ...result, via: 'jina' };
}
