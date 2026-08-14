import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { login } from '../eventPortal/services/api';
import '../eventPortal/evento.css';

type EventoOpcao = { id: string; nome: string; codigo_evento: string | null };

export default function EventLogin() {
  const navigate = useNavigate();
  const already = sessionStorage.getItem('portalToken');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [eventos, setEventos] = useState<EventoOpcao[] | null>(null);

  if (already) return <Navigate to="/evento/dashboard" replace />;

  const entrar = async (tenantId?: string) => {
    setErro('');
    setLoading(true);
    try {
      sessionStorage.removeItem('adminToken');
      await login(email, senha, tenantId);
      navigate('/evento/dashboard');
    } catch (err: unknown) {
      const data = (
        err as {
          response?: {
            data?: {
              error?: string;
              detalhe?: string;
              eventos?: EventoOpcao[];
            };
          };
        }
      )?.response?.data;
      if (data?.error === 'choose_event' && data.eventos?.length) {
        setEventos(data.eventos);
        setErro('');
      } else {
        setErro(data?.detalhe || 'E-mail ou senha inválidos do adm do evento.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await entrar();
  };

  return (
    <div className="login-shell">
      <section className="login-hero">
        <div className="login-hero-inner">
          <div className="evento-login-mark">TF</div>
          <h1>O painel do seu festival</h1>
          <p>
            Vendas, produtos, totens e equipe em um só lugar — feito para o ritmo
            do evento, não para planilha.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Adm do evento</h2>
          {eventos ? (
            <>
              <p className="sub">
                Este e-mail tem mais de um evento. Escolha qual abrir.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {eventos.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => void entrar(ev.id)}
                  >
                    {ev.nome}
                    {ev.codigo_evento ? ` · ${ev.codigo_evento}` : ''}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => setEventos(null)}
              >
                Voltar
              </button>
            </>
          ) : (
            <>
              <p className="sub">
                Entre com o e-mail e a senha que você recebeu. Vamos abrir o painel
                do seu festival.
              </p>

              <label className="field">
                <span>E-mail</span>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Senha</span>
                <input
                  className="input"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
              </label>

              {erro && <div className="login-error">{erro}</div>}

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar no meu evento'}
              </button>
            </>
          )}
          <p className="sub" style={{ marginTop: 16, marginBottom: 0 }}>
            <Link to="/">Sou super admin</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
