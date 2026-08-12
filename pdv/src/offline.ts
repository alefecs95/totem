/** Fila local de vendas do PDV Electron (funciona sem internet). */

export const PDV_OFFLINE_KEY = 'pdv_offline_sales_queue';

export type ManualMetodo = 'dinheiro' | 'cartao_fisico';

export interface QueuedPdvSale {
  id: string;
  codigo: string;
  items: Array<{ productId: string; quantidade: number }>;
  total: number;
  metodo: ManualMetodo;
  createdAt: string;
  printItems: Array<{
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean;
    ficha_2_vias?: boolean;
    ficha_logo_data?: string | null;
  }>;
  nomeFestival: string;
}

export function getOfflineQueue(): QueuedPdvSale[] {
  try {
    const raw = localStorage.getItem(PDV_OFFLINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedPdvSale[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(queue: QueuedPdvSale[]): void {
  localStorage.setItem(PDV_OFFLINE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineSale(sale: QueuedPdvSale): void {
  const queue = getOfflineQueue();
  if (queue.some((s) => s.id === sale.id)) return;
  save([...queue, sale]);
}

export function removeOfflineSale(id: string): void {
  save(getOfflineQueue().filter((s) => s.id !== id));
}

export function countOfflineQueue(): number {
  return getOfflineQueue().length;
}

export async function flushOfflineQueue(
  send: (sale: QueuedPdvSale) => Promise<void>
): Promise<{ synced: number; remaining: number }> {
  const queue = getOfflineQueue();
  let synced = 0;
  for (const sale of queue) {
    try {
      await send(sale);
      removeOfflineSale(sale.id);
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, remaining: countOfflineQueue() };
}
