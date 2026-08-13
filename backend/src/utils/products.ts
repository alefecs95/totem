import { z } from 'zod';
import { env } from '../config/env';
import {
  PRODUCT_CATEGORIES,
} from './productCategories';

const fichaLogoDataSchema = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z
    .string()
    .max(1_800_000)
    .refine(
      (v) =>
        v.startsWith('data:image/png;base64,') ||
        v.startsWith('data:image/jpeg;base64,') ||
        v.startsWith('data:image/webp;base64,'),
      'Logo deve ser PNG/JPEG/WebP em data URL'
    )
    .nullable()
    .optional()
);

export const productSchema = z.object({
  nome: z.string().min(1).max(100),
  preco: z.number().positive(),
  categoria: z.enum(PRODUCT_CATEGORIES),
  emoji: z.string().max(10).optional(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  ordem: z.number().int().nonnegative().optional(),
  ativo: z.boolean().optional(),
  /** Se true, cada unidade da venda imprime uma ficha unica (25mm) na termica. */
  imprime_ficha: z.boolean().optional(),
  /**
   * Independente de imprime_ficha. Se true, cada unidade gera 2 vias maiores (50mm):
   * barman (sabor em destaque) + cliente (codigo).
   */
  ficha_2_vias: z.boolean().optional(),
  /** Logo individual da ficha deste produto (data URL). */
  ficha_logo_data: fichaLogoDataSchema,
});

export function mapProductRow(row: Record<string, unknown>) {
  const logo = (row.ficha_logo_data as string | null) || null;
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    nome: row.nome as string,
    preco: Number(row.preco),
    categoria: row.categoria as string,
    emoji: row.emoji as string,
    cor: row.cor as string,
    ordem: row.ordem as number,
    ativo: row.ativo as boolean,
    imprime_ficha: Boolean(row.imprime_ficha),
    ficha_2_vias: Boolean(row.ficha_2_vias),
    ficha_logo_data: logo,
    ficha_logo_set: Boolean(logo),
    criado_em: row.criado_em as string,
  };
}

export function stripTenantSecrets(row: Record<string, unknown>) {
  const { portal_senha_hash, operador_senha_hash, ...rest } = row;
  const codigo = (rest.codigo_evento as string | null) || null;
  const portalBase = env.portalUrl.replace(/\/$/, '');
  return {
    ...rest,
    portal_ativo: Boolean(portal_senha_hash),
    operador_ativo: Boolean(operador_senha_hash),
    ficha_logo_set: Boolean(rest.ficha_logo_data),
    portal_url:
      portalBase && codigo
        ? `${portalBase}/e/${encodeURIComponent(codigo)}`
        : null,
  };
}
