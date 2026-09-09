// Coarse user-agent family (ADR D8/D10.14): "Chrome/Windows", never the raw header. ≤ 64 chars.
export function uaFamily(ua: string | null | undefined): string {
  const s = (ua ?? '').slice(0, 512);
  if (!s) return 'unknown';
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : /bot|crawl|spider|curl|wget|python|node/i.test(s)
              ? 'Bot'
              : 'Other';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(s)
      ? 'iOS'
      : /Android/.test(s)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : 'Other';
  return `${browser}/${os}`.slice(0, 64);
}
