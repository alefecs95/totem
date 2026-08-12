import 'dotenv/config';

function requireJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'ADMIN_JWT_SECRET não está definido. Configure no .env antes de iniciar o servidor.'
    );
  }
  if (secret.length < 32) {
    throw new Error(
      'ADMIN_JWT_SECRET deve ter no mínimo 32 caracteres. Gere um valor forte (ex.: openssl rand -base64 32).'
    );
  }
  return secret;
}

// Domínio do PWA do totem (usado também na URL de setup do QR Code).
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
// Domínio do painel admin.
const adminUrl = process.env.ADMIN_URL ?? 'http://localhost:5174';
// Portal do organizador (dono do totem locado).
const portalUrl = process.env.PORTAL_URL ?? 'http://localhost:5175';

// Origens permitidas no CORS: PWA + admin + portal + extras (CORS_ORIGINS separados por vírgula).
const corsOrigins = [
  ...new Set(
    [frontendUrl, adminUrl, portalUrl, ...(process.env.CORS_ORIGINS ?? '').split(',')]
      .map((s) => s.trim())
      .filter(Boolean)
  ),
];

export const env = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl,
  adminUrl,
  portalUrl,
  corsOrigins,
  // URL pública da própria API (usada no notification_url dos webhooks).
  publicUrl: process.env.PUBLIC_URL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwt: {
    secret: requireJwtSecret(),
  },
  comissaoPadrao: Number(process.env.COMISSAO_PADRAO ?? 5),
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    posCategory: Number(process.env.MP_POS_CATEGORY ?? 621102),
    // Só use sandbox=true com credenciais de teste do MP.
    sandbox: process.env.MP_SANDBOX === 'true',
  },
};
