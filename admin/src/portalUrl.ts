/** Monta o link do portal com o código do evento, no domínio do site (não localhost). */
export function portalEventUrl(codigo: string | null | undefined): string | null {
  if (!codigo?.trim()) return null;
  const code = codigo.trim().toUpperCase().replace(/\s+/g, '');
  const fromEnv = String(import.meta.env.VITE_PORTAL_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  const { protocol, hostname } = window.location;
  let base = fromEnv;
  if (!base || /localhost|127\.0\.0\.1/i.test(base)) {
    if (hostname.includes('-admin.')) {
      base = `${protocol}//${hostname.replace('-admin.', '-portal.')}`;
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      base = 'http://localhost:5175';
    } else {
      base = `${protocol}//${hostname.replace(/-admin\b/, '-portal')}`;
    }
  }
  return `${base.replace(/\/$/, '')}/e/${encodeURIComponent(code)}`;
}
