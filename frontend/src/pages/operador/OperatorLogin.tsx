import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalLogin } from '../../services/operatorApi';

export default function OperatorLogin() {
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
      await portalLogin(email.trim(), senha);
      navigate('/operador', { replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { error?: string; detalhe?: string } } })
        ?.response?.status;
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      const detalhe = (err as { response?: { data?: { detalhe?: string } } })?.response?.data
        ?.detalhe;
      if (status === 400) {
        setErro(
          'Requisição inválida (verifique e-mail). Se persistir, limpe cookies do site e tente de novo.'
        );
      } else if (status === 401 || code === 'invalid_credentials') {
        setErro(
          detalhe ||
            'E-mail ou senha inválidos. Peça ao adm do evento para cadastrar seu usuário no portal.'
        );
      } else {
        setErro('Não foi possível entrar. Verifique a conexão e tente novamente.');
      }
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
        background: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)',
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 16,
          width: 400,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, color: '#9a3412', fontSize: 24 }}>
          Modo Operador
        </h1>
        <p style={{ margin: 0, color: '#78716c', fontSize: 14 }}>
          Use o e-mail e a senha que o <strong>adm do evento</strong> cadastrou
          no portal (menu Operadores). Nao e o login do organizador.
        </p>

        <label style={labelStyle}>
          E-mail do operador
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Senha do operador
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
            padding: 14,
            borderRadius: 8,
            border: 'none',
            background: '#ea580c',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Entrando...' : 'Iniciar vendas'}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#44403c',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  fontSize: 15,
};
