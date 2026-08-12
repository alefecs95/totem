import axios from 'axios';

import type { ProductCategory } from '../utils/productCategories';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('portalToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      sessionStorage.removeItem('portalToken');
      sessionStorage.removeItem('portalTenant');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export interface TenantInfo {
  id: string;
  nome: string;
  email: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  nome: string;
  preco: number;
  categoria: ProductCategory;
  emoji: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  imprime_ficha: boolean;
  criado_em: string;
}

export type ProductInput = Pick<
  Product,
  'nome' | 'preco' | 'categoria' | 'emoji' | 'cor' | 'ativo' | 'imprime_ficha'
> & {
  ordem?: number;
};

export type { ProductCategory };

export interface Totem {
  id: string;
  nome: string;
  local: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
}

export interface TransactionItem {
  nome: string;
  quantidade: number;
  preco: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  totem_id: string | null;
  totem_nome: string | null;
  gateway: string;
  metodo: string;
  status: string;
  valor_bruto: string;
  valor_liquido: string;
  repasse_status: string;
  itens: TransactionItem[];
  criado_em: string;
}

export interface DashboardData {
  totalVendas: number;
  totalLiquido: number;
  vendasHoje: number;
  totalTransacoes: number;
  repassePendente: number;
  vendasPorProduto: Array<{ nome: string; quantidade: number; total: number }>;
  vendasPorTotem: Array<{
    totemId: string;
    totemNome: string;
    vendas: number;
    total: number;
  }>;
}

export async function login(email: string, senha: string): Promise<TenantInfo> {
  const { data } = await api.post<{ token: string; tenant: TenantInfo }>(
    '/portal/login',
    { email, senha }
  );
  sessionStorage.setItem('portalToken', data.token);
  sessionStorage.setItem('portalTenant', JSON.stringify(data.tenant));
  return data.tenant;
}

export function getStoredTenant(): TenantInfo | null {
  const raw = sessionStorage.getItem('portalTenant');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TenantInfo;
  } catch {
    return null;
  }
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await api.get<DashboardData>('/portal/dashboard');
  return data;
}

export async function getTotens(): Promise<Totem[]> {
  const { data } = await api.get<{ totens: Totem[] }>('/portal/totens');
  return data.totens;
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await api.get<{ produtos: Product[] }>('/portal/produtos');
  return data.produtos;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data } = await api.post<{ produto: Product }>('/portal/produtos', input);
  return data.produto;
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>
): Promise<Product> {
  const { data } = await api.put<{ produto: Product }>(`/portal/produtos/${id}`, input);
  return data.produto;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/portal/produtos/${id}`);
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface TransactionsFilters {
  status?: string;
  dataInicio?: string;
  dataFim?: string;
  totemId?: string;
  page?: number;
  limit?: number;
}

export async function getTransactions(
  filters: TransactionsFilters = {}
): Promise<TransactionsResponse> {
  const { data } = await api.get<TransactionsResponse>('/portal/transactions', {
    params: filters,
  });
  return data;
}
