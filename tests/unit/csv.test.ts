// RFC 4180 serialisation (src/lib/csv.ts, brief §9): quote only when required, double embedded
// quotes, CRLF records, UTF-8 BOM, and Sheets' JSON booleans/numbers rendered the way Shopify's
// importer expects to read them back.
import { describe, expect, it } from 'vitest';
import { CSV_BOM, CSV_EOL, csvField, csvRow, toCsv } from '../../src/lib/csv.ts';

describe('csvField (RFC 4180 §2.5–2.7)', () => {
  it('leaves an ordinary field bare and quotes only the four characters that force it', () => {
    expect(csvField('Winks')).toBe('Winks');
    expect(csvField('100% Wool')).toBe('100% Wool');
    expect(csvField('Denizli, Turkey')).toBe('"Denizli, Turkey"');
    expect(csvField('a "quoted" word')).toBe('"a ""quoted"" word"');
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('line one\r\nline two')).toBe('"line one\r\nline two"');
  });

  it('doubles every quote, including a field that is nothing but quotes', () => {
    expect(csvField('""')).toBe('""""""');
    expect(csvField('<p class="lead">Hand-woven, Denizli</p>')).toBe(
      '"<p class=""lead"">Hand-woven, Denizli</p>"',
    );
  });

  it('renders blanks, numbers and Sheets booleans the way Shopify reads them back', () => {
    expect(csvField('')).toBe('');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(576)).toBe('576');
    expect(csvField(0)).toBe('0');
    expect(csvField(1234.5)).toBe('1234.5');
    expect(csvField(true)).toBe('TRUE');
    expect(csvField(false)).toBe('FALSE');
  });

  it('never sanitises a leading = + - @ (the file is re-imported by Shopify, not typed by a user)', () => {
    expect(csvField('=SUM(A1)')).toBe('=SUM(A1)');
    expect(csvField('-40 cm')).toBe('-40 cm');
    expect(csvField('+971 ...')).toBe('+971 ...');
  });
});

describe('csvRow / toCsv', () => {
  it('joins with commas and terminates every record with CRLF, final record included', () => {
    expect(csvRow(['a', 'b', ''])).toBe('a,b,');
    const csv = toCsv(
      [
        ['Handle', 'Title'],
        ['winks', 'Winks'],
      ],
      { bom: false },
    );
    expect(csv).toBe(`Handle,Title${CSV_EOL}winks,Winks${CSV_EOL}`);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('prepends the UTF-8 BOM by default and encodes it as the three-byte EF BB BF', () => {
    const csv = toCsv([['Origin'], ['İzmir, Türkiye']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toHaveLength(1);
    expect([...Buffer.from(csv, 'utf8').subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // The BOM is one character but three bytes; the accented origin survives the round trip.
    expect(Buffer.from(csv, 'utf8').toString('utf8')).toContain('İzmir, Türkiye');
  });

  it('round-trips an embedded newline: the quoted field stays one record', () => {
    const csv = toCsv([['Body (HTML)'], ['<p>One</p>\r\n<p>Two, "quoted"</p>']], { bom: false });
    expect(csv).toBe(`Body (HTML)${CSV_EOL}"<p>One</p>${CSV_EOL}<p>Two, ""quoted""</p>"${CSV_EOL}`);
    // Records outside quotes: exactly two (the header and the one product), plus the trailing empty.
    expect(csv.split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/)).toHaveLength(3);
  });

  it('serialises no rows as just the BOM', () => {
    expect(toCsv([])).toBe(CSV_BOM);
    expect(toCsv([], { bom: false })).toBe('');
  });
});
