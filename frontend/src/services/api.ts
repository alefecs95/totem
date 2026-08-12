import axios from 'axios';
import type { CartItem, Product } from '../store/cartStore';

// Em dev usa o proxy do Vite (/api). Em produção (domínios separados),
// VITE_API_URL aponta para o domínio da API (ex.: https://totem-api.easypanel.host/api).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

// Injeta os headers de identificação do totem (tenant + totem físico)
// gravados no localStorage durante a configuração inicial.
api.interceptors.request.use((config) => {
  const tenantId = localStorage.getItem('tenantId');
  const totemId = localStorage.getItem('totemId');
  if (tenantId) config.headers['x-tenant-id'] = tenantId;
  if (totemId) config.headers['x-totem-id'] = totemId;
  return config;
});

export interface TotemConfig {
  nomeFestival: string;
  gateway?: 'mercadopago' | 'sumup';
  produtos: Product[];
  pagamentos?: {
    pix: boolean;
    cartao: boolean;
  };
  sumupSurcharge?: {
    enabled: boolean;
    debitPercent: number;
    creditPercent: number;
  } | null;
}

export function persistTotemConfig(config: TotemConfig): void {
  localStorage.setItem('tenantName', config.nomeFestival);
  if (config.pagamentos) {
    localStorage.setItem('pagamentos', JSON.stringify(config.pagamentos));
  }
  if (config.gateway) {
    localStorage.setItem('gateway', config.gateway);
  }
  if (config.sumupSurcharge) {
    localStorage.setItem('sumupSurcharge', JSON.stringify(config.sumupSurcharge));
  } else {
    localStorage.removeItem('sumupSurcharge');
  }
}

export interface CardPaymentResponse {
  intentId: string;
  transactionId: string;
  status: string;
  netAmount?: number;
  chargedAmount?: number;
  surchargeAmount?: number;
  cardType?: 'credit' | 'debit';
}

export interface PixPaymentResponse {
  paymentId: string;
  pixCode: string;
  qrCodeBase64: string;
  expiresIn: number;
}

export interface PaymentStatusResponse {
  status: string;
  mpPaymentId?: string | null;
  transactionId?: string | null;
  rawStatus?: string | null;
}

// GET /api/config -> nome do festival + produtos do tenant
export async function getConfig(): Promise<TotemConfig> {
  const { data } = await api.get<TotemConfig>('/config');
  return data;
}

// POST /api/payment/pix -> cria cobrança Pix
export async function createPixPayment(
  items: CartItem[],
  total: number,
  tenantId: string
): Promise<PixPaymentResponse> {
  const { data } = await api.post<PixPaymentResponse>('/payment/pix', {
    items: items.map(({ id, quantidade }) => ({
      productId: id,
      quantidade,
    })),
    total,
    tenantId,
  });
  return data;
}

// GET /api/payment/status/:paymentId -> status do pagamento
export async function getPaymentStatus(
  paymentId: string
): Promise<PaymentStatusResponse> {
  const { data } = await api.get<PaymentStatusResponse>(
    `/payment/status/${paymentId}`
  );
  return data;
}

// POST /api/payment/card -> cria pagamento no cartão (Point Smart / SumUp)
export async function createCardPayment(
  items: CartItem[],
  total: number,
  tenantId: string,
  cardType?: 'credit' | 'debit'
): Promise<CardPaymentResponse> {
  const { data } = await api.post<CardPaymentResponse>('/payment/card', {
    items: items.map(({ id, quantidade }) => ({
      productId: id,
      quantidade,
    })),
    total,
    tenantId,
    ...(cardType ? { cardType } : {}),
  });
  return data;
}

// GET /api/payment/card-status/:intentId -> status do pagamento no cartão
export async function getCardPaymentStatus(
  intentId: string,
  tenantId: string
): Promise<PaymentStatusResponse> {
  const { data } = await api.get<PaymentStatusResponse>(
    `/payment/card-status/${intentId}`,
    { params: { tenantId } }
  );
  return data;
}
