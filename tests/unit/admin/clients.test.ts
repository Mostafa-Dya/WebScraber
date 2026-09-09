import { describe, expect, it } from 'vitest';
import {
  CLIENT_CODE_RE,
  clientCode,
  clientLink,
  clientToCells,
  newClientCode,
  parseClients,
  rand6,
} from '../../../src/lib/admin/clients.ts';
import { HEADERS } from '../../../src/lib/sheets/contract.ts';

/** The site's Votes `client` column rule (src/lib/sheets/parse.ts CLIENT_RE, handler.ts Body.client). */
const SITE_CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

describe('client codes (ADMIN_SPEC §6.1)', () => {
  it('rand6 draws six [a-z0-9] characters', () => {
    for (let i = 0; i < 50; i++) expect(rand6()).toMatch(/^[a-z0-9]{6}$/);
  });
  it('builds <slug[:20]>-<rand6>, always valid for the admin AND the site', () => {
    const fixed = () => 'k7m2pq';
    expect(clientCode('Nadia', fixed)).toBe('nadia-k7m2pq');
    expect(clientCode('  Nadia  Al-Sayed ', fixed)).toBe('nadia-al-sayed-k7m2pq');
    expect(clientCode('Twenty characters exactly here', fixed)).toBe('twenty-characters-ex-k7m2pq');
    expect(clientCode('Abcdefghijklmnopqrs-x', fixed)).toBe('abcdefghijklmnopqrs-k7m2pq'); // trailing dash trimmed
    expect(clientCode('نادية', fixed)).toBe('client-k7m2pq');
    for (const name of ['Nadia', 'نادية', 'A B C D E F G H I J K L M N O P', '---', 'x']) {
      const code = clientCode(name);
      expect(code).toMatch(CLIENT_CODE_RE);
      expect(code).toMatch(SITE_CLIENT_RE);
      expect(code.length).toBeLessThanOrEqual(28);
    }
  });
  it('retries once on a collision, then gives up', () => {
    let n = 0;
    const seq = () => (n++ === 0 ? 'aaaaaa' : 'bbbbbb');
    expect(newClientCode('Nadia', ['nadia-aaaaaa'], seq)).toBe('nadia-bbbbbb');
    expect(() => newClientCode('Nadia', ['nadia-cccccc'], () => 'cccccc')).toThrow(/collision/);
    expect(newClientCode('Nadia', ['NADIA-DDDDDD'], () => 'eeeeee')).toBe('nadia-eeeeee');
  });
  it('builds the link from the runtime origin only', () => {
    expect(clientLink('https://catalogue.serioludere.com/some/path', 'nadia-k7m2pq')).toBe(
      'https://catalogue.serioludere.com/nadia-k7m2pq',
    );
    expect(clientLink('http://localhost:4321', 'x-1')).toBe('http://localhost:4321/x-1');
    expect(() => clientLink('https://x.test', 'Bad Code')).toThrow();
  });
});

describe('parseClients', () => {
  it('maps rows newest-first with row numbers, drops malformed slugs, keeps inactive ones', () => {
    const { items, dropped } = parseClients([
      [...HEADERS.Customers],
      ['nadia-k7m2pq', 'Nadia', 'scrypt.131072.8.1.aa.bb', 'VIP', '2026-09-07T00:00:00Z', true],
      ['omar-aaaaaa', 'Omar', 'scrypt.131072.8.1.cc.dd', '', '', false],
      ['Bad Code', 'x', '', '', '', true],
      [],
    ]);
    expect(dropped).toBe(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      row: 2,
      code: 'nadia-k7m2pq',
      name: 'Nadia',
      note: 'VIP',
      status: 'active',
    });
    // An inactive customer keeps their history; they simply cannot sign in.
    expect(items[1]).toMatchObject({ row: 3, code: 'omar-aaaaaa', status: 'revoked' });
    // The hash round-trips through the row builder and is never part of the public view.
    expect(clientToCells(items[0]!)).toEqual([
      'nadia-k7m2pq',
      'Nadia',
      'scrypt.131072.8.1.aa.bb',
      'VIP',
      '2026-09-07T00:00:00Z',
      true,
    ]);
  });
});
