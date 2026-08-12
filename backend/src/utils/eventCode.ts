/** Gera código curto único para o PDV Electron (ex.: FESTA3K9). */
export function generateEventCode(nome: string): string {
  const base =
    nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6) || 'EVENTO';
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}${suffix}`.slice(0, 12);
}

export function normalizeEventCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}
