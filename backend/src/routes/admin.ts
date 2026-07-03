import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/database';
import { seedDefaultProducts } from '../config/seed';
import { env } from '../config/env';
import { verifyAdmin } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  try {
    const { email, senha } = parsed.data;
    const result = await query(
      'SELECT id, email, senha_hash FROM admin_users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const token = jwt.sign({ id: user.id, email: user.email }, env.jwt.secret, {
      expiresIn: '8h',
    });

    res.json({ token, email: user.email });
  } catch (err) {
    console.error('Erro no login admin:', err);
    res.status(500).json({ error: 'login_failed' });
  }
});

// ---------------------------------------------------------------------------
// Tenants (protegido)
// ---------------------------------------------------------------------------

const tenantSchema = z.object({
  nome: z.string().min(1),
  responsavel: z.string().min(1),
  telefone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  gateway: z.enum(['mercadopago', 'sumup']).default('mercadopago'),
  comissao_pct: z.number().nonnegative().default(5),
  mp_access_token: z.string().optional().nullable(),
  mp_webhook_secret: z.string().optional().nullable(),
  mp_device_id: z.string().optional().nullable(),
  sumup_api_key: z.string().optional().nullable(),
  sumup_reader_id: z.string().optional().nullable(),
});

// GET /api/admin/tenants
router.get('/tenants', verifyAdmin, async (_req, res) => {
  try {
    const result = await query('SELECT * FROM tenants ORDER BY criado_em DESC');
    res.json({ tenants: result.rows });
  } catch (err) {
    console.error('Erro ao listar tenants:', err);
    res.status(500).json({ error: 'list_tenants_failed' });
  }
});

// POST /api/admin/tenants
router.post('/tenants', verifyAdmin, async (req, res) => {
  const parsed = tenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const t = parsed.data;
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO tenants
        (nome, responsavel, telefone, email, gateway, comissao_pct,
         mp_access_token, mp_webhook_secret, mp_device_id,
         sumup_api_key, sumup_reader_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        t.nome,
        t.responsavel,
        t.telefone ?? null,
        t.email ?? null,
        t.gateway,
        t.comissao_pct,
        t.mp_access_token ?? null,
        t.mp_webhook_secret ?? null,
        t.mp_device_id ?? null,
        t.sumup_api_key ?? null,
        t.sumup_reader_id ?? null,
      ]
    );

    const tenant = result.rows[0];
    // Cada novo tenant já nasce com os 4 produtos padrão.
    await seedDefaultProducts(tenant.id);

    res.status(201).json({ tenant });
  } catch (err) {
    console.error('Erro ao criar tenant:', err);
    res.status(500).json({ error: 'create_tenant_failed' });
  }
});

// PUT /api/admin/tenants/:id
router.put('/tenants/:id', verifyAdmin, async (req, res) => {
  const parsed = tenantSchema.partial().safeParse(req.body);
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
    setClauses.push('atualizado_em = NOW()');
    const values = keys.map((key) => (fields as Record<string, unknown>)[key]);

    const result = await query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    res.json({ tenant: result.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar tenant:', err);
    res.status(500).json({ error: 'update_tenant_failed' });
  }
});

// DELETE /api/admin/tenants/:id (desativa)
router.delete('/tenants/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await query(
      'UPDATE tenants SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao desativar tenant:', err);
    res.status(500).json({ error: 'delete_tenant_failed' });
  }
});

// ---------------------------------------------------------------------------
// Totens (protegido)
// ---------------------------------------------------------------------------

const totemSchema = z.object({
  nome: z.string().min(1),
  local: z.string().optional().nullable(),
});

function buildSetupUrl(tenantId: string, totemId: string): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  return `${base}/setup?tenantId=${encodeURIComponent(tenantId)}&totemId=${encodeURIComponent(totemId)}`;
}

function mapTotemRow(row: Record<string, unknown>, tenantId: string) {
  const id = row.id as string;
  return {
    id,
    tenant_id: row.tenant_id as string,
    nome: row.nome as string,
    local: row.local as string | null,
    ativo: row.ativo as boolean,
    ultimo_acesso: row.ultimo_acesso as string | null,
    criado_em: row.criado_em as string,
    setupUrl: buildSetupUrl(tenantId, id),
  };
}

// GET /api/admin/tenants/:tenantId/totens
router.get('/tenants/:tenantId/totens', verifyAdmin, async (req, res) => {
  try {
    const tenantId = String(req.params.tenantId);
    const result = await query(
      `SELECT * FROM totens WHERE tenant_id = $1 ORDER BY criado_em DESC`,
      [tenantId]
    );
    res.json({
      totens: result.rows.map((row) => mapTotemRow(row, tenantId)),
    });
  } catch (err) {
    console.error('Erro ao listar totens:', err);
    res.status(500).json({ error: 'list_totens_failed' });
  }
});

// POST /api/admin/tenants/:tenantId/totens
router.post('/tenants/:tenantId/totens', verifyAdmin, async (req, res) => {
  const parsed = totemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const tenantId = String(req.params.tenantId);
  const { nome, local } = parsed.data;

  try {
    const tenantResult = await query(
      'SELECT id FROM tenants WHERE id = $1 AND ativo = true',
      [tenantId]
    );
    if (!tenantResult.rows[0]) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const result = await query(
      `INSERT INTO totens (tenant_id, nome, local)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenantId, nome, local ?? null]
    );

    const totem = mapTotemRow(result.rows[0], tenantId);
    res.status(201).json({ totem });
  } catch (err) {
    console.error('Erro ao criar totem:', err);
    res.status(500).json({ error: 'create_totem_failed' });
  }
});

// DELETE /api/admin/totens/:id (desativa)
router.delete('/totens/:id', verifyAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE totens SET ativo = false WHERE id = $1 RETURNING id, tenant_id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'totem_not_found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao desativar totem:', err);
    res.status(500).json({ error: 'delete_totem_failed' });
  }
});

// ---------------------------------------------------------------------------
// Transações (protegido)
// ---------------------------------------------------------------------------

// GET /api/admin/transactions
router.get('/transactions', verifyAdmin, async (req, res) => {
  try {
    const { tenantId, status, dataInicio, dataFim } = req.query as Record<
      string,
      string | undefined
    >;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (tenantId) {
      conditions.push(`t.tenant_id = $${i++}`);
      params.push(tenantId);
    }
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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const countResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM transactions t ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    const dataResult = await query(
      `SELECT t.*, tn.nome AS tenant_nome
       FROM transactions t
       LEFT JOIN tenants tn ON tn.id = t.tenant_id
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
    console.error('Erro ao listar transações:', err);
    res.status(500).json({ error: 'list_transactions_failed' });
  }
});

// PUT /api/admin/transactions/:id/repasse
router.put('/transactions/:id/repasse', verifyAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE transactions
       SET repasse_status = 'repassado', repasse_em = NOW(), atualizado_em = NOW()
       WHERE id = $1
       RETURNING id, repasse_status, repasse_em`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'transaction_not_found' });
      return;
    }
    res.json({ transaction: result.rows[0] });
  } catch (err) {
    console.error('Erro ao marcar repasse:', err);
    res.status(500).json({ error: 'repasse_failed' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard (protegido)
// ---------------------------------------------------------------------------

// GET /api/admin/dashboard
router.get('/dashboard', verifyAdmin, async (_req, res) => {
  try {
    const result = await query<{
      total_vendas: string;
      total_comissoes: string;
      total_liquido: string;
      vendas_hoje: number;
      vendas_pendentes_repasse: number;
    }>(
      `SELECT
        COALESCE(SUM(valor_bruto) FILTER (WHERE status = 'approved'), 0) AS total_vendas,
        COALESCE(SUM(comissao_valor) FILTER (WHERE status = 'approved'), 0) AS total_comissoes,
        COALESCE(SUM(valor_liquido) FILTER (WHERE status = 'approved'), 0) AS total_liquido,
        COUNT(*) FILTER (WHERE status = 'approved' AND criado_em::date = CURRENT_DATE) AS vendas_hoje,
        COUNT(*) FILTER (WHERE status = 'approved' AND repasse_status = 'pendente') AS vendas_pendentes_repasse
      FROM transactions`
    );

    const row = result.rows[0];
    res.json({
      totalVendas: Number(row.total_vendas),
      totalComissoes: Number(row.total_comissoes),
      totalLiquido: Number(row.total_liquido),
      vendasHoje: Number(row.vendas_hoje),
      vendasPendentesRepasse: Number(row.vendas_pendentes_repasse),
    });
  } catch (err) {
    console.error('Erro ao montar dashboard:', err);
    res.status(500).json({ error: 'dashboard_failed' });
  }
});

export default router;
