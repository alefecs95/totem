import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
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
    `SELECT id, nome, comissao_pct, gateway, ativo
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
  metodo: z.enum(['dinheiro', 'cartao_fisico']).default('dinheiro'),
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

    res.json({
      codigo: normalizeEventCode(String(req.params.codigo)),
      tenantId: tenant.id as string,
      nomeFestival: tenant.nome as string,
      gateway: tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago',
      produtos,
    });
  } catch (err) {
    console.error('Erro PDV config:', err);
    res.status(500).json({ error: 'pdv_config_failed' });
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

    // Anexa logo por produto para o cliente imprimir offline se precisar
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
