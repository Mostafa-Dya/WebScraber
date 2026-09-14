// /admin/google: copy the redirect URI, and disconnect.
//
// Connecting is a plain link rather than a fetch, because it ends in a top-level navigation to
// Google and back — an XHR cannot follow a consent screen.
import { post, type ApiOptions } from './api.ts';
import { msg } from './msg.ts';

export interface GooglePage {
  disconnect(): Promise<void>;
  createSheet(): Promise<void>;
}

export function initGoogle(doc: Document = document, api: ApiOptions = {}): GooglePage | undefined {
  const redirect = doc.getElementById('redirectUri') as HTMLInputElement | null;
  const copy = doc.getElementById('btnCopyRedirect') as HTMLButtonElement | null;
  const disconnectBtn = doc.getElementById('btnDisconnect') as HTMLButtonElement | null;
  const out = doc.getElementById('m12');
  const createBtn = doc.getElementById('btnCreateSheet') as HTMLButtonElement | null;
  const sheetTitle = doc.getElementById('sheetTitle') as HTMLInputElement | null;
  const sheetOut = doc.getElementById('mSheet');
  // The page renders nothing to wire in service-account mode or before the client is configured.
  if (!redirect && !disconnectBtn && !createBtn) return undefined;

  copy?.addEventListener('click', () => {
    if (!redirect) return;
    redirect.focus();
    redirect.select();
    void navigator.clipboard
      .writeText(redirect.value)
      .then(() => out && msg(out, 'Copied. Paste it into the OAuth client in the Google console.', 'ok'))
      .catch(() => out && msg(out, 'Select the address and copy it with Ctrl/⌘+C.', 'busy'));
  });

  const disconnect = async (): Promise<void> => {
    if (!disconnectBtn) return;
    disconnectBtn.disabled = true;
    if (out) msg(out, 'Disconnecting…', 'busy');
    const r = await post<{ revoked: boolean }>('/api/admin/google/disconnect', {}, api);
    disconnectBtn.disabled = false;
    if (!r.ok) {
      if (out) msg(out, r.message, 'err');
      return;
    }
    if (out) {
      msg(
        out,
        r.data.revoked
          ? 'Disconnected, and the authorisation was revoked at Google.'
          : 'Disconnected here. Google could not be reached to revoke it, so remove it from your account permissions as well.',
        'ok',
      );
    }
    // The status block is server-rendered, so a reload is the honest way to show the new state.
    setTimeout(() => location.reload(), 1200);
  };

  /**
   * Creates the catalogue spreadsheet in the connected Google account.
   *
   * Deliberately slow-looking: this is one click that creates a real document in someone's Drive and
   * then writes ten tabs, their headers, the formats and the formulas into it. The button is disabled
   * for the whole round trip so a second click cannot start a second sheet — the failure the endpoint
   * also guards server-side, because a double-click is faster than a network round trip.
   */
  const createSheet = async (): Promise<void> => {
    if (!createBtn) return;
    createBtn.disabled = true;
    if (sheetOut) msg(sheetOut, 'Creating the spreadsheet and building its tabs…', 'busy');
    const r = await post<{ sheetId: string; url: string }>(
      '/api/admin/google/provision',
      { title: sheetTitle?.value.trim() || 'Serio Ludere — Catalogue' },
      // Ten tabs, their headers, formats, protections and formulas: several round trips to Google.
      { timeoutMs: 120_000, ...api },
    );
    if (!r.ok) {
      createBtn.disabled = false;
      if (sheetOut) msg(sheetOut, r.message, 'err');
      return;
    }
    if (sheetOut) msg(sheetOut, 'Catalogue created. Loading it…', 'ok');
    // Everything on this page is server-rendered from the sheet's existence, so a reload is the
    // honest way to show the new state.
    setTimeout(() => location.reload(), 1200);
  };

  disconnectBtn?.addEventListener('click', () => void disconnect());
  createBtn?.addEventListener('click', () => void createSheet());
  return { disconnect, createSheet };
}
