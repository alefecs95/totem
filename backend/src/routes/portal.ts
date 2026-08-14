import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/database';
import { env } from '../config/env';
import { verifyPortal, verifyEventAdmin, type AuthRequest } from '../middleware/auth';
import { productSchema, mapProductRow } from '../utils/products';
import { normalizeEventCode } from '../utils/eventCode';
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
  /** Codigo do evento (vindo do link /e/:codigo, salvo no localStorage). */
  codigo: z.string().trim().min(3).max(32).optional(),
  /** Quando o mesmo e-mail tem varios eventos, o adm escolhe qual abrir. */
  tenantId: z.string().uuid().optional(),
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

  const { email, senha, mode, codigo, tenantId } = parsed.data;
  const emailNorm = email.trim().toLowerCase().replace(/\s+/g, '');
  const codigoNorm = codigo ? normalizeEventCode(codigo) : '';

  try {
    if (mode === 'operador') {
      const opRes = await query<{
        id: string;
        tenant_id: string;
        nome: string;
        email: string;
        senha_hash: string;
        tenant_nome: string;
        tenant_ativo: boolean;
      }>(
        `SELECT o.id, o.tenant_id, o.nome, o.email, o.senha_hash,
                t.nome AS tenant_nome, t.ativo AS tenant_ativo
         FROM operadores o
         JOIN tenants t ON t.id = o.tenant_id
         WHERE LOWER(TRIM(o.email)) = $1 AND o.ativo = true
         LIMIT 1`,
        [emailNorm]
      );
      const op = opRes.rows[0];
      if (!op?.tenant_ativo) {
        res.status(401).json({
          error: 'invalid_credentials',
          detalhe:
            'Operador nao encontrado. O adm do evento cadastra operadores no portal (menu Operadores).',
        });
        return;
      }
      const ok = await bcrypt.compare(senha, op.senha_hash);
      if (!ok) {
        res.status(401).json({
          error: 'invalid_credentials',
          detalhe: 'Senha do operador incorreta.',
        });
        return;
      }
      const token = jwt.sign(
        {
          tenantId: op.tenant_id,
          email: op.email,
          nome: op.tenant_nome,
          role: 'operador',
          operatorId: op.id,
        },
        env.jwt.secret,
        { expiresIn: '12h' }
      );
      res.json({
        token,
        tenant: {
          id: op.tenant_id,
          nome: op.tenant_nome,
          email: op.email,
          role: 'operador',
        },
      });
      return;
    }

    const result = await query<{
      id: string;
      nome: string;
      email: string | null;
      portal_senha_hash: string | null;
      codigo_evento: string | null;
      ativo: boolean;
    }>(
      `SELECT id, nome, email, portal_senha_hash, codigo_evento, ativo
       FROM tenants
       WHERE LOWER(REPLACE(TRIM(COALESCE(email, '')), ' ', '')) = $1
         AND ativo = true
       ORDER BY criado_em DESC`,
      [emailNorm]
    );
    if (result.rows.length === 0) {
      res.status(401).json({
        error: 'invalid_credentials',
        detalhe:
          'E-mail do adm do evento nao encontrado. Use o e-mail cadastrado pelo super admin.',
      });
      return;
    }

    const withPassword = result.rows.filter((row) => row.portal_senha_hash);
    const matches: typeof result.rows = [];
    for (const row of withPassword) {
      const ok = await bcrypt.compare(senha, row.portal_senha_hash as string);
      if (ok) matches.push(row);
    }
    if (matches.length === 0) {
      res.status(401).json({
        error: 'invalid_credentials',
        detalhe: 'Senha do adm do evento incorreta.',
      });
      return;
    }

    let tenant = matches[0];
    if (tenantId) {
      const chosen = matches.find((row) => row.id === tenantId);
      if (!chosen) {
        res.status(401).json({
          error: 'invalid_credentials',
          detalhe: 'Evento nao encontrado para este e-mail.',
        });
        return;
      }
      tenant = chosen;
    } else if (codigoNorm) {
      const byCode = matches.find(
        (row) =>
          row.codigo_evento &&
          normalizeEventCode(row.codigo_evento) === codigoNorm
      );
      if (byCode) tenant = byCode;
    } else if (matches.length > 1) {
      res.status(409).json({
        error: 'choose_event',
        detalhe: 'Este e-mail tem mais de um evento. Escolha qual abrir.',
        eventos: matches.map((row) => ({
          id: row.id,
          nome: row.nome,
          codigo_evento: row.codigo_evento,
        })),
      });
      return;
    }

    const loginEmail = tenant.email || emailNorm;
    const token = jwt.sign(
      {
        tenantId: tenant.id,
        email: loginEmail,
        nome: tenant.nome,
        role: 'portal',
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
        role: 'portal',
      },
    });
  } catch (err) {
    console.error('Erro no login portal:', err);
    res.status(500).json({ error: 'login_failed' });
  }
});

// GET /api/portal/evento/:codigo — publico: so o nome, para a tela de login.
router.get('/evento/:codigo', async (req, res) => {
  const codigo = normalizeEventCode(String(req.params.codigo ?? ''));
  if (!codigo) {
    res.status(404).json({ error: 'evento_nao_encontrado' });
    return;
  }
  try {
    const result = await query<{ nome: string }>(
      `SELECT nome FROM tenants
       WHERE UPPER(codigo_evento) = $1 AND ativo = true
       LIMIT 1`,
      [codigo]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'evento_nao_encontrado' });
      return;
    }
    res.json({ nome: row.nome });
  } catch (err) {
    console.error('Erro ao buscar evento do portal:', err);
    res.status(500).json({ error: 'evento_failed' });
  }
});

// GET /api/portal/me
router.get('/me', verifyPortal, async (req: AuthRequest, res) => {
  res.json({ tenant: req.portal });
});

const operadorSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  senha: z.string().min(4).optional(),
  ativo: z.boolean().optional(),
});

function mapOperadorRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    nome: row.nome,
    email: row.email,
    ativo: row.ativo,
    criado_em: row.criado_em,
  };
}

// GET /api/portal/operadores
router.get('/operadores', verifyEventAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, tenant_id, nome, email, ativo, criado_em
       FROM operadores
       WHERE tenant_id = $1
       ORDER BY criado_em DESC`,
      [req.portal!.tenantId]
    );
    res.json({ operadores: result.rows.map(mapOperadorRow) });
  } catch (err) {
    console.error('Erro ao listar operadores:', err);
    res.status(500).json({ error: 'list_operadores_failed' });
  }
});

// POST /api/portal/operadores
router.post('/operadores', verifyEventAdmin, async (req: AuthRequest, res) => {
  const parsed = operadorSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.senha) {
    res.status(400).json({
      error: 'invalid_body',
      detalhe: 'Informe nome, e-mail e senha (minimo 4 caracteres).',
    });
    return;
  }
  const { nome, email, senha } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  const tenantId = req.portal!.tenantId;

  try {
    const clash = await query(
      `SELECT 1 FROM tenants WHERE LOWER(TRIM(email)) = $1
       UNION ALL
       SELECT 1 FROM operadores WHERE LOWER(email) = $1`,
      [emailNorm]
    );
    if (clash.rows.length > 0) {
      res.status(409).json({
        error: 'email_in_use',
        detalhe: 'Este e-mail ja esta em uso. Use outro para o operador.',
      });
      return;
    }

    const result = await query(
      `INSERT INTO operadores (tenant_id, nome, email, senha_hash, ativo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, tenant_id, nome, email, ativo, criado_em`,
      [tenantId, nome.trim(), emailNorm, bcrypt.hashSync(senha, 10)]
    );
    res.status(201).json({ operador: mapOperadorRow(result.rows[0]) });
  } catch (err) {
    console.error('Erro ao criar operador:', err);
    res.status(500).json({ error: 'create_operador_failed' });
  }
});

// PUT /api/portal/operadores/:id
router.put('/operadores/:id', verifyEventAdmin, async (req: AuthRequest, res) => {
  const parsed = operadorSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  const fields = parsed.data;
  const tenantId = req.portal!.tenantId;
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.nome !== undefined) {
    sets.push(`nome = $${sets.length + 1}`);
    values.push(fields.nome.trim());
  }
  if (fields.email !== undefined) {
    const emailNorm = fields.email.trim().toLowerCase();
    const clash = await query(
      `SELECT 1 FROM tenants WHERE LOWER(TRIM(email)) = $1
       UNION ALL
       SELECT 1 FROM operadores WHERE LOWER(email) = $1 AND id <> $2`,
      [emailNorm, req.params.id]
    );
    if (clash.rows.length > 0) {
      res.status(409).json({
        error: 'email_in_use',
        detalhe: 'Este e-mail ja esta em uso.',
      });
      return;
    }
    sets.push(`email = $${sets.length + 1}`);
    values.push(emailNorm);
  }
  if (fields.senha) {
    sets.push(`senha_hash = $${sets.length + 1}`);
    values.push(bcrypt.hashSync(fields.senha, 10));
  }
  if (fields.ativo !== undefined) {
    sets.push(`ativo = $${sets.length + 1}`);
    values.push(fields.ativo);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: 'no_fields' });
    return;
  }

  try {
    values.push(req.params.id, tenantId);
    const result = await query(
      `UPDATE operadores SET ${sets.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length}
       RETURNING id, tenant_id, nome, email, ativo, criado_em`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'operador_not_found' });
      return;
    }
    res.json({ operador: mapOperadorRow(result.rows[0]) });
  } catch (err) {
    console.error('Erro ao atualizar operador:', err);
    res.status(500).json({ error: 'update_operador_failed' });
  }
});

// DELETE /api/portal/operadores/:id
router.delete('/operadores/:id', verifyEventAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `UPDATE operadores SET ativo = false
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [req.params.id, req.portal!.tenantId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'operador_not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao desativar operador:', err);
    res.status(500).json({ error: 'delete_operador_failed' });
  }
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
router.post('/produtos', verifyEventAdmin, async (req: AuthRequest, res) => {
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
router.put('/produtos/:id', verifyEventAdmin, async (req: AuthRequest, res) => {
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
router.delete('/produtos/:id', verifyEventAdmin, async (req: AuthRequest, res) => {
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
