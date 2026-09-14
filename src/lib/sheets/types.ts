// Domain types produced by src/lib/sheets/parse.ts and consumed by pages and endpoints.
// Column ↔ field mapping for `Product` is in contract.ts (`PRODUCT_COLS`).

export type Rotate = 'force' | 'true' | 'false';
export type Status = 'active' | 'draft' | 'archived';
export type Vote = 'like' | 'dislike';
/** A reaction event's value; `none` clears an earlier like/dislike (brief §3 rule 1). */
export type Reaction = Vote | 'none';
/** Where the reaction was made: the grid card (like only) or the detail page (brief §7). */
export type ReactionSource = 'card' | 'detail';
export type CommitStatus = 'pending' | 'complete' | '';
export type VisitorVoteState = Vote | 'none';

export interface Product {
  /** `Product ID` — manually assigned, the primary key, rendered in mono (brief §9). */
  id: string;
  /** `Handle` — the URL segment. */
  slug: string;
  /** `Title`. */
  name: string;
  /** `Body (HTML)`. */
  description: string;
  /**
   * `Collection` — every collection *name* this product belongs to, denormalised so the tab imports
   * standalone. Owner requirement 2026-09-13: a rug can sit in several collections at once.
   *
   * Pipe-delimited in the sheet, NOT comma-delimited like `Tags`: a collection name is prose the
   * owner types ("Wabi Sabi, Vol. 2") and comma-splitting would shatter it. A cell with no pipe is
   * therefore one collection, which is exactly what every pre-existing row already is.
   */
  collections: string[];
  /**
   * The primary collection — `collections[0]`, or `''` when the cell is empty.
   *
   * Kept because one collection has to be *the* one: the canonical `/[slug]/` route a product link
   * resolves to, the label a card shows when there is only room for one, and the grouping key for
   * lead-first ordering. Membership questions ("is this rug in Kilims?") must read `collections`.
   */
  collection: string;
  tags: string[];
  /**
   * Drive file ids for the images we know from the sheet. `Image Src` holds the primary only
   * (brief §9); the detail page adds the rest by listing `driveFolderId`.
   */
  photos: string[];
  /** `Image Src` verbatim, whatever shape it has (Drive id, Drive URL or an https URL). */
  imageSrc: string;
  imageAltText: string;
  widthCm?: number;
  lengthCm?: number;
  /** `Size Label`, e.g. "240 × 170 cm"; derived when the column is blank. */
  sizeLabel: string;
  /** `Size Band` from the area: XS | S | M | L | XL (brief §11). */
  sizeBand: string;
  material: string;
  method: string;
  origin: string;
  age: string;
  pile: string;
  /** Stored but never displayed (brief §7). */
  shape: string;
  /** `Variant Price` in the store's base currency. */
  priceUsd?: number;
  compareAtPrice?: number;
  vendor: string;
  productCategory: string;
  productType: string;
  published: boolean;
  variantSku: string;
  variantGrams?: number;
  variantInventoryQty?: number;
  variantInventoryPolicy: string;
  variantRequiresShipping: boolean;
  variantTaxable: boolean;
  seoTitle: string;
  seoDescription: string;
  status: Status;
  sourceUrl: string;
  sourceSite: string;
  driveFolderId: string;
  driveFolderUrl: string;
  scrapedAt: string;
  /** `pending` until the Drive upload finishes; the products list offers a retry (brief §12). */
  commitStatus: CommitStatus;
  internalNotes: string;
  /** Derived from a `featured` tag: no column exists in the Shopify set. */
  featured: boolean;
  /** Derived from a `rotate` / `rotate-force` tag (ADR D6). */
  rotate: Rotate;
  /** Derived from the Reactions log, never stored (brief §3). */
  likes: number;
  dislikes: number;
  /** 0–5, derived: likes / (likes + dislikes) × 5. */
  rating: number;
}

/** The pre-brief name; kept so the catalogue view layer reads unchanged. */
export type Rug = Product;

export interface Collection {
  id: string;
  slug: string;
  name: string;
  /** Buyer-facing since brief §7: shown clamped to one line with a "See more" expander. */
  description: string;
  createdAt?: string;
  /** Already normalised by src/lib/images.ts (Drive id → lh3 URL, or an allow-listed https URL). */
  coverImageUrl?: string;
  sortOrder?: number;
}

export interface Customer {
  slug: string;
  displayName: string;
  /** scrypt hash; never leaves the server, never rendered (brief §10). */
  passwordHash: string;
  note: string;
  createdAt?: string;
  active: boolean;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  color?: string;
}

export interface Rate {
  currency: string;
  rateToBase: number;
  /** Never trimmed: "AED " and "SAR " carry a trailing space by design (reference line 105). */
  symbol: string;
  updatedAt?: string;
}

/** One append-only row of the Reactions tab (brief §3 rule 1). */
export interface ReactionRow {
  eventId: string;
  customerSlug: string;
  productId: string;
  reaction: Reaction;
  source: ReactionSource;
  createdAt: string;
}

/** One append-only row of the Visits tab. */
export interface VisitRow {
  eventId: string;
  customerSlug: string;
  occurredAt: string;
  userAgent: string;
  referrer: string;
}

export interface Catalogue {
  /** Named `rugs` for continuity with the catalogue view layer; these are `Product`s. */
  rugs: Product[];
  collections: Collection[];
  tags: Tag[];
  rates: Rate[];
  customers: Customer[];
}

/** customerSlug → productId → current reaction (rebuilt from the newest-first Reactions window). */
export type VoteStateMap = Map<string, Map<string, Vote>>;

export interface DroppedRow {
  tab: string;
  /** 1-based sheet row number. */
  row: number;
  issues: string[];
}

export interface TabStats {
  kept: number;
  dropped: number;
}

export interface ParseReport {
  /** Rows rejected by validation (the row is not in the catalogue). */
  dropped: DroppedRow[];
  /** Rows kept with a field replaced or ignored (photo, slug, colour, cover URL, clamped counts). */
  warnings: DroppedRow[];
  /** Reaction rows read in this refresh (the window is bounded). */
  votesRowsRead: number;
  stats: Record<string, TabStats>;
}

export interface Snapshot {
  catalogue: Catalogue;
  voteState: VoteStateMap;
  report: ParseReport;
  /** Epoch milliseconds, stamped by the cache. */
  fetchedAt: number;
}
