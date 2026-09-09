// /admin/google: copy the redirect URI, and disconnect.
//
// Connecting is a plain link rather than a fetch, because it ends in a top-level navigation to
// Google and back — an XHR cannot follow a consent screen.
import { post, type ApiOptions } from './api.ts';
import { msg } from './msg.ts';

export interface GooglePage {
  disconnect(): Promise<void>;
}

export function initGoogle(doc: Document = document, api: ApiOptions = {}): GooglePage | undefined {
  const redirect = doc.getElementById('redirectUri') as HTMLInputElement | null;
  const copy = doc.getElementById('btnCopyRedirect') as HTMLButtonElement | null;
  const disconnectBtn = doc.getElementById('btnDisconnect') as HTMLButtonElement | null;
  const out = doc.getElementById('m12');
  // The page renders nothing to wire in service-account mode or before the client is configured.
  if (!redirect && !disconnectBtn) return undefined;

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

  disconnectBtn?.addEventListener('click', () => void disconnect());
  return { disconnect };
}
