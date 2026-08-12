import { query } from '../config/database';

export class PaymentValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

export interface PaymentItemInput {
  productId: string;
  quantidade: number;
}

export interface ValidatedPaymentItem {
  productId: string;
  nome: string;
  categoria: string;
  imprime_ficha: boolean;
  ficha_2_vias: boolean;
  quantidade: number;
  preco: number;
  subtotal: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Valida itens contra produtos reais do tenant e recalcula o total no servidor.
export async function validatePaymentItems(
  tenantId: string,
  items: PaymentItemInput[],
  clientTotal: number
): Promise<{ items: ValidatedPaymentItem[]; total: number }> {
  if (items.length === 0) {
    throw new PaymentValidationError('empty_cart', 'Carrinho vazio.');
  }

  const productIds = items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new PaymentValidationError(
      'duplicate_product',
      'Produto duplicado no carrinho.'
    );
  }

  const result = await query<{
    id: string;
    nome: string;
    preco: string;
    categoria: string;
    imprime_ficha: boolean;
    ficha_2_vias: boolean;
  }>(
    `SELECT id, nome, preco, categoria, imprime_ficha, ficha_2_vias FROM produtos
     WHERE tenant_id = $1 AND ativo = true AND id = ANY($2::uuid[])`,
    [tenantId, productIds]
  );

  const byId = new Map(result.rows.map((row) => [row.id, row]));

  const validated: ValidatedPaymentItem[] = [];
  let total = 0;

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) {
      throw new PaymentValidationError(
        'product_not_found',
        `Produto inválido ou inativo: ${item.productId}`
      );
    }

    const preco = Number(product.preco);
    const subtotal = round2(preco * item.quantidade);
    validated.push({
      productId: item.productId,
      nome: product.nome,
      categoria: product.categoria,
      imprime_ficha: Boolean(product.imprime_ficha),
      ficha_2_vias: Boolean(product.ficha_2_vias),
      quantidade: item.quantidade,
      preco,
      subtotal,
    });
    total += subtotal;
  }

  total = round2(total);

  if (Math.abs(total - clientTotal) > 0.001) {
    throw new PaymentValidationError(
      'total_mismatch',
      `Total enviado (${clientTotal}) não confere com o calculado (${total}).`
    );
  }

  return { items: validated, total };
}
