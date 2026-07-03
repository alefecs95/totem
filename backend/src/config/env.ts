import 'dotenv/config';

// TODO: implementar (validar variáveis de ambiente com zod, exportar objeto tipado)
export const env = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwt: {
    secret: process.env.ADMIN_JWT_SECRET ?? '',
  },
  comissaoPadrao: Number(process.env.COMISSAO_PADRAO ?? 5),
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
  },
  sumup: {
    apiKey: process.env.SUMUP_API_KEY ?? '',
  },
};
