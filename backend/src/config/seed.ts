import { query } from './database';
import type { ProductCategory } from '../utils/productCategories';

interface DefaultProduct {
  nome: string;
  preco: number;
  emoji: string;
  cor: string;
  categoria: ProductCategory;
}

// Produtos padrão criados para cada novo tenant.
const DEFAULT_PRODUCTS: DefaultProduct[] = [
  {
    nome: 'Ficha de Cerveja',
    preco: 8.0,
    emoji: '🍺',
    cor: '#FF6B00',
    categoria: 'bebida_alcoolica',
  },
  {
    nome: 'Ficha de Refrigerante',
    preco: 5.0,
    emoji: '🥤',
    cor: '#00B4FF',
    categoria: 'bebida_nao_alcoolica',
  },
  {
    nome: 'Ficha de Água',
    preco: 3.0,
    emoji: '💧',
    cor: '#00E5FF',
    categoria: 'bebida_nao_alcoolica',
  },
  {
    nome: 'Ficha de Comida',
    preco: 15.0,
    emoji: '🍔',
    cor: '#FF3D6B',
    categoria: 'comida',
  },
];

// Insere os 4 produtos padrão para um tenant recém-criado.
export async function seedDefaultProducts(tenantId: string): Promise<void> {
  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    const p = DEFAULT_PRODUCTS[i];
    await query(
      `INSERT INTO produtos (tenant_id, nome, preco, emoji, cor, ordem, categoria)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, p.nome, p.preco, p.emoji, p.cor, i, p.categoria]
    );
  }
}
