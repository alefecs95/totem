import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

export default function Cart() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const getTotal = useCartStore((s) => s.getTotal);
  const getTotalItems = useCartStore((s) => s.getTotalItems);

  const total = getTotal();
  const totalItems = getTotalItems();

  if (items.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 80 }}>🛒</div>
        <p style={{ fontSize: 20, color: 'var(--text-muted)' }}>
          Seu carrinho está vazio
        </p>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <button className="btn-primary" onClick={() => navigate('/')}>
            ← VOLTAR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 120 }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--bg)',
          borderBottom: '1px solid rgba(176, 168, 204, 0.15)',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: 16,
            cursor: 'pointer',
            justifySelf: 'start',
          }}
        >
          ← Voltar
        </button>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 32,
            letterSpacing: 1,
            justifySelf: 'center',
          }}
        >
          Seu Pedido
        </h1>
        <span
          style={{
            justifySelf: 'end',
            background: 'var(--primary)',
            color: '#fff',
            borderRadius: 999,
            minWidth: 28,
            height: 28,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          {totalItems}
        </span>
      </header>

      <main style={{ padding: 16 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 0',
              borderBottom: '1px solid #2A2545',
            }}
          >
            <div style={{ fontSize: 36 }}>{item.emoji}</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{item.nome}</div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                {formatPreco(item.preco)} · x{item.quantidade}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => removeItem(item.id)}
                aria-label={`Remover ${item.nome}`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: `2px solid ${item.cor}`,
                  background: 'transparent',
                  color: item.cor,
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                −
              </button>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22,
                  minWidth: 20,
                  textAlign: 'center',
                }}
              >
                {item.quantidade}
              </span>
              <button
                onClick={() => addItem(item)}
                aria-label={`Adicionar ${item.nome}`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: `2px solid ${item.cor}`,
                  background: item.cor,
                  color: '#fff',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>

            <div
              style={{
                width: 90,
                textAlign: 'right',
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {formatPreco(item.preco * item.quantidade)}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginTop: 24,
            paddingTop: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 40,
              color: 'var(--primary)',
              letterSpacing: 1,
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 40,
              color: 'var(--primary)',
            }}
          >
            {formatPreco(total)}
          </span>
        </div>
      </main>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          display: 'flex',
          gap: 12,
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
        }}
      >
        <div style={{ width: '40%' }}>
          <button className="btn-secondary" onClick={() => navigate('/')}>
            ← ALTERAR
          </button>
        </div>
        <div style={{ width: '58%' }}>
          <button
            className="btn-primary"
            onClick={() => navigate('/payment', { state: { items, total } })}
          >
            PAGAR →
          </button>
        </div>
      </footer>
    </div>
  );
}
