import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { login } from '../eventPortal/services/api';

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #9a3412 0%, #ea580c 100%)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 16,
          width: 380,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: '#9a3412' }}>
          Adm do evento
        </h1>
        <p style={{ margin: 0, color: '#78716c', fontSize: 14 }}>
          Entre com o e-mail e a senha do organizador. Você vai para o painel
          do seu festival.
        </p>

        <label style={{ fontSize: 13, color: '#44403c', fontWeight: 600 }}>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={{ fontSize: 13, color: '#44403c', fontWeight: 600 }}>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            borderRadius: 8,
            border: 'none',
            background: '#ea580c',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Entrando...' : 'Entrar no meu evento'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  fontSize: 14,
  fontWeight: 400,
  boxSizing: 'border-box',
};
