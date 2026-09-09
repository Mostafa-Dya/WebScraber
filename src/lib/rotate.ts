// Rotate decision ported from reference/catalogue.html lines 199-212.
// "force" = tagged rotate in the sheet, turn regardless of the file's shape;
// "true"  = the sheet says portrait, so only turn a landscape file.
import type { Rotate } from './sheets/types.ts';

export function dataRot(rotate: Rotate): 'force' | '1' | '0' {
  if (rotate === 'force') return 'force';
  return rotate === 'true' ? '1' : '0';
}

export function shouldRotate(rot: string | undefined, naturalWidth: number, naturalHeight: number): boolean {
  return rot === 'force' || (rot === '1' && naturalWidth > naturalHeight);
}
