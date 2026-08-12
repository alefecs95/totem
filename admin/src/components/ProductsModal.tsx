import { useEffect, useState, type FormEvent } from 'react';
import {
  createProduct,
  deleteProduct,
  getProducts,
  updateProduct,
  updateTenant,
  type Product,
  type ProductInput,
  type Tenant,
} from '../services/api';
import { formatBRL } from '../utils/format';

interface ProductsModalProps {
  tenant: Tenant;
  onClose: () => void;
  /** Atualiza o tenant no pai após salvar a logo. */
  onTenantUpdated?: (tenant: Tenant) => void;
}

export default function ProductsModal({
  tenant,
  onClose,
  onTenantUpdated,
}: ProductsModalProps) {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [emoji, setEmoji] = useState('🎟️');
  const [cor, setCor] = useState('#FF6B00');
  const [categoria, setCategoria] = useState('outro');
  const [imprimeFicha, setImprimeFicha] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logoData, setLogoData] = useState<string | null>(
    tenant.ficha_logo_data ?? null
  );
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');

  const carregar = () => {
    setLoading(true);
    getProducts(tenant.id)
      .then(setProdutos)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [tenant.id]);

  useEffect(() => {
    setLogoData(tenant.ficha_logo_data ?? null);
  }, [tenant.id, tenant.ficha_logo_data]);

  const limparForm = () => {
    setNome('');
    setPreco('');
    setEmoji('🎟️');
    setCor('#FF6B00');
    setCategoria('outro');
    setImprimeFicha(false);
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
      imprime_ficha: imprimeFicha,
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
    setImprimeFicha(Boolean(p.imprime_ficha));
  };

  const desativar = async (p: Product) => {
    if (!window.confirm(`Desativar "${p.nome}"?`)) return;
    await deleteProduct(tenant.id, p.id);
    carregar();
  };

  const onLogoSelected = (file: File | null) => {
    if (!file) return;
    if (
      !file.type.includes('png') &&
      !file.type.includes('jpeg') &&
      !file.type.includes('webp')
    ) {
      setLogoMsg('Use PNG (preferencial), JPEG ou WebP.');
      return;
    }
    if (file.size > 700_000) {
      setLogoMsg('Arquivo grande demais (máx. ~700 KB). Ideal ~300×95 px.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!result.startsWith('data:image/')) {
        setLogoMsg('Não foi possível ler a imagem.');
        return;
      }
      setLogoData(result);
      setLogoMsg('Prévia pronta — clique em Salvar logo.');
    };
    reader.readAsDataURL(file);
  };

  const salvarLogo = async () => {
    setSavingLogo(true);
    setLogoMsg('');
    try {
      const { tenant: updated } = await updateTenant(tenant.id, {
        ficha_logo_data: logoData,
      });
      onTenantUpdated?.(updated);
      setLogoData(updated.ficha_logo_data ?? logoData);
      setLogoMsg(logoData ? 'Logo salva!' : 'Logo removida.');
    } catch {
      setLogoMsg('Falha ao salvar a logo. Redeploy da API/admin se a opção for nova.');
    } finally {
      setSavingLogo(false);
    }
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

        <div style={logoBox}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
            Logo da ficha (PNG) — 80 mm × 25 mm
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Impressa em paisagem na térmica: <b>80 mm na horizontal</b> ×{' '}
            <b>25 mm na vertical</b>. A logo preenche essa área. Preferência: PNG
            ~300×95 px.
          </p>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
          />
          {logoData ? (
            <img
              src={logoData}
              alt="Prévia logo ficha"
              style={{
                width: 320,
                height: 100,
                objectFit: 'contain',
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
              }}
            />
          ) : (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Nenhuma logo enviada.
            </span>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={salvarLogo}
              disabled={savingLogo}
              style={btn}
            >
              {savingLogo ? 'Salvando...' : 'Salvar logo'}
            </button>
            {logoData && (
              <button
                type="button"
                onClick={() => {
                  setLogoData(null);
                  setLogoMsg('Clique em Salvar logo para remover.');
                }}
                style={btnSecondary}
              >
                Remover
              </button>
            )}
          </div>
          {logoMsg && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: logoMsg.includes('Falha') ? '#dc2626' : '#15803d',
              }}
            >
              {logoMsg}
            </p>
          )}
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
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={imprimeFicha}
              onChange={(e) => setImprimeFicha(e.target.checked)}
            />
            Imprime ficha
          </label>
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
                <th style={th}>Ficha</th>
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
                  <td style={td}>{p.imprime_ficha ? 'Sim' : '—'}</td>
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
  width: 720,
  maxWidth: '100%',
  maxHeight: '90vh',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const logoBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 14,
  borderRadius: 10,
  border: '1px solid #fcd34d',
  background: '#fffbeb',
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
