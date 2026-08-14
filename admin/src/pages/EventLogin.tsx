import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { login } from '../eventPortal/services/api';
import '../eventPortal/evento.css';

export default function EventLogin() {
  const navigate = useNavigate();
  const already = sessionStorage.getItem('portalToken');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  if (already) return <Navigate to="/evento/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      sessionStorage.removeItem('adminToken');
      await login(email, senha);
      navigate('/evento/dashboard');
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setErro(detalhe || 'E-mail ou senha inválidos do adm do evento.');
    } finally {
      setLoading(false);
    }
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
          <p className="sub" style={{ marginTop: 16, marginBottom: 0 }}>
            <Link to="/">Sou super admin</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
