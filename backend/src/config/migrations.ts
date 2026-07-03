import bcrypt from 'bcrypt';
import { query } from './database';

// Schema completo. Todas as tabelas usam IF NOT EXISTS para ser idempotente
// (seguro rodar várias vezes na inicialização).
const SCHEMA_SQL = `
-- TABELA: tenants (cada organizador/cliente que aluga o totem)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(200) NOT NULL,
  responsavel VARCHAR(200) NOT NULL,
  telefone VARCHAR(20),
  email VARCHAR(200),
  gateway VARCHAR(20) NOT NULL DEFAULT 'mercadopago',
  mp_access_token TEXT,
  mp_webhook_secret TEXT,
  mp_device_id VARCHAR(100),
  sumup_api_key TEXT,
  sumup_reader_id VARCHAR(100),
  comissao_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABELA: totens (cada dispositivo físico — tablet)
CREATE TABLE IF NOT EXISTS totens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  local VARCHAR(200),
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABELA: produtos (por tenant — cada organizador configura seus produtos)
CREATE TABLE IF NOT EXISTS produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  preco NUMERIC(10,2) NOT NULL,
  emoji VARCHAR(10) NOT NULL DEFAULT '🎟️',
  cor VARCHAR(7) NOT NULL DEFAULT '#FF6B00',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABELA: transactions (cada venda realizada)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  totem_id UUID REFERENCES totens(id),
  payment_id VARCHAR(200),
  gateway VARCHAR(20) NOT NULL,
  metodo VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  valor_bruto NUMERIC(10,2) NOT NULL,
  taxa_gateway_pct NUMERIC(5,4) NOT NULL,
  taxa_gateway_valor NUMERIC(10,2) NOT NULL,
  comissao_pct NUMERIC(5,2) NOT NULL,
  comissao_valor NUMERIC(10,2) NOT NULL,
  valor_liquido NUMERIC(10,2) NOT NULL,
  itens JSONB NOT NULL,
  repasse_status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  repasse_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABELA: admin_users
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ÍNDICES para performance com muitos totens e transações
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_totem_id ON transactions(totem_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_criado_em ON transactions(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_totens_tenant_id ON totens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_id ON produtos(tenant_id);
`;

// Admin padrão (email: admin@totem.com / senha: admin123).
// O hash é gerado em runtime com bcrypt para não versionar credenciais fixas.
const DEFAULT_ADMIN_EMAIL = 'admin@totem.com';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

export async function runMigrations(): Promise<void> {
  await query(SCHEMA_SQL);

  const senhaHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
  await query(
    `INSERT INTO admin_users (email, senha_hash)
     SELECT $1, $2
     WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE email = $1)`,
    [DEFAULT_ADMIN_EMAIL, senhaHash]
  );

  console.log('Migrations aplicadas com sucesso.');
}
