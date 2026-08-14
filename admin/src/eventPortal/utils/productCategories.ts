export type ProductCategory =
  | 'bebida_alcoolica'
  | 'bebida_nao_alcoolica'
  | 'comida'
  | 'outro';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  bebida_alcoolica: 'Bebida alcoólica',
  bebida_nao_alcoolica: 'Bebida não alcoólica',
  comida: 'Comida',
  outro: 'Outro',
};

export const PRODUCT_CATEGORIES = Object.keys(
  PRODUCT_CATEGORY_LABELS
) as ProductCategory[];
