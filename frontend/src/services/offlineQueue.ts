/** Chave localStorage da fila de vendas offline (modo operador). */
export const OFFLINE_QUEUE_KEY = 'totem_offline_sales_queue';

/** Intervalo entre tentativas de sincronização (ms). */
export const OFFLINE_SYNC_INTERVAL_MS = 15000;

export type ManualMetodo = 'dinheiro' | 'cartao_fisico' | 'pix_proprietario';

export interface QueuedSale {
  id: string;
  items: Array<{ productId: string; quantidade: number }>;
  total: number;
  metodo: ManualMetodo;
  totemId: string | null;
  createdAt: string;
}

export function getOfflineQueue(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedSale[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: QueuedSale[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineSale(sale: QueuedSale): void {
  const queue = getOfflineQueue();
  if (queue.some((s) => s.id === sale.id)) return;
  saveOfflineQueue([...queue, sale]);
}

export function removeOfflineSale(id: string): void {
  saveOfflineQueue(getOfflineQueue().filter((s) => s.id !== id));
}

export function countOfflineQueue(): number {
  return getOfflineQueue().length;
}
