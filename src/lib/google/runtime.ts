// Process-wide state for the Google authorisation flow. Separate from src/lib/runtime.ts so the
// OAuth routes do not drag the Sheets client, the cache and the Drive client in with them.
import { HandshakeStore } from './handshake.ts';

/** In-progress authorisations, keyed by the id in the owner's short-lived cookie. */
export const handshakes = new HandshakeStore();
