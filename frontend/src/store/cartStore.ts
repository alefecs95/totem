import { create } from 'zustand';

export interface Product {
  id: string;
  nome: string;
  preco: number;
  emoji: string;
  cor: string;
}

export interface CartItem extends Product {
  quantidade: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((item) => item.id === product.id);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.id === product.id
              ? { ...item, quantidade: item.quantidade + 1 }
              : item
          ),
        };
      }
      return { items: [...state.items, { ...product, quantidade: 1 }] };
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
