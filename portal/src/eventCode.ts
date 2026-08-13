const STORAGE_KEY = 'portalEventCode';

export function savePortalEventCode(codigo: string) {
  const normalized = codigo.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
}

export function getPortalEventCode(): string {
  return (localStorage.getItem(STORAGE_KEY) ?? '').trim().toUpperCase();
}

export function portalLoginPath(): string {
  const codigo = getPortalEventCode();
  return codigo ? `/e/${encodeURIComponent(codigo)}` : '/';
}
