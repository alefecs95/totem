import { useEffect, useState, type FormEvent } from 'react';
import {
  createOperador,
  deleteOperador,
  getOperadores,
  updateOperador,
  type Operador,
} from '../services/api';

function initials(nome: string) {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

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
      <div className="evento-page-head">
        <div>
          <div className="evento-kicker">Equipe</div>
          <h1>Operadores</h1>
          <p>
            Quem vende no caixa tem e-mail e senha próprios — não usam o login
            do adm do evento.
          </p>
        </div>
      </div>

      <div className="evento-grid-2">
        <form onSubmit={salvar} className="evento-card">
          <h2>{editingId ? 'Editar operador' : 'Novo operador'}</h2>
          <label className="field">
            <span>Nome</span>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>E-mail</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>{editingId ? 'Nova senha (opcional)' : 'Senha'}</span>
            <input
              className="input"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={editingId ? undefined : 4}
              autoComplete="new-password"
            />
          </label>
          {aviso && (
            <div className="evento-error" style={{ marginTop: 10 }}>
              {aviso}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
            </button>
            {editingId && (
              <button type="button" onClick={limpar} className="btn btn-secondary">
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div>
          {loading ? (
            <div className="evento-skel" />
          ) : lista.length === 0 ? (
            <div className="empty-state">Nenhum operador ainda. Cadastre o primeiro.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lista.map((o) => (
                <div
                  key={o.id}
                  className="evento-op"
                  style={{ opacity: o.ativo ? 1 : 0.55 }}
                >
                  <div className="evento-avatar">{initials(o.nome)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{o.nome}</div>
                    <div className="evento-muted">{o.email}</div>
                  </div>
                  <span className={o.ativo ? 'badge badge-ok' : 'badge badge-off'}>
                    {o.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  <button type="button" className="btn-link" onClick={() => editar(o)}>
                    Editar
                  </button>
                  {o.ativo ? (
                    <button
                      type="button"
                      className="btn-danger-text"
                      onClick={() => void desativar(o)}
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => void reativar(o)}
                    >
                      Reativar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
