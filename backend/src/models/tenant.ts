// TODO: implementar (tabela de tenants/organizadores: gateway escolhido, credenciais, comissão)
export interface Tenant {
  id: string;
  name: string; // nome do organizador
  gateway: 'mercadopago' | 'sumup';
  commissionPercent: number; // percentual de comissão da plataforma
  active: boolean;
  createdAt: string;
}

// TODO: implementar (funções: create, findById, list, update, deactivate)
