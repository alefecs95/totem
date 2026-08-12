import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig, persistTotemConfig } from '../services/api';

type Status = 'aguardando' | 'configurando' | 'erro';

/** Extrai o primeiro UUID válido (ignora lixo tipo //operador colado na URL). */
function extractUuid(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  return match?.[0] ?? null;
}

export default function Setup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('aguardando');
  const [erro, setErro] = useState('');

  useEffect(() => {
    const tenantId = extractUuid(searchParams.get('tenantId'));
    const totemId = extractUuid(searchParams.get('totemId'));

    if (!tenantId || !totemId) {
      if (searchParams.get('tenantId') || searchParams.get('totemId')) {
        setStatus('erro');
        setErro('QR Code inválido: IDs malformados. Gere um novo QR no admin.');
      }
      return;
    }

    let ativo = true;
    setStatus('configurando');

    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('totemId', totemId);

    getConfig()
      .then((config) => {
        if (!ativo) return;
        persistTotemConfig(config);
        navigate('/', { replace: true });
      })
      .catch((err: unknown) => {
        if (!ativo) return;
        localStorage.removeItem('tenantId');
        localStorage.removeItem('totemId');
        localStorage.removeItem('tenantName');
        setStatus('erro');
        const statusCode = (err as { response?: { status?: number } })?.response
          ?.status;
        if (statusCode === 404) {
          setErro(
            'Totem inválido, inativo ou não vinculado a este organizador.'
          );
        } else if (!statusCode || statusCode >= 500) {
          setErro(
            'Não foi possível falar com o servidor. Confira se a API está no ar e tente de novo.'
          );
        } else {
          setErro('Falha ao configurar o totem. Tente escanear o QR novamente.');
        }
      });

    return () => {
      ativo = false;
    };
  }, [searchParams, navigate]);

  if (status === 'configurando') {
    return (
      <div style={center}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)', fontSize: 18 }}>
          Configurando totem...
        </p>
      </div>
    );
  }

  if (status === 'erro') {
    return (
      <div style={center}>
        <div style={{ fontSize: 72 }}>⚠️</div>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 36,
            letterSpacing: 1,
          }}
        >
          Falha na configuração
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
          {erro}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
          Peça ao técnico um novo QR Code no painel admin.
        </p>
        <button
          type="button"
          onClick={() => navigate('/operador/login')}
          style={loginBtn}
        >
          Entrar como operador
        </button>
      </div>
    );
  }

  return (
    <div style={center}>
      <div style={{ fontSize: 80 }}>📱</div>
      <h1
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 44,
          letterSpacing: 1,
          textAlign: 'center',
        }}
      >
        CONFIGURAR TOTEM
      </h1>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: 18,
          textAlign: 'center',
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        Escaneie o QR Code gerado no painel administrativo para vincular este
        tablet ao festival.
      </p>
      <p style={{ color: 'var(--secondary)', fontSize: 14, marginTop: 8 }}>
        Aguardando configuração...
      </p>
      <button
        type="button"
        onClick={() => navigate('/operador/login')}
        style={{ ...loginBtn, marginTop: 24 }}
      >
        Entrar como operador
      </button>
    </div>
  );
}

const center: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: 24,
};

const loginBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '14px 28px',
  borderRadius: 10,
  border: 'none',
  background: '#ea580c',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
};
