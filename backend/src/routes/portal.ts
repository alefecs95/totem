import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/database';
import { env } from '../config/env';
import { verifyPortal, type AuthRequest } from '../middleware/auth';
import { productSchema, mapProductRow } from '../utils/products';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

// POST /api/portal/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const { email, senha } = parsed.data;

  try {
    const result = await query<{
      id: string;
      nome: string;
      email: string;
      portal_senha_hash: string | null;
      ativo: boolean;
    }>(
      `SELECT id, nome, email, portal_senha_hash, ativo
       FROM tenants
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    const tenant = result.rows[0];
    if (!tenant?.ativo || !tenant.portal_senha_hash) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const ok = await bcrypt.compare(senha, tenant.portal_senha_hash);
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const token = jwt.sign(
      {
        tenantId: tenant.id,
        email: tenant.email,
        nome: tenant.nome,
        role: 'portal',
      },
      env.jwt.secret,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      tenant: { id: tenant.id, nome: tenant.nome, email: tenant.email },
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
      `INSERT INTO produtos (tenant_id, nome, preco, emoji, cor, ordem, ativo, categoria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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

export default router;
