import axios from 'axios';
import { api } from './api';
import type { CartItem } from '../store/cartStore';
import {
  countOfflineQueue,
  enqueueOfflineSale,
  getOfflineQueue,
  removeOfflineSale,
  OFFLINE_SYNC_INTERVAL_MS,
  type ManualMetodo,
  type QueuedSale,
} from './offlineQueue';

export interface PortalTenant {
  id: string;
  nome: string;
  email: string;
}

export interface ManualSaleResult {
  transactionId: string;
  ok: boolean;
  duplicate?: boolean;
}

const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

portalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('portalToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function portalLogin(
  email: string,
  senha: string
): Promise<PortalTenant> {
  const { data } = await api.post<{ token: string; tenant: PortalTenant }>(
    '/portal/login',
    { email, senha }
  );
  sessionStorage.setItem('portalToken', data.token);
  sessionStorage.setItem('portalTenant', JSON.stringify(data.tenant));
  localStorage.setItem('tenantId', data.tenant.id);
  sessionStorage.setItem('operadorMode', '1');

  try {
    const totensRes = await portalApi.get<{ totens: Array<{ id: string; ativo: boolean }> }>(
      '/portal/totens'
    );
    const primeiro = totensRes.data.totens.find((t) => t.ativo);
    if (primeiro) {
      localStorage.setItem('totemId', primeiro.id);
    }
  } catch {
    // totem opcional no modo operador
  }

  return data.tenant;
}

export function isOperadorLoggedIn(): boolean {
  return Boolean(sessionStorage.getItem('portalToken'));
}

export function operadorLogout(): void {
  sessionStorage.removeItem('portalToken');
  sessionStorage.removeItem('portalTenant');
  sessionStorage.removeItem('operadorMode');
}

export async function createManualSale(
  sale: QueuedSale
): Promise<ManualSaleResult> {
  const { data } = await portalApi.post<ManualSaleResult>(
    '/portal/vendas/manual',
    {
      clientTransactionId: sale.id,
      items: sale.items,
      total: sale.total,
      metodo: sale.metodo,
      totemId: sale.totemId,
    }
  );
  return data;
}

export function buildQueuedSale(
  items: CartItem[],
  total: number,
  metodo: ManualMetodo
): QueuedSale {
  return {
    id: crypto.randomUUID(),
    items: items.map(({ id, quantidade }) => ({ productId: id, quantidade })),
    total,
    metodo,
    totemId: localStorage.getItem('totemId'),
    createdAt: new Date().toISOString(),
  };
}

type SyncListener = (pending: number) => void;

let syncTimer: number | null = null;
const listeners = new Set<SyncListener>();

export function subscribeOfflineSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(countOfflineQueue());
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  const n = countOfflineQueue();
  listeners.forEach((fn) => fn(n));
}

export async function syncOfflineQueue(): Promise<void> {
  if (!navigator.onLine || !isOperadorLoggedIn()) return;

  const queue = getOfflineQueue();
  for (const sale of queue) {
    try {
      await createManualSale(sale);
      removeOfflineSale(sale.id);
    } catch (err) {
      console.warn('Falha ao sincronizar venda offline:', sale.id, err);
      break;
    }
  }
  notifyListeners();
}

export function startOfflineSyncLoop(): () => void {
  if (syncTimer != null) return () => undefined;

  const tick = () => {
    syncOfflineQueue().catch(() => undefined);
  };

  tick();
  syncTimer = window.setInterval(tick, OFFLINE_SYNC_INTERVAL_MS);

  const onOnline = () => tick();
  window.addEventListener('online', onOnline);

  return () => {
    if (syncTimer != null) {
      window.clearInterval(syncTimer);
      syncTimer = null;
    }
    window.removeEventListener('online', onOnline);
  };
}

export async function submitManualSale(
  items: CartItem[],
  total: number,
  metodo: ManualMetodo
): Promise<{ ok: true; queued: boolean }> {
  const sale = buildQueuedSale(items, total, metodo);

  if (!navigator.onLine) {
    enqueueOfflineSale(sale);
    notifyListeners();
    return { ok: true, queued: true };
  }

  try {
    await createManualSale(sale);
    return { ok: true, queued: false };
  } catch {
    enqueueOfflineSale(sale);
    notifyListeners();
    return { ok: true, queued: true };
  }
}
