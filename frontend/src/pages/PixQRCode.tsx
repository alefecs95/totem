import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPixPayment, getPaymentStatus } from '../services/api';
import { useCartStore, type CartItem } from '../store/cartStore';

type Estado = 'loading' | 'aguardando' | 'aprovado' | 'expirado' | 'erro';

interface PixLocationState {
  items?: CartItem[];
  total?: number;
}

const POLL_INTERVAL_MS = 3000;
const DEFAULT_EXPIRES_IN = 300;

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

function formatTempo(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PixQRCode() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as PixLocationState;

  const storeItems = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);

  const items = state.items ?? storeItems;
  const total = state.total ?? getTotal();

  const [estado, setEstado] = useState<Estado>('loading');
  const [pixCode, setPixCode] = useState('');
  const [qrCodeBase64, setQrCodeBase64] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_EXPIRES_IN);
  const [copiado, setCopiado] = useState(false);

  const copyTimeoutRef = useRef<number>();

  const iniciarPagamento = useCallback(async () => {
    setEstado('loading');
    setSecondsLeft(DEFAULT_EXPIRES_IN);
    try {
      const tenantId = localStorage.getItem('tenantId') ?? '';
      const res = await createPixPayment(items, total, tenantId);
      setPixCode(res.pixCode);
      setQrCodeBase64(res.qrCodeBase64);
      setPaymentId(res.paymentId);
      setSecondsLeft(res.expiresIn ?? DEFAULT_EXPIRES_IN);
      setEstado('aguardando');
    } catch (err) {
      console.error('Falha ao gerar cobrança Pix:', err);
      setEstado('erro');
    }
    // items/total são estáveis por render; recriar só ao montar/tentar novamente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    iniciarPagamento();
  }, [iniciarPagamento]);

  // Polling do status do pagamento
  useEffect(() => {
    if (estado !== 'aguardando' || !paymentId) return;

    const id = window.setInterval(async () => {
      try {
        const { status } = await getPaymentStatus(paymentId);
        if (status === 'approved') {
          setEstado('aprovado');
        } else if (status === 'expired') {
          setEstado('expirado');
        }
      } catch (err) {
        console.error('Falha ao consultar status do pagamento:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [estado, paymentId]);

  // Countdown de expiração
  useEffect(() => {
    if (estado !== 'aguardando') return;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setEstado('expirado');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [estado]);

  // Redireciona ao aprovar
  useEffect(() => {
    if (estado === 'aprovado') {
      navigate('/success', {
        state: { items, total, metodo: 'pix', payment: { paymentId } },
      });
    }
  }, [estado, navigate, items, total, paymentId]);

  useEffect(() => {
    return () => window.clearTimeout(copyTimeoutRef.current);
  }, []);

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiado(true);
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar código Pix:', err);
    }
  };

  if (estado === 'loading') {
    return (
      <div style={centerBox}>
        <div className="spinner" />
        <p style={{ fontSize: 20, color: 'var(--text-muted)' }}>
          Gerando QR Code...
        </p>
      </div>
    );
  }

  if (estado === 'expirado' || estado === 'erro') {
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 80 }}>⚠️</div>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            letterSpacing: 1,
          }}
        >
          {estado === 'erro' ? 'Erro ao gerar QR Code' : 'QR Code expirado'}
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
          O tempo de pagamento foi encerrado
        </p>
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn-primary" onClick={iniciarPagamento}>
            TENTAR NOVAMENTE
          </button>
          <button className="btn-secondary" onClick={() => navigate('/payment')}>
            VOLTAR
          </button>
        </div>
      </div>
    );
  }

  if (estado === 'aprovado') {
    return (
      <div style={centerBox}>
        <div className="spinner" />
      </div>
    );
  }

  // estado === 'aguardando'
  const urgente = secondsLeft < 60;
  const critico = secondsLeft < 30;

  return (
    <div style={{ minHeight: '100vh', padding: 16 }}>
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span />
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 30,
            letterSpacing: 1,
            justifySelf: 'center',
          }}
        >
          Pagamento via PIX
        </h1>
        <button
          onClick={() => navigate('/payment')}
          aria-label="Cancelar"
          style={{
            justifySelf: 'end',
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: 26,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </header>

      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 56,
          color: 'var(--secondary)',
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        {formatPreco(total)}
      </div>

      <div
        style={{
          width: 300,
          height: 300,
          background: '#fff',
          borderRadius: 16,
          padding: 12,
          margin: '20px auto 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {qrCodeBase64 ? (
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            width={276}
            height={276}
            alt="QR Code Pix"
          />
        ) : (
          <div className="spinner" />
        )}
      </div>

      <p
        style={{
          color: 'var(--text-muted)',
          textAlign: 'center',
          margin: '16px auto 0',
          maxWidth: 320,
        }}
      >
        Abra o app do banco e escaneie o QR Code
      </p>

      <div style={{ maxWidth: 320, margin: '16px auto 0' }}>
        <button className="btn-secondary" onClick={copiarCodigo} style={{ fontSize: 16, padding: '12px 24px' }}>
          {copiado ? '✓ Copiado!' : '📋 COPIAR CÓDIGO PIX'}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: 'var(--text-muted)',
          maxWidth: 320,
          margin: '20px auto',
        }}
      >
        <span style={{ flex: 1, height: 1, background: '#2A2545' }} />
        ou
        <span style={{ flex: 1, height: 1, background: '#2A2545' }} />
      </div>

      <div
        className={critico ? 'pulse-loop' : undefined}
        style={{
          textAlign: 'center',
          fontSize: 20,
          fontWeight: 700,
          color: urgente ? '#FF3D6B' : '#00C853',
        }}
      >
        ⏱ Expira em {formatTempo(secondsLeft)}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 24,
          color: 'var(--text-muted)',
        }}
      >
        <span className="dots" style={{ color: 'var(--primary)', fontSize: 24, lineHeight: 1 }}>
          <span>•</span>
          <span>•</span>
          <span>•</span>
        </span>
        Aguardando pagamento...
      </div>
    </div>
  );
}

const centerBox: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
  padding: 24,
};
