import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const token = await login(email, senha);
      sessionStorage.removeItem('portalToken');
      sessionStorage.removeItem('portalTenant');
      sessionStorage.setItem('adminToken', token);
      navigate('/dashboard');
    } catch {
      setErro('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-hero">
        <div className="login-hero-inner">
          <div className="admin-brand-mark">TF</div>
          <h1>Controle total do festival</h1>
          <p>
            Organize eventos, maquininhas, produtos e repasses em um painel feito
            para o ritmo do balcão.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Entrar</h2>
          <p className="sub">Acesso do super administrador</p>

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
            {loading ? 'Entrando...' : 'Entrar no painel'}
          </button>
          <p className="sub" style={{ marginTop: 16, marginBottom: 0 }}>
            <a href="/evento">Sou adm do evento</a>
          </p>
        </form>
      </section>
    </div>
  );
}
