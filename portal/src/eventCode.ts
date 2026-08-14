export function normalizePortalCode(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/\s+/g, '');
}

const SESSION_KEY = 'portalEventCode';

export function rememberPortalCode(codigo: string) {
  const normalized = normalizePortalCode(codigo);
  if (normalized) sessionStorage.setItem(SESSION_KEY, normalized);
}

export function portalLoginPath(): string {
  const match = window.location.pathname.match(/^\/e\/([^/]+)/i);
  if (match?.[1]) return `/e/${match[1]}`;
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return `/e/${encodeURIComponent(stored)}`;
  return '/';
}
