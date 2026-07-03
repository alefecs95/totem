import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCardPaymentStatus } from '../services/api';
import { useCartStore, type CartItem } from '../store/cartStore';

type Estado = 'aguardando' | 'aprovado' | 'recusado' | 'erro';

interface CardLocationState {
  items?: CartItem[];
  total?: number;
  intentId?: string;
  transactionId?: string;
}

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_SEC = 300;

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

export default function CardWaiting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as CardLocationState;

  const storeItems = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);

  const items = state.items ?? storeItems;
  const total = state.total ?? getTotal();
  const intentId = state.intentId ?? '';
  const transactionId = state.transactionId ?? '';

  const [estado, setEstado] = useState<Estado>('aguardando');
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC);
  const [mpPaymentId, setMpPaymentId] = useState('');
  const [rawStatus, setRawStatus] = useState('');

  // Sem intentId não há o que aguardar — volta ao pagamento.
  useEffect(() => {
    if (!intentId) {
      navigate('/payment', { replace: true, state: { items, total } });
    }
  }, [intentId, navigate, items, total]);

  // Polling: só vai para sucesso quando a maquininha aprovar de verdade.
  useEffect(() => {
    if (estado !== 'aguardando' || !intentId) return;

    const tenantId = localStorage.getItem('tenantId') ?? '';

    const id = window.setInterval(async () => {
      try {
        const result = await getCardPaymentStatus(intentId, tenantId);
        if (result.rawStatus) setRawStatus(result.rawStatus);
        if (result.status === 'approved') {
          if (result.mpPaymentId) setMpPaymentId(result.mpPaymentId);
          setEstado('aprovado');
        } else if (result.status === 'rejected') {
          setEstado('recusado');
        }
      } catch (err) {
        console.error('Falha ao consultar status do cartão:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [estado, intentId]);

  // Timeout se o cliente não passar o cartão.
  useEffect(() => {
    if (estado !== 'aguardando') return;

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setEstado('recusado');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [estado]);

  useEffect(() => {
    if (estado === 'aprovado') {
      navigate('/success', {
        state: {
          items,
          total,
          metodo: 'cartao',
          payment: {
            paymentId: mpPaymentId || intentId || transactionId,
          },
        },
      });
    }
  }, [estado, navigate, items, total, intentId, transactionId, mpPaymentId]);

  if (!intentId) return null;

  if (estado === 'recusado') {
    return (
      <div style={centerBox}>
        <div style={{ fontSize: 72 }}>❌</div>
        <h1 style={titleStyle}>Pagamento não concluído</h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
          O pagamento foi cancelado, recusado ou expirou. Tente novamente.
        </p>
        <button
          className="btn-primary"
          style={{ marginTop: 16, maxWidth: 320 }}
          onClick={() =>
            navigate('/payment', { state: { items, total } })
          }
        >
          TENTAR NOVAMENTE
        </button>
      </div>
    );
  }

  return (
    <div style={centerBox}>
      <div className="spinner" />
      <h1 style={titleStyle}>Passe o cartão na maquininha</h1>
      <p
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 36,
          color: 'var(--secondary)',
        }}
      >
        {formatPreco(total)}
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 18, textAlign: 'center' }}>
        Aguardando confirmação na maquininha ao lado...
      </p>
      <div className="dots" style={{ marginTop: 8 }} />
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>
        Expira em {Math.floor(secondsLeft / 60)}:
        {String(secondsLeft % 60).padStart(2, '0')}
      </p>
      {rawStatus && (
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
          Status MP: {rawStatus}
        </p>
      )}
      {TIMEOUT_SEC - secondsLeft >= 15 && (
        <div
          style={{
            marginTop: 20,
            maxWidth: 360,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(255, 193, 7, 0.12)',
            color: '#ffca28',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          A maquininha mostra &quot;Inserir valor&quot;? Está no modo errado.
          Vá em Ajustes → Modo de operação → PDV (integrado). A tela não pode
          ter botão de digitar valor.
        </div>
      )}
    </div>
  );
}

const centerBox: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  padding: 24,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 40,
  letterSpacing: 1,
  textAlign: 'center',
  margin: 0,
};
