import { useEffect, useState, type FormEvent } from 'react';
import {
  createOperador,
  deleteOperador,
  getOperadores,
  updateOperador,
  type Operador,
} from '../services/api';

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #fed7aa',
  fontSize: 15,
  width: '100%',
};

const btn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#ea580c',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSmall: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #fed7aa',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
};

export default function Operadores() {
  const [lista, setLista] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [saving, setSaving] = useState(false);

  const carregar = () => {
    setLoading(true);
    getOperadores()
      .then(setLista)
      .catch(() => setAviso('Falha ao carregar operadores.'))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, []);

  const limpar = () => {
    setNome('');
    setEmail('');
    setSenha('');
    setEditingId(null);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setAviso('');
    if (!editingId && senha.trim().length < 4) {
      setAviso('Defina uma senha com no minimo 4 caracteres.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateOperador(editingId, {
          nome,
          email,
          ...(senha.trim() ? { senha: senha.trim() } : {}),
        });
      } else {
        await createOperador({
          nome,
          email,
          senha: senha.trim(),
        });
      }
      limpar();
      carregar();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { detalhe?: string; error?: string } } })
        ?.response?.data;
      setAviso(data?.detalhe || data?.error || 'Nao foi possivel salvar.');
    } finally {
      setSaving(false);
    }
  };

  const editar = (o: Operador) => {
    setEditingId(o.id);
    setNome(o.nome);
    setEmail(o.email);
    setSenha('');
    setAviso('');
  };

  const desativar = async (o: Operador) => {
    if (!window.confirm(`Desativar o operador "${o.nome}"?`)) return;
    await deleteOperador(o.id);
    carregar();
  };

  const reativar = async (o: Operador) => {
    await updateOperador(o.id, { ativo: true });
    carregar();
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#9a3412' }}>Operadores</h1>
      <p style={{ color: '#78716c' }}>
        Cadastre quem vende no caixa (/operador). Cada um tem e-mail e senha
        proprios — nao usam o login do adm do evento.
      </p>

      <form
        onSubmit={salvar}
        style={{
          background: '#fff',
          border: '1px solid #fed7aa',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginBottom: 24,
          maxWidth: 520,
        }}
      >
        <strong>{editingId ? 'Editar operador' : 'Novo operador'}</strong>
        <label>
          Nome
          <input
            style={inputStyle}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </label>
        <label>
          E-mail
          <input
            style={inputStyle}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Senha {editingId ? '(deixe vazio para manter)' : ''}
          <input
            style={inputStyle}
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={editingId ? undefined : 4}
            autoComplete="new-password"
          />
        </label>
        {aviso && <div style={{ color: '#dc2626', fontSize: 13 }}>{aviso}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={saving} style={btn}>
            {saving ? '...' : editingId ? 'Atualizar' : 'Cadastrar'}
          </button>
          {editingId && (
            <button type="button" onClick={limpar} style={btnSmall}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p>Carregando...</p>
      ) : lista.length === 0 ? (
        <p style={{ color: '#78716c' }}>Nenhum operador cadastrado ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lista.map((o) => (
            <div
              key={o.id}
              style={{
                background: '#fff',
                border: '1px solid #fed7aa',
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                opacity: o.ativo ? 1 : 0.6,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{o.nome}</div>
                <div style={{ fontSize: 13, color: '#78716c' }}>
                  {o.email}
                  {!o.ativo ? ' · Inativo' : ''}
                </div>
              </div>
              <button type="button" style={btnSmall} onClick={() => editar(o)}>
                Editar
              </button>
              {o.ativo ? (
                <button
                  type="button"
                  style={{ ...btnSmall, color: '#dc2626' }}
                  onClick={() => void desativar(o)}
                >
                  Desativar
                </button>
              ) : (
                <button type="button" style={btnSmall} onClick={() => void reativar(o)}>
                  Reativar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
