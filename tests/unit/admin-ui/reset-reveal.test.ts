// @vitest-environment happy-dom
// Resetting a customer's password must SHOW the new password.
//
// THE BUG. `#linkOut` — the reveal-once credential panel — lives inside `<Modal id="new-client">`.
// On the create path that modal is already open, so `linkOut.hidden = false` was enough, and this
// looked correct for as long as anyone only ever created customers.
//
// "Reset password" is a control on a TABLE ROW, outside the modal. It wrote the one-time plaintext
// into a hidden element inside a CLOSED dialog and announced "copy it now, it is not shown again" —
// while the new password was already live in the sheet. The buyer was locked out of their preview
// with no way back, and resetting again just repeated it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initClients } from '../../../src/scripts/admin/clients.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A fake fetch that answers BOTH the reset call and the two reports `initClients` fires on load
 * (the access log and client saves). Without the report shapes those two reject unhandled, which
 * vitest reports as an unhandled rejection even while the assertions pass — noise that would later
 * be mistaken for a real failure.
 */
const ok = (body: Record<string, unknown>): typeof fetch =>
  (async (url: string) =>
    new Response(
      JSON.stringify(
        String(url).includes('/visits')
          ? { ok: true, byClient: [], recent: [], total: 0 }
          : String(url).includes('/report') || String(url).includes('/saves')
            ? { ok: true, byClient: [], rugs: [] }
            : body,
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch;

const CLIENT = {
  code: 'nadia-k7m2pq',
  name: 'Nadia',
  note: '',
  status: 'active',
  createdAt: '2026-09-01',
  createdBy: 'owner',
  link: 'https://catalogue.example.test/nadia-k7m2pq',
  row: 2,
  version: 'a1b2c3d4e5f60718',
};

function mount(): void {
  document.body.innerHTML = `
    <button data-open="new-client">New customer link</button>
    <div id="m9" class="msg"></div>
    <!-- The page's other sections; initClients requires them to exist. -->
    <button id="btnReport"></button><div id="m10" class="msg"></div><div id="reportOut"></div>
    <button id="btnVisits"></button><div id="m11" class="msg"></div><div id="visitsOut"></div>
    <dialog id="pwDialog"><h2 id="pwDialogTitle"></h2><input id="pwDialogInput">
      <p id="pwDialogErr"></p><button id="pwDialogOk"></button><button id="pwDialogCancel"></button></dialog>
    <table id="clientTable"><tbody>
      <tr data-code="nadia-k7m2pq" data-version="a1b2c3d4e5f60718" data-status="active">
        <td>Nadia</td><td class="acts"><button data-act="password">Reset password</button></td>
      </tr>
    </tbody></table>
    <dialog id="new-client">
      <div class="modal__fields">
        <div class="row"><input id="cl_name"><input id="cl_note"><input id="cl_pw">
          <button id="btnGenerate">Generate link</button></div>
        <div id="m8" class="msg"></div>
        <div id="linkOut" class="stack" hidden>
          <span data-credential-url></span><span data-credential-password></span>
          <span id="linkCode"></span><span id="linkNote"></span>
        </div>
      </div>
    </dialog>
    <script type="application/json" id="admin-data">${JSON.stringify({ clients: [CLIENT], siteOrigin: 'https://catalogue.example.test' })}</script>`;
  // happy-dom does not implement <dialog>.
  for (const id of ['new-client', 'pwDialog']) {
    const d = document.getElementById(id) as HTMLDialogElement;
    d.showModal = function showModal(): void {
      this.open = true;
    };
    d.close = function close(): void {
      this.open = false;
    };
  }
}

const linkOut = (): HTMLElement => document.getElementById('linkOut')!;
const dialog = (): HTMLDialogElement => document.getElementById('new-client') as HTMLDialogElement;
const form = (): HTMLElement => document.querySelector('#new-client .modal__fields > .row')!;

describe('resetting a password', () => {
  it('opens the dialog so the one-time password is actually visible', async () => {
    mount();
    const page = initClients(document, {
      fetchImpl: ok({ ok: true, client: CLIENT, password: 'reed-otter-lamp-9214' }),
    });
    expect(dialog().open).toBe(false); // the reset is pressed from a ROW, with the modal shut

    await page.resetPassword('nadia-k7m2pq');
    expect(linkOut().hidden).toBe(false);

    // The whole point: revealed AND on screen.
    expect(dialog().open).toBe(true);
    expect(document.querySelector('[data-credential-password]')!.textContent).toBe('reed-otter-lamp-9214');
    // The create form is noise here — F4 (52:1115) draws the panel alone.
    expect(form().hasAttribute('hidden')).toBe(true);
  });

  it('puts the create form back when the owner next adds a customer', async () => {
    mount();
    const page = initClients(document, { fetchImpl: ok({ ok: true, client: CLIENT, password: 'x' }) });
    await page.resetPassword('nadia-k7m2pq');
    expect(form().hasAttribute('hidden')).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-open="new-client"]')!.click();
    expect(form().hasAttribute('hidden')).toBe(false);
    expect(linkOut().hidden).toBe(true);
  });
});
