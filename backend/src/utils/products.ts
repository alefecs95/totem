import { z } from 'zod';

export const productSchema = z.object({
  nome: z.string().min(1).max(100),
  preco: z.number().positive(),
  emoji: z.string().max(10).optional(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  ordem: z.number().int().nonnegative().optional(),
  ativo: z.boolean().optional(),
});

export function mapProductRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    nome: row.nome as string,
    preco: Number(row.preco),
    emoji: row.emoji as string,
    cor: row.cor as string,
    ordem: row.ordem as number,
    ativo: row.ativo as boolean,
    criado_em: row.criado_em as string,
  };
}

export function stripTenantSecrets(row: Record<string, unknown>) {
  const { portal_senha_hash, ...rest } = row;
  return {
    ...rest,
    portal_ativo: Boolean(portal_senha_hash),
  };
}
