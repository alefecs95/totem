import 'dotenv/config';

// Domínio do PWA do totem (usado também na URL de setup do QR Code).
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
// Domínio do painel admin.
const adminUrl = process.env.ADMIN_URL ?? 'http://localhost:5174';

// Origens permitidas no CORS: PWA + admin + extras (CORS_ORIGINS separados por vírgula).
const corsOrigins = [
  ...new Set(
    [frontendUrl, adminUrl, ...(process.env.CORS_ORIGINS ?? '').split(',')]
      .map((s) => s.trim())
      .filter(Boolean)
  ),
];

export const env = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl,
  adminUrl,
  corsOrigins,
  // URL pública da própria API (usada no notification_url dos webhooks).
  publicUrl: process.env.PUBLIC_URL ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwt: {
    secret: process.env.ADMIN_JWT_SECRET ?? '',
  },
  comissaoPadrao: Number(process.env.COMISSAO_PADRAO ?? 5),
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
    // Código MCC do caixa (POS). Padrão do exemplo da doc do MP.
    posCategory: Number(process.env.MP_POS_CATEGORY ?? 621102),
  },
  sumup: {
    apiKey: process.env.SUMUP_API_KEY ?? '',
  },
};
