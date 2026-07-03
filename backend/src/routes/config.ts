import { Router } from 'express';
import { query } from '../config/database';

const router = Router();

// GET /api/config — nome do festival + produtos do tenant (identificado pelos headers).
router.get('/config', async (req, res) => {
  const tenantId = req.header('x-tenant-id');
  const totemId = req.header('x-totem-id');

  if (!tenantId) {
    res.status(400).json({ error: 'missing_tenant_id' });
    return;
  }

  try {
    const tenantResult = await query(
      `SELECT id, nome, gateway, mp_device_id, mp_access_token,
              sumup_api_key, sumup_reader_id
       FROM tenants WHERE id = $1 AND ativo = true`,
      [tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      res.status(404).json({ error: 'tenant_not_found' });
      return;
    }

    if (totemId) {
      const totemResult = await query(
        `SELECT id FROM totens
         WHERE id = $1 AND tenant_id = $2 AND ativo = true`,
        [totemId, tenantId]
      );
      if (!totemResult.rows[0]) {
        res.status(404).json({ error: 'totem_not_found' });
        return;
      }
      await query(
        'UPDATE totens SET ultimo_acesso = NOW() WHERE id = $1',
        [totemId]
      );
    }

    const produtosResult = await query(
      `SELECT id, nome, preco, emoji, cor
       FROM produtos
       WHERE tenant_id = $1 AND ativo = true
       ORDER BY ordem ASC, criado_em ASC`,
      [tenantId]
    );

    const produtos = produtosResult.rows.map((row) => ({
      id: row.id as string,
      nome: row.nome as string,
      preco: Number(row.preco),
      emoji: row.emoji as string,
      cor: row.cor as string,
    }));

    // Métodos de pagamento realmente disponíveis para este tenant.
    // Pix precisa só de credencial; cartão precisa da maquininha configurada.
    const gateway = tenant.gateway === 'sumup' ? 'sumup' : 'mercadopago';
    const pixDisponivel =
      gateway === 'sumup'
        ? Boolean(tenant.sumup_api_key)
        : Boolean(tenant.mp_access_token);
    const cartaoDisponivel =
      gateway === 'sumup'
        ? Boolean(tenant.sumup_api_key && tenant.sumup_reader_id)
        : Boolean(tenant.mp_access_token && tenant.mp_device_id);

    res.json({
      nomeFestival: tenant.nome,
      produtos,
      pagamentos: {
        pix: pixDisponivel,
        cartao: cartaoDisponivel,
      },
    });
  } catch (err) {
    console.error('Erro ao carregar config do totem:', err);
    res.status(500).json({ error: 'config_failed' });
  }
});

export default router;
