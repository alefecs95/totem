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
      sessionStorage.setItem('adminToken', token);
      navigate('/dashboard');
    } catch {
      setErro('E-mail ou senha inválidos.');
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
        background: '#0f172a',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 16,
          width: 360,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>
          Totem Festival
        </h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
          Painel administrativo
        </p>

        <label style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {erro && (
          <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px',
            borderRadius: 8,
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
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
  border: '1px solid #cbd5e1',
  fontSize: 14,
  fontWeight: 400,
};
