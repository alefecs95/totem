import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  type Product,
  type ProductInput,
  type Tenant,
} from '../services/api';
import { formatBRL } from '../utils/format';

interface ProductsModalProps {
  tenant: Tenant;
  onClose: () => void;
}

export default function ProductsModal({ tenant, onClose }: ProductsModalProps) {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [emoji, setEmoji] = useState('🎟️');
  const [cor, setCor] = useState('#FF6B00');
  const [categoria, setCategoria] = useState('outro');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const carregar = () => {
    setLoading(true);
    getProducts(tenant.id)
      .then(setProdutos)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [tenant.id]);

  const limparForm = () => {
    setNome('');
    setPreco('');
    setEmoji('🎟️');
    setCor('#FF6B00');
    setCategoria('outro');
    setEditingId(null);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const input: ProductInput = {
      nome,
      preco: Number(preco),
      categoria,
      emoji,
      cor,
      ativo: true,
    };
    try {
      if (editingId) {
        await updateProduct(tenant.id, editingId, input);
      } else {
        await createProduct(tenant.id, input);
      }
      limparForm();
      carregar();
    } finally {
      setSaving(false);
    }
  };

  const editar = (p: Product) => {
    setEditingId(p.id);
    setNome(p.nome);
    setPreco(String(p.preco));
    setEmoji(p.emoji);
    setCor(p.cor);
    setCategoria(p.categoria ?? 'outro');
  };

  const desativar = async (p: Product) => {
    if (!window.confirm(`Desativar "${p.nome}"?`)) return;
    await deleteProduct(tenant.id, p.id);
    carregar();
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Produtos — {tenant.nome}</h2>
          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <form onSubmit={salvar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...input, flex: 2, minWidth: 140 }}
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            style={{ ...input, width: 90 }}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Preço"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            required
          />
          <select
            style={{ ...input, minWidth: 160 }}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            required
          >
            <option value="bebida_alcoolica">Bebida alcoólica</option>
            <option value="bebida_nao_alcoolica">Bebida não alcoólica</option>
            <option value="comida">Comida</option>
            <option value="outro">Outro</option>
          </select>
          <input
            style={{ ...input, width: 50 }}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />
          <input
            style={{ ...input, width: 50, padding: 4 }}
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
          />
          <button type="submit" disabled={saving} style={btn}>
            {saving ? '...' : editingId ? 'Atualizar' : 'Adicionar'}
          </button>
          {editingId && (
            <button type="button" onClick={limparForm} style={btnSecondary}>
              Cancelar
            </button>
          )}
        </form>

        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table style={table}>
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
                    <span style={{ fontSize: 20 }}>{p.emoji}</span>
                  </td>
                  <td style={td}>{p.nome}</td>
                  <td style={td}>{formatBRL(p.preco)}</td>
                  <td style={td}>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <button onClick={() => editar(p)} style={linkBtn}>
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
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: 16,
};

const modal: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 24,
  width: 640,
  maxWidth: '100%',
  maxHeight: '90vh',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  color: '#64748b',
};

const input: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
};

const btn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
};

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #e2e8f0',
  color: '#64748b',
};

const td: React.CSSProperties = {
  padding: 8,
  borderBottom: '1px solid #f1f5f9',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0f172a',
  cursor: 'pointer',
  fontWeight: 600,
  marginLeft: 8,
};
