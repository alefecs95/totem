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
  resolveTenantSumUpConfig,
  terminateSumUpReaderCheckout,
  SumUpError,
} from '../services/sumup';
import {
  computeCardSurchargeForCardType,
  type CardType,
} from '../utils/cardSurcharge';
import {
  PaymentValidationError,
  validatePaymentItems,
} from '../utils/validatePaymentItems';

const router = Router();

// Taxas de gateway do Mercado Pago.
const TAXA_PIX_MP = 0.0099; // 0,99% Pix
const TAXA_CARD_MP = 0.0199; // 1,99% cartão (padrão por ora)

const paymentItemSchema = z.object({
  productId: z.string().uuid(),
  quantidade: z.number().int().positive(),
});

const pixSchema = z.object({
  items: z.array(paymentItemSchema).min(1),
  total: z.number().positive(),
  tenantId: z.string().uuid(),
});

const cardSchema = z.object({
  items: z.array(paymentItemSchema).min(1),
  total: z.number().positive(),
  tenantId: z.string().uuid(),
  deviceId: z.string().min(1).optional(),
  /** Override do leitor SumUp (PDV Electron pode escolher a maquininha). */
  readerId: z.string().min(3).optional(),
  /** Operador escolhe SumUp ou Mercado Pago na hora da venda. */
  gateway: z.enum(['sumup', 'mercadopago']).optional(),
  cardType: z.enum(['credit', 'debit']).optional(),
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

  const { items, total: clientTotal, tenantId } = parsed.data;

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

    let validated;
    try {
      validated = await validatePaymentItems(tenantId, items, clientTotal);
    } catch (err) {
      if (err instanceof PaymentValidationError) {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }

    const { items: validatedItems, total } = validated;
    const gatewayItems = validatedItems.map(({ nome, quantidade, preco }) => ({
      nome,
      quantidade,
      preco,
    }));

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
      const sumup = resolveTenantSumUpConfig(tenant);
      if (!sumup.apiKey) {
        res.status(400).json({
          error: 'missing_api_key',
          detalhe: 'Configure a API Key SumUp no admin do organizador.',
        });
        return;
      }
      if (!sumup.payToEmail) {
        res.status(400).json({
          error: 'missing_pay_to_email',
          detalhe: 'Configure o Pay To Email SumUp no admin do organizador.',
        });
        return;
      }
      const returnUrl = env.publicUrl
        ? `${env.publicUrl}/api/webhook/sumup?type=checkout`
        : undefined;
      const pixResult = await createSumUpPixPayment({
        apiKey: sumup.apiKey,
        total,
        tenantId,
        payToEmail: sumup.payToEmail,
        returnUrl,
      });
      paymentId = pixResult.checkoutId;
      pixCode = pixResult.pixCode;
      qrCodeBase64 = pixResult.qrCodeBase64;
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
        items: gatewayItems,
        tenantId,
        webhookUrl,
      });
      paymentId = pix.paymentId;
      pixCode = pix.pixCode;
      qrCodeBase64 = pix.qrCodeBase64;
      expiresIn = pix.expiresIn;
    }

    const itens = validatedItems.map((item) => ({
      productId: item.productId,
      nome: item.nome,
      categoria: item.categoria,
      imprime_ficha: item.imprime_ficha,
      ficha_2_vias: item.ficha_2_vias,
      quantidade: item.quantidade,
      preco: item.preco,
      subtotal: item.subtotal,
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
      `SELECT mp_access_token, sumup_api_key, sumup_merchant_code,
              sumup_affiliate_app_id, sumup_affiliate_key, sumup_pay_to_email,
              sumup_reader_id
       FROM tenants WHERE id = $1`,
      [transaction.tenant_id]
    );
    const tenant = tenantResult.rows[0];

    let status: string;
    if (transaction.gateway === 'sumup') {
      const sumup = resolveTenantSumUpConfig(tenant ?? {});
      if (!sumup.apiKey) {
        res.status(400).json({ error: 'missing_sumup_config' });
        return;
      }
      ({ status } = await getSumUpPaymentStatus(sumup.apiKey, paymentId));
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

  const {
    items,
    total: clientTotal,
    tenantId,
    deviceId: bodyDeviceId,
    readerId: bodyReaderId,
    gateway: bodyGateway,
    cardType: bodyCardType,
  } = parsed.data;

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

    let validated;
    try {
      validated = await validatePaymentItems(tenantId, items, clientTotal);
    } catch (err) {
      if (err instanceof PaymentValidationError) {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      }
      throw err;
    }

    const { items: validatedItems, total } = validated;
    const gatewayItems = validatedItems.map(({ nome, quantidade, preco }) => ({
      nome,
      quantidade,
      preco,
    }));

    const defaultGateway = tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago';
    const gateway = bodyGateway === 'sumup' || bodyGateway === 'mercadopago'
      ? bodyGateway
      : defaultGateway;
    const deviceId = bodyDeviceId || (tenant.mp_device_id as string | null) || undefined;
    const sumupConfig =
      gateway === 'sumup' ? resolveTenantSumUpConfig(tenant) : null;
    const cardType: CardType = bodyCardType ?? 'credit';
    const surcharge =
      gateway === 'sumup' && sumupConfig
        ? computeCardSurchargeForCardType({
            netAmount: total,
            config: sumupConfig.surcharge,
            cardType,
          })
        : null;
    const chargedAmount = surcharge?.grossAmount ?? total;

    // Valida as credenciais do gateway antes de registrar a transação.
    if (gateway === 'sumup') {
      const readerId = bodyReaderId || sumupConfig?.readerId;
      if (!sumupConfig?.apiKey || !sumupConfig.merchantCode || !readerId) {
        res.status(400).json({
          error: 'missing_sumup_config',
          detalhe:
            'Configure API Key, Merchant Code e Reader ID no admin do organizador.',
        });
        return;
      }
      if (!sumupConfig.affiliateKey || !sumupConfig.affiliateAppId) {
        res.status(400).json({
          error: 'missing_sumup_affiliate',
          detalhe:
            'Configure Affiliate App ID e Affiliate Key no admin do organizador.',
        });
        return;
      }
      // Usa leitor escolhido no PDV / admin
      sumupConfig.readerId = readerId;
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
    const taxaGatewayPct =
      gateway === 'sumup' && sumupConfig?.surcharge.enabled
        ? 0
        : gateway === 'sumup'
          ? 0
          : TAXA_CARD_MP;
    const taxaGatewayValor =
      gateway === 'sumup' ? 0 : round2(total * TAXA_CARD_MP);
    const comissaoValor = round2(total * (comissaoPct / 100));
    const valorLiquido = round2(total - taxaGatewayValor - comissaoValor);

    const transactionId = uuidv4();
    const totemId = (req.headers['x-totem-id'] as string) || null;

    const itens = validatedItems.map((item) => ({
      productId: item.productId,
      nome: item.nome,
      categoria: item.categoria,
      imprime_ficha: item.imprime_ficha,
      ficha_2_vias: item.ficha_2_vias,
      quantidade: item.quantidade,
      preco: item.preco,
      subtotal: item.subtotal,
    }));

    await query(
      `INSERT INTO transactions
        (id, tenant_id, totem_id, gateway, metodo, status,
         valor_bruto, taxa_gateway_pct, taxa_gateway_valor,
         comissao_pct, comissao_valor, valor_liquido, itens,
         sumup_surcharge_valor, sumup_charged_amount, sumup_card_type)
       VALUES ($1, $2, $3, $4, 'cartao', 'pending',
         $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        transactionId,
        tenantId,
        totemId,
        gateway,
        total,
        taxaGatewayPct,
        taxaGatewayValor,
        comissaoPct,
        comissaoValor,
        valorLiquido,
        JSON.stringify(itens),
        surcharge && surcharge.surchargeAmount > 0 ? surcharge.surchargeAmount : null,
        gateway === 'sumup' ? chargedAmount : null,
        gateway === 'sumup' ? cardType : null,
      ]
    );

    let intentId: string;
    if (gateway === 'sumup') {
      const returnUrl = env.publicUrl
        ? `${env.publicUrl}/api/webhook/sumup?type=reader`
        : 'https://localhost/api/webhook/sumup?type=reader';
      const result = await createSumUpCardPayment({
        apiKey: sumupConfig!.apiKey!,
        total: chargedAmount,
        readerId: sumupConfig!.readerId!,
        merchantCode: sumupConfig!.merchantCode!,
        affiliateAppId: sumupConfig!.affiliateAppId!,
        affiliateKey: sumupConfig!.affiliateKey!,
        foreignTransactionId: transactionId,
        returnUrl,
        cardType,
      });
      intentId = result.paymentId;

      await query(
        'UPDATE transactions SET payment_id = $1 WHERE id = $2',
        [intentId, transactionId]
      );
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
        items: gatewayItems,
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

    res.json({
      intentId,
      transactionId,
      status: 'aguardando_maquininha',
      netAmount: total,
      chargedAmount,
      surchargeAmount: surcharge?.surchargeAmount ?? 0,
      cardType: gateway === 'sumup' ? cardType : undefined,
    });
  } catch (err) {
    console.error('Erro ao criar pagamento no cartão:', err);
    const msg = err instanceof Error ? err.message : String(err);
    const statusCode = err instanceof SumUpError ? err.statusCode : undefined;
    const isQueued =
      msg.includes('409') || msg.includes('queued intent') || msg.includes('2205');
    res.status(isQueued ? 409 : statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: isQueued ? 'queued_intent' : 'card_payment_failed',
      detalhe: isQueued
        ? 'Há um pagamento pendente na maquininha. Cancele na Point/Solo e tente de novo.'
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
                sumup_api_key, sumup_merchant_code, sumup_reader_id,
                sumup_affiliate_app_id, sumup_affiliate_key, sumup_pay_to_email
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

    const txResult = await query<{ id: string; status: string; gateway: string }>(
      'SELECT id, status, gateway FROM transactions WHERE payment_id = $1',
      [intentId]
    );
    const transaction = txResult.rows[0];
    const effectiveGateway =
      transaction?.gateway === 'sumup' || transaction?.gateway === 'mercadopago'
        ? transaction.gateway
        : tenant?.gateway === 'sumup'
          ? 'sumup'
          : 'mercadopago';

    if (effectiveGateway === 'sumup') {
      const sumup = resolveTenantSumUpConfig(tenant || {});
      if (!sumup.apiKey || !sumup.merchantCode) {
        res.status(400).json({ error: 'missing_sumup_config' });
        return;
      }
      ({ status, rawStatus } = await getSumUpReaderStatus(
        sumup.apiKey,
        sumup.merchantCode,
        intentId,
        transaction?.id
      ));
    } else {
      ({ status, mpPaymentId, rawStatus } = await getCardPaymentStatus({
        accessToken,
        deviceId: resolvedDeviceId,
        intentId,
      }));
    }

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

// POST /api/payment/card-terminate — cancela cobrança pendente no Solo (SumUp)
router.post('/card-terminate', async (req, res) => {
  const { tenantId, intentId } = req.body as {
    tenantId?: string;
    intentId?: string;
  };

  if (!tenantId || !intentId) {
    res.status(400).json({ error: 'missing_params' });
    return;
  }

  try {
    const tenantResult = await query(
      `SELECT gateway, sumup_api_key, sumup_merchant_code, sumup_reader_id
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant || tenant.gateway !== 'sumup') {
      res.status(400).json({ error: 'not_sumup_tenant' });
      return;
    }

    const sumup = resolveTenantSumUpConfig(tenant);
    if (!sumup.apiKey || !sumup.merchantCode || !sumup.readerId) {
      res.status(400).json({ error: 'missing_sumup_config' });
      return;
    }

    await terminateSumUpReaderCheckout(
      sumup.apiKey,
      sumup.merchantCode,
      sumup.readerId
    );

    await query(
      `UPDATE transactions SET status = 'cancelled', atualizado_em = NOW()
       WHERE payment_id = $1 AND status = 'pending'`,
      [intentId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao cancelar checkout SumUp:', err);
    const msg = err instanceof Error ? err.message : String(err);
    const statusCode = err instanceof SumUpError ? err.statusCode : 500;
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: 'terminate_failed',
      detalhe: msg,
    });
  }
});

export default router;
