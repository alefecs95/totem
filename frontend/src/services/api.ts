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
  produtos: Product[];
}

export interface PaymentResponse {
  paymentId: string;
  status: string;
  qrCode?: string;
  qrCodeBase64?: string;
}

export interface PixPaymentResponse {
  paymentId: string;
  pixCode: string;
  qrCodeBase64: string;
  expiresIn: number;
}

export interface PaymentStatusResponse {
  status: string;
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
    items,
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
  tenantId: string
): Promise<PaymentResponse> {
  const { data } = await api.post<PaymentResponse>('/payment/card', {
    items,
    total,
    tenantId,
  });
  return data;
}
