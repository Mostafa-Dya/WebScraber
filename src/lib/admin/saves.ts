// Customer-saves report (brief §3, §6.3), pure. Input: the Reactions tab read fully, newest first.
// For each (customer_slug, product_id) the FIRST row seen decides; a `none` event clears the pair.
// Archived products still display (greyed by the UI).
import type { CellValue } from '../sheets/client.ts';
import { TABS } from '../sheets/contract.ts';
import { assertHeaders } from '../sheets/parse.ts';
import type { Rug } from '../sheets/types.ts';

/** Bounded by the existing 200 000-row growth breaker (handler.ts MAX_VOTES_ROWS). */
export const SAVES_READ_RANGE = `${TABS.reactions}!A1:F200001`;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface RugRef {
  rugId: string;
  name: string;
  slug: string;
  status: Rug['status'] | 'unknown';
}

export interface MostSavedEntry extends RugRef {
  /** Distinct visitors currently liking the rug. */
  saves: number;
  /** Distinct visitors currently disliking it (counted separately). */
  dislikes: number;
}

export interface ClientSaves {
  code: string;
  /** Display name from the Clients tab; 'anonymous' for `anon`; the code itself when unknown. */
  name: string;
  known: boolean;
  status?: 'active' | 'revoked';
  liked: RugRef[];
  disliked: RugRef[];
}

export interface SavesReport {
  generatedAt: string;
  mostSaved: MostSavedEntry[];
  byClient: ClientSaves[];
  rowsRead: number;
  rowsDropped: number;
}

export interface KnownClient {
  code: string;
  name: string;
  status: 'active' | 'revoked';
}

const text = (v: CellValue | undefined): string => (v === undefined || v === null ? '' : String(v).trim());

export function buildSavesReport(
  votes: CellValue[][] | undefined,
  rugs: readonly Rug[],
  clients: readonly KnownClient[],
  now: () => number = Date.now,
): SavesReport {
  assertHeaders(TABS.reactions, votes?.[0]);
  const decided = new Set<string>();
  const likers = new Map<string, Set<string>>(); // rugId → visitors
  const dislikers = new Map<string, Set<string>>();
  const byClient = new Map<string, { liked: Set<string>; disliked: Set<string> }>();
  let rowsRead = 0;
  let rowsDropped = 0;

  for (let i = 1; i < (votes?.length ?? 0); i++) {
    const cells = votes![i] ?? [];
    if (cells.every((c) => text(c) === '')) continue;
    rowsRead++;
    const customer = text(cells[1]);
    const rugId = text(cells[2]);
    const reaction = text(cells[3]).toLowerCase();
    if (!ID_RE.test(rugId) || !CLIENT_RE.test(customer)) {
      rowsDropped++;
      continue;
    }
    if (reaction !== 'like' && reaction !== 'dislike' && reaction !== 'none') {
      rowsDropped++;
      continue;
    }
    const key = `${customer} ${rugId}`;
    if (decided.has(key)) continue; // an older event for this pair is already settled
    decided.add(key);
    if (reaction === 'none') continue;
    const bucket = reaction === 'like' ? likers : dislikers;
    let set = bucket.get(rugId);
    if (!set) {
      set = new Set();
      bucket.set(rugId, set);
    }
    set.add(customer);
    let c = byClient.get(customer);
    if (!c) {
      c = { liked: new Set(), disliked: new Set() };
      byClient.set(customer, c);
    }
    (reaction === 'like' ? c.liked : c.disliked).add(rugId);
  }

  const rugById = new Map(rugs.map((r) => [r.id, r]));
  const ref = (rugId: string): RugRef => {
    const r = rugById.get(rugId);
    return r
      ? { rugId, name: r.name, slug: r.slug, status: r.status }
      : { rugId, name: rugId, slug: '', status: 'unknown' };
  };
  const rugIds = new Set([...likers.keys(), ...dislikers.keys()]);
  const mostSaved: MostSavedEntry[] = [...rugIds]
    .map((rugId) => ({
      ...ref(rugId),
      saves: likers.get(rugId)?.size ?? 0,
      dislikes: dislikers.get(rugId)?.size ?? 0,
    }))
    .sort((a, b) => b.saves - a.saves || a.name.localeCompare(b.name) || a.rugId.localeCompare(b.rugId));

  const knownByCode = new Map(clients.map((c) => [c.code.toLowerCase(), c]));
  const sortRefs = (ids: Set<string>): RugRef[] =>
    [...ids].map(ref).sort((a, b) => a.name.localeCompare(b.name) || a.rugId.localeCompare(b.rugId));
  const byClientOut: ClientSaves[] = [...byClient.entries()]
    .map(([code, sets]) => {
      const known = knownByCode.get(code.toLowerCase());
      const entry: ClientSaves = {
        code,
        name: code === 'anon' ? 'anonymous' : (known?.name ?? code),
        known: Boolean(known),
        liked: sortRefs(sets.liked),
        disliked: sortRefs(sets.disliked),
      };
      if (known) entry.status = known.status;
      return entry;
    })
    .sort((a, b) => {
      // known clients first (by name), then unknown codes, then anonymous last
      const rank = (c: ClientSaves): number => (c.code === 'anon' ? 2 : c.known ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
    });

  return {
    generatedAt: new Date(now()).toISOString(),
    mostSaved,
    byClient: byClientOut,
    rowsRead,
    rowsDropped,
  };
}
