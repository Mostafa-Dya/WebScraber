// robots.txt (brief §11: "respect robots.txt"). Parsing follows RFC 9309: groups keyed by
// `User-agent`, `Allow`/`Disallow` paths with `*` and `$`, the longest matching pattern wins and a
// tie goes to Allow. `/robots.txt` is fetched once per host through the same guarded fetch layer as
// every other outbound request (docs/ADMIN_SPEC.md §4.3, §4.5) and the parsed rules are cached in
// memory for an hour. A robots.txt that 404s, errors or is unreadable means "allowed".
import { silentLogger, type Logger } from '../sheets/errors.ts';
import { fetchText, toScrapeError, type FetchTextOptions } from './fetch.ts';
import type { TransportClient } from './types.ts';

export const ROBOTS_TTL_MS = 60 * 60_000;
export const ROBOTS_MAX_BYTES = 512 * 1024;
export const ROBOTS_MAX_HOSTS = 100;

/** robots.txt is `text/plain`; a few stores serve it as HTML or octet-stream. */
export const ROBOTS_ACCEPT: readonly string[] = [
  'text/plain',
  'text/html',
  'application/octet-stream',
  'text/x-robots',
];

/**
 * The token our group is matched on. We present a browser User-Agent (§4.3), so in practice the
 * applicable group is the catch-all `*`; the resolver still honours a named group if a store ever
 * addresses one of these tokens.
 */
export const ROBOTS_AGENT_TOKENS: readonly string[] = ['serioludere', '*'];

export interface RobotsRule {
  allow: boolean;
  /** The raw path pattern, `*` and a trailing `$` included. */
  pattern: string;
}

export interface RobotsGroup {
  /** Lowercased user-agent tokens this group addresses. */
  agents: string[];
  rules: RobotsRule[];
}

export interface RobotsRules {
  /** The agent token whose group was selected ('*' for the catch-all, '' when nothing matched). */
  agent: string;
  rules: RobotsRule[];
}

/** No robots.txt, an error, or an empty file: everything is allowed. */
export const ALLOW_ALL: RobotsRules = { agent: '', rules: [] };

/** Splits a robots.txt into its `User-agent` groups. Comments and unknown fields are ignored. */
export function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  /** A run of consecutive `User-agent` lines addresses one group. */
  let agentRun = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0]?.trim() ?? '';
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !agentRun) {
        current = { agents: [], rules: [] };
        groups.push(current);
        agentRun = true;
      }
      if (value) current.agents.push(value.toLowerCase());
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    agentRun = false;
    if (!current) continue;
    // "Disallow:" with an empty value means "nothing is disallowed" — it contributes no rule.
    if (!value) continue;
    current.rules.push({ allow: field === 'allow', pattern: value });
  }
  return groups.filter((g) => g.agents.length > 0);
}

/** Picks the group for our tokens: an exact token match first (longest wins), else `*`. */
export function rulesFor(
  groups: readonly RobotsGroup[],
  tokens: readonly string[] = ROBOTS_AGENT_TOKENS,
): RobotsRules {
  const wanted = tokens.map((t) => t.toLowerCase());
  let best: { agent: string; rank: number; rules: RobotsRule[] } | undefined;
  for (const group of groups) {
    for (const agent of group.agents) {
      const rank = wanted.indexOf(agent);
      if (rank < 0) continue;
      // Earlier token in the list = more specific; merge groups that address the same token.
      if (!best || rank < best.rank) best = { agent, rank, rules: [...group.rules] };
      else if (best.agent === agent) best.rules.push(...group.rules);
    }
  }
  return best ? { agent: best.agent, rules: best.rules } : ALLOW_ALL;
}

/** robots.txt text → the rules that apply to us. */
export function parseRobots(text: string, tokens: readonly string[] = ROBOTS_AGENT_TOKENS): RobotsRules {
  return rulesFor(parseRobotsGroups(text), tokens);
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

/** The pattern's specificity when it matches `path` (its length in characters), else undefined. */
export function patternMatch(pattern: string, path: string): number | undefined {
  if (!pattern) return undefined;
  try {
    return patternToRegExp(pattern).test(path) ? pattern.length : undefined;
  } catch {
    return undefined;
  }
}

/** RFC 9309 §2.2.2: the longest matching pattern decides; a tie goes to Allow. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const target = path.startsWith('/') ? path : `/${path}`;
  let best: { length: number; allow: boolean } | undefined;
  for (const rule of rules.rules) {
    const length = patternMatch(rule.pattern, target);
    if (length === undefined) continue;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}

interface CachedRobots {
  rules: RobotsRules;
  at: number;
}

/** Per-host cache of the parsed rules: 1 h TTL, at most 100 hosts (least recently used out first). */
export class RobotsCache {
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CachedRobots>();

  constructor(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? ROBOTS_TTL_MS;
    this.max = options.maxEntries ?? ROBOTS_MAX_HOSTS;
    this.now = options.now ?? Date.now;
  }

  get(host: string): RobotsRules | undefined {
    const key = host.toLowerCase();
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.rules;
  }

  set(host: string, rules: RobotsRules): void {
    const key = host.toLowerCase();
    this.entries.delete(key);
    this.entries.set(key, { rules, at: this.now() });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** The process-wide robots cache used by `scrapeRug` unless a caller supplies its own. */
export const defaultRobotsCache = new RobotsCache();

export interface RobotsCheckOptions {
  cache?: RobotsCache;
  /** Which client fetches `/robots.txt` — the same one that will fetch the page. */
  client?: TransportClient;
  /** Passed straight to `fetchText`; the transport, signal and deadlines come from the scrape. */
  fetchOpts?: Omit<FetchTextOptions, 'kind' | 'allowHosts' | 'accept' | 'maxBytes'>;
  tokens?: readonly string[];
  logger?: Logger;
}

export interface RobotsVerdict {
  allowed: boolean;
  /** Why, for the log and the `blocked` message. */
  reason: 'allowed' | 'disallowed' | 'no-robots' | 'unreadable';
  rules: RobotsRules;
  cached: boolean;
}

/**
 * Fetches (once per host, then from cache) and evaluates `/robots.txt` for `target`. Never throws:
 * a 404, a non-2xx, a transport failure or an unreadable body all mean "allowed".
 */
export async function robotsAllows(target: string, opts: RobotsCheckOptions = {}): Promise<RobotsVerdict> {
  const logger = opts.logger ?? silentLogger;
  const cache = opts.cache ?? defaultRobotsCache;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { allowed: true, reason: 'unreadable', rules: ALLOW_ALL, cached: false };
  }
  const host = url.hostname.toLowerCase();
  const path = `${url.pathname}${url.search}`;
  const hit = cache.get(host);
  if (hit) return { allowed: isPathAllowed(hit, path), reason: verdict(hit, path), rules: hit, cached: true };

  let rules = ALLOW_ALL;
  let reason: RobotsVerdict['reason'] = 'no-robots';
  try {
    const res = await fetchText(`https://${host}/robots.txt`, opts.client ?? 'undici', {
      ...opts.fetchOpts,
      kind: 'html',
      allowHosts: [host],
      accept: ROBOTS_ACCEPT,
      maxBytes: ROBOTS_MAX_BYTES,
    });
    if (res.status >= 400) {
      logger.info('robots.txt unavailable; treating the host as allowed', { host, status: res.status });
    } else {
      rules = parseRobots(res.body, opts.tokens);
      reason = 'allowed';
    }
  } catch (e) {
    // A robots.txt we cannot read is not a reason to refuse the owner's own product link.
    logger.info('robots.txt could not be read; treating the host as allowed', {
      host,
      message: toScrapeError(e).message,
    });
    reason = 'unreadable';
  }
  cache.set(host, rules);
  return { allowed: isPathAllowed(rules, path), reason: verdict(rules, path, reason), rules, cached: false };
}

function verdict(
  rules: RobotsRules,
  path: string,
  fallback: RobotsVerdict['reason'] = 'allowed',
): RobotsVerdict['reason'] {
  if (!isPathAllowed(rules, path)) return 'disallowed';
  return rules.rules.length ? 'allowed' : fallback;
}
