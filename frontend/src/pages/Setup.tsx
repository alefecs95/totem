import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getConfig } from '../services/api';

type Status = 'aguardando' | 'configurando' | 'erro';

export default function Setup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('aguardando');
  const [erro, setErro] = useState('');

  useEffect(() => {
    const tenantId = searchParams.get('tenantId');
    const totemId = searchParams.get('totemId');

    if (!tenantId || !totemId) return;

    let ativo = true;
    setStatus('configurando');

    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('totemId', totemId);

    getConfig()
      .then((config) => {
        if (!ativo) return;
        localStorage.setItem('tenantName', config.nomeFestival);
        navigate('/', { replace: true });
      })
      .catch(() => {
        if (!ativo) return;
        localStorage.removeItem('tenantId');
        localStorage.removeItem('totemId');
        localStorage.removeItem('tenantName');
        setStatus('erro');
        setErro('Totem inválido, inativo ou não vinculado a este organizador.');
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
