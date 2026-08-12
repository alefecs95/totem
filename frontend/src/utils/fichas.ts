import type { CartItem } from '../store/cartStore';

export type FichaTicket = {
  key: string;
  nome: string;
};

/** Expande itens marcados com imprime_ficha em 1 ficha por unidade. */
export function expandFichaTickets(
  items: Array<{ id?: string; nome: string; quantidade: number; imprime_ficha?: boolean }>
): FichaTicket[] {
  const tickets: FichaTicket[] = [];
  for (const item of items) {
    if (!item.imprime_ficha) continue;
    const qtd = Math.max(0, Math.floor(Number(item.quantidade) || 0));
    for (let i = 0; i < qtd; i += 1) {
      tickets.push({
        key: `${item.id ?? item.nome}-${i}`,
        nome: item.nome.trim() || 'FICHA',
      });
    }
  }
  return tickets;
}

export function countFichaTickets(items: CartItem[]): number {
  return expandFichaTickets(items).length;
}
