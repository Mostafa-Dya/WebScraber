import { describe, expect, it } from 'vitest';
import { HTML_MAX_BYTES, MAX_REDIRECTS, fetchText, toScrapeError } from '../../../src/lib/scrape/fetch.ts';
import { JINA_ACCEPT, fetchViaJina, jinaUrl } from '../../../src/lib/scrape/jina.ts';
import { ScrapeError } from '../../../src/lib/scrape/types.ts';
import { bodyOf, fakeTransport, type FakeCall } from '../../fixtures/scrape/index.ts';

const ECG = 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114';
const KV_JS = 'https://karavanrug.com/products/abc.js';

async function failure(p: Promise<unknown>): Promise<ScrapeError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ScrapeError) return e;
    throw e;
  }
  throw new Error('expected a ScrapeError');
}

describe('fetchText (ADMIN_SPEC §4.3)', () => {
  it('returns the decoded body, status and content type, reporting the client that answered', async () => {
    const calls: FakeCall[] = [];
    const transport = fakeTransport({ [ECG]: { body: '<html>ok ✓</html>' } }, calls);
    const r = await fetchText(ECG, 'impit', { kind: 'html', transport });
    expect(r).toMatchObject({ status: 200, url: ECG, body: '<html>ok ✓</html>', hops: 0, via: 'impit' });
    expect(r.contentType).toBe('text/html; charset=utf-8');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.client).toBe('impit');
    expect(calls[0]?.headers.Accept).toMatch(/^text\/html/);
  });

  it('reports via: undici when the transport fell back', async () => {
    const transport = fakeTransport({
      [KV_JS]: { body: '{}', contentType: 'application/json', via: 'undici' },
    });
    const r = await fetchText(KV_JS, 'impit', { kind: 'json', transport });
    expect(r.via).toBe('undici');
  });

  it('follows re-validated redirects manually (www → apex, store code) up to 3 hops', async () => {
    const calls: FakeCall[] = [];
    const transport = fakeTransport(
      {
        'https://www.ecarpetgallery.com/us_en/x-1234': {
          status: 301,
          headers: { location: 'https://ecarpetgallery.com/us_en/x-1234' },
        },
        'https://ecarpetgallery.com/us_en/x-1234': { status: 302, headers: { location: '/eu_en/x-1234' } },
        'https://ecarpetgallery.com/eu_en/x-1234': { body: 'landed' },
      },
      calls,
    );
    const r = await fetchText('https://www.ecarpetgallery.com/us_en/x-1234', 'impit', {
      kind: 'html',
      transport,
    });
    expect(r).toMatchObject({ body: 'landed', hops: 2, url: 'https://ecarpetgallery.com/eu_en/x-1234' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://www.ecarpetgallery.com/us_en/x-1234',
      'https://ecarpetgallery.com/us_en/x-1234',
      'https://ecarpetgallery.com/eu_en/x-1234',
    ]);
  });

  it('refuses redirects to hosts off the allow-list, to http, or to IP literals', async () => {
    for (const location of [
      'https://evil.example/x',
      'http://ecarpetgallery.com/us_en/x',
      'https://127.0.0.1/',
      'https://169.254.169.254/latest',
    ]) {
      const transport = fakeTransport({ [ECG]: { status: 302, headers: { location } } });
      const err = await failure(fetchText(ECG, 'impit', { kind: 'html', transport }));
      expect(err.code, location).toBe('fetch_failed');
      expect(err.message, location).toMatch(/redirect refused/);
    }
  });

  it('stops after MAX_REDIRECTS hops and on a redirect without Location', async () => {
    const loop = fakeTransport({ [ECG]: { status: 302, headers: { location: ECG } } });
    const err = await failure(fetchText(ECG, 'impit', { kind: 'html', transport: loop }));
    expect(err.code).toBe('fetch_failed');
    expect(err.message).toContain(`more than ${MAX_REDIRECTS}`);
    const noLocation = fakeTransport({ [ECG]: { status: 301 } });
    expect((await failure(fetchText(ECG, 'impit', { kind: 'html', transport: noLocation }))).message).toMatch(
      /without a Location/,
    );
  });

  it('returns HTTP error statuses (403 / 404 / 500) instead of throwing', async () => {
    for (const status of [403, 404, 500]) {
      const transport = fakeTransport({ [ECG]: { status, body: `<title>${status}</title>` } });
      const r = await fetchText(ECG, 'impit', { kind: 'html', transport });
      expect(r.status).toBe(status);
      expect(r.body).toContain(String(status));
    }
  });

  it('rejects unexpected content types on success and enforces the byte cap', async () => {
    const image = fakeTransport({ [ECG]: { body: 'PNG', contentType: 'image/png' } });
    const err = await failure(fetchText(ECG, 'impit', { kind: 'html', transport: image }));
    expect(err.code).toBe('fetch_failed');
    expect(err.message).toMatch(/content-type "image\/png"/);

    const big = fakeTransport({ [ECG]: { body: bodyOf(2048) } });
    const capped = await failure(fetchText(ECG, 'impit', { kind: 'html', transport: big, maxBytes: 1024 }));
    expect(capped.code).toBe('fetch_failed');
    expect(capped.message).toMatch(/exceeds 1024 bytes/);
    expect(HTML_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it('accepts the Shopify .js content type', async () => {
    const transport = fakeTransport({
      [KV_JS]: { body: '{"a":1}', contentType: 'text/javascript; charset=utf-8' },
    });
    expect((await fetchText(KV_JS, 'impit', { kind: 'json', transport })).body).toBe('{"a":1}');
  });

  it('maps transport failures: timeouts → timeout, anything else → fetch_failed', async () => {
    const timeoutErr = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const t1 = fakeTransport({ [ECG]: { throws: timeoutErr } });
    expect((await failure(fetchText(ECG, 'impit', { kind: 'html', transport: t1 }))).code).toBe('timeout');

    const t2 = fakeTransport({
      [ECG]: { throws: Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' }) },
    });
    const e2 = await failure(fetchText(ECG, 'impit', { kind: 'html', transport: t2 }));
    expect(e2.code).toBe('fetch_failed');
    expect(e2.message).toMatch(/ECONNRESET/);

    const slow = fakeTransport({ [ECG]: { body: 'late', delayMs: 5_000 } });
    const e3 = await failure(
      fetchText(ECG, 'impit', { kind: 'html', transport: slow, requestTimeoutMs: 20 }),
    );
    expect(e3.code).toBe('timeout');
  });

  it('honours an already-aborted outer signal', async () => {
    const controller = new AbortController();
    controller.abort(new ScrapeError('timeout', 'scrape exceeded 20000 ms'));
    const slow = fakeTransport({ [ECG]: { body: 'late', delayMs: 5_000 } });
    const err = await failure(
      fetchText(ECG, 'impit', { kind: 'html', transport: slow, signal: controller.signal }),
    );
    expect(err.code).toBe('timeout');
  });

  it('refuses to fetch a URL off the allow-list before any request is made', async () => {
    const calls: FakeCall[] = [];
    const transport = fakeTransport({}, calls);
    const err = await failure(fetchText('https://example.com/x', 'impit', { kind: 'html', transport }));
    expect(err.code).toBe('unsupported_host');
    expect(calls).toEqual([]);
  });

  it('toScrapeError never leaks anything secret-looking', () => {
    const e = toScrapeError(new Error('refresh_token=abc123 failed'));
    expect(e.message).not.toContain('abc123');
    expect(toScrapeError(new ScrapeError('blocked', 'x')).code).toBe('blocked');
  });
});

describe('fetchViaJina', () => {
  it('prefixes the outbound URL, asks for HTML, goes through undici and accepts text/plain', async () => {
    const calls: FakeCall[] = [];
    const url = jinaUrl(ECG);
    expect(url).toBe(`https://r.jina.ai/${ECG}`);
    const transport = fakeTransport(
      { [url]: { body: '<html>via jina</html>', contentType: 'text/plain; charset=utf-8' } },
      calls,
    );
    const r = await fetchViaJina(ECG, { transport });
    expect(r).toMatchObject({ via: 'jina', body: '<html>via jina</html>', status: 200 });
    expect(calls[0]?.client).toBe('undici');
    expect(calls[0]?.headers['X-Return-Format']).toBe('html');
    expect(JINA_ACCEPT).toContain('text/plain');
  });
  it('does not follow Jina redirects', async () => {
    const transport = fakeTransport({
      [jinaUrl(ECG)]: { status: 302, headers: { location: 'https://r.jina.ai/elsewhere' } },
    });
    const err = await failure(fetchViaJina(ECG, { transport }));
    expect(err.code).toBe('fetch_failed');
  });
});
