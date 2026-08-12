import crypto from 'crypto';
import { Router, type Request } from 'express';
import { query } from '../config/database';
import { env } from '../config/env';
import { getPaymentStatus } from '../services/mercadopago';
import {
  getSumUpPaymentStatus,
  getSumUpReaderStatus,
  resolveTenantSumUpConfig,
} from '../services/sumup';

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

function mapReaderHintStatus(raw: unknown): 'approved' | 'rejected' | 'pending' {
  const status = String(raw ?? '').toLowerCase();
  if (status === 'successful' || status === 'paid' || status === 'success') {
    return 'approved';
  }
  if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
    return 'rejected';
  }
  return 'pending';
}

async function approveTransaction(transactionId: string): Promise<void> {
  await query(
    `UPDATE transactions SET status = 'approved', atualizado_em = NOW()
     WHERE id = $1 AND status != 'approved'`,
    [transactionId]
  );
}

async function rejectTransaction(transactionId: string): Promise<void> {
  await query(
    `UPDATE transactions SET status = 'rejected', atualizado_em = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [transactionId]
  );
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
    await approveTransaction(transaction.id);
  }
}

type SumUpCheckoutWebhook = {
  event_type?: string;
  id?: string;
};

type SumUpReaderWebhook = {
  event_type?: string;
  id?: string;
  payload?: {
    client_transaction_id?: string;
    transaction_id?: string;
    status?: string;
    merchant_code?: string;
  };
};

async function processSumUpCheckoutWebhook(checkoutId: string): Promise<void> {
  const txResult = await query<{
    id: string;
    tenant_id: string;
    status: string;
  }>(
    'SELECT id, tenant_id, status FROM transactions WHERE payment_id = $1',
    [checkoutId]
  );
  const transaction = txResult.rows[0];
  if (!transaction || transaction.status === 'approved') return;

  const tenantResult = await query(
    `SELECT sumup_api_key, sumup_merchant_code, sumup_affiliate_app_id,
            sumup_affiliate_key, sumup_pay_to_email, sumup_reader_id
     FROM tenants WHERE id = $1`,
    [transaction.tenant_id]
  );
  const tenant = tenantResult.rows[0];
  const sumup = resolveTenantSumUpConfig(tenant ?? {});
  if (!sumup.apiKey) return;

  const { status } = await getSumUpPaymentStatus(sumup.apiKey, checkoutId);
  if (status === 'approved') {
    await approveTransaction(transaction.id);
  } else if (status === 'rejected') {
    await rejectTransaction(transaction.id);
  }
}

async function processSumUpReaderWebhook(payload: SumUpReaderWebhook): Promise<void> {
  const inner = payload.payload;
  const clientTransactionId = String(inner?.client_transaction_id ?? '').trim();
  const transactionIdHint = String(inner?.transaction_id ?? '').trim();
  const hintStatus = inner?.status ?? null;

  if (!clientTransactionId && !transactionIdHint) return;

  const txResult = await query<{
    id: string;
    tenant_id: string;
    status: string;
    payment_id: string | null;
  }>(
    `SELECT id, tenant_id, status, payment_id FROM transactions
     WHERE payment_id = $1
        OR id = $2
        OR payment_id = $3
     ORDER BY criado_em DESC
     LIMIT 1`,
    [
      clientTransactionId || transactionIdHint,
      clientTransactionId || transactionIdHint,
      transactionIdHint || clientTransactionId,
    ]
  );
  const transaction = txResult.rows[0];
  if (!transaction || transaction.status === 'approved') return;

  const tenantResult = await query(
    `SELECT sumup_api_key, sumup_merchant_code, sumup_affiliate_app_id,
            sumup_affiliate_key, sumup_pay_to_email, sumup_reader_id
     FROM tenants WHERE id = $1`,
    [transaction.tenant_id]
  );
  const tenant = tenantResult.rows[0];
  const sumup = resolveTenantSumUpConfig(tenant ?? {});
  if (!sumup.apiKey || !sumup.merchantCode) return;

  const paymentId = transaction.payment_id || clientTransactionId;

  try {
    const { status } = await getSumUpReaderStatus(
      sumup.apiKey,
      sumup.merchantCode,
      paymentId,
      transaction.id
    );

    if (status === 'approved') {
      await approveTransaction(transaction.id);
    } else if (status === 'rejected') {
      await rejectTransaction(transaction.id);
    }
  } catch (err) {
    // Fallback: usa hint do webhook se a API ainda não indexou a transação.
    const mapped = mapReaderHintStatus(hintStatus);
    if (mapped === 'approved') {
      await approveTransaction(transaction.id);
    } else if (mapped === 'rejected') {
      await rejectTransaction(transaction.id);
    } else {
      console.error('Erro ao processar webhook Solo SumUp:', err);
    }
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

// POST /api/webhook/sumup?type=checkout|reader
router.post('/sumup', (req, res) => {
  res.sendStatus(204);

  const webhookType = String(req.query.type ?? 'checkout');
  const body = (req.body ?? {}) as SumUpCheckoutWebhook & SumUpReaderWebhook;
  const eventType = String(body.event_type ?? '');

  if (webhookType === 'reader') {
    if (
      !eventType ||
      eventType === 'solo.transaction.updated' ||
      eventType.includes('transaction')
    ) {
      processSumUpReaderWebhook(body).catch((err) => {
        console.error('Erro ao processar webhook Solo SumUp:', err);
      });
    }
    return;
  }

  // Checkout online (Pix / widget)
  const checkoutId = String(body.id ?? '').trim();
  if (
    checkoutId &&
    (eventType.includes('checkout') || eventType === '' || !eventType)
  ) {
    processSumUpCheckoutWebhook(checkoutId).catch((err) => {
      console.error('Erro ao processar webhook checkout SumUp:', err);
    });
  }
});

export default router;
