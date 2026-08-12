import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  type Product,
  type ProductCategory,
  type ProductInput,
} from '../services/api';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
} from '../utils/productCategories';
import { formatBRL } from '../utils/format';

const EMOJI_POR_CATEGORIA: Record<ProductCategory, string> = {
  bebida_alcoolica: '🍺',
  bebida_nao_alcoolica: '🥤',
  comida: '🍔',
  outro: '🎟️',
};

const emptyForm: ProductInput = {
  nome: '',
  preco: 0,
  categoria: 'outro',
  emoji: '🎟️',
  cor: '#FF6B00',
  ativo: true,
  imprime_ficha: false,
  ficha_2_vias: false,
  ficha_logo_data: null,
};

export default function Products() {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [formErro, setFormErro] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      setProdutos(await getProducts());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormErro('');
  };

  const validarForm = (): boolean => {
    if (!form.nome.trim()) {
      setFormErro('Informe o nome do produto.');
      return false;
    }
    if (!form.categoria) {
      setFormErro('Selecione uma categoria.');
      return false;
    }
    if (!form.preco || form.preco <= 0) {
      setFormErro('O preço deve ser maior que zero.');
      return false;
    }
    setFormErro('');
    return true;
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!validarForm()) return;

    setSaving(true);
    try {
      const payload: ProductInput = {
        ...form,
        nome: form.nome.trim(),
        emoji: form.emoji || EMOJI_POR_CATEGORIA[form.categoria],
      };

      if (editingId) {
        const atualizado = await updateProduct(editingId, payload);
        setProdutos((prev) =>
          prev.map((p) => (p.id === editingId ? atualizado : p))
        );
        setToast('Produto atualizado!');
      } else {
        const criado = await createProduct(payload);
        setProdutos((prev) => [...prev, criado]);
        setToast('Produto cadastrado!');
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const iniciarEdicao = (p: Product) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      preco: p.preco,
      categoria: p.categoria,
      emoji: p.emoji,
      cor: p.cor,
      ativo: p.ativo,
      imprime_ficha: Boolean(p.imprime_ficha),
      ficha_2_vias: Boolean(p.ficha_2_vias),
      ficha_logo_data: p.ficha_logo_data ?? null,
    });
    setFormErro('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const desativar = async (p: Product) => {
    if (!window.confirm(`Desativar "${p.nome}"?`)) return;
    await deleteProduct(p.id);
    setProdutos((prev) =>
      prev.map((item) =>
        item.id === p.id ? { ...item, ativo: false } : item
      )
    );
    if (editingId === p.id) resetForm();
    setToast('Produto desativado.');
  };

  const reativar = async (p: Product) => {
    const atualizado = await updateProduct(p.id, { ativo: true });
    setProdutos((prev) =>
      prev.map((item) => (item.id === p.id ? atualizado : item))
    );
    setToast('Produto reativado.');
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#9a3412' }}>Produtos</h1>
      <p style={{ color: '#78716c', marginTop: 0 }}>
        Cadastro rápido — preencha e salve. Itens aparecem no totem na hora.
      </p>

      {toast && <div style={toastStyle}>{toast}</div>}

      <form onSubmit={salvar} style={formCard}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>
          {editingId ? 'Editar produto' : 'Novo produto'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <label style={label}>
            Nome *
            <input
              style={input}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Ficha de Cerveja"
              autoFocus
            />
          </label>
          <label style={label}>
            Preço (R$) *
            <input
              style={input}
              type="number"
              step="0.01"
              min="0.01"
              value={form.preco || ''}
              onChange={(e) =>
                setForm({ ...form, preco: Number(e.target.value) })
              }
              placeholder="0,00"
            />
          </label>
        </div>

        <label style={label}>
          Categoria *
          <select
            style={input}
            value={form.categoria}
            onChange={(e) => {
              const categoria = e.target.value as ProductCategory;
              setForm({
                ...form,
                categoria,
                emoji: EMOJI_POR_CATEGORIA[categoria],
              });
            }}
          >
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {PRODUCT_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(form.imprime_ficha)}
            onChange={(e) =>
              setForm({
                ...form,
                imprime_ficha: e.target.checked,
              })
            }
          />
          Imprime ficha unica (80×25mm)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={Boolean(form.ficha_2_vias)}
            onChange={(e) =>
              setForm({ ...form, ficha_2_vias: e.target.checked })
            }
          />
          2 vias 80×50mm: barman (sabor grande) + cliente (so codigo)
        </label>

        {form.imprime_ficha && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 10,
              border: '1px solid #fcd34d',
              background: '#fffbeb',
            }}
          >
            <strong style={{ fontSize: 13 }}>Logo deste produto na ficha</strong>
            <span style={{ fontSize: 12, color: '#78716c' }}>
              Individual por produto. Sem logo, imprime o nome do produto.
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 700_000) {
                  setFormErro('Logo muito grande (máx. ~700 KB).');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const result = String(reader.result || '');
                  if (!result.startsWith('data:image/')) {
                    setFormErro('Não foi possível ler a imagem.');
                    return;
                  }
                  setForm((prev) => ({ ...prev, ficha_logo_data: result }));
                  setFormErro('');
                };
                reader.readAsDataURL(file);
              }}
            />
            {form.ficha_logo_data ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={form.ficha_logo_data}
                  alt="Prévia"
                  style={{
                    width: 200,
                    height: 62,
                    objectFit: 'contain',
                    background: '#fff',
                    border: '1px solid #e7e5e4',
                    borderRadius: 6,
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, ficha_logo_data: null }))
                  }
                  style={btnSecondary}
                >
                  Remover logo
                </button>
              </div>
            ) : null}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
          />
          Ativo no totem
        </label>

        {formErro && <div style={erroStyle}>{formErro}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} style={btnSecondary}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Seus produtos</h2>
          {produtos.length === 0 ? (
            <p style={{ color: '#78716c' }}>Nenhum produto cadastrado ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {produtos.map((p) => (
                <div
                  key={p.id}
                  style={{
                    ...listItem,
                    opacity: p.ativo ? 1 : 0.65,
                    borderLeft: `4px solid ${p.cor}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <span style={{ fontSize: 28 }}>{p.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nome}</div>
                      <div style={{ color: '#78716c', fontSize: 13 }}>
                        {PRODUCT_CATEGORY_LABELS[p.categoria]} · {formatBRL(p.preco)}
                        {(p.ficha_2_vias || p.imprime_ficha) &&
                          ` · ${[
                            p.ficha_2_vias ? '2 vias' : null,
                            p.imprime_ficha ? 'Ficha' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}`}
                        {!p.ativo && ' · Inativo'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => iniciarEdicao(p)} style={btnSmall}>
                      Editar
                    </button>
                    {p.ativo ? (
                      <button
                        onClick={() => desativar(p)}
                        style={{ ...btnSmall, color: '#dc2626' }}
                      >
                        Desativar
                      </button>
                    ) : (
                      <button onClick={() => reativar(p)} style={btnSmall}>
                        Reativar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const formCard: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const listItem: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  flexWrap: 'wrap',
};

const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 13,
  fontWeight: 600,
  color: '#44403c',
};

const input: React.CSSProperties = {
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  fontSize: 15,
};

const btnPrimary: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#ea580c',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
};

const btnSecondary: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 15,
};

const btnSmall: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #fed7aa',
  background: '#fff',
  color: '#9a3412',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
};

const toastStyle: React.CSSProperties = {
  background: '#166534',
  color: '#fff',
  padding: '12px 16px',
  borderRadius: 8,
  marginBottom: 16,
  fontWeight: 600,
};

const erroStyle: React.CSSProperties = {
  color: '#dc2626',
  fontSize: 14,
};
