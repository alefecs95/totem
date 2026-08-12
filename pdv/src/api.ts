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

export interface PdvConfig {
  codigo: string;
  tenantId: string;
  nomeFestival: string;
  gateway: string;
  produtos: PdvProduct[];
}

export async function loadEvento(codigo: string): Promise<PdvConfig> {
  const { data } = await axios.get<PdvConfig>(
    `${getApiBase()}/pdv/${encodeURIComponent(codigo.trim().toUpperCase())}`
  );
  return data;
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
