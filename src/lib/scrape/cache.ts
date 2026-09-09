// In-process scrape result cache (docs/ADMIN_SPEC.md §4.3): keyed by the normalised outbound URL,
// 15-minute TTL, at most 100 entries (least recently used out first). Stores the raw scrape only —
// pricing (markup, rates, rounding) is re-derived on every call so a Settings change shows at once.
import type { ScrapeVia, ScrapedRug } from './types.ts';

export const SCRAPE_CACHE_TTL_MS = 15 * 60_000;
export const SCRAPE_CACHE_MAX = 100;

export interface CachedScrape {
  data: ScrapedRug;
  via: ScrapeVia;
  /** Epoch ms of the fetch. */
  at: number;
}

export class ScrapeCache {
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CachedScrape>();

  constructor(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? SCRAPE_CACHE_TTL_MS;
    this.max = options.maxEntries ?? SCRAPE_CACHE_MAX;
    this.now = options.now ?? Date.now;
  }

  get(key: string): CachedScrape | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency (Map keeps insertion order).
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  set(key: string, value: { data: ScrapedRug; via: ScrapeVia }): void {
    this.entries.delete(key);
    this.entries.set(key, { data: value.data, via: value.via, at: this.now() });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** The process-wide cache used by `scrapeRug` unless a caller supplies its own. */
export const defaultScrapeCache = new ScrapeCache();
