// The live Google connection: a token source that reads the current refresh token every time,
// caches the access token until just before it lapses, and never needs a restart to pick up a new
// authorisation.
//
// This replaces `UserRefreshClient` for the oauth_refresh mode. That client is perfectly good, but
// it captures the refresh token when it is constructed, which is precisely the thing that made
// re-connecting mean editing `.env` and restarting. Here the refresh token is looked up per refresh,
// so the moment the admin stores a new one the next request uses it.
//
// Access tokens last an hour and are renewed a minute early, single-flight, so a burst of parallel
// sheet calls triggers one token request rather than ten.
import type { Logger } from '../sheets/errors.ts';
import { serializeError } from '../sheets/errors.ts';
import { GoogleAuthError, refreshAccessToken } from './oauth.ts';
import type { GoogleTokenStore, StoredGoogleAuth } from './store.ts';

/** Renew this long before the access token actually expires. */
export const RENEW_MARGIN_MS = 60_000;

export interface ConnectionOptions {
  clientId: string;
  clientSecret: string;
  store: GoogleTokenStore;
  /** Used only when the store is empty: the value from the environment, if any. */
  fallbackRefreshToken?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Logger;
}

export interface ConnectionHealth {
  connected: boolean;
  durable: boolean;
  account?: string;
  scopes: string[];
  connectedAt?: string;
  lastRefreshAt?: string;
  /** Where the refresh token came from, which is the question when two places could supply one. */
  source: 'stored' | 'environment' | 'none';
  lastError: string | null;
}

export class GoogleConnection {
  private readonly options: ConnectionOptions;
  private readonly now: () => number;
  private accessToken: string | undefined;
  private expiresAt = 0;
  /** The refresh token the cached access token was minted from, so a swap invalidates the cache. */
  private mintedFrom: string | undefined;
  private inflight: Promise<string> | undefined;
  private lastError: string | null = null;

  constructor(options: ConnectionOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** The stored authorisation, or the environment's token dressed as one. Stored wins. */
  current():
    { refreshToken: string; source: 'stored' | 'environment'; stored?: StoredGoogleAuth } | undefined {
    const stored = this.options.store.read();
    if (stored?.refreshToken) return { refreshToken: stored.refreshToken, source: 'stored', stored };
    const env = this.options.fallbackRefreshToken;
    if (env) return { refreshToken: env, source: 'environment' };
    return undefined;
  }

  health(): ConnectionHealth {
    const current = this.current();
    return {
      connected: Boolean(current),
      durable: this.options.store.durable,
      account: current?.stored?.account,
      scopes: current?.stored?.scopes ?? [],
      connectedAt: current?.stored?.connectedAt,
      lastRefreshAt: current?.stored?.lastRefreshAt,
      source: current?.source ?? 'none',
      lastError: this.lastError,
    };
  }

  /** Drops the cached access token; the next call mints a fresh one. */
  invalidate(): void {
    this.accessToken = undefined;
    this.expiresAt = 0;
    this.mintedFrom = undefined;
  }

  async getAccessToken(): Promise<string> {
    const current = this.current();
    if (!current) {
      throw new GoogleAuthError(
        'not_connected',
        'No Google account is connected. Open /admin/google and connect one.',
      );
    }
    const fresh = this.accessToken && this.mintedFrom === current.refreshToken && this.now() < this.expiresAt;
    if (fresh) return this.accessToken!;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const tokens = await refreshAccessToken({
          clientId: this.options.clientId,
          clientSecret: this.options.clientSecret,
          refreshToken: current.refreshToken,
          fetchImpl: this.options.fetchImpl,
        });
        this.accessToken = tokens.accessToken;
        this.mintedFrom = current.refreshToken;
        this.expiresAt = this.now() + Math.max(0, tokens.expiresInSec * 1000 - RENEW_MARGIN_MS);
        this.lastError = null;
        // Stamp the stored record so the admin can show when the connection last actually worked.
        if (current.source === 'stored' && current.stored) {
          this.options.store.write({
            ...current.stored,
            scopes: tokens.scopes.length ? tokens.scopes : current.stored.scopes,
            lastRefreshAt: new Date(this.now()).toISOString(),
          });
        }
        return tokens.accessToken;
      } catch (e) {
        this.invalidate();
        const safe = serializeError(e);
        this.lastError =
          e instanceof GoogleAuthError ? `${e.code}: ${e.message}` : `${safe.name}: ${safe.message}`;
        // `invalid_grant` is the one worth naming: it means the grant is gone, not that the network
        // hiccuped, and the only cure is connecting again.
        if (e instanceof GoogleAuthError && e.code === 'invalid_grant') {
          this.options.logger?.error('google connection rejected; re-authorisation needed', {
            error: safe,
          });
          throw new GoogleAuthError(
            'invalid_grant',
            'Google rejected the stored authorisation. This happens when access is revoked, after six months unused, or after seven days if the consent screen is still in Testing. Connect the account again at /admin/google.',
          );
        }
        throw e;
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }
}
