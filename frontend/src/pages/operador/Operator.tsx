import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createCardPayment, getConfig } from '../../services/api';
import {
  isOperadorLoggedIn,
  operadorLogout,
  startOfflineSyncLoop,
  submitManualSale,
  subscribeOfflineSync,
} from '../../services/operatorApi';
import { useCartStore, type Product } from '../../store/cartStore';

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

export default function Operator() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nomeFestival, setNomeFestival] = useState('');
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [toast, setToast] = useState(
    (location.state as { toast?: string } | null)?.toast ?? ''
  );
  const [pendingSync, setPendingSync] = useState(0);
  const [pagando, setPagando] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);
  const getTotalItems = useCartStore((s) => s.getTotalItems);

  const total = getTotal();
  const totalItems = getTotalItems();
  const tenantId = localStorage.getItem('tenantId') ?? '';

  const pagamentos = (() => {
    try {
      const raw = localStorage.getItem('pagamentos');
      return raw
        ? (JSON.parse(raw) as { pix: boolean; cartao: boolean })
        : { pix: true, cartao: true };
    } catch {
      return { pix: true, cartao: true };
    }
  })();

  useEffect(() => {
    if (!isOperadorLoggedIn()) {
      navigate('/operador/login', { replace: true });
      return;
    }

    setLoadingProdutos(true);
    getConfig()
      .then((cfg) => {
        setNomeFestival(cfg.nomeFestival);
        setProdutos(cfg.produtos);
        if (cfg.pagamentos) {
          localStorage.setItem('pagamentos', JSON.stringify(cfg.pagamentos));
        }
      })
      .finally(() => setLoadingProdutos(false));

    const stopSync = startOfflineSyncLoop();
    const unsub = subscribeOfflineSync(setPendingSync);
    return () => {
      stopSync();
      unsub();
    };
  }, [navigate]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const flash = (msg: string) => {
    setToast(msg);
    setErro('');
  };

  const finalizarManual = async (metodo: 'dinheiro' | 'cartao_fisico') => {
    if (items.length === 0) return;
    setPagando(metodo);
    setErro('');
    try {
      const { queued } = await submitManualSale(items, total, metodo);
      clearCart();
      flash(
        queued
          ? 'Venda salva offline — sincroniza em breve'
          : metodo === 'dinheiro'
            ? 'Dinheiro registrado!'
            : 'Cartão físico registrado!'
      );
    } catch {
      setErro('Não foi possível registrar a venda.');
    } finally {
      setPagando(null);
    }
  };

  const pagarPix = () => {
    if (items.length === 0) return;
    navigate('/pix', {
      state: { items: [...items], total, returnTo: '/operador' },
    });
  };

  const pagarCartaoGateway = async () => {
    if (items.length === 0 || !tenantId) return;
    setPagando('gateway');
    setErro('');
    try {
      const payment = await createCardPayment(items, total, tenantId);
      navigate('/card', {
        state: {
          items: [...items],
          total,
          intentId: payment.intentId,
          transactionId: payment.transactionId,
          returnTo: '/operador',
        },
      });
    } catch (err: unknown) {
      const data = (
        err as { response?: { data?: { detalhe?: string; error?: string } } }
      )?.response?.data;
      setErro(data?.detalhe ?? 'Falha ao enviar para maquininha. Tente de novo.');
    } finally {
      setPagando(null);
    }
  };

  const getQtd = (id: string) =>
    items.find((i) => i.id === id)?.quantidade ?? 0;

  const logout = () => {
    operadorLogout();
    navigate('/operador/login');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1c1917',
      }}
    >
      <header
        style={{
          background: '#ea580c',
          color: '#fff',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 18 }}>MODO OPERADOR</strong>
        <span style={{ flex: 1, opacity: 0.9, fontSize: 14 }}>{nomeFestival}</span>
        {pendingSync > 0 && (
          <span
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {pendingSync} pendente{pendingSync > 1 ? 's' : ''} sync
          </span>
        )}
        <button
          onClick={logout}
          style={{
            background: 'rgba(0,0,0,0.2)',
            border: 'none',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Sair
        </button>
      </header>

      <main style={{ flex: 1, padding: 12, paddingBottom: 220, overflowY: 'auto' }}>
        {loadingProdutos ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#a8a29e' }}>
            Carregando produtos...
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {produtos.map((p) => {
              const qtd = getQtd(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  style={{
                    background: '#292524',
                    border: `2px solid ${p.cor}`,
                    borderRadius: 12,
                    padding: 12,
                    cursor: 'pointer',
                    color: '#fff',
                    textAlign: 'center',
                    position: 'relative',
                    minHeight: 120,
                  }}
                >
                  {qtd > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        background: p.cor,
                        borderRadius: 999,
                        minWidth: 24,
                        height: 24,
                        lineHeight: '24px',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      {qtd}
                    </span>
                  )}
                  <div style={{ fontSize: 36 }}>{p.emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                    {p.nome}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 22,
                      color: p.cor,
                    }}
                  >
                    {formatPreco(p.preco)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <footer
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: '#0c0a09',
          borderTop: '2px solid #ea580c',
          padding: 12,
        }}
      >
        {items.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              marginBottom: 10,
              paddingBottom: 4,
            }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  flexShrink: 0,
                  background: '#292524',
                  borderRadius: 8,
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: '#fff',
                }}
              >
                <span>{item.emoji}</span>
                <span>{item.nome}</span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  style={qtyBtn}
                >
                  −
                </button>
                <strong>{item.quantidade}</strong>
                <button
                  type="button"
                  onClick={() => addItem(item)}
                  style={qtyBtn}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <span style={{ color: '#a8a29e', fontSize: 14 }}>
            {totalItems} {totalItems === 1 ? 'item' : 'itens'}
          </span>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32,
              color: '#ea580c',
            }}
          >
            {formatPreco(total)}
          </span>
        </div>

        {erro && (
          <div
            style={{
              color: '#fca5a5',
              fontSize: 13,
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            {erro}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          <PayBtn
            label="DINHEIRO"
            color="#16a34a"
            disabled={items.length === 0 || pagando !== null}
            loading={pagando === 'dinheiro'}
            onClick={() => finalizarManual('dinheiro')}
          />
          <PayBtn
            label="CARTÃO FÍSICO"
            color="#2563eb"
            disabled={items.length === 0 || pagando !== null}
            loading={pagando === 'cartao_fisico'}
            onClick={() => finalizarManual('cartao_fisico')}
          />
          {pagamentos.pix && (
            <PayBtn
              label="PIX"
              color="#00C853"
              disabled={items.length === 0 || pagando !== null}
              onClick={pagarPix}
            />
          )}
          {pagamentos.cartao && (
            <PayBtn
              label="CARTÃO LEITOR"
              color="#448AFF"
              disabled={items.length === 0 || pagando !== null}
              loading={pagando === 'gateway'}
              onClick={pagarCartaoGateway}
            />
          )}
        </div>
      </footer>

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#166534',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 8,
            fontWeight: 700,
            zIndex: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function PayBtn({
  label,
  color,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '14px 8px',
        borderRadius: 8,
        border: 'none',
        background: color,
        color: '#fff',
        fontWeight: 800,
        fontSize: 14,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {loading ? '...' : label}
    </button>
  );
}

const qtyBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid #57534e',
  background: '#44403c',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
};
