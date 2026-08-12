import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/database';
import { env } from '../config/env';
import { verifyPortal, type AuthRequest } from '../middleware/auth';
import { productSchema, mapProductRow } from '../utils/products';
import {
  PaymentValidationError,
  validatePaymentItems,
} from '../utils/validatePaymentItems';

const router = Router();

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const manualSaleSchema = z.object({
  clientTransactionId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantidade: z.number().int().positive(),
    })
  ).min(1),
  total: z.number().positive(),
  metodo: z.enum(['dinheiro', 'cartao_fisico']),
  totemId: z.string().uuid().optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  senha: z.string().min(1),
  /** portal = adm do evento; operador = modo operador web */
  mode: z.enum(['portal', 'operador']).optional().default('portal'),
});

// POST /api/portal/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_body',
      details: parsed.error.flatten(),
    });
    return;
  }

  const { email, senha, mode } = parsed.data;

  try {
    const result = await query<{
      id: string;
      nome: string;
      email: string;
      operador_email: string | null;
      portal_senha_hash: string | null;
      operador_senha_hash: string | null;
      ativo: boolean;
    }>(
      mode === 'operador'
        ? `SELECT id, nome, email, operador_email, portal_senha_hash, operador_senha_hash, ativo
           FROM tenants
           WHERE ativo = true
             AND (
               (operador_email IS NOT NULL AND TRIM(operador_email) <> '' AND LOWER(operador_email) = LOWER($1))
               OR
               ((operador_email IS NULL OR TRIM(operador_email) = '') AND LOWER(email) = LOWER($1))
             )
           LIMIT 1`
        : `SELECT id, nome, email, operador_email, portal_senha_hash, operador_senha_hash, ativo
           FROM tenants
           WHERE LOWER(email) = LOWER($1)
           LIMIT 1`,
      [email]
    );

    const tenant = result.rows[0];
    if (!tenant?.ativo) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const hash =
      mode === 'operador'
        ? tenant.operador_senha_hash || tenant.portal_senha_hash
        : tenant.portal_senha_hash;

    if (!hash) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const ok = await bcrypt.compare(senha, hash);
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const loginEmail =
      mode === 'operador'
        ? (tenant.operador_email && tenant.operador_email.trim()) || tenant.email
        : tenant.email;

    const token = jwt.sign(
      {
        tenantId: tenant.id,
        email: loginEmail,
        nome: tenant.nome,
        role: mode === 'operador' ? 'operador' : 'portal',
      },
      env.jwt.secret,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      tenant: {
        id: tenant.id,
        nome: tenant.nome,
        email: loginEmail,
      },
    });
  } catch (err) {
    console.error('Erro no login portal:', err);
    res.status(500).json({ error: 'login_failed' });
  }
});

// GET /api/portal/me
router.get('/me', verifyPortal, async (req: AuthRequest, res) => {
  res.json({ tenant: req.portal });
});

// GET /api/portal/dashboard
router.get('/dashboard', verifyPortal, async (req: AuthRequest, res) => {
  const tenantId = req.portal!.tenantId;

  try {
    const stats = await query<{
      total_vendas: string;
      total_liquido: string;
      vendas_hoje: number;
      total_transacoes: number;
      repasse_pendente: number;
    }>(
      `SELECT
        COALESCE(SUM(valor_bruto) FILTER (WHERE status = 'approved'), 0) AS total_vendas,
        COALESCE(SUM(valor_liquido) FILTER (WHERE status = 'approved'), 0) AS total_liquido,
        COUNT(*) FILTER (WHERE status = 'approved' AND criado_em::date = CURRENT_DATE) AS vendas_hoje,
        COUNT(*) FILTER (WHERE status = 'approved') AS total_transacoes,
        COUNT(*) FILTER (WHERE status = 'approved' AND repasse_status = 'pendente') AS repasse_pendente
      FROM transactions
      WHERE tenant_id = $1`,
      [tenantId]
    );

    const porProduto = await query<{
      nome: string;
      quantidade: string;
      total: string;
    }>(
      `SELECT
        item->>'nome' AS nome,
        COALESCE(SUM((item->>'quantidade')::int), 0)::text AS quantidade,
        COALESCE(SUM((item->>'subtotal')::numeric), 0)::text AS total
      FROM transactions t,
      LATERAL jsonb_array_elements(t.itens) AS item
      WHERE t.tenant_id = $1 AND t.status = 'approved'
      GROUP BY item->>'nome'
      ORDER BY SUM((item->>'subtotal')::numeric) DESC
      LIMIT 10`,
      [tenantId]
    );

    const porTotem = await query<{
      totem_id: string;
      totem_nome: string;
      vendas: number;
      total: string;
    }>(
      `SELECT
        tt.id AS totem_id,
        tt.nome AS totem_nome,
        COUNT(*)::int AS vendas,
        COALESCE(SUM(t.valor_bruto), 0)::text AS total
      FROM transactions t
      JOIN totens tt ON tt.id = t.totem_id
      WHERE t.tenant_id = $1 AND t.status = 'approved'
      GROUP BY tt.id, tt.nome
      ORDER BY SUM(t.valor_bruto) DESC`,
      [tenantId]
    );

    const row = stats.rows[0];
    res.json({
      totalVendas: Number(row.total_vendas),
      totalLiquido: Number(row.total_liquido),
      vendasHoje: row.vendas_hoje,
      totalTransacoes: row.total_transacoes,
      repassePendente: row.repasse_pendente,
      vendasPorProduto: porProduto.rows.map((p) => ({
        nome: p.nome,
        quantidade: Number(p.quantidade),
        total: Number(p.total),
      })),
      vendasPorTotem: porTotem.rows.map((t) => ({
        totemId: t.totem_id,
        totemNome: t.totem_nome,
        vendas: t.vendas,
        total: Number(t.total),
      })),
    });
  } catch (err) {
    console.error('Erro no dashboard portal:', err);
    res.status(500).json({ error: 'dashboard_failed' });
  }
});

// GET /api/portal/totens
router.get('/totens', verifyPortal, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, nome, local, ativo, ultimo_acesso, criado_em
       FROM totens
       WHERE tenant_id = $1
       ORDER BY criado_em DESC`,
      [req.portal!.tenantId]
    );
    res.json({ totens: result.rows });
  } catch (err) {
    console.error('Erro ao listar totens portal:', err);
    res.status(500).json({ error: 'list_totens_failed' });
  }
});

// GET /api/portal/transactions
router.get('/transactions', verifyPortal, async (req: AuthRequest, res) => {
  const tenantId = req.portal!.tenantId;
  const { status, dataInicio, dataFim, totemId } = req.query as Record<
    string,
    string | undefined
  >;

  try {
    const conditions = ['t.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (status) {
      conditions.push(`t.status = $${i++}`);
      params.push(status);
    }
    if (dataInicio) {
      conditions.push(`t.criado_em >= $${i++}`);
      params.push(dataInicio);
    }
    if (dataFim) {
      conditions.push(`t.criado_em <= $${i++}`);
      params.push(dataFim);
    }
    if (totemId) {
      conditions.push(`t.totem_id = $${i++}`);
      params.push(totemId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const countResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM transactions t ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    const dataResult = await query(
      `SELECT t.*, tt.nome AS totem_nome
       FROM transactions t
       LEFT JOIN totens tt ON tt.id = t.totem_id
       ${where}
       ORDER BY t.criado_em DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    res.json({
      transactions: dataResult.rows,
      total,
      pagina: page,
      totalPaginas: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error('Erro ao listar transações portal:', err);
    res.status(500).json({ error: 'list_transactions_failed' });
  }
});

// GET /api/portal/produtos
router.get('/produtos', verifyPortal, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT * FROM produtos
       WHERE tenant_id = $1
       ORDER BY ordem ASC, criado_em ASC`,
      [req.portal!.tenantId]
    );
    res.json({ produtos: result.rows.map(mapProductRow) });
  } catch (err) {
    console.error('Erro ao listar produtos portal:', err);
    res.status(500).json({ error: 'list_products_failed' });
  }
});

// POST /api/portal/produtos
router.post('/produtos', verifyPortal, async (req: AuthRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const p = parsed.data;
  const tenantId = req.portal!.tenantId;

  try {
    let ordem = p.ordem;
    if (ordem === undefined) {
      const maxResult = await query<{ max: number | null }>(
        'SELECT MAX(ordem) AS max FROM produtos WHERE tenant_id = $1',
        [tenantId]
      );
      ordem = (maxResult.rows[0].max ?? -1) + 1;
    }

    const result = await query(
      `INSERT INTO produtos (tenant_id, nome, preco, emoji, cor, ordem, ativo, categoria, imprime_ficha, ficha_2_vias, ficha_logo_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId,
        p.nome,
        p.preco,
        p.emoji ?? '🎟️',
        p.cor ?? '#FF6B00',
        ordem,
        p.ativo ?? true,
        p.categoria,
        p.imprime_ficha ?? false,
        p.ficha_2_vias ?? false,
        p.ficha_logo_data ?? null,
      ]
    );

    res.status(201).json({ produto: mapProductRow(result.rows[0]) });
  } catch (err) {
    console.error('Erro ao criar produto portal:', err);
    res.status(500).json({ error: 'create_product_failed' });
  }
});

// PUT /api/portal/produtos/:id
router.put('/produtos/:id', verifyPortal, async (req: AuthRequest, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const fields = parsed.data;
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    res.status(400).json({ error: 'no_fields' });
    return;
  }

  try {
    const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);
    const values = keys.map((key) => (fields as Record<string, unknown>)[key]);
    const tenantId = req.portal!.tenantId;

    const result = await query(
      `UPDATE produtos SET ${setClauses.join(', ')}
       WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2}
       RETURNING *`,
      [...values, req.params.id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }

    res.json({ produto: mapProductRow(result.rows[0]) });
  } catch (err) {
    console.error('Erro ao atualizar produto portal:', err);
    res.status(500).json({ error: 'update_product_failed' });
  }
});

// DELETE /api/portal/produtos/:id (desativa)
router.delete('/produtos/:id', verifyPortal, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `UPDATE produtos SET ativo = false
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [req.params.id, req.portal!.tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao desativar produto portal:', err);
    res.status(500).json({ error: 'delete_product_failed' });
  }
});

// POST /api/portal/vendas/manual — venda em dinheiro/cartão físico (modo operador)
router.post('/vendas/manual', verifyPortal, async (req: AuthRequest, res) => {
  const parsed = manualSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const tenantId = req.portal!.tenantId;
  const { clientTransactionId, items, total: clientTotal, metodo, totemId } =
    parsed.data;

  try {
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

    const tenantResult = await query<{ comissao_pct: string }>(
      'SELECT comissao_pct FROM tenants WHERE id = $1 AND ativo = true',
      [tenantId]
    );
    if (!tenantResult.rows[0]) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const comissaoPct = Number(tenantResult.rows[0].comissao_pct);
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
    }));

    const insert = await query<{ id: string }>(
      `INSERT INTO transactions
        (tenant_id, totem_id, payment_id, gateway, metodo, status,
         valor_bruto, taxa_gateway_pct, taxa_gateway_valor,
         comissao_pct, comissao_valor, valor_liquido, itens)
       VALUES ($1, $2, $3, 'manual', $4, 'approved',
         $5, 0, 0, $6, $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        totemId ?? null,
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
    });
  } catch (err) {
    console.error('Erro ao registrar venda manual:', err);
    res.status(500).json({ error: 'manual_sale_failed' });
  }
});

export default router;
