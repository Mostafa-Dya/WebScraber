// Data cache (docs/ADR.md D5): one in-memory snapshot, TTL, single-flight refresh, stale-if-error
// with a failure cooldown (also when no snapshot exists yet), bust() that always yields a read
// started after the call, in-place vote deltas that survive an overlapping refresh (ADR D4) and can
// be discarded when a write fails, and optional last-good persistence of the raw content ranges
// (re-validated through the parser on restore; vote rows are never written to disk).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ValueRange } from './client.ts';
import { HEADERS, READ_RANGES } from './contract.ts';
import { serializeError, silentLogger, type Logger } from './errors.ts';
import type { DroppedRow, Rug, Snapshot, Vote, VoteStateMap } from './types.ts';

export interface SnapshotMeta {
  /** Grid row count of the Votes tab (grows with every insert); drives the growth breaker (ADR D4). */
  votesRowsTotal?: number;
}

export interface CacheOptions {
  /** Fetches the raw READ_RANGES (one batchGet). */
  load: () => Promise<ValueRange[]>;
  /** Parses + validates; throws to reject the refresh (see read.ts#snapshotFromRanges). */
  parse: (ranges: ValueRange[]) => Snapshot;
  /** Optional extra metadata fetched alongside the ranges (never fails the refresh). */
  loadMeta?: () => Promise<SnapshotMeta>;
  ttlMs: number;
  now?: () => number;
  logger?: Logger;
  /** Optional path for the last-good content snapshot (only useful on hosts with a volume). */
  persistPath?: string;
  /** After a failed refresh, serve the stale snapshot (or fail fast) without retrying for this long. */
  failureCooldownMs?: number;
}

export interface CacheHealth {
  ok: boolean;
  lastRefreshOk: boolean;
  snapshotAgeSec: number | null;
  lastError: string | null;
  rowsDropped: number;
  rowsWarned: number;
  dropped: DroppedRow[];
  warnings: DroppedRow[];
  votesRowsRead: number;
  votesRowsTotal: number | null;
  voteStateTruncated: boolean;
  rugs: number;
}

interface PersistedRanges {
  version: 1;
  fetchedAt: number;
  /** The four content ranges (Rugs, Collections, Tags, Rates); Votes are deliberately not persisted. */
  ranges: ValueRange[];
}

export interface VoteDelta {
  at: number;
  rugId: string;
  visitorHash: string;
  previous: Vote | 'none';
  next: Vote | 'none';
}

/** Products, Collections, Tags, Rates — the tabs that are safe to keep on disk. */
const CONTENT_RANGE_COUNT = 4;
const HEALTH_ROWS = 10;

export class CatalogueCache {
  private readonly load: () => Promise<ValueRange[]>;
  private readonly parse: (ranges: ValueRange[]) => Snapshot;
  private readonly loadMeta: (() => Promise<SnapshotMeta>) | undefined;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly logger: Logger;
  private readonly persistPath: string | undefined;
  private readonly failureCooldownMs: number;
  private readonly windowRows: number;
  private snapshot: Snapshot | undefined;
  private meta: SnapshotMeta = {};
  private inflight: Promise<Snapshot> | undefined;
  private lastRefreshOk = true;
  private lastError: string | null = null;
  private lastFailureAt = -Infinity;
  private deltas: VoteDelta[] = [];

  constructor(options: CacheOptions & { windowRows?: number }) {
    this.load = options.load;
    this.parse = options.parse;
    this.loadMeta = options.loadMeta;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? silentLogger;
    this.persistPath = options.persistPath;
    this.failureCooldownMs = options.failureCooldownMs ?? Math.min(options.ttlMs, 15_000);
    this.windowRows = options.windowRows ?? 5000;
    if (this.persistPath) this.snapshot = this.restore(this.persistPath);
  }

  /** Current snapshot; refreshes when stale (single-flight). Serves the last good one on failure. */
  async get(): Promise<Snapshot> {
    const s = this.snapshot;
    const t = this.now();
    if (s && t - s.fetchedAt < this.ttlMs) return s;
    if (t - this.lastFailureAt < this.failureCooldownMs) {
      if (s) return s; // don't hammer a failing Google
      throw new Error(this.lastError ?? 'catalogue refresh failed recently'); // fail fast, no round trip
    }
    return this.refresh();
  }

  /** Forces a refresh that starts after this call; awaiting it yields the refreshed (or stale-if-error) snapshot. */
  async bust(): Promise<Snapshot> {
    const prior = this.inflight;
    if (prior) await prior.catch(() => undefined);
    this.lastFailureAt = -Infinity;
    if (this.snapshot) this.snapshot = { ...this.snapshot, fetchedAt: 0 };
    return this.refresh();
  }

  peek(): Snapshot | undefined {
    return this.snapshot;
  }

  private async refresh(): Promise<Snapshot> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const startedAt = this.now();
      try {
        const [ranges, meta] = await Promise.all([
          this.load(),
          this.loadMeta
            ? this.loadMeta().catch((e: unknown) => {
                // Never fails the refresh, but never silently disables the growth breaker either:
                // the last known Votes row count is kept and the failure is visible in the log.
                this.logger.warn('metadata read failed; keeping the last known Votes row count', {
                  error: serializeError(e),
                });
                return undefined;
              })
            : Promise.resolve(undefined),
        ]);
        const fresh: Snapshot = { ...this.parse(ranges), fetchedAt: this.now() };
        // Votes applied while this read was in flight are not in it yet: replay them.
        for (const d of this.deltas) if (d.at >= startedAt) applyDelta(fresh, d);
        this.snapshot = fresh;
        if (meta) this.meta = meta;
        this.lastRefreshOk = true;
        this.lastError = null;
        this.pruneDeltas();
        if (this.persistPath) this.persist(this.persistPath, ranges, fresh.fetchedAt);
        if (fresh.report.dropped.length || fresh.report.warnings.length) {
          this.logger.warn(
            `refresh dropped ${fresh.report.dropped.length} row(s), ${fresh.report.warnings.length} warning(s)`,
            {
              dropped: fresh.report.dropped.slice(0, 20),
              warnings: fresh.report.warnings.slice(0, 20),
            },
          );
        }
        return fresh;
      } catch (e) {
        this.lastRefreshOk = false;
        this.lastFailureAt = this.now();
        const safe = serializeError(e);
        this.lastError = `${safe.name}: ${safe.message}`;
        this.logger.error('refresh failed; serving the last good snapshot', { error: safe });
        if (this.snapshot) return this.snapshot; // stale-if-error, unbounded (ADR D5.2)
        throw e;
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }

  /**
   * Applies a vote delta to the in-memory snapshot (counts + visitor state). The next refresh
   * reconciles with the sheet's COUNTIFS. Returns the delta (for discardVote) and the updated rug.
   */
  applyVote(
    rugId: string,
    visitorHash: string,
    previous: Vote | 'none',
    next: Vote | 'none',
  ): { delta: VoteDelta; rug: Rug } | undefined {
    if (!this.snapshot) return undefined;
    const delta: VoteDelta = { at: this.now(), rugId, visitorHash, previous, next };
    const rug = applyDelta(this.snapshot, delta);
    if (!rug) return undefined;
    this.deltas.push(delta);
    return { delta, rug };
  }

  /** Undoes an optimistic delta whose sheet write failed: it is removed from the replay log too. */
  discardVote(delta: VoteDelta): void {
    this.deltas = this.deltas.filter((d) => d !== delta);
    if (!this.snapshot) return;
    applyDelta(this.snapshot, { ...delta, previous: delta.next, next: delta.previous });
  }

  currentVote(visitorHash: string, rugId: string): Vote | 'none' {
    return this.snapshot?.voteState.get(visitorHash)?.get(rugId) ?? 'none';
  }

  health(): CacheHealth {
    const s = this.snapshot;
    const report = s?.report;
    const votesRowsRead = report?.votesRowsRead ?? 0;
    return {
      ok: this.lastRefreshOk && s !== undefined,
      lastRefreshOk: this.lastRefreshOk,
      snapshotAgeSec: s ? Math.max(0, Math.round((this.now() - s.fetchedAt) / 1000)) : null,
      lastError: this.lastError,
      rowsDropped: report?.dropped?.length ?? 0,
      rowsWarned: report?.warnings?.length ?? 0,
      dropped: (report?.dropped ?? []).slice(0, HEALTH_ROWS),
      warnings: (report?.warnings ?? []).slice(0, HEALTH_ROWS),
      votesRowsRead,
      votesRowsTotal: this.meta.votesRowsTotal ?? null,
      voteStateTruncated: votesRowsRead >= this.windowRows,
      rugs: s?.catalogue.rugs.length ?? 0,
    };
  }

  get votesRowsTotal(): number | undefined {
    return this.meta.votesRowsTotal;
  }

  private pruneDeltas(): void {
    const cutoff = this.now() - 2 * this.ttlMs;
    this.deltas = this.deltas.filter((d) => d.at >= cutoff);
  }

  private persist(path: string, ranges: ValueRange[], fetchedAt: number): void {
    try {
      const data: PersistedRanges = { version: 1, fetchedAt, ranges: ranges.slice(0, CONTENT_RANGE_COUNT) };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(data));
    } catch (e) {
      this.logger.warn('could not persist snapshot', { error: serializeError(e) });
    }
  }

  /** Re-runs the parser (same Zod schemas, same rejection rule) over the persisted content ranges. */
  private restore(path: string): Snapshot | undefined {
    try {
      if (!existsSync(path)) return undefined;
      const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<PersistedRanges>;
      if (data?.version !== 1 || !Array.isArray(data.ranges) || data.ranges.length !== CONTENT_RANGE_COUNT)
        return undefined;
      // Neither the reaction log nor the customer list is persisted: the log is per-visitor state we
      // re-read anyway, and Customers holds password hashes that must not sit in a cache file. Both
      // come back as header-only ranges; the snapshot is stale, so the first request refreshes.
      const reactionsRange: ValueRange = { range: READ_RANGES[4], values: [[...HEADERS.Reactions]] };
      const customersRange: ValueRange = { range: READ_RANGES[5], values: [[...HEADERS.Customers]] };
      const snap = this.parse([...data.ranges, reactionsRange, customersRange]);
      // Restored snapshots are always considered stale so the first request refreshes.
      return { ...snap, fetchedAt: 0 };
    } catch (e) {
      this.logger.warn('ignoring invalid persisted snapshot', { error: serializeError(e) });
      return undefined;
    }
  }
}

function applyDelta(snap: Snapshot, d: VoteDelta): Rug | undefined {
  const rug = snap.catalogue.rugs.find((r) => r.id === d.rugId);
  if (!rug) return undefined;
  if (d.previous === 'like') rug.likes = Math.max(0, rug.likes - 1);
  if (d.previous === 'dislike') rug.dislikes = Math.max(0, rug.dislikes - 1);
  if (d.next === 'like') rug.likes += 1;
  if (d.next === 'dislike') rug.dislikes += 1;
  const total = rug.likes + rug.dislikes;
  rug.rating = total === 0 ? 0 : Math.round((rug.likes / total) * 5 * 100) / 100;
  const state: VoteStateMap = snap.voteState;
  let byRug = state.get(d.visitorHash);
  if (!byRug) {
    byRug = new Map();
    state.set(d.visitorHash, byRug);
  }
  if (d.next === 'none') byRug.delete(d.rugId);
  else byRug.set(d.rugId, d.next);
  return rug;
}
