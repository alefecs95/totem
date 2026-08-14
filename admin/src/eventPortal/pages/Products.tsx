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
  bebida_alcoolica: 'ðŸº',
  bebida_nao_alcoolica: 'ðŸ¥¤',
  comida: 'ðŸ”',
  outro: 'ðŸŽŸï¸',
};

const emptyForm: ProductInput = {
  nome: '',
  preco: 0,
  categoria: 'outro',
  emoji: 'ðŸŽŸï¸',
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
      setFormErro('O preÃ§o deve ser maior que zero.');
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
      <div className="evento-page-head">
        <div>
          <div className="evento-kicker">CardÃ¡pio</div>
          <h1>Produtos</h1>
          <p>
            Cadastre e publique na hora. O que estiver ativo aparece no totem e
            no PDV.
          </p>
        </div>
      </div>

      {toast && <div className="evento-toast">{toast}</div>}

      <form onSubmit={salvar} className="evento-card" style={{ marginBottom: 20 }}>
        <h2>{editingId ? 'Editar produto' : 'Novo produto'}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <label className="field">
            <span>Nome</span>
            <input
              className="input"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Ficha de Cerveja"
              autoFocus
            />
          </label>
          <label className="field">
            <span>PreÃ§o (R$)</span>
            <input
              className="input"
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

        <label className="field" style={{ marginTop: 12 }}>
          <span>Categoria</span>
          <select
            className="input"
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          <label className="evento-check">
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
            Imprime ficha Ãºnica (80Ã—25mm)
          </label>
          <label className="evento-check">
            <input
              type="checkbox"
              checked={Boolean(form.ficha_2_vias)}
              onChange={(e) =>
                setForm({ ...form, ficha_2_vias: e.target.checked })
              }
            />
            2 vias 80Ã—50mm: barman (sabor) + cliente (cÃ³digo)
          </label>
          <label className="evento-check">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo no totem
          </label>
        </div>

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
              marginTop: 14,
            }}
          >
            <strong style={{ fontSize: 13 }}>Logo deste produto na ficha</strong>
            <span className="evento-muted">
              Individual por produto. Sem logo, imprime o nome.
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 700_000) {
                  setFormErro('Logo muito grande (mÃ¡x. ~700 KB).');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const result = String(reader.result || '');
                  if (!result.startsWith('data:image/')) {
                    setFormErro('NÃ£o foi possÃ­vel ler a imagem.');
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
                  alt="PrÃ©via"
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
                  className="btn btn-secondary"
                >
                  Remover logo
                </button>
              </div>
            ) : null}
          </div>
        )}

        {formErro && <div className="evento-error" style={{ marginTop: 10 }}>{formErro}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Salvando...' : editingId ? 'Salvar alteraÃ§Ãµes' : 'Cadastrar produto'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="evento-skel" />
      ) : produtos.length === 0 ? (
        <div className="empty-state">Nenhum produto ainda. Cadastre o primeiro acima.</div>
      ) : (
        <div className="evento-product-list">
          {produtos.map((p) => (
            <div
              key={p.id}
              className="evento-product"
              style={{
                opacity: p.ativo ? 1 : 0.6,
                borderLeftColor: p.cor,
              }}
            >
              <div className="evento-product-main">
                <div className="evento-product-emoji">{p.emoji}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nome}</div>
                  <div className="evento-muted">
                    {PRODUCT_CATEGORY_LABELS[p.categoria]} Â· {formatBRL(p.preco)}
                    {(p.ficha_2_vias || p.imprime_ficha) &&
                      ` Â· ${[
                        p.ficha_2_vias ? '2 vias' : null,
                        p.imprime_ficha ? 'Ficha' : null,
                      ]
                        .filter(Boolean)
                        .join(' Â· ')}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={p.ativo ? 'badge badge-ok' : 'badge badge-off'}>
                  {p.ativo ? 'Ativo' : 'Inativo'}
                </span>
                <button type="button" onClick={() => iniciarEdicao(p)} className="btn-link">
                  Editar
                </button>
                {p.ativo ? (
                  <button
                    type="button"
                    onClick={() => desativar(p)}
                    className="btn-danger-text"
                  >
                    Desativar
                  </button>
                ) : (
                  <button type="button" onClick={() => reativar(p)} className="btn-link">
                    Reativar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
