import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../config/database';
import { seedDefaultProducts } from '../config/seed';
import { env } from '../config/env';
import { verifyAdmin, type AuthRequest } from '../middleware/auth';
import {
  createMpPos,
  createMpStore,
  getMpUserId,
  isValidMpDeviceId,
  listMpTerminals,
  setTerminalOperatingMode,
} from '../services/mercadopago';
import { geocodeBrazil } from '../services/geocode';
import { listSumUpReaders, pairSumUpReader } from '../services/sumup';
import { productSchema, mapProductRow, stripTenantSecrets } from '../utils/products';

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      env.jwt.secret,
      { expiresIn: '8h' }
    );

    res.json({ token, email: user.email });
  } catch (err) {
    console.error('Erro no login admin:', err);
    res.status(500).json({ error: 'login_failed' });
  }
});

const changePasswordSchema = z.object({
  senhaAtual: z.string().min(1),
  senhaNova: z.string().min(8),
});

// PUT /api/admin/change-password
router.put('/change-password', verifyAdmin, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const adminId = req.admin?.id;
  if (!adminId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { senhaAtual, senhaNova } = parsed.data;

  try {
    const result = await query<{ senha_hash: string }>(
      'SELECT senha_hash FROM admin_users WHERE id = $1',
      [adminId]
    );
    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ error: 'admin_not_found' });
      return;
    }

    const ok = await bcrypt.compare(senhaAtual, user.senha_hash);
    if (!ok) {
      res.status(401).json({ error: 'invalid_current_password' });
      return;
    }

    const senhaHash = bcrypt.hashSync(senhaNova, 10);
    await query('UPDATE admin_users SET senha_hash = $1 WHERE id = $2', [
      senhaHash,
      adminId,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao trocar senha admin:', err);
    res.status(500).json({ error: 'change_password_failed' });
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
  sumup_merchant_code: z.string().optional().nullable(),
  sumup_affiliate_key: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  portal_senha: z.string().min(4).optional().nullable(),
});

type TenantRow = Record<string, unknown> & {
  id: string;
  nome: string;
  gateway: string;
  mp_access_token: string | null;
  mp_store_id: string | null;
  mp_user_id: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
};

// Cria (best-effort) a loja do Mercado Pago para o tenant. Nunca lança:
// retorna um status para o admin exibir, sem quebrar o cadastro.
async function tryCreateMpStore(
  tenant: TenantRow
): Promise<{ ok: boolean; motivo?: string; detalhe?: string }> {
  if (tenant.mp_store_id) return { ok: true };

  const accessToken = tenant.mp_access_token || env.mercadopago.accessToken;
  if (tenant.gateway !== 'mercadopago' || !accessToken) {
    return { ok: false, motivo: 'sem_access_token' };
  }

  let lat = tenant.latitude != null ? Number(tenant.latitude) : null;
  let lng = tenant.longitude != null ? Number(tenant.longitude) : null;

  // Fallback: se o operador não informou coordenadas, deriva do endereço.
  if ((lat == null || lng == null) && tenant.cidade && tenant.estado) {
    try {
      const geo = await geocodeBrazil({
        endereco: tenant.endereco,
        numero: tenant.numero,
        bairro: tenant.bairro,
        cidade: tenant.cidade,
        estado: tenant.estado,
      });
      if (geo) {
        lat = geo.latitude;
        lng = geo.longitude;
      }
    } catch (err) {
      console.error('Falha ao geocodificar endereço do tenant:', err);
    }
  }

  if (!tenant.cidade || !tenant.estado || lat == null || lng == null) {
    return { ok: false, motivo: 'localizacao_incompleta' };
  }

  try {
    const userId = tenant.mp_user_id || (await getMpUserId(accessToken));
    const { storeId } = await createMpStore({
      accessToken,
      userId,
      name: tenant.nome,
      externalId: tenant.id,
      location: {
        street_name: tenant.endereco?.trim() || tenant.nome,
        street_number: tenant.numero?.trim() || 'S/N',
        city_name: tenant.cidade,
        state_name: tenant.estado,
        latitude: lat,
        longitude: lng,
        reference: tenant.bairro?.trim() || undefined,
      },
    });
    await query(
      `UPDATE tenants
       SET mp_user_id = $1, mp_store_id = $2, latitude = $3, longitude = $4,
           atualizado_em = NOW()
       WHERE id = $5`,
      [userId, storeId, lat, lng, tenant.id]
    );
    return { ok: true };
  } catch (err) {
    console.error('Erro ao criar loja no Mercado Pago:', err);
    return {
      ok: false,
      motivo: 'mp_store_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}

// Cria (best-effort) o caixa (POS) do Mercado Pago para o totem.
async function tryCreateMpPos(
  tenant: TenantRow,
  totem: { id: string; nome: string }
): Promise<{ ok: boolean; motivo?: string; detalhe?: string }> {
  const accessToken = tenant.mp_access_token || env.mercadopago.accessToken;
  if (tenant.gateway !== 'mercadopago' || !accessToken || !tenant.mp_store_id) {
    return { ok: false, motivo: 'loja_indisponivel' };
  }

  try {
    const { posId } = await createMpPos({
      accessToken,
      name: totem.nome,
      storeId: tenant.mp_store_id,
      externalStoreId: tenant.id,
      externalId: totem.id,
      category: env.mercadopago.posCategory,
    });
    await query('UPDATE totens SET mp_pos_id = $1 WHERE id = $2', [
      posId,
      totem.id,
    ]);
    return { ok: true };
  } catch (err) {
    console.error('Erro ao criar caixa no Mercado Pago:', err);
    return {
      ok: false,
      motivo: 'mp_pos_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    };
  }
}

// GET /api/admin/geocode?cidade=&estado=&endereco=&numero= -> lat/long
// (aceita também ?q= por compatibilidade)
router.get('/geocode', verifyAdmin, async (req, res) => {
  const cidade = String(req.query.cidade ?? '').trim();
  const estado = String(req.query.estado ?? '').trim();
  const endereco = String(req.query.endereco ?? '').trim();
  const numero = String(req.query.numero ?? '').trim();
  const bairro = String(req.query.bairro ?? '').trim();
  const q = String(req.query.q ?? '').trim();

  if (!cidade && !estado && !q) {
    res.status(400).json({ error: 'missing_query' });
    return;
  }

  try {
    const result = q
      ? await geocodeBrazil({ endereco: q })
      : await geocodeBrazil({ endereco, numero, bairro, cidade, estado });
    if (!result) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error('Erro ao geocodificar endereço:', err);
    res.status(500).json({ error: 'geocode_failed' });
  }
});

// GET /api/admin/tenants/:id/terminals -> lista maquininhas Point do tenant
router.get('/tenants/:id/terminals', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1 AND ativo = true',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const accessToken =
      tenant.mp_access_token || env.mercadopago.accessToken;
    if (!accessToken) {
      res.status(400).json({ error: 'missing_access_token' });
      return;
    }

    const terminals = await listMpTerminals(accessToken, {
      storeId: tenant.mp_store_id ?? undefined,
    });

    res.json({ terminals });
  } catch (err) {
    console.error('Erro ao listar terminais MP:', err);
    res.status(500).json({
      error: 'list_terminals_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/admin/tenants/:id/terminals/pdv -> coloca a maquininha em modo PDV
router.post('/tenants/:id/terminals/pdv', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1 AND ativo = true',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const accessToken =
      tenant.mp_access_token || env.mercadopago.accessToken;
    if (!accessToken) {
      res.status(400).json({ error: 'missing_access_token' });
      return;
    }

    const deviceId =
      (req.body?.deviceId as string | undefined) ||
      (tenant.mp_device_id as string | null | undefined);
    if (!isValidMpDeviceId(deviceId)) {
      res.status(400).json({ error: 'invalid_device_id' });
      return;
    }

    const outcome = await setTerminalOperatingMode(
      accessToken,
      deviceId as string,
      'PDV'
    );
    if (!outcome.ok) {
      res.status(502).json({
        error: 'set_pdv_failed',
        detalhe: outcome.detail,
      });
      return;
    }

    res.json({ ok: true, mode: outcome.mode });
  } catch (err) {
    console.error('Erro ao ativar modo PDV:', err);
    res.status(500).json({
      error: 'set_pdv_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/admin/tenants/:id/sumup-readers -> lista leitores SumUp pareados
router.get('/tenants/:id/sumup-readers', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const apiKey =
      (tenant.sumup_api_key as string | null) || env.sumup.apiKey;
    const merchantCode =
      (tenant.sumup_merchant_code as string | null) || env.sumup.merchantCode;
    if (!apiKey || !merchantCode) {
      res.status(400).json({ error: 'missing_sumup_config' });
      return;
    }

    const readers = await listSumUpReaders(apiKey, merchantCode);
    res.json({ readers });
  } catch (err) {
    console.error('Erro ao listar leitores SumUp:', err);
    res.status(500).json({
      error: 'list_sumup_readers_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/admin/tenants/:id/sumup-readers -> pareia um leitor SumUp
router.post('/tenants/:id/sumup-readers', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const apiKey =
      (tenant.sumup_api_key as string | null) || env.sumup.apiKey;
    const merchantCode =
      (tenant.sumup_merchant_code as string | null) || env.sumup.merchantCode;
    if (!apiKey || !merchantCode) {
      res.status(400).json({ error: 'missing_sumup_config' });
      return;
    }

    const pairingCode = String(req.body?.pairingCode ?? '').trim();
    if (!pairingCode) {
      res.status(400).json({ error: 'missing_pairing_code' });
      return;
    }

    const reader = await pairSumUpReader(
      apiKey,
      merchantCode,
      pairingCode,
      (tenant.nome as string) || 'Totem'
    );

    // Já grava o reader_id no tenant para facilitar.
    await query(
      'UPDATE tenants SET sumup_reader_id = $1, atualizado_em = NOW() WHERE id = $2',
      [reader.id, req.params.id]
    );

    res.json({ reader });
  } catch (err) {
    console.error('Erro ao parear leitor SumUp:', err);
    res.status(500).json({
      error: 'pair_sumup_reader_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/admin/tenants/:id/sync-mp -> (re)cria loja e caixas no Mercado Pago
router.post('/tenants/:id/sync-mp', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    // 1) Garante a loja (store).
    const store = await tryCreateMpStore(tenant);

    // Recarrega para pegar o mp_store_id recém-criado.
    const refreshed = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    const tenantAtualizado = refreshed.rows[0];

    // 2) Cria os caixas (POS) faltantes de cada totem.
    const totensResult = await query(
      'SELECT * FROM totens WHERE tenant_id = $1 AND ativo = true',
      [req.params.id]
    );
    const totensStatus: Array<{
      id: string;
      nome: string;
      ok: boolean;
      motivo?: string;
      detalhe?: string;
    }> = [];
    for (const row of totensResult.rows) {
      const posId = row.mp_pos_id as string | null;
      if (posId) {
        totensStatus.push({
          id: row.id as string,
          nome: row.nome as string,
          ok: true,
        });
        continue;
      }
      const pos = await tryCreateMpPos(tenantAtualizado, {
        id: row.id as string,
        nome: row.nome as string,
      });
      totensStatus.push({
        id: row.id as string,
        nome: row.nome as string,
        ok: pos.ok,
        motivo: pos.motivo,
        detalhe: pos.detalhe,
      });
    }

    res.json({
      store,
      storeId: tenantAtualizado.mp_store_id ?? null,
      userId: tenantAtualizado.mp_user_id ?? null,
      totens: totensStatus,
    });
  } catch (err) {
    console.error('Erro ao sincronizar MP:', err);
    res.status(500).json({
      error: 'sync_mp_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/admin/tenants/:id/orders/:orderId -> diagnóstico da Order no MP
router.get('/tenants/:id/orders/:orderId', verifyAdmin, async (req, res) => {
  try {
    const result = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }
    const accessToken =
      tenant.mp_access_token || env.mercadopago.accessToken;
    if (!accessToken) {
      res.status(400).json({ error: 'missing_access_token' });
      return;
    }

    const mpResp = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(
        String(req.params.orderId)
      )}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const body = await mpResp.text();
    res.status(mpResp.status).type('application/json').send(body);
  } catch (err) {
    console.error('Erro ao consultar order MP:', err);
    res.status(500).json({
      error: 'order_lookup_failed',
      detalhe: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/admin/tenants
router.get('/tenants', verifyAdmin, async (_req, res) => {
  try {
    const result = await query('SELECT * FROM tenants ORDER BY criado_em DESC');
    res.json({ tenants: result.rows.map(stripTenantSecrets) });
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
  const { portal_senha, ...tenantFields } = t;
  const portalSenhaHash = portal_senha
    ? bcrypt.hashSync(portal_senha, 10)
    : null;

  try {
    const result = await query<TenantRow>(
      `INSERT INTO tenants
        (nome, responsavel, telefone, email, gateway, comissao_pct,
         mp_access_token, mp_webhook_secret, mp_device_id,
         sumup_api_key, sumup_reader_id, sumup_merchant_code,
         sumup_affiliate_key,
         endereco, numero, bairro, cidade, estado, latitude, longitude,
         portal_senha_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [
        tenantFields.nome,
        tenantFields.responsavel,
        tenantFields.telefone ?? null,
        tenantFields.email ?? null,
        tenantFields.gateway,
        tenantFields.comissao_pct,
        tenantFields.mp_access_token ?? null,
        tenantFields.mp_webhook_secret ?? null,
        tenantFields.mp_device_id ?? null,
        tenantFields.sumup_api_key ?? null,
        tenantFields.sumup_reader_id ?? null,
        tenantFields.sumup_merchant_code ?? null,
        tenantFields.sumup_affiliate_key ?? null,
        tenantFields.endereco ?? null,
        tenantFields.numero ?? null,
        tenantFields.bairro ?? null,
        tenantFields.cidade ?? null,
        tenantFields.estado ?? null,
        tenantFields.latitude ?? null,
        tenantFields.longitude ?? null,
        portalSenhaHash,
      ]
    );

    const tenant = result.rows[0];
    // Cada novo tenant já nasce com os 4 produtos padrão.
    await seedDefaultProducts(tenant.id);

    // Cria a loja no Mercado Pago (best-effort — não bloqueia o cadastro).
    const mpStore = await tryCreateMpStore(tenant);

    const finalResult = await query('SELECT * FROM tenants WHERE id = $1', [
      tenant.id,
    ]);

    res.status(201).json({
      tenant: stripTenantSecrets(finalResult.rows[0]),
      mpStore,
    });
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
  const { portal_senha, ...tenantFields } = fields;
  const keys = Object.keys(tenantFields);
  const values: unknown[] = keys.map(
    (key) => (tenantFields as Record<string, unknown>)[key]
  );

  if (portal_senha) {
    keys.push('portal_senha_hash');
    values.push(bcrypt.hashSync(portal_senha, 10));
  }

  if (keys.length === 0) {
    res.status(400).json({ error: 'no_fields' });
    return;
  }

  try {
    const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);
    setClauses.push('atualizado_em = NOW()');

    const result = await query<TenantRow>(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    // Se agora tem access token + localização e ainda não tem loja, cria.
    const mpStore = await tryCreateMpStore(result.rows[0]);

    const finalResult = await query('SELECT * FROM tenants WHERE id = $1', [
      req.params.id,
    ]);

    res.json({ tenant: stripTenantSecrets(finalResult.rows[0]), mpStore });
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
    mp_pos_id: (row.mp_pos_id as string | null) ?? null,
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
    const tenantResult = await query<TenantRow>(
      'SELECT * FROM tenants WHERE id = $1 AND ativo = true',
      [tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    const result = await query(
      `INSERT INTO totens (tenant_id, nome, local)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenantId, nome, local ?? null]
    );

    const row = result.rows[0];
    // Cria o caixa (POS) no Mercado Pago (best-effort).
    const mpPos = await tryCreateMpPos(tenant, {
      id: row.id as string,
      nome: row.nome as string,
    });

    const finalRow = await query('SELECT * FROM totens WHERE id = $1', [row.id]);
    const totem = mapTotemRow(finalRow.rows[0], tenantId);
    res.status(201).json({ totem, mpPos });
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

// ---------------------------------------------------------------------------
// Produtos por tenant (protegido)
// ---------------------------------------------------------------------------

// GET /api/admin/tenants/:tenantId/produtos
router.get('/tenants/:tenantId/produtos', verifyAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM produtos
       WHERE tenant_id = $1
       ORDER BY ordem ASC, criado_em ASC`,
      [req.params.tenantId]
    );
    res.json({ produtos: result.rows.map(mapProductRow) });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    res.status(500).json({ error: 'list_products_failed' });
  }
});

// POST /api/admin/tenants/:tenantId/produtos
router.post('/tenants/:tenantId/produtos', verifyAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
    return;
  }

  const p = parsed.data;
  const tenantId = String(req.params.tenantId);

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
      `INSERT INTO produtos (tenant_id, nome, preco, emoji, cor, ordem, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        p.nome,
        p.preco,
        p.emoji ?? '🎟️',
        p.cor ?? '#FF6B00',
        ordem,
        p.ativo ?? true,
      ]
    );

    res.status(201).json({ produto: mapProductRow(result.rows[0]) });
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    res.status(500).json({ error: 'create_product_failed' });
  }
});

// PUT /api/admin/tenants/:tenantId/produtos/:id
router.put(
  '/tenants/:tenantId/produtos/:id',
  verifyAdmin,
  async (req, res) => {
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
      const tenantId = String(req.params.tenantId);

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
      console.error('Erro ao atualizar produto:', err);
      res.status(500).json({ error: 'update_product_failed' });
    }
  }
);

// DELETE /api/admin/tenants/:tenantId/produtos/:id
router.delete(
  '/tenants/:tenantId/produtos/:id',
  verifyAdmin,
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE produtos SET ativo = false
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [req.params.id, req.params.tenantId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'product_not_found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro ao desativar produto:', err);
      res.status(500).json({ error: 'delete_product_failed' });
    }
  }
);

export default router;
