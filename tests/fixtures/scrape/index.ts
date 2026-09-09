// Test helpers for the scraper: fixture loader and a fake Transport (no network ever).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOW_ALL, RobotsCache } from '../../../src/lib/scrape/robots.ts';
import { HostThrottle } from '../../../src/lib/scrape/throttle.ts';
import type {
  ScrapeOptions,
  Transport,
  TransportClient,
  TransportResponse,
} from '../../../src/lib/scrape/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export const ECG_380114_URL = 'https://ecarpetgallery.com/us_en/red-5x8-andelz-area-rugs-380114';
export const ECG_425302_URL = 'https://ecarpetgallery.com/us_en/red-10-ft-runner-andelz-runner-rug-425302';
export const KV_OUSHAK_HANDLE = '60-years-old-vintage-turkish-oushak-rug-305-x-370-cm-10-0-x-12-1-ft';
export const KV_RUNNER_HANDLE = 'vintage-turkish-runner-rug-2-7x9-8-ft-82x300-cm';

export function fixture(name: string): string {
  return readFileSync(join(HERE, name), 'utf8');
}

export const SUPPLIER_TEST_HOSTS: readonly string[] = [
  'ecarpetgallery.com',
  'www.ecarpetgallery.com',
  'karavanrug.com',
  'www.karavanrug.com',
  'r.jina.ai',
];

/**
 * Scrape options that take the brief §11 politeness guards out of the way of a parsing test: a
 * robots cache pre-primed "allow all" for the supplier hosts (so no `/robots.txt` request is made)
 * and a host throttle whose sleep is instant. Both are exercised for real in `robots.test.ts`,
 * `throttle.test.ts` and the robots cases of `index.test.ts`.
 */
export function guards(hosts: readonly string[] = SUPPLIER_TEST_HOSTS): Pick<
  ScrapeOptions,
  'robots' | 'throttle'
> {
  const robots = new RobotsCache();
  for (const host of hosts) robots.set(host, ALLOW_ALL);
  return { robots, throttle: new HostThrottle({ sleep: async () => {} }) };
}

/** A `/robots.txt` route for `fakeTransport`. */
export function robotsRoute(body: string, status = 200): FakeRoute {
  return { status, body, contentType: 'text/plain; charset=utf-8' };
}

export interface FakeRoute {
  status?: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
  /** Thrown instead of answering. */
  throws?: unknown;
  via?: TransportClient;
  /** Answer only after this delay (rejects with the signal's reason when aborted first). */
  delayMs?: number;
}

export interface FakeCall {
  url: string;
  client: TransportClient;
  headers: Record<string, string>;
}

/**
 * Routes are matched by exact URL. Any URL without a route throws, so a test that reaches the
 * network by mistake fails loudly. `calls` records every request in order.
 */
export function fakeTransport(
  routes: Record<string, FakeRoute | ((url: string) => FakeRoute)>,
  calls: FakeCall[] = [],
): Transport {
  return async (url, init) => {
    calls.push({ url, client: init.client, headers: init.headers });
    const entry = routes[url];
    if (!entry) throw new Error(`fakeTransport: no route for ${url}`);
    const route = typeof entry === 'function' ? entry(url) : entry;
    if (init.signal.aborted) throw init.signal.reason ?? new Error('aborted');
    if (route.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, route.delayMs);
        init.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(init.signal.reason ?? new Error('aborted'));
          },
          { once: true },
        );
      });
    }
    if (route.throws !== undefined) throw route.throws;
    const status = route.status ?? 200;
    const headers = new Headers({
      'content-type': route.contentType ?? 'text/html; charset=utf-8',
      ...route.headers,
    });
    const body = route.body ?? '';
    const response: TransportResponse = {
      status,
      headers,
      body: new Blob([body]).stream(),
      via: route.via ?? init.client,
      abort: () => {},
    };
    return response;
  };
}

/** A big-enough body of the given size (for the byte-cap tests). */
export function bodyOf(bytes: number): string {
  return 'x'.repeat(bytes);
}
