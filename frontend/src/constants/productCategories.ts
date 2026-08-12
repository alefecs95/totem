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

/**
 * Categorias que exigem impressão de 2 vias (cliente + barman).
 * Ajuste esta lista para mudar quais produtos geram comprovante duplo no totem.
 */
export const CATEGORIAS_IMPRESSAO_DUPLA: ProductCategory[] = ['bebida_alcoolica'];

export function precisaImpressaoDupla(
  items: Array<{ categoria?: string }>
): boolean {
  return items.some((item) =>
    CATEGORIAS_IMPRESSAO_DUPLA.includes(item.categoria as ProductCategory)
  );
}

export type ViaComprovante = 'cliente' | 'barman';

export function viasComprovante(
  items: Array<{ categoria?: string }>
): ViaComprovante[] {
  return precisaImpressaoDupla(items) ? ['cliente', 'barman'] : ['cliente'];
}
