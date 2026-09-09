// /admin dashboard (docs/ADMIN_SPEC.md §2.1): relative times on the audit rows' timestamps.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function initDashboard(doc: Document = document, now: number = Date.now()): void {
  doc.querySelectorAll<HTMLElement>('[data-ts]').forEach((node) => {
    const rel = relativeTime(node.dataset.ts ?? '', now);
    if (!rel) return;
    node.title = node.dataset.ts ?? '';
    node.textContent = rel;
  });
}
