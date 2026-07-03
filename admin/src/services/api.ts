import axios from 'axios';

// Em dev usa o proxy do Vite (/api). Em produção, VITE_API_URL aponta
// para o domínio da API (ex.: https://totem-api.easypanel.host/api).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
});

// Injeta o JWT do admin (sessionStorage) em toda requisição.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Em 401, limpa a sessão e volta ao login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      sessionStorage.removeItem('adminToken');
      // BASE_URL respeita o subpath /admin/ configurado no Vite.
      const loginPath = import.meta.env.BASE_URL;
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  }
);

export interface Tenant {
  id: string;
  nome: string;
  responsavel: string;
  telefone: string | null;
  email: string | null;
  gateway: 'mercadopago' | 'sumup';
  comissao_pct: string | number;
  mp_access_token: string | null;
  mp_webhook_secret: string | null;
  mp_device_id: string | null;
  sumup_api_key: string | null;
  sumup_reader_id: string | null;
  ativo: boolean;
  criado_em: string;
}

export type TenantInput = Partial<
  Pick<
    Tenant,
    | 'nome'
    | 'responsavel'
    | 'telefone'
    | 'email'
    | 'gateway'
    | 'mp_access_token'
    | 'mp_webhook_secret'
    | 'sumup_api_key'
  >
> & { comissao_pct?: number };

export interface Transaction {
  id: string;
  tenant_id: string;
  tenant_nome: string | null;
  gateway: string;
  metodo: string;
  status: string;
  valor_bruto: string;
  comissao_valor: string;
  valor_liquido: string;
  repasse_status: string;
  criado_em: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  pagina: number;
  totalPaginas: number;
}

export interface DashboardData {
  totalVendas: number;
  totalComissoes: number;
  totalLiquido: number;
  vendasHoje: number;
  vendasPendentesRepasse: number;
}

export interface TransactionsFilters {
  tenantId?: string;
  status?: string;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  limit?: number;
}

export async function login(email: string, senha: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/admin/login', {
    email,
    senha,
  });
  return data.token;
}

export async function getDashboard(): Promise<DashboardData> {
  const { data } = await api.get<DashboardData>('/admin/dashboard');
  return data;
}

export async function getTenants(): Promise<Tenant[]> {
  const { data } = await api.get<{ tenants: Tenant[] }>('/admin/tenants');
  return data.tenants;
}

export async function createTenant(input: TenantInput): Promise<Tenant> {
  const { data } = await api.post<{ tenant: Tenant }>('/admin/tenants', input);
  return data.tenant;
}

export async function updateTenant(
  id: string,
  input: TenantInput
): Promise<Tenant> {
  const { data } = await api.put<{ tenant: Tenant }>(
    `/admin/tenants/${id}`,
    input
  );
  return data.tenant;
}

export async function deleteTenant(id: string): Promise<void> {
  await api.delete(`/admin/tenants/${id}`);
}

export interface Totem {
  id: string;
  tenant_id: string;
  nome: string;
  local: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
  setupUrl: string;
}

export interface TotemInput {
  nome: string;
  local?: string;
}

export async function getTotens(tenantId: string): Promise<Totem[]> {
  const { data } = await api.get<{ totens: Totem[] }>(
    `/admin/tenants/${tenantId}/totens`
  );
  return data.totens;
}

export async function createTotem(
  tenantId: string,
  input: TotemInput
): Promise<Totem> {
  const { data } = await api.post<{ totem: Totem }>(
    `/admin/tenants/${tenantId}/totens`,
    input
  );
  return data.totem;
}

export async function deleteTotem(id: string): Promise<void> {
  await api.delete(`/admin/totens/${id}`);
}

export async function getTransactions(
  filters: TransactionsFilters = {}
): Promise<TransactionsResponse> {
  const { data } = await api.get<TransactionsResponse>('/admin/transactions', {
    params: filters,
  });
  return data;
}

export async function marcarRepasse(id: string): Promise<void> {
  await api.put(`/admin/transactions/${id}/repasse`);
}
