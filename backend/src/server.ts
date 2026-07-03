import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { runMigrations } from './config/migrations';
import configRoutes from './routes/config';
import paymentRoutes from './routes/payment';
import webhookRoutes from './routes/webhook';
import adminRoutes from './routes/admin';

// TODO: implementar (middleware de identificação tenant/totem via headers x-tenant-id / x-totem-id, tratamento de erros)
const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());

// Rotas montadas sob /api para casar com o proxy do Vite (dev) e o Caddy (prod).
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', configRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin', adminRoutes);

async function start(): Promise<void> {
  try {
    await runMigrations();
  } catch (err) {
    console.error('Falha ao aplicar migrations:', err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Totem Festival backend rodando na porta ${env.port}`);
  });
}

start();
