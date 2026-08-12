import axios from 'axios';

const DEFAULT_API =
  import.meta.env.VITE_API_URL ??
  'https://totem-totem-api.jgdvyu.easypanel.host/api';

export function getApiBase(): string {
  return localStorage.getItem('pdvApiUrl') || DEFAULT_API;
}

export function setApiBase(url: string): void {
  localStorage.setItem('pdvApiUrl', url.replace(/\/$/, ''));
}

export interface PdvProduct {
  id: string;
  nome: string;
  preco: number;
  emoji: string;
  cor: string;
  categoria: string;
  imprime_ficha: boolean;
  ficha_2_vias?: boolean;
  ficha_logo_data: string | null;
}

export type CardType = 'credit' | 'debit';
export type PayGateway = 'sumup' | 'mercadopago';

export interface SumupSurcharge {
  enabled: boolean;
  debitPercent: number;
  creditPercent: number;
}

export interface SumUpReader {
  id: string;
  name: string;
  status: string;
  model?: string;
  deviceStatus?: string | null;
}

export interface PdvSale {
  id: string;
  metodo: string;
  status: string;
  gateway: string;
  valor_bruto: number;
  itens: unknown;
  criado_em: string;
  totem_nome: string | null;
}

export interface PdvConfig {
  codigo: string;
  tenantId: string;
  nomeFestival: string;
  gateway: string;
  produtos: PdvProduct[];
  pagamentos?: {
    pix: boolean;
    cartao: boolean;
    sumup?: boolean;
    mercadopago?: boolean;
  };
  sumupReaderId?: string | null;
  mpDeviceId?: string | null;
  sumupSurcharge?: SumupSurcharge | null;
}

export async function loadEvento(codigo: string): Promise<PdvConfig> {
  const { data } = await axios.get<PdvConfig>(
    `${getApiBase()}/pdv/${encodeURIComponent(codigo.trim().toUpperCase())}`
  );
  return data;
}

export async function listSumupReaders(
  codigo: string
): Promise<{ readers: SumUpReader[]; selectedReaderId: string | null }> {
  const { data } = await axios.get<{
    readers: SumUpReader[];
    selectedReaderId: string | null;
  }>(
    `${getApiBase()}/pdv/${encodeURIComponent(codigo)}/sumup-readers?live=1`
  );
  return data;
}

export async function selectSumupReader(
  codigo: string,
  readerId: string
): Promise<void> {
  await axios.post(
    `${getApiBase()}/pdv/${encodeURIComponent(codigo)}/sumup-reader`,
    { readerId }
  );
}

export async function getPdvSales(
  codigo: string,
  limit = 40
): Promise<PdvSale[]> {
  const { data } = await axios.get<{ transactions: PdvSale[] }>(
    `${getApiBase()}/pdv/${encodeURIComponent(codigo)}/transactions`,
    { params: { limit, status: 'approved' } }
  );
  return data.transactions ?? [];
}

export async function criarVenda(input: {
  codigo: string;
  items: Array<{ productId: string; quantidade: number }>;
  total: number;
  metodo: 'dinheiro' | 'cartao_fisico';
  clientTransactionId: string;
}): Promise<{
  transactionId: string;
  ok: boolean;
  itens: Array<{
    productId: string;
    nome: string;
    quantidade: number;
    imprime_ficha: boolean;
    ficha_2_vias?: boolean;
    ficha_logo_data?: string;
  }>;
  total: number;
  nomeFestival: string;
}> {
  const { data } = await axios.post(
    `${getApiBase()}/pdv/${encodeURIComponent(input.codigo)}/vendas`,
    {
      clientTransactionId: input.clientTransactionId,
      items: input.items,
      total: input.total,
      metodo: input.metodo,
    }
  );
  return data;
}

export async function createCardPayment(input: {
  tenantId: string;
  items: Array<{ productId: string; quantidade: number }>;
  total: number;
  cardType?: CardType;
  readerId?: string;
  deviceId?: string;
  gateway?: PayGateway;
}): Promise<{
  intentId: string;
  transactionId: string;
  chargedAmount?: number;
}> {
  const { data } = await axios.post(`${getApiBase()}/payment/card`, {
    tenantId: input.tenantId,
    items: input.items,
    total: input.total,
    ...(input.cardType ? { cardType: input.cardType } : {}),
    ...(input.readerId ? { readerId: input.readerId } : {}),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.gateway ? { gateway: input.gateway } : {}),
  });
  return data;
}

export async function getCardPaymentStatus(
  intentId: string,
  tenantId: string
): Promise<{ status: string; rawStatus?: string | null }> {
  const { data } = await axios.get(
    `${getApiBase()}/payment/card-status/${encodeURIComponent(intentId)}`,
    { params: { tenantId } }
  );
  return data;
}

/** Cancela cobranca pendente na maquininha (SumUp terminate / MP cancel). */
export async function cancelCardPayment(input: {
  tenantId: string;
  intentId: string;
  readerId?: string;
  deviceId?: string;
}): Promise<void> {
  await axios.post(`${getApiBase()}/payment/card-cancel`, {
    tenantId: input.tenantId,
    intentId: input.intentId,
    ...(input.readerId ? { readerId: input.readerId } : {}),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
  });
}
