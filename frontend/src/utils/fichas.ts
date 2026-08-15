import type { CartItem } from '../store/cartStore';

export type FichaVia = 'unica' | 'barman' | 'cliente';

export type FichaTicket = {
  key: string;
  nome: string;
  productId?: string;
  /** Logo individual do produto (data URL), se houver. */
  logo?: string | null;
  via?: FichaVia;
  /** Numero do dia (001, 002…). */
  codigo?: string;
  seqDia?: number;
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

const DAY_SEQ_KEY = 'totemFichaDaySeq';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextDaySeq(): number {
  try {
    const raw = localStorage.getItem(DAY_SEQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day: string; n: number }) : null;
    const day = todayKey();
    const n = parsed && parsed.day === day ? Number(parsed.n) || 0 : 0;
    const next = n + 1;
    localStorage.setItem(DAY_SEQ_KEY, JSON.stringify({ day, n: next }));
    return next;
  } catch {
    return Math.floor(Math.random() * 900) + 100;
  }
}

export function formatFichaNumero(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0');
}

export function generateFichaCodigo(): string {
  return formatFichaNumero(nextDaySeq());
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

export function readProductFicha2ViasFlags(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('productFicha2ViasFlags');
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

/** Expande impressoes: 2 vias e ficha unica sao independentes. */
export function expandFichaTickets(
  items: Array<{
    id?: string;
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean | string | number | null;
    ficha_2_vias?: boolean | string | number | null;
    ficha_logo_data?: string | null;
  }>
): FichaTicket[] {
  const flags = readProductFichaFlags();
  const dualFlags = readProductFicha2ViasFlags();
  const logos = readProductFichaLogos();
  const tickets: FichaTicket[] = [];
  for (const item of items) {
    const fromItemFicha = isImprimeFicha(item.imprime_ficha);
    const fromConfigFicha = item.id ? Boolean(flags[item.id]) : false;
    const dual =
      isImprimeFicha(item.ficha_2_vias) ||
      (item.id ? Boolean(dualFlags[item.id]) : false);
    const unica = (fromItemFicha || fromConfigFicha) && !dual;

    if (!dual && !unica) continue;

    const logoFromItem =
      item.ficha_logo_data && item.ficha_logo_data.startsWith('data:image/')
        ? item.ficha_logo_data
        : null;
    const logoFromConfig = item.id ? logos[item.id] ?? null : null;
    const logo = logoFromItem || logoFromConfig;
    const qtd = Math.max(0, Math.floor(Number(item.quantidade) || 0));
    for (let i = 0; i < qtd; i += 1) {
      const base = `${item.id ?? item.nome}-${i}`;
      if (dual) {
        const seqDia = nextDaySeq();
        const codigo = formatFichaNumero(seqDia);
        tickets.push({
          key: `${base}-bar`,
          productId: item.id,
          nome: item.nome.trim() || 'FICHA',
          via: 'barman',
          codigo,
          seqDia,
        });
        tickets.push({
          key: `${base}-cli`,
          productId: item.id,
          nome: item.nome.trim() || 'FICHA',
          via: 'cliente',
          codigo,
          seqDia,
        });
      } else {
        tickets.push({
          key: base,
          productId: item.id,
          nome: item.nome.trim() || 'FICHA',
          logo,
          via: 'unica',
        });
      }
    }
  }
  return tickets;
}

export function countFichaTickets(items: CartItem[]): number {
  return expandFichaTickets(items).length;
}
