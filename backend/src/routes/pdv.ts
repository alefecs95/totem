import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { isValidMpDeviceId } from '../services/mercadopago';
import {
  getTenantCardSurchargeConfig,
  listSumUpReaders,
  resolveTenantSumUpConfig,
  SumUpError,
  type TenantSumUpFields,
} from '../services/sumup';
import { normalizeEventCode } from '../utils/eventCode';
import {
  PaymentValidationError,
  validatePaymentItems,
} from '../utils/validatePaymentItems';

const router = Router();

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function findTenantByCodigo(codigoRaw: string) {
  const codigo = normalizeEventCode(codigoRaw);
  if (!codigo) return null;
  const result = await query(
    `SELECT *
     FROM tenants
     WHERE UPPER(codigo_evento) = $1 AND ativo = true`,
    [codigo]
  );
  return result.rows[0] ?? null;
}

const saleSchema = z.object({
  clientTransactionId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantidade: z.number().int().positive(),
      })
    )
    .min(1),
  total: z.number().positive(),
  metodo: z.enum(['dinheiro', 'cartao_fisico', 'pix_proprietario']).default('dinheiro'),
});

const selectReaderSchema = z.object({
  readerId: z.string().min(3),
});

/**
 * GET /api/pdv/:codigo
 * Carrega dados do evento para o app Electron (sem login de portal).
 */
router.get('/:codigo', async (req, res) => {
  try {
    const tenant = await findTenantByCodigo(String(req.params.codigo || ''));
    if (!tenant) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }

    const produtosResult = await query(
      `SELECT id, nome, preco, emoji, cor, categoria, imprime_ficha, ficha_2_vias, ficha_logo_data
       FROM produtos
       WHERE tenant_id = $1 AND ativo = true
       ORDER BY ordem ASC, criado_em ASC`,
      [tenant.id]
    );

    const produtos = produtosResult.rows.map((row) => ({
      id: row.id as string,
      nome: row.nome as string,
      preco: Number(row.preco),
      emoji: row.emoji as string,
      cor: row.cor as string,
      categoria: row.categoria as string,
      imprime_ficha: Boolean(row.imprime_ficha),
      ficha_2_vias: Boolean(row.ficha_2_vias),
      ficha_logo_data: (row.ficha_logo_data as string | null) || null,
    }));

    const defaultGateway = tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago';
    const sumupCartao = Boolean(
      tenant.sumup_api_key &&
        tenant.sumup_reader_id &&
        tenant.sumup_merchant_code &&
        tenant.sumup_affiliate_key &&
        tenant.sumup_affiliate_app_id
    );
    const mpCartao = Boolean(
      tenant.mp_access_token &&
        isValidMpDeviceId(tenant.mp_device_id as string)
    );
    const sumupPix = Boolean(
      tenant.sumup_api_key &&
        (tenant.sumup_pay_to_email || tenant.sumup_merchant_code)
    );
    const mpPix = Boolean(tenant.mp_access_token);
    const pix =
      defaultGateway === 'sumup' ? sumupPix : mpPix;

    res.json({
      codigo: normalizeEventCode(String(req.params.codigo)),
      tenantId: tenant.id as string,
      nomeFestival: tenant.nome as string,
      gateway: defaultGateway,
      produtos,
      pagamentos: {
        pix,
        cartao: sumupCartao || mpCartao,
        sumup: sumupCartao,
        mercadopago: mpCartao,
        pixProprietario: Boolean(tenant.pix_proprietario_enabled),
      },
      pixProprietarioChave:
        (tenant.pix_proprietario_chave as string | null) || null,
      sumupReaderId: (tenant.sumup_reader_id as string | null) || null,
      mpDeviceId: (tenant.mp_device_id as string | null) || null,
      sumupSurcharge: getTenantCardSurchargeConfig(tenant),
    });
  } catch (err) {
    console.error('Erro PDV config:', err);
    res.status(500).json({ error: 'pdv_config_failed' });
  }
});

/**
 * GET /api/pdv/:codigo/transactions
 * Ultimas vendas do evento (historico do PDV Electron).
 */
router.get('/:codigo/transactions', async (req, res) => {
  try {
    const tenant = await findTenantByCodigo(String(req.params.codigo || ''));
    if (!tenant) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }

    const limitRaw = Number(req.query.limit ?? 40);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 40));
    const status = String(req.query.status || 'approved');

    const result = await query(
      `SELECT t.id, t.metodo, t.status, t.gateway, t.valor_bruto, t.itens, t.criado_em,
              tt.nome AS totem_nome
       FROM transactions t
       LEFT JOIN totens tt ON tt.id = t.totem_id
       WHERE t.tenant_id = $1
         AND ($2 = 'all' OR t.status = $2)
       ORDER BY t.criado_em DESC
       LIMIT $3`,
      [tenant.id, status, limit]
    );

    res.json({
      transactions: result.rows.map((row) => ({
        id: row.id,
        metodo: row.metodo,
        status: row.status,
        gateway: row.gateway,
        valor_bruto: Number(row.valor_bruto),
        itens: row.itens,
        criado_em: row.criado_em,
        totem_nome: row.totem_nome ?? null,
      })),
    });
  } catch (err) {
    console.error('Erro PDV transactions:', err);
    res.status(500).json({ error: 'pdv_transactions_failed' });
  }
});

/**
 * GET /api/pdv/:codigo/sumup-readers
 * Lista leitores SumUp pareados (para selecionar no Electron).
 */
router.get('/:codigo/sumup-readers', async (req, res) => {
  try {
    const tenant = await findTenantByCodigo(String(req.params.codigo || ''));
    if (!tenant) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }

    const sumup = resolveTenantSumUpConfig(tenant as TenantSumUpFields);
    if (!sumup.apiKey || !sumup.merchantCode) {
      res.status(400).json({
        error: 'missing_sumup_config',
        detalhe: 'Configure API Key e Merchant Code no admin.',
      });
      return;
    }

    const live = req.query.live === '1' || req.query.live === 'true';
    const readers = await listSumUpReaders(sumup.apiKey, sumup.merchantCode, {
      includeDeviceStatus: live,
    });
    res.json({
      readers,
      selectedReaderId: (tenant.sumup_reader_id as string | null) || null,
    });
  } catch (err) {
    console.error('Erro PDV list readers:', err);
    const statusCode = err instanceof SumUpError ? err.statusCode : 500;
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: 'list_sumup_readers_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdv/:codigo/sumup-reader
 * Seleciona a maquininha ativa deste evento.
 */
router.post('/:codigo/sumup-reader', async (req, res) => {
  const parsed = selectReaderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  try {
    const tenant = await findTenantByCodigo(String(req.params.codigo || ''));
    if (!tenant) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }

    await query(
      `UPDATE tenants SET sumup_reader_id = $1, atualizado_em = NOW() WHERE id = $2`,
      [parsed.data.readerId, tenant.id]
    );

    res.json({ ok: true, sumupReaderId: parsed.data.readerId });
  } catch (err) {
    console.error('Erro PDV select reader:', err);
    res.status(500).json({ error: 'select_sumup_reader_failed' });
  }
});

/**
 * POST /api/pdv/:codigo/vendas
 * Venda manual (dinheiro / cartão físico) pelo PDV Electron.
 */
router.post('/:codigo/vendas', async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  try {
    const tenant = await findTenantByCodigo(String(req.params.codigo || ''));
    if (!tenant) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }

    const tenantId = tenant.id as string;
    const clientTransactionId =
      parsed.data.clientTransactionId || randomUUID();
    const { items, total: clientTotal, metodo } = parsed.data;

    const dup = await query<{ id: string }>(
      `SELECT id FROM transactions
       WHERE payment_id = $1 AND tenant_id = $2`,
      [clientTransactionId, tenantId]
    );
    if (dup.rows[0]) {
      res.json({
        transactionId: dup.rows[0].id,
        ok: true,
        duplicate: true,
      });
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
    const comissaoPct = Number(tenant.comissao_pct);
    const comissaoValor = round2(total * (comissaoPct / 100));
    const valorLiquido = round2(total - comissaoValor);

    const itensJson = validatedItems.map((item) => ({
      productId: item.productId,
      nome: item.nome,
      categoria: item.categoria,
      imprime_ficha: item.imprime_ficha,
      ficha_2_vias: item.ficha_2_vias,
      quantidade: item.quantidade,
      preco: item.preco,
      subtotal: item.subtotal,
      ficha_logo_data: undefined as string | undefined,
    }));

    const logoMap = new Map<string, string | null>();
    for (const row of (
      await query(
        `SELECT id, ficha_logo_data FROM produtos WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, validatedItems.map((i) => i.productId)]
      )
    ).rows) {
      logoMap.set(row.id as string, (row.ficha_logo_data as string | null) || null);
    }
    for (const item of itensJson) {
      item.ficha_logo_data = logoMap.get(item.productId) || undefined;
    }

    const insert = await query<{ id: string }>(
      `INSERT INTO transactions
        (tenant_id, totem_id, payment_id, gateway, metodo, status,
         valor_bruto, taxa_gateway_pct, taxa_gateway_valor,
         comissao_pct, comissao_valor, valor_liquido, itens)
       VALUES ($1, NULL, $2, 'manual', $3, 'approved',
         $4, 0, 0, $5, $6, $7, $8)
       RETURNING id`,
      [
        tenantId,
        clientTransactionId,
        metodo,
        total,
        comissaoPct,
        comissaoValor,
        valorLiquido,
        JSON.stringify(itensJson),
      ]
    );

    res.status(201).json({
      transactionId: insert.rows[0].id,
      ok: true,
      duplicate: false,
      itens: itensJson,
      total,
      nomeFestival: tenant.nome,
    });
  } catch (err) {
    console.error('Erro PDV venda:', err);
    res.status(500).json({ error: 'pdv_sale_failed' });
  }
});

export default router;
