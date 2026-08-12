import type { CartItem } from '../store/cartStore';

export type FichaTicket = {
  key: string;
  nome: string;
  /** Logo individual do produto (data URL), se houver. */
  logo?: string | null;
};

/** Aceita true, "true", 1 — evita perder flag vinda de JSON/API. */
export function isImprimeFicha(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'sim' || v === 'yes';
  }
  return false;
}

export function readProductFichaFlags(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('productFichaFlags');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      out[id] = isImprimeFicha(value);
    }
    return out;
  } catch {
    return {};
  }
}

export function readProductFichaLogos(): Record<string, string> {
  try {
    const raw = localStorage.getItem('productFichaLogos');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.startsWith('data:image/')) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Expande itens marcados com imprime_ficha em 1 ficha por unidade. */
export function expandFichaTickets(
  items: Array<{
    id?: string;
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean | string | number | null;
    ficha_logo_data?: string | null;
  }>
): FichaTicket[] {
  const flags = readProductFichaFlags();
  const logos = readProductFichaLogos();
  const tickets: FichaTicket[] = [];
  for (const item of items) {
    const fromItem = isImprimeFicha(item.imprime_ficha);
    const fromConfig = item.id ? Boolean(flags[item.id]) : false;
    if (!fromItem && !fromConfig) continue;
    const logoFromItem =
      item.ficha_logo_data && item.ficha_logo_data.startsWith('data:image/')
        ? item.ficha_logo_data
        : null;
    const logoFromConfig = item.id ? logos[item.id] ?? null : null;
    const logo = logoFromItem || logoFromConfig;
    const qtd = Math.max(0, Math.floor(Number(item.quantidade) || 0));
    for (let i = 0; i < qtd; i += 1) {
      tickets.push({
        key: `${item.id ?? item.nome}-${i}`,
        nome: item.nome.trim() || 'FICHA',
        logo,
      });
    }
  }
  return tickets;
}

export function countFichaTickets(items: CartItem[]): number {
  return expandFichaTickets(items).length;
}
