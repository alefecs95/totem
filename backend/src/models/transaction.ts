// TODO: implementar (tabela de transações: valor bruto, taxa gateway, comissão plataforma, líquido organizador)
export interface Transaction {
  id: string;
  tenantId: string;
  gateway: 'mercadopago' | 'sumup';
  method: 'pix' | 'debit' | 'credit';
  grossAmount: number; // valor bruto
  gatewayFee: number; // taxa do gateway
  platformCommission: number; // sua comissão
  netAmount: number; // líquido do organizador
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  createdAt: string;
}

// TODO: implementar (funções: create, updateStatus, listByTenant, sumCommissions)
