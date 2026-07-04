import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  type Product,
} from '../services/api';
import { formatBRL } from '../utils/format';

const emptyForm = {
  nome: '',
  preco: 0,
  emoji: '🎟️',
  cor: '#FF6B00',
  ativo: true,
};

export default function Products() {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const carregar = () => {
    setLoading(true);
    getProducts()
      .then(setProdutos)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, []);

  const abrirNovo = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const abrirEdicao = (p: Product) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      preco: p.preco,
      emoji: p.emoji,
      cor: p.cor,
      ativo: p.ativo,
    });
    setModalOpen(true);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateProduct(editingId, form);
      } else {
        await createProduct(form);
      }
      setModalOpen(false);
      carregar();
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (p: Product) => {
    if (!window.confirm(`Desativar "${p.nome}"?`)) return;
    await deleteProduct(p.id);
    carregar();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginTop: 0, color: '#9a3412' }}>Produtos</h1>
        <button onClick={abrirNovo} style={btnPrimary}>
          + Novo produto
        </button>
      </div>

      <p style={{ color: '#78716c', marginTop: 0 }}>
        Cadastre os itens que aparecem no totem (fichas, bebidas, comidas).
      </p>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}></th>
              <th style={th}>Nome</th>
              <th style={th}>Preço</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
                <td style={td}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: p.cor,
                      textAlign: 'center',
                      lineHeight: '36px',
                      fontSize: 20,
                    }}
                  >
                    {p.emoji}
                  </span>
                </td>
                <td style={td}>{p.nome}</td>
                <td style={td}>{formatBRL(p.preco)}</td>
                <td style={td}>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => abrirEdicao(p)} style={linkBtn}>
                    Editar
                  </button>
                  {p.ativo && (
                    <button
                      onClick={() => desativar(p)}
                      style={{ ...linkBtn, color: '#dc2626' }}
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr>
                <td colSpan={5} style={td}>
                  Nenhum produto cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {modalOpen && (
        <div style={overlay} onClick={() => setModalOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={salvar}
            style={modal}
          >
            <h2 style={{ marginTop: 0 }}>
              {editingId ? 'Editar produto' : 'Novo produto'}
            </h2>

            <label style={label}>
              Nome
              <input
                style={input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </label>

            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ ...label, flex: 1 }}>
                Preço (R$)
                <input
                  style={input}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.preco || ''}
                  onChange={(e) =>
                    setForm({ ...form, preco: Number(e.target.value) })
                  }
                  required
                />
              </label>
              <label style={{ ...label, width: 80 }}>
                Emoji
                <input
                  style={input}
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                />
              </label>
              <label style={{ ...label, width: 100 }}>
                Cor
                <input
                  style={input}
                  type="color"
                  value={form.cor}
                  onChange={(e) => setForm({ ...form, cor: e.target.value })}
                />
              </label>
            </div>

            {editingId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                Produto ativo no totem
              </label>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setModalOpen(false)} style={btnSecondary}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} style={btnPrimary}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  borderRadius: 12,
  borderCollapse: 'collapse',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 12,
  borderBottom: '1px solid #e7e5e4',
  color: '#78716c',
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #f5f5f4',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ea580c',
  cursor: 'pointer',
  fontWeight: 600,
  marginLeft: 8,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#ea580c',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  background: '#fff',
  cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modal: React.CSSProperties = {
  background: '#fff',
  padding: 24,
  borderRadius: 12,
  width: 420,
  maxWidth: '95vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
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
  fontSize: 14,
};
