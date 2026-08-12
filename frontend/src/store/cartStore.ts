import { create } from 'zustand';

export interface Product {
  id: string;
  nome: string;
  preco: number;
  emoji: string;
  cor: string;
  categoria: string;
  /** Se true, cada unidade imprime uma ficha na térmica. */
  imprime_ficha?: boolean;
}

export interface CartItem extends Product {
  quantidade: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantidade?: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product, quantidade = 1) =>
    set((state) => {
      const qtd = Math.max(1, Math.floor(quantidade));
      const existing = state.items.find((item) => item.id === product.id);
      const imprime_ficha = Boolean(product.imprime_ficha);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.id === product.id
              ? {
                  ...item,
                  ...product,
                  imprime_ficha,
                  quantidade: item.quantidade + qtd,
                }
              : item
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { ...product, imprime_ficha, quantidade: qtd },
        ],
      };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items
        .map((item) =>
          item.id === id ? { ...item, quantidade: item.quantidade - 1 } : item
        )
        .filter((item) => item.quantidade > 0),
    })),

  clearCart: () => set({ items: [] }),

  getTotal: () =>
    get().items.reduce((total, item) => total + item.preco * item.quantidade, 0),

  getTotalItems: () =>
    get().items.reduce((count, item) => count + item.quantidade, 0),
}));
