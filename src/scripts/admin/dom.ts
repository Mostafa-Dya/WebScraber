// Tiny DOM builder for the admin scripts (docs/ADMIN_SPEC.md §8.2): text lands through
// `textContent` only — never `innerHTML` — so sheet text can never become markup.
export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child | Child[] = [],
  doc: Document = document,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else if (name === 'text') node.textContent = String(value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child | Child[]): void {
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' ? parent.ownerDocument!.createTextNode(c) : c);
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** `#id` lookup that throws a clear error when the page markup and the script disagree. */
export function byId<T extends HTMLElement = HTMLElement>(id: string, doc: Document = document): T {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`admin: missing #${id}`);
  return node as T;
}

export function maybe<T extends HTMLElement = HTMLElement>(id: string, doc: Document = document): T | null {
  return doc.getElementById(id) as T | null;
}

/** JSON block rendered by the page with jsonForScript() (§8.2). */
export function readJson<T>(id: string, doc: Document = document): T {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`admin: missing data block #${id}`);
  return JSON.parse(node.textContent || 'null') as T;
}

export function setDisabled(nodes: Iterable<HTMLButtonElement | HTMLInputElement>, disabled: boolean): void {
  for (const n of nodes) n.disabled = disabled;
}

export function money(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
