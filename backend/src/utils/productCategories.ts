export const PRODUCT_CATEGORIES = [
  'bebida_alcoolica',
  'bebida_nao_alcoolica',
  'comida',
  'outro',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = 'outro';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  bebida_alcoolica: 'Bebida alcoólica',
  bebida_nao_alcoolica: 'Bebida não alcoólica',
  comida: 'Comida',
  outro: 'Outro',
};

export function isValidProductCategory(value: string): value is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}
