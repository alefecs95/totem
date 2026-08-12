import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Atalhos do PDV (teclado):
 * 0–9     → monta quantidade (ex: 20)
 * F1–F9   → adiciona produto × quantidade
 * clique  → adiciona produto × quantidade
 * D/Enter → abre dinheiro (recebido + troco)
 * No dinheiro: dígitos = recebido, Enter confirma, Esc volta
 * F       → cartão físico
 * P / L   → Pix / leitor
 * Esc     → limpa qtd ou pedido
 * Backspace → apaga dígito da qtd; senão −1 do último item
 */
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
  const [showHelp, setShowHelp] = useState(false);
  /** Dígitos digitados para quantidade em lote (ex: "20"). Vazio = 1. */
  const [qtyDigits, setQtyDigits] = useState('');
  /** Modal de dinheiro: valor recebido (centavos como string de dígitos, ex: "5000" = R$ 50,00). */
  const [cashOpen, setCashOpen] = useState(false);
  const [cashDigits, setCashDigits] = useState('');

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const getTotal = useCartStore((s) => s.getTotal);
  const getTotalItems = useCartStore((s) => s.getTotalItems);

  const total = getTotal();
  const totalItems = getTotalItems();
  const pendingQty = Math.min(
    999,
    Math.max(1, qtyDigits === '' ? 1 : Number.parseInt(qtyDigits, 10) || 1)
  );

  const [pagamentos, setPagamentos] = useState(() => {
    try {
      const raw = localStorage.getItem('pagamentos');
      return raw
        ? (JSON.parse(raw) as { pix: boolean; cartao: boolean })
        : { pix: true, cartao: true };
    } catch {
      return { pix: true, cartao: true };
    }
  });

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setErro('');
  }, []);

  const fecharDinheiro = useCallback(() => {
    setCashOpen(false);
    setCashDigits('');
  }, []);

  const abrirDinheiro = useCallback(() => {
    const state = useCartStore.getState();
    if (state.items.length === 0 || pagando) return;
    setQtyDigits('');
    setErro('');
    setCashDigits('');
    setCashOpen(true);
  }, [pagando]);

  const finalizarManual = useCallback(
    async (metodo: 'dinheiro' | 'cartao_fisico', recebido?: number) => {
      const state = useCartStore.getState();
      if (state.items.length === 0 || pagando) return;
      const tot = state.getTotal();

      if (metodo === 'dinheiro') {
        const valorRecebido = recebido ?? 0;
        if (valorRecebido + 0.001 < tot) {
          setErro('Valor recebido menor que o total.');
          return;
        }
      }

      setPagando(metodo);
      setErro('');
      try {
        const { queued } = await submitManualSale(state.items, tot, metodo);
        state.clearCart();
        fecharDinheiro();
        if (metodo === 'dinheiro' && recebido != null) {
          const troco = Math.round((recebido - tot) * 100) / 100;
          flash(
            queued
              ? `Offline · Troco ${formatPreco(troco)}`
              : troco > 0
                ? `✓ Troco ${formatPreco(troco)}`
                : '✓ Dinheiro OK (sem troco)'
          );
        } else {
          flash(
            queued
              ? 'Offline — sincroniza em breve'
              : '✓ Cartão físico OK'
          );
        }
      } catch {
        setErro('Não foi possível registrar a venda.');
      } finally {
        setPagando(null);
      }
    },
    [flash, pagando, fecharDinheiro]
  );

  const confirmarDinheiro = useCallback(() => {
    const tot = useCartStore.getState().getTotal();
    const recebido = cashDigits === '' ? 0 : Number.parseInt(cashDigits, 10) / 100;
    if (recebido + 0.001 < tot) {
      setErro('Valor recebido insuficiente.');
      return;
    }
    void finalizarManual('dinheiro', recebido);
  }, [cashDigits, finalizarManual]);

  const pagarPix = useCallback(() => {
    const state = useCartStore.getState();
    if (state.items.length === 0 || pagando) return;
    navigate('/pix', {
      state: {
        items: [...state.items],
        total: state.getTotal(),
        returnTo: '/operador',
      },
    });
  }, [navigate, pagando]);

  const pagarCartaoGateway = useCallback(async () => {
    const state = useCartStore.getState();
    const tid = localStorage.getItem('tenantId') ?? '';
    if (state.items.length === 0 || !tid || pagando) return;
    setPagando('gateway');
    setErro('');
    try {
      const payment = await createCardPayment(
        state.items,
        state.getTotal(),
        tid
      );
      navigate('/card', {
        state: {
          items: [...state.items],
          total: state.getTotal(),
          intentId: payment.intentId,
          transactionId: payment.transactionId,
          returnTo: '/operador',
        },
      });
    } catch (err: unknown) {
      const data = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data;
      setErro(data?.detalhe ?? 'Falha no leitor. Tente de novo.');
    } finally {
      setPagando(null);
    }
  }, [navigate, pagando]);

  const produtosRef = useRef(produtos);
  produtosRef.current = produtos;
  const pagamentosRef = useRef(pagamentos);
  pagamentosRef.current = pagamentos;
  const finalizarRef = useRef(finalizarManual);
  finalizarRef.current = finalizarManual;
  const abrirDinheiroRef = useRef(abrirDinheiro);
  abrirDinheiroRef.current = abrirDinheiro;
  const confirmarDinheiroRef = useRef(confirmarDinheiro);
  confirmarDinheiroRef.current = confirmarDinheiro;
  const fecharDinheiroRef = useRef(fecharDinheiro);
  fecharDinheiroRef.current = fecharDinheiro;
  const cashOpenRef = useRef(cashOpen);
  cashOpenRef.current = cashOpen;
  const pixRef = useRef(pagarPix);
  pixRef.current = pagarPix;
  const cartaoRef = useRef(pagarCartaoGateway);
  cartaoRef.current = pagarCartaoGateway;
  const qtyDigitsRef = useRef(qtyDigits);
  qtyDigitsRef.current = qtyDigits;

  const addProductQty = useCallback((product: Product, qtd?: number) => {
    const digits = qtyDigitsRef.current;
    const n =
      qtd ??
      Math.min(999, Math.max(1, digits === '' ? 1 : Number.parseInt(digits, 10) || 1));
    useCartStore.getState().addItem(product, n);
    setQtyDigits('');
  }, []);

  const addProductQtyRef = useRef(addProductQty);
  addProductQtyRef.current = addProductQty;

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
          setPagamentos(cfg.pagamentos);
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
    const id = window.setTimeout(() => setToast(''), 1600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Atalhos de teclado — PDV
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // Modal dinheiro aberto: dígitos = valor recebido (centavos)
      if (cashOpenRef.current) {
        if (/^[0-9]$/.test(key)) {
          e.preventDefault();
          setCashDigits((prev) => (prev + key).replace(/^0+(?=\d)/, '').slice(0, 8));
          return;
        }
        if (key === 'Backspace') {
          e.preventDefault();
          setCashDigits((prev) => prev.slice(0, -1));
          return;
        }
        if (key === 'Escape') {
          e.preventDefault();
          fecharDinheiroRef.current();
          return;
        }
        if (key === 'Enter') {
          e.preventDefault();
          confirmarDinheiroRef.current();
          return;
        }
        return;
      }

      // Quantidade: dígitos 0–9 (teclado principal ou numpad)
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        setQtyDigits((prev) => {
          const next = (prev + key).replace(/^0+(?=\d)/, '');
          return next.slice(0, 3);
        });
        return;
      }

      // F1–F9 → produto × quantidade pendente
      if (/^F[1-9]$/.test(key)) {
        const idx = Number(key.slice(1)) - 1;
        const p = produtosRef.current[idx];
        if (p) {
          e.preventDefault();
          addProductQtyRef.current(p);
        }
        return;
      }

      if (key === 'Escape') {
        e.preventDefault();
        if (qtyDigitsRef.current) {
          setQtyDigits('');
        } else {
          useCartStore.getState().clearCart();
          setErro('');
        }
        return;
      }

      if (key === 'Delete') {
        e.preventDefault();
        useCartStore.getState().clearCart();
        setQtyDigits('');
        setErro('');
        return;
      }

      if (key === 'Backspace') {
        e.preventDefault();
        if (qtyDigitsRef.current) {
          setQtyDigits((prev) => prev.slice(0, -1));
          return;
        }
        const cart = useCartStore.getState().items;
        if (cart.length > 0) {
          useCartStore.getState().removeItem(cart[cart.length - 1]!.id);
        }
        return;
      }

      const k = key.toLowerCase();
      if (k === 'd' || key === 'Enter') {
        e.preventDefault();
        setQtyDigits('');
        abrirDinheiroRef.current();
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        setQtyDigits('');
        void finalizarRef.current('cartao_fisico');
        return;
      }
      if (k === 'p' && pagamentosRef.current.pix) {
        e.preventDefault();
        setQtyDigits('');
        pixRef.current();
        return;
      }
      if (k === 'l' && pagamentosRef.current.cartao) {
        e.preventDefault();
        setQtyDigits('');
        void cartaoRef.current();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getQtd = (id: string) =>
    items.find((i) => i.id === id)?.quantidade ?? 0;

  const logout = () => {
    operadorLogout();
    navigate('/operador/login');
  };

  const busy = pagando !== null;
  const canPay = items.length > 0 && !busy;
  const QTY_CHIPS = [2, 5, 10, 20, 50];

  const cashRecebido =
    cashDigits === '' ? 0 : Number.parseInt(cashDigits, 10) / 100;
  const cashTroco = Math.round((cashRecebido - total) * 100) / 100;
  const cashOk = cashRecebido + 0.001 >= total && total > 0;

  const sugerirRecebido = (valor: number) => {
    const cents = Math.round(valor * 100);
    setCashDigits(String(cents));
    setErro('');
  };

  const sugestoesDinheiro = (() => {
    const base = [total];
    for (const n of [10, 20, 50, 100, 200]) {
      if (n >= total) base.push(n);
    }
    const ceil10 = Math.ceil(total / 10) * 10;
    if (ceil10 > total) base.push(ceil10);
    return [...new Set(base.map((v) => Math.round(v * 100) / 100))].slice(0, 6);
  })();

  return (
    <div style={shell}>
      <style>{`
        @media (max-width: 800px) {
          .pdv-body {
            grid-template-columns: 1fr !important;
            grid-template-rows: 1fr auto;
          }
          .pdv-sidebar {
            border-left: none !important;
            border-top: 2px solid #ea580c;
            max-height: 48vh;
          }
        }
      `}</style>
      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={pdvBadge}>PDV</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              VENDA RÁPIDA
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{nomeFestival}</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {pendingSync > 0 && (
          <span style={syncBadge}>
            {pendingSync} sync
          </span>
        )}

        <button type="button" onClick={() => setShowHelp((v) => !v)} style={hdrBtn}>
          Atalhos
        </button>
        <button
          type="button"
          onClick={() => {
            clearCart();
            setQtyDigits('');
            setErro('');
          }}
          style={hdrBtn}
          title="Del"
        >
          Limpar
        </button>
        <button type="button" onClick={logout} style={hdrBtn}>
          Sair
        </button>
      </header>

      {showHelp && (
        <div style={helpBar}>
          <strong>Teclado:</strong>
          <span>20 + toque = 20 un.</span>
          <span>F1–F9 produto</span>
          <span>0–9 quantidade</span>
          <span>D / Enter dinheiro</span>
          <span>F cartão físico</span>
          {pagamentos.pix && <span>P Pix</span>}
          {pagamentos.cartao && <span>L leitor</span>}
          <span>Esc limpa qtd</span>
        </div>
      )}

      <div className="pdv-body" style={body}>
        <main style={gridArea}>
          <div style={qtyBar}>
            <div
              style={{
                ...qtyDisplay,
                outline: pendingQty > 1 ? '2px solid #ea580c' : 'none',
              }}
            >
              <span style={{ fontSize: 12, color: '#a8a29e', fontWeight: 700 }}>
                QTD
              </span>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 36,
                  color: pendingQty > 1 ? '#ea580c' : '#fff',
                  lineHeight: 1,
                }}
              >
                ×{pendingQty}
              </span>
            </div>
            {QTY_CHIPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQtyDigits(String(n))}
                style={{
                  ...qtyChip,
                  background: pendingQty === n ? '#ea580c' : '#292524',
                }}
              >
                ×{n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQtyDigits('')}
              style={{ ...qtyChip, background: '#44403c' }}
            >
              ×1
            </button>
          </div>

          {loadingProdutos ? (
            <div style={{ color: '#a8a29e', padding: 40, textAlign: 'center' }}>
              Carregando...
            </div>
          ) : produtos.length === 0 ? (
            <div style={{ color: '#a8a29e', padding: 40, textAlign: 'center' }}>
              Nenhum produto ativo. Cadastre no portal/admin.
            </div>
          ) : (
            <div style={productGrid}>
              {produtos.map((p, idx) => {
                const qtd = getQtd(p.id);
                const atalho = idx < 9 ? `F${idx + 1}` : null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProductQty(p)}
                    style={{
                      ...productBtn,
                      borderColor: p.cor,
                      background:
                        qtd > 0 ? `${p.cor}22` : '#1c1917',
                    }}
                  >
                    {atalho && <span style={keyBadge}>{atalho}</span>}
                    {qtd > 0 && (
                      <span style={{ ...qtyBadge, background: p.cor }}>{qtd}</span>
                    )}
                    <div style={{ fontSize: 42, lineHeight: 1 }}>{p.emoji}</div>
                    <div style={productName}>{p.nome}</div>
                    <div style={{ ...productPrice, color: p.cor }}>
                      {formatPreco(p.preco)}
                    </div>
                    {pendingQty > 1 && (
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#fbbf24',
                          marginTop: 2,
                        }}
                      >
                        +{pendingQty}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="pdv-sidebar" style={sidebar}>
          <div style={sideTitle}>Pedido atual</div>

          <div style={cartList}>
            {items.length === 0 ? (
              <div style={emptyCart}>
                Ex: toque <strong>×20</strong> e depois na cerveja
                <br />
                ou digite <strong>20</strong> e toque no produto
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} style={cartRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {item.emoji} {item.nome}
                    </div>
                    <div style={{ color: '#a8a29e', fontSize: 12 }}>
                      {formatPreco(item.preco)} · un.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    style={qtyBtn}
                  >
                    −
                  </button>
                  <strong style={{ minWidth: 32, textAlign: 'center', fontSize: 16 }}>
                    {item.quantidade}
                  </strong>
                  <button
                    type="button"
                    onClick={() => addItem(item, 1)}
                    style={qtyBtn}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem(item, 5)}
                    style={{ ...qtyBtn, width: 40, fontSize: 12 }}
                    title="+5"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem(item, 10)}
                    style={{ ...qtyBtn, width: 44, fontSize: 12 }}
                    title="+10"
                  >
                    +10
                  </button>
                  <div
                    style={{
                      width: 68,
                      textAlign: 'right',
                      fontWeight: 800,
                      color: '#ea580c',
                      fontSize: 14,
                    }}
                  >
                    {formatPreco(item.preco * item.quantidade)}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={totalBlock}>
            <div>
              <div style={{ color: '#a8a29e', fontSize: 13 }}>
                {totalItems} {totalItems === 1 ? 'item' : 'itens'}
              </div>
              <div style={totalValue}>{formatPreco(total)}</div>
            </div>
          </div>

          {erro && <div style={erroBox}>{erro}</div>}

          <div style={payGrid}>
            <PayBtn
              label="DINHEIRO"
              hint="D / Enter"
              color="#16a34a"
              disabled={!canPay}
              loading={pagando === 'dinheiro'}
              onClick={abrirDinheiro}
              primary
            />
            <PayBtn
              label="CARTÃO FÍSICO"
              hint="F"
              color="#2563eb"
              disabled={!canPay}
              loading={pagando === 'cartao_fisico'}
              onClick={() => finalizarManual('cartao_fisico')}
            />
            {pagamentos.pix && (
              <PayBtn
                label="PIX"
                hint="P"
                color="#059669"
                disabled={!canPay}
                onClick={pagarPix}
              />
            )}
            {pagamentos.cartao && (
              <PayBtn
                label="LEITOR"
                hint="L"
                color="#1d4ed8"
                disabled={!canPay}
                loading={pagando === 'gateway'}
                onClick={pagarCartaoGateway}
              />
            )}
          </div>
        </aside>
      </div>

      {toast && <div style={toastStyle}>{toast}</div>}

      {cashOpen && (
        <div style={modalOverlay} onClick={fecharDinheiro}>
          <div
            style={modalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Pagamento em dinheiro"
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: '#a8a29e' }}>
              DINHEIRO
            </div>
            <div style={{ marginTop: 4, color: '#d6d3d1', fontSize: 14 }}>
              Total a pagar
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 48,
                color: '#ea580c',
                lineHeight: 1,
              }}
            >
              {formatPreco(total)}
            </div>

            <div style={{ marginTop: 18, color: '#a8a29e', fontSize: 13 }}>
              Valor recebido (digite no teclado)
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 44,
                color: '#fff',
                lineHeight: 1.1,
                background: '#0c0a09',
                borderRadius: 10,
                padding: '12px 16px',
                marginTop: 6,
                border: '2px solid #44403c',
              }}
            >
              {formatPreco(cashRecebido)}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 12,
              }}
            >
              {sugestoesDinheiro.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => sugerirRecebido(v)}
                  style={cashChip}
                >
                  {v === total ? 'Exato' : formatPreco(v)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCashDigits('');
                  setErro('');
                }}
                style={{ ...cashChip, background: '#44403c' }}
              >
                Limpar
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 10,
                background: cashOk
                  ? cashTroco > 0
                    ? '#14532d'
                    : '#1c1917'
                  : '#7f1d1d',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>Troco</span>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 36,
                  lineHeight: 1,
                  color: cashOk ? '#86efac' : '#fecaca',
                }}
              >
                {cashOk ? formatPreco(Math.max(0, cashTroco)) : '—'}
              </span>
            </div>

            {erro && (
              <div style={{ ...erroBox, marginTop: 10 }}>{erro}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={fecharDinheiro}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid #57534e',
                  background: 'transparent',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Voltar (Esc)
              </button>
              <button
                type="button"
                onClick={confirmarDinheiro}
                disabled={!cashOk || pagando === 'dinheiro'}
                style={{
                  flex: 1.4,
                  padding: 14,
                  borderRadius: 10,
                  border: 'none',
                  background: cashOk ? '#16a34a' : '#44403c',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: cashOk ? 'pointer' : 'default',
                  opacity: pagando === 'dinheiro' ? 0.7 : 1,
                }}
              >
                {pagando === 'dinheiro' ? '...' : 'Confirmar (Enter)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayBtn({
  label,
  hint,
  color,
  disabled,
  loading,
  onClick,
  primary,
}: {
  label: string;
  hint: string;
  color: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: primary ? '18px 12px' : '14px 10px',
        borderRadius: 10,
        border: 'none',
        background: color,
        color: '#fff',
        fontWeight: 800,
        fontSize: primary ? 17 : 14,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        gridColumn: primary ? '1 / -1' : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span>{loading ? '...' : label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{hint}</span>
    </button>
  );
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#0c0a09',
  color: '#fff',
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  background: 'linear-gradient(90deg, #c2410c, #ea580c)',
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const pdvBadge: React.CSSProperties = {
  background: '#fff',
  color: '#c2410c',
  fontWeight: 900,
  fontSize: 13,
  padding: '6px 10px',
  borderRadius: 6,
  letterSpacing: 1,
};

const hdrBtn: React.CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: 'none',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 13,
};

const syncBadge: React.CSSProperties = {
  background: '#fef3c7',
  color: '#92400e',
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const helpBar: React.CSSProperties = {
  background: '#1c1917',
  borderBottom: '1px solid #44403c',
  padding: '8px 14px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px 16px',
  fontSize: 12,
  color: '#d6d3d1',
  flexShrink: 0,
};

const body: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '1fr minmax(300px, 380px)',
  minHeight: 0,
};

const gridArea: React.CSSProperties = {
  padding: 12,
  overflowY: 'auto',
  minHeight: 0,
};

const qtyBar: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
};

const qtyDisplay: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1c1917',
  borderRadius: 10,
  padding: '6px 14px',
  minWidth: 72,
};

const qtyChip: React.CSSProperties = {
  border: 'none',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  padding: '12px 14px',
  borderRadius: 10,
  cursor: 'pointer',
  minWidth: 52,
};

const productGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 10,
  alignContent: 'start',
};

const productBtn: React.CSSProperties = {
  position: 'relative',
  border: '3px solid',
  borderRadius: 14,
  padding: '16px 10px 12px',
  cursor: 'pointer',
  color: '#fff',
  textAlign: 'center',
  minHeight: 140,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  WebkitTapHighlightColor: 'transparent',
};

const keyBadge: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  background: '#44403c',
  color: '#fafaf9',
  minWidth: 28,
  height: 22,
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: '22px',
  padding: '0 5px',
};

const qtyBadge: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  borderRadius: 999,
  minWidth: 28,
  height: 28,
  lineHeight: '28px',
  fontWeight: 800,
  fontSize: 14,
  color: '#fff',
  padding: '0 6px',
};

const productName: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.2,
};

const productPrice: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 26,
  lineHeight: 1,
};

const sidebar: React.CSSProperties = {
  background: '#1c1917',
  borderLeft: '2px solid #ea580c',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  padding: 12,
};

const sideTitle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: 1,
  color: '#a8a29e',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const cartList: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const emptyCart: React.CSSProperties = {
  color: '#78716c',
  fontSize: 14,
  textAlign: 'center',
  padding: '32px 12px',
  lineHeight: 1.5,
};

const cartRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#292524',
  borderRadius: 10,
  padding: '10px 8px',
};

const totalBlock: React.CSSProperties = {
  borderTop: '1px solid #44403c',
  paddingTop: 12,
  marginTop: 10,
  marginBottom: 10,
};

const totalValue: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 44,
  color: '#ea580c',
  lineHeight: 1,
};

const erroBox: React.CSSProperties = {
  color: '#fecaca',
  background: '#7f1d1d',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  marginBottom: 8,
  textAlign: 'center',
};

const payGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#166534',
  color: '#fff',
  padding: '14px 28px',
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 18,
  zIndex: 200,
  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 300,
  padding: 16,
};

const modalCard: React.CSSProperties = {
  background: '#1c1917',
  borderRadius: 16,
  padding: 22,
  width: '100%',
  maxWidth: 420,
  border: '2px solid #ea580c',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
};

const cashChip: React.CSSProperties = {
  border: 'none',
  background: '#292524',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};

const qtyBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: '1px solid #57534e',
  background: '#44403c',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
  fontWeight: 700,
  flexShrink: 0,
};
