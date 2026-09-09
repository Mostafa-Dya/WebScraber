// The legacy `.msg` banner (reference/admin.html `msg()` / `hide()`): text only, three kinds, and an
// optional trailing action link built as a node (never markup).
import { append, clear } from './dom.ts';

export type MsgKind = 'ok' | 'err' | 'busy';

export function msg(target: HTMLElement, content: string | Node | Array<string | Node>, kind: MsgKind): void {
  clear(target);
  append(target, Array.isArray(content) ? content : [content]);
  target.className = `msg on ${kind}`;
  if (kind === 'err') target.setAttribute('role', 'alert');
  else target.setAttribute('role', 'status');
}

export function hide(target: HTMLElement): void {
  target.className = 'msg';
  clear(target);
}

export function isShown(target: HTMLElement): boolean {
  return target.classList.contains('on');
}

/** Hides the visible banners in `doc` (Escape, §8.2). Returns how many were hidden. */
export function hideVisible(doc: Document = document): number {
  let n = 0;
  doc.querySelectorAll<HTMLElement>('.msg.on').forEach((m) => {
    hide(m);
    n++;
  });
  return n;
}
