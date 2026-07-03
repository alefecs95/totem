import crypto from 'crypto';
import { Router, type Request } from 'express';
import { query } from '../config/database';
import { env } from '../config/env';
import { getPaymentStatus } from '../services/mercadopago';

const router = Router();

// Valida a assinatura do webhook do Mercado Pago (x-signature / x-request-id).
// Template assinado: id:{data.id};request-id:{x-request-id};ts:{ts};
function verifyMpSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  // Sem secret configurado: não bloqueia (útil em dev). Em produção, defina o secret.
  if (!secret) return true;

  const signature = req.header('x-signature');
  const requestId = req.header('x-request-id');
  if (!signature) return false;

  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId =
    (req.query['data.id'] as string | undefined) ??
    (req.body?.data?.id !== undefined ? String(req.body.data.id) : undefined);

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

// Processa a notificação de pagamento de forma assíncrona (não bloqueia a resposta).
async function processPaymentNotification(paymentId: string): Promise<void> {
  const txResult = await query<{ id: string; tenant_id: string; status: string }>(
    'SELECT id, tenant_id, status FROM transactions WHERE payment_id = $1',
    [paymentId]
  );
  const transaction = txResult.rows[0];
  if (!transaction) return;

  const tenantResult = await query(
    'SELECT mp_access_token FROM tenants WHERE id = $1',
    [transaction.tenant_id]
  );
  const accessToken =
    tenantResult.rows[0]?.mp_access_token || env.mercadopago.accessToken;
  if (!accessToken) return;

  const { status } = await getPaymentStatus(accessToken, paymentId);
  if (status === 'approved' && transaction.status !== 'approved') {
    await query(
      'UPDATE transactions SET status = $1, atualizado_em = NOW() WHERE id = $2',
      ['approved', transaction.id]
    );
  }
}

// POST /api/webhook/mercadopago
router.post('/mercadopago', (req, res) => {
  if (!verifyMpSignature(req)) {
    res.sendStatus(401);
    return;
  }

  // Responde imediatamente (MP exige resposta em < 2s).
  res.sendStatus(200);

  const topic = req.body?.type ?? req.body?.topic;
  const paymentId =
    req.body?.data?.id !== undefined ? String(req.body.data.id) : undefined;

  if (topic === 'payment' && paymentId) {
    processPaymentNotification(paymentId).catch((err) => {
      console.error('Erro ao processar webhook de pagamento:', err);
    });
  }
});

// POST /api/webhook/sumup
router.post('/sumup', (_req, res) => {
  // TODO: implementar
  res.sendStatus(200);
});

export default router;
