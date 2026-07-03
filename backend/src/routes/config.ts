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
      'SELECT id, nome FROM tenants WHERE id = $1 AND ativo = true',
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

    res.json({
      nomeFestival: tenant.nome,
      produtos,
    });
  } catch (err) {
    console.error('Erro ao carregar config do totem:', err);
    res.status(500).json({ error: 'config_failed' });
  }
});

export default router;
