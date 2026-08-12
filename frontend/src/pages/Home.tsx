import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { getConfig } from '../services/api';
import { useCartStore, type Product } from '../store/cartStore';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nomeFestival, setNomeFestival] = useState('');
  const [produtos, setProdutos] = useState<Product[]>([]);

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const getTotalItems = useCartStore((s) => s.getTotalItems);

  useEffect(() => {
    let ativo = true;
    getConfig()
      .then((config) => {
        if (!ativo) return;
        setNomeFestival(config.nomeFestival);
        setProdutos(config.produtos);
        localStorage.setItem('tenantName', config.nomeFestival);
        if (config.pagamentos) {
          localStorage.setItem(
            'pagamentos',
            JSON.stringify(config.pagamentos)
          );
        }
      })
      .catch((err) => {
        console.error('Falha ao carregar configuração do totem:', err);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const getQuantidade = (id: string) =>
    items.find((item) => item.id === id)?.quantidade ?? 0;

  const totalItems = getTotalItems();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="spinner" />
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
          padding: '20px 16px 12px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            textAlign: 'left',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 40,
                lineHeight: 1,
                letterSpacing: 1,
                margin: 0,
              }}
            >
              {nomeFestival || 'Totem'}
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 15 }}>
              Selecione seus produtos
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/operador/login')}
            style={{
              flexShrink: 0,
              background: '#ea580c',
              border: 'none',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
            }}
          >
            LOGIN
          </button>
        </div>
      </header>

      <main style={{ padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          {produtos.map((produto) => (
            <ProductCard
              key={produto.id}
              id={produto.id}
              nome={produto.nome}
              preco={produto.preco}
              emoji={produto.emoji}
              cor={produto.cor}
              quantidade={getQuantidade(produto.id)}
              onAdd={() => addItem(produto)}
              onRemove={removeItem}
            />
          ))}
        </div>
      </main>

      {totalItems > 0 && (
        <footer
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            background:
              'linear-gradient(to top, var(--bg) 70%, transparent)',
          }}
        >
          <button className="btn-primary" onClick={() => navigate('/payment')}>
            PAGAR → ({totalItems} {totalItems === 1 ? 'item' : 'itens'})
          </button>
          <button
            onClick={() => navigate('/cart')}
            style={{
              marginTop: 8,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 14,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Ver detalhes do pedido
          </button>
        </footer>
      )}
    </div>
  );
}
