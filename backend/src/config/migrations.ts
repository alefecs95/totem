import bcrypt from 'bcrypt';
import crypto from 'crypto';
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

-- Colunas adicionais (idempotentes) para integração de Loja/Caixa do Mercado Pago
-- e localização da loja (obrigatória na API de stores do MP).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mp_user_id VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mp_store_id VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS endereco VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS numero VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bairro VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cidade VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS estado VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
ALTER TABLE totens ADD COLUMN IF NOT EXISTS mp_pos_id VARCHAR(50);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sumup_merchant_code VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sumup_affiliate_key TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS portal_senha_hash TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) NOT NULL DEFAULT 'outro';

-- Categorias para produtos já existentes (antes da coluna categoria).
UPDATE produtos SET categoria = 'bebida_alcoolica' WHERE categoria = 'outro' AND nome ILIKE '%cerveja%';
UPDATE produtos SET categoria = 'bebida_nao_alcoolica' WHERE categoria = 'outro' AND (nome ILIKE '%refrigerante%' OR nome ILIKE '%água%' OR nome ILIKE '%agua%');
UPDATE produtos SET categoria = 'comida' WHERE categoria = 'outro' AND nome ILIKE '%comida%';

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

const DEFAULT_ADMIN_EMAIL = 'admin@totem.com';

function generateSecurePassword(length = 20): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
}

async function seedInitialAdminIfNeeded(): Promise<void> {
  const countResult = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM admin_users'
  );
  if (Number(countResult.rows[0]?.count ?? 0) > 0) {
    return;
  }

  const senha = generateSecurePassword();
  const senhaHash = bcrypt.hashSync(senha, 10);
  await query(
    'INSERT INTO admin_users (email, senha_hash) VALUES ($1, $2)',
    [DEFAULT_ADMIN_EMAIL, senhaHash]
  );

  console.log('');
  console.log('⚠️  SENHA INICIAL DO ADMIN — ANOTE E TROQUE IMEDIATAMENTE:');
  console.log(`    E-mail: ${DEFAULT_ADMIN_EMAIL}`);
  console.log(`    Senha:  ${senha}`);
  console.log('');
}

export async function runMigrations(): Promise<void> {
  await query(SCHEMA_SQL);
  await seedInitialAdminIfNeeded();
  console.log('Migrations aplicadas com sucesso.');
}
