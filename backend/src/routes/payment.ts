import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query } from '../config/database';
import { env } from '../config/env';
import {
  createCardPayment,
  createPixPayment,
  cancelCardPaymentIntent,
  getCardPaymentStatus,
  getPaymentStatus,
  isValidMpDeviceId,
  type PaymentStatus,
} from '../services/mercadopago';
import {
  createSumUpCardPayment,
  createSumUpPixPayment,
  getSumUpPaymentStatus,
  getSumUpReaderStatus,
} from '../services/sumup';

const router = Router();

// Taxas de gateway do Mercado Pago.
const TAXA_PIX_MP = 0.0099; // 0,99% Pix
const TAXA_CARD_MP = 0.0199; // 1,99% cartão (padrão por ora)

const pixSchema = z.object({
  items: z.array(
    z.object({
      nome: z.string(),
      quantidade: z.number().int().positive(),
      preco: z.number().nonnegative(),
    })
  ),
  total: z.number().positive(),
  tenantId: z.string().uuid(),
});

const cardSchema = z.object({
  items: z.array(
    z.object({
      nome: z.string(),
      quantidade: z.number().int().positive(),
      preco: z.number().nonnegative(),
    })
  ),
  total: z.number().positive(),
  tenantId: z.string().uuid(),
  deviceId: z.string().min(1).optional(),
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// POST /api/payment/pix -> cria cobrança Pix e registra a transação
router.post('/pix', async (req, res) => {
  const parsed = pixSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const { items, total, tenantId } = parsed.data;

  try {
    const tenantResult = await query(
      'SELECT * FROM tenants WHERE id = $1 AND ativo = true',
      [tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const gateway = tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago';

    const comissaoPct = Number(tenant.comissao_pct);
    const taxaGatewayValor = round2(total * TAXA_PIX_MP);
    const comissaoValor = round2(total * (comissaoPct / 100));
    const valorLiquido = round2(total - taxaGatewayValor - comissaoValor);

    const totemId = (req.headers['x-totem-id'] as string) || null;

    let paymentId: string;
    let pixCode: string;
    let qrCodeBase64: string;
    let expiresIn = 300;

    if (gateway === 'sumup') {
      const apiKey = tenant.sumup_api_key || env.sumup.apiKey;
      if (!apiKey) {
        res.status(400).json({ error: 'missing_api_key' });
        return;
      }
      const sumup = await createSumUpPixPayment({ apiKey, total, tenantId });
      paymentId = sumup.checkoutId;
      pixCode = sumup.pixCode;
      qrCodeBase64 = sumup.qrCodeBase64;
    } else {
      const accessToken = tenant.mp_access_token || env.mercadopago.accessToken;
      if (!accessToken) {
        res.status(400).json({ error: 'missing_access_token' });
        return;
      }
      const webhookUrl = env.publicUrl
        ? `${env.publicUrl}/api/webhook/mercadopago`
        : undefined;
      const pix = await createPixPayment({
        accessToken,
        total,
        items,
        tenantId,
        webhookUrl,
      });
      paymentId = pix.paymentId;
      pixCode = pix.pixCode;
      qrCodeBase64 = pix.qrCodeBase64;
      expiresIn = pix.expiresIn;
    }

    const itens = items.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      preco: item.preco,
      subtotal: round2(item.preco * item.quantidade),
    }));

    const insert = await query<{ id: string }>(
      `INSERT INTO transactions
        (tenant_id, totem_id, payment_id, gateway, metodo, status,
         valor_bruto, taxa_gateway_pct, taxa_gateway_valor,
         comissao_pct, comissao_valor, valor_liquido, itens)
       VALUES ($1, $2, $3, $4, 'pix', 'pending',
         $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        tenantId,
        totemId,
        paymentId,
        gateway,
        total,
        TAXA_PIX_MP,
        taxaGatewayValor,
        comissaoPct,
        comissaoValor,
        valorLiquido,
        JSON.stringify(itens),
      ]
    );

    res.json({
      pixCode,
      qrCodeBase64,
      paymentId,
      expiresIn,
      transactionId: insert.rows[0].id,
    });
  } catch (err) {
    console.error('Erro ao criar pagamento Pix:', err);
    res.status(500).json({ error: 'payment_creation_failed' });
  }
});

// GET /api/payment/status/:paymentId -> consulta e sincroniza status
router.get('/status/:paymentId', async (req, res) => {
  const { paymentId } = req.params;

  try {
    const txResult = await query(
      'SELECT * FROM transactions WHERE payment_id = $1',
      [paymentId]
    );
    const transaction = txResult.rows[0];
    if (!transaction) {
      res.status(404).json({ error: 'transaction_not_found' });
      return;
    }

    const tenantResult = await query(
      'SELECT mp_access_token, sumup_api_key FROM tenants WHERE id = $1',
      [transaction.tenant_id]
    );
    const tenant = tenantResult.rows[0];

    let status: string;
    if (transaction.gateway === 'sumup') {
      const apiKey = tenant?.sumup_api_key || env.sumup.apiKey;
      ({ status } = await getSumUpPaymentStatus(apiKey, paymentId));
    } else {
      const accessToken = tenant?.mp_access_token || env.mercadopago.accessToken;
      ({ status } = await getPaymentStatus(accessToken, paymentId));
    }

    if (status === 'approved' && transaction.status !== 'approved') {
      await query(
        'UPDATE transactions SET status = $1, atualizado_em = NOW() WHERE id = $2',
        ['approved', transaction.id]
      );
    }

    res.json({ status, transactionId: transaction.id });
  } catch (err) {
    console.error('Erro ao consultar status do pagamento:', err);
    res.status(500).json({ error: 'status_check_failed' });
  }
});

// POST /api/payment/card -> cria intenção de pagamento no Point Smart
router.post('/card', async (req, res) => {
  const parsed = cardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const { items, total, tenantId, deviceId: bodyDeviceId } = parsed.data;

  try {
    const tenantResult = await query(
      'SELECT * FROM tenants WHERE id = $1 AND ativo = true',
      [tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const gateway = tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago';
    const deviceId = bodyDeviceId || (tenant.mp_device_id as string | null) || undefined;

    // Valida as credenciais do gateway antes de registrar a transação.
    if (gateway === 'sumup') {
      const hasKey = tenant.sumup_api_key || env.sumup.apiKey;
      const hasMerchant = tenant.sumup_merchant_code || env.sumup.merchantCode;
      if (!hasKey || !tenant.sumup_reader_id || !hasMerchant) {
        res.status(400).json({ error: 'missing_sumup_config' });
        return;
      }
    } else {
      if (!(tenant.mp_access_token || env.mercadopago.accessToken)) {
        res.status(400).json({ error: 'missing_access_token' });
        return;
      }
      if (!deviceId) {
        res.status(400).json({ error: 'missing_device_id' });
        return;
      }
      if (!isValidMpDeviceId(deviceId)) {
        res.status(400).json({
          error: 'invalid_device_id',
          detalhe:
            'Device ID inválido. Use o botão "Buscar maquininhas" no admin — não confunda com o ID do caixa (POS).',
        });
        return;
      }
    }

    const comissaoPct = Number(tenant.comissao_pct);
    const taxaGatewayValor = round2(total * TAXA_CARD_MP);
    const comissaoValor = round2(total * (comissaoPct / 100));
    const valorLiquido = round2(total - taxaGatewayValor - comissaoValor);

    const transactionId = uuidv4();
    const totemId = (req.headers['x-totem-id'] as string) || null;

    const itens = items.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      preco: item.preco,
      subtotal: round2(item.preco * item.quantidade),
    }));

    await query(
      `INSERT INTO transactions
        (id, tenant_id, totem_id, gateway, metodo, status,
         valor_bruto, taxa_gateway_pct, taxa_gateway_valor,
         comissao_pct, comissao_valor, valor_liquido, itens)
       VALUES ($1, $2, $3, $4, 'cartao', 'pending',
         $5, $6, $7, $8, $9, $10, $11)`,
      [
        transactionId,
        tenantId,
        totemId,
        gateway,
        total,
        TAXA_CARD_MP,
        taxaGatewayValor,
        comissaoPct,
        comissaoValor,
        valorLiquido,
        JSON.stringify(itens),
      ]
    );

    let intentId: string;
    if (gateway === 'sumup') {
      const apiKey = tenant.sumup_api_key || env.sumup.apiKey;
      const merchantCode = tenant.sumup_merchant_code || env.sumup.merchantCode;
      const result = await createSumUpCardPayment({
        apiKey,
        total,
        readerId: tenant.sumup_reader_id,
        merchantCode,
        affiliateKey: env.sumup.affiliateKey,
        tenantId,
      });
      intentId = result.paymentId;
    } else {
      const accessToken = tenant.mp_access_token || env.mercadopago.accessToken;

      // Cancela intenções pendentes anteriores (evita erro 409 na maquininha).
      const pendingResult = await query<{ payment_id: string }>(
        `SELECT payment_id FROM transactions
         WHERE tenant_id = $1 AND metodo = 'cartao' AND status = 'pending'
           AND payment_id IS NOT NULL
         ORDER BY criado_em DESC
         LIMIT 10`,
        [tenantId]
      );
      const pendingIntentIds = pendingResult.rows.map((r) => r.payment_id);
      for (const oldIntentId of pendingIntentIds) {
        await cancelCardPaymentIntent(
          accessToken,
          deviceId as string,
          oldIntentId
        );
      }
      if (pendingIntentIds.length > 0) {
        await query(
          `UPDATE transactions SET status = 'rejected', atualizado_em = NOW()
           WHERE tenant_id = $1 AND metodo = 'cartao' AND status = 'pending'
             AND payment_id = ANY($2::text[])`,
          [tenantId, pendingIntentIds]
        );
      }

      const result = await createCardPayment({
        accessToken,
        total,
        deviceId: deviceId as string,
        items,
        tenantId,
        transactionId,
        sandbox: env.mercadopago.sandbox,
        pendingIntentIds,
      });
      intentId = result.intentId;
    }

    // Guarda o intentId/paymentId para o polling / webhook conseguirem sincronizar.
    await query(
      'UPDATE transactions SET payment_id = $1, atualizado_em = NOW() WHERE id = $2',
      [intentId, transactionId]
    );

    res.json({ intentId, transactionId, status: 'aguardando_maquininha' });
  } catch (err) {
    console.error('Erro ao criar pagamento no cartão:', err);
    const msg = err instanceof Error ? err.message : String(err);
    const isQueued =
      msg.includes('409') || msg.includes('queued intent') || msg.includes('2205');
    res.status(isQueued ? 409 : 500).json({
      error: isQueued ? 'queued_intent' : 'card_payment_failed',
      detalhe: isQueued
        ? 'Há um pagamento pendente na maquininha. Cancele na Point (segure o botão inferior direito → Sair) e tente de novo.'
        : msg,
    });
  }
});

// GET /api/payment/card-status/:intentId?tenantId=&deviceId=
router.get('/card-status/:intentId', async (req, res) => {
  const { intentId } = req.params;
  const tenantId = req.query.tenantId as string | undefined;
  const deviceId = req.query.deviceId as string | undefined;

  try {
    let accessToken = env.mercadopago.accessToken;
    let resolvedDeviceId = deviceId;
    let tenant:
      | {
          gateway?: string;
          mp_access_token?: string;
          mp_device_id?: string;
          sumup_api_key?: string;
          sumup_merchant_code?: string;
        }
      | undefined;
    if (tenantId) {
      const tenantResult = await query(
        `SELECT gateway, mp_access_token, mp_device_id,
                sumup_api_key, sumup_merchant_code
         FROM tenants WHERE id = $1`,
        [tenantId]
      );
      tenant = tenantResult.rows[0];
      accessToken = tenant?.mp_access_token || accessToken;
      resolvedDeviceId = resolvedDeviceId || tenant?.mp_device_id || undefined;
    }

    let status: PaymentStatus;
    let mpPaymentId: string | undefined;
    let rawStatus: string | undefined;

    if (tenant?.gateway === 'sumup') {
      const apiKey = tenant.sumup_api_key || env.sumup.apiKey;
      const merchantCode = tenant.sumup_merchant_code || env.sumup.merchantCode;
      ({ status } = await getSumUpReaderStatus(apiKey, merchantCode, intentId));
    } else {
      ({ status, mpPaymentId, rawStatus } = await getCardPaymentStatus({
        accessToken,
        deviceId: resolvedDeviceId,
        intentId,
      }));
    }

    const txResult = await query<{ id: string; status: string }>(
      'SELECT id, status FROM transactions WHERE payment_id = $1',
      [intentId]
    );
    const transaction = txResult.rows[0];

    if (
      status === 'approved' &&
      transaction &&
      transaction.status !== 'approved'
    ) {
      await query(
        'UPDATE transactions SET status = $1, atualizado_em = NOW() WHERE id = $2',
        ['approved', transaction.id]
      );
    }

    res.json({
      status,
      transactionId: transaction?.id ?? null,
      mpPaymentId: mpPaymentId ?? null,
      rawStatus: rawStatus ?? null,
    });
  } catch (err) {
    console.error('Erro ao consultar status do cartão:', err);
    res.status(500).json({ error: 'card_status_failed' });
  }
});

export default router;
