import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createCardPayment } from '../services/api';
import { useCartStore, type CartItem } from '../store/cartStore';

type Metodo = 'pix' | 'card';

interface PaymentLocationState {
  items?: CartItem[];
  total?: number;
}

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

const VERDE = '#00C853';
const AZUL = '#448AFF';

export default function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as PaymentLocationState;

  const storeItems = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);

  const items = state.items ?? storeItems;
  const total = state.total ?? getTotal();

  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const mensagemErroPagamento = (code?: string): string => {
    switch (code) {
      case 'missing_access_token':
        return 'Mercado Pago não configurado. Preencha o Access Token no admin.';
      case 'missing_device_id':
        return 'Maquininha não configurada. Preencha o Device ID no admin.';
      case 'missing_sumup_config':
        return 'SumUp não configurado. Preencha API Key e Reader ID no admin.';
      case 'tenant_not_found':
        return 'Organizador não encontrado. Reconfigure o totem.';
      case 'invalid_body':
        return 'Dados do pedido inválidos. Tente novamente.';
      default:
        return 'Não foi possível ativar a maquininha. Tente novamente.';
    }
  };

  const handleConfirmar = async () => {
    if (!metodo) return;
    setErro('');

    if (metodo === 'pix') {
      navigate('/pix', { state: { items, total } });
      return;
    }

    const tenantId = localStorage.getItem('tenantId');
    if (!tenantId) {
      setErro('Totem não configurado. Escaneie o QR Code novamente.');
      return;
    }

    setLoading(true);
    try {
      const payment = await createCardPayment(items, total, tenantId);
      navigate('/success', {
        state: { items, total, metodo: 'cartao', payment },
      });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      setErro(mensagemErroPagamento(code));
      console.error('Falha ao ativar a maquininha:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <div className="spinner" />
        <p style={{ fontSize: 20, color: 'var(--text-muted)' }}>
          Ativando maquininha...
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 120 }}>
      <header style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            letterSpacing: 1,
          }}
        >
          Como vai pagar?
        </h1>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            color: 'var(--secondary)',
            marginTop: 4,
          }}
        >
          {formatPreco(total)}
        </div>
      </header>

      <main
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <button
          onClick={() => setMetodo('pix')}
          className="card"
          style={{
            position: 'relative',
            textAlign: 'center',
            cursor: 'pointer',
            border: `2px solid ${metodo === 'pix' ? VERDE : 'transparent'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {metodo === 'pix' && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 16,
                color: VERDE,
                fontSize: 24,
              }}
            >
              ✓
            </span>
          )}
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2.6 3.8 10.8a1.7 1.7 0 0 0 0 2.4L12 21.4l8.2-8.2a1.7 1.7 0 0 0 0-2.4L12 2.6Zm0 3.4 5.4 5.4L12 17l-5.4-5.4L12 6Z"
              fill={VERDE}
            />
          </svg>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 52,
              color: VERDE,
              lineHeight: 1,
            }}
          >
            PIX
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Instantâneo · Sem taxas extras
          </span>
        </button>

        <button
          onClick={() => setMetodo('card')}
          className="card"
          style={{
            position: 'relative',
            textAlign: 'center',
            cursor: 'pointer',
            border: `2px solid ${metodo === 'card' ? AZUL : 'transparent'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {metodo === 'card' && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 16,
                color: AZUL,
                fontSize: 24,
              }}
            >
              ✓
            </span>
          )}
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="5" width="20" height="14" rx="2.5" fill={AZUL} />
            <rect x="2" y="8.5" width="20" height="3" fill="#0D0A1A" />
            <rect x="5" y="15" width="6" height="2" rx="1" fill="#0D0A1A" />
          </svg>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 52,
              color: AZUL,
              lineHeight: 1,
            }}
          >
            CARTÃO
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Débito ou Crédito
          </span>
          <span style={{ color: AZUL, fontSize: 14, fontWeight: 600 }}>
            Passe na maquininha ao lado →
          </span>
        </button>
      </main>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
        }}
      >
        {erro && (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(220, 38, 38, 0.15)',
              color: '#fca5a5',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            {erro}
          </div>
        )}
        <button
          className="btn-primary"
          onClick={handleConfirmar}
          disabled={!metodo}
          style={{ opacity: metodo ? 1 : 0.4, cursor: metodo ? 'pointer' : 'default' }}
        >
          CONFIRMAR →
        </button>
      </footer>
    </div>
  );
}
