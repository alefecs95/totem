import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPortalEventCode, savePortalEventCode } from '../eventCode';
import { getEventoPublico, login } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const { codigo: codigoParam } = useParams<{ codigo: string }>();
  if (codigoParam) savePortalEventCode(codigoParam);

  const codigo = getPortalEventCode();
  const [eventoNome, setEventoNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    void getEventoPublico(codigo)
      .then((ev) => setEventoNome(ev.nome))
      .catch(() =>
        setErro('Link do evento invalido ou festival inativo. Peca um link novo.')
      );
  }, [codigo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!codigo) return;
    setErro('');
    setLoading(true);
    try {
      await login(email, senha, codigo);
      navigate('/dashboard');
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setErro(
        detalhe ||
          'E-mail ou senha inválidos. Use o e-mail/senha do ADM DO EVENTO.'
      );
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
          Portal do Organizador
        </h1>
        {eventoNome ? (
          <p style={{ margin: 0, color: '#78716c', fontSize: 14 }}>
            Evento: <strong>{eventoNome}</strong>
            <br />
            Entre com o e-mail e a senha que voce recebeu.
          </p>
        ) : (
          <p style={{ margin: 0, color: '#78716c', fontSize: 14 }}>
            Abra o <strong>link do seu evento</strong> (enviado pelo Totem).
            Depois informe so o e-mail e a senha do adm.
          </p>
        )}

        <label style={{ fontSize: 13, color: '#44403c', fontWeight: 600 }}>
          E-mail do cadastro
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!codigo}
            style={inputStyle}
          />
        </label>

        <label style={{ fontSize: 13, color: '#44403c', fontWeight: 600 }}>
          Senha do portal
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            disabled={!codigo}
            style={inputStyle}
          />
        </label>

        {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}

        <button
          type="submit"
          disabled={loading || !codigo}
          style={{
            padding: '12px',
            borderRadius: 8,
            border: 'none',
            background: '#ea580c',
            color: '#fff',
            fontWeight: 700,
            cursor: loading || !codigo ? 'default' : 'pointer',
            opacity: loading || !codigo ? 0.6 : 1,
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
  border: '1px solid #d6d3d1',
  fontSize: 14,
  fontWeight: 400,
  boxSizing: 'border-box',
};
