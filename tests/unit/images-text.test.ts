import { describe, expect, it } from 'vitest';
import { driveImageUrl, extractDriveId, normaliseImageUrl, lh3Url } from '../../src/lib/images.ts';
import { canonicalCollection, slugify, splitPipe } from '../../src/lib/text.ts';

const ID = '1U8FwNPCdm-n8RUvSNRcJLBA_27u-Pjkb';

describe('extractDriveId', () => {
  it('accepts every Drive URL shape the studio uses', () => {
    expect(extractDriveId(ID)).toBe(ID);
    expect(extractDriveId(`https://drive.google.com/thumbnail?id=${ID}&sz=w800`)).toBe(ID);
    expect(extractDriveId(`https://drive.google.com/uc?export=view&id=${ID}`)).toBe(ID);
    expect(extractDriveId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(extractDriveId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(extractDriveId(`https://drive.google.com/file/d/${ID}`)).toBe(ID);
    expect(extractDriveId(`https://lh3.googleusercontent.com/d/${ID}=w1000`)).toBe(ID);
    expect(extractDriveId(`https://lh3.googleusercontent.com/d/${ID}`)).toBe(ID);
  });
  it('rejects junk and bounds the id length', () => {
    expect(extractDriveId('')).toBeNull();
    expect(extractDriveId('not a url')).toBeNull();
    expect(extractDriveId('https://example.com/photo.jpg')).toBeNull();
    expect(
      extractDriveId('https://drive.google.com/drive/folders/1B97RZtgjHCLNePWf40j2a1h8vPtaU6ee'),
    ).toBeNull();
    expect(extractDriveId('a'.repeat(19))).toBeNull();
    expect(extractDriveId('a'.repeat(20))).toBe('a'.repeat(20));
    expect(extractDriveId('a'.repeat(129))).toBeNull();
    expect(extractDriveId(`https://drive.google.com/file/d/${'a'.repeat(200)}/view`)).toBeNull();
  });
});

describe('driveImageUrl / normaliseImageUrl', () => {
  it('formats the verified lh3 pattern and refuses bad ids', () => {
    expect(driveImageUrl(ID)).toBe(`/api/image/${ID}?w=800`);
    // The upstream is still lh3; only what a browser is pointed at changed.
    expect(lh3Url(ID)).toBe(`https://lh3.googleusercontent.com/d/${ID}=w800`);
    expect(driveImageUrl(ID, 1600)).toBe(`/api/image/${ID}?w=1600`);
    expect(() => driveImageUrl('../etc/passwd')).toThrow();
  });
  it('normalises cover cells: Drive → lh3, allow-listed https kept, anything else refused with a reason', () => {
    expect(normaliseImageUrl(ID)).toEqual({ url: `/api/image/${ID}?w=1600` });
    expect(normaliseImageUrl('https://lh3.googleusercontent.com/some/other.jpg')).toEqual({
      url: 'https://lh3.googleusercontent.com/some/other.jpg',
    });
    expect(normaliseImageUrl('http://lh3.googleusercontent.com/x').reason).toMatch(/https/);
    expect(normaliseImageUrl('https://evil.example/x.png').reason).toMatch(/not allow-listed/);
    expect(normaliseImageUrl('javascript:alert(1)').reason).toMatch(/https/);
    expect(normaliseImageUrl('nonsense').reason).toMatch(/not a Drive id/);
  });
});

describe('text helpers', () => {
  it('slugifies like the legacy script', () => {
    expect(slugify('People // Antique Oushak Runner')).toBe('people-antique-oushak-runner');
    expect(slugify('Çanakkale pink ')).toBe('canakkale-pink');
    expect(slugify('Wooly Grass')).toBe('wooly-grass');
  });
  it('splits pipes and dedupes case-insensitively', () => {
    expect(splitPipe('Kilim | Denizli|kilim|Plant Dyes')).toEqual(['Kilim', 'Denizli', 'Plant Dyes']);
    expect(splitPipe(undefined)).toEqual([]);
  });
  it('canonicalises the legacy collection spellings', () => {
    expect(canonicalCollection('Wabi-sabi ')).toBe('Wabi Sabi');
    expect(canonicalCollection('Kilim')).toBe('Kilims');
    expect(canonicalCollection('Classics')).toBe('Classics');
  });
});
