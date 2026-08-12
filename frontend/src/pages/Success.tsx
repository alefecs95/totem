import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PrintReceipt from '../components/PrintReceipt';
import { viasComprovante } from '../constants/productCategories';
import { useCartStore, type CartItem } from '../store/cartStore';

interface SuccessLocationState {
  items?: CartItem[];
  total?: number;
  metodo?: 'pix' | 'cartao';
  payment?: { paymentId?: string };
}

const VERDE = '#00C853';
const AZUL = '#448AFF';
const VOLTAR_EM = 30;

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

export default function Success() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as SuccessLocationState;

  const clearCart = useCartStore((s) => s.clearCart);

  const items = state.items ?? [];
  const total = state.total ?? 0;
  const metodo = state.metodo ?? 'pix';
  const paymentId = state.payment?.paymentId ?? '';
  const isPix = metodo === 'pix';

  const [secondsLeft, setSecondsLeft] = useState(VOLTAR_EM);
  const tenantName = localStorage.getItem('tenantName') ?? 'Festival';

  const novoPedido = () => {
    clearCart();
    navigate('/');
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0) {
      clearCart();
      navigate('/');
    }
  }, [secondsLeft, clearCart, navigate]);

  const resetCountdown = () => setSecondsLeft(VOLTAR_EM);

  const idCurto = paymentId ? paymentId.slice(0, 8).toUpperCase() : '--------';
  const vias = viasComprovante(items);
  const impressaoDupla = vias.length > 1;

  return (
    <div
      onClick={resetCountdown}
      onTouchStart={resetCountdown}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 16px 24px',
        gap: 16,
      }}
    >
      <div
        className="pop-in"
        style={{
          width: 110,
          height: 110,
          borderRadius: '50%',
          background: VERDE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          color: '#fff',
          marginTop: 8,
        }}
      >
        ✓
      </div>

      <h1
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 44,
          color: VERDE,
          textAlign: 'center',
          letterSpacing: 1,
          lineHeight: 1,
        }}
      >
        PAGAMENTO CONFIRMADO!
      </h1>
      <p style={{ fontSize: 18, color: 'var(--text-muted)', textAlign: 'center' }}>
        Retire suas fichas no balcão
      </p>

      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
            }}
          >
            <span style={{ fontSize: 24 }}>{item.emoji}</span>
            <span style={{ flex: 1 }}>{item.nome}</span>
            <span style={{ color: 'var(--text-muted)' }}>x{item.quantidade}</span>
            <span style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>
              {formatPreco(item.preco * item.quantidade)}
            </span>
          </div>
        ))}

        <div style={{ height: 1, background: '#2A2545', margin: '12px 0' }} />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32,
              color: 'var(--primary)',
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32,
              color: 'var(--primary)',
            }}
          >
            {formatPreco(total)}
          </span>
        </div>

        <div
          style={{
            marginTop: 12,
            fontWeight: 700,
            color: isPix ? VERDE : AZUL,
          }}
        >
          {isPix ? 'PIX ✓' : 'CARTÃO ✓'}
        </div>

        <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          #{idCurto}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 4,
        }}
      >
        <button
          className="btn-primary"
          style={{ background: AZUL }}
          onClick={() => window.print()}
        >
          🖨️ {impressaoDupla ? 'IMPRIMIR 2 VIAS' : 'IMPRIMIR COMPROVANTE'}
        </button>
        <button className="btn-primary" onClick={novoPedido}>
          NOVO PEDIDO
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
        Voltando automaticamente em {secondsLeft}s...
      </p>

      <PrintReceipt
        items={items}
        total={total}
        paymentMethod={isPix ? 'PIX' : 'CARTÃO'}
        paymentId={paymentId}
        tenantName={tenantName}
        date={new Date()}
        vias={vias}
      />
    </div>
  );
}
