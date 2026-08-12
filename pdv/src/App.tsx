import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  criarVenda,
  getApiBase,
  loadEvento,
  setApiBase,
  type PdvConfig,
  type PdvProduct,
} from './api';
import { expandFichas, renderFichaBitmap } from './printFichas';

type CartLine = PdvProduct & { quantidade: number };

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

function uuid(): string {
  return crypto.randomUUID();
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

export default function App() {
  const [codigo, setCodigo] = useState(
    () => localStorage.getItem('pdvCodigo') || ''
  );
  const [apiUrl, setApiUrl] = useState(getApiBase());
  const [config, setConfig] = useState<PdvConfig | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagando, setPagando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [qtyDigits, setQtyDigits] = useState('');
  const [cashOpen, setCashOpen] = useState(false);
  const [cashDigits, setCashDigits] = useState('');
  const [printers, setPrinters] = useState<
    Array<{ name: string; displayName: string; isDefault: boolean }>
  >([]);
  const [printerName, setPrinterName] = useState(
    () => localStorage.getItem('pdvPrinter') || ''
  );

  const produtos = config?.produtos ?? [];
  const total = useMemo(
    () => cart.reduce((s, i) => s + i.preco * i.quantidade, 0),
    [cart]
  );
  const totalItems = useMemo(
    () => cart.reduce((s, i) => s + i.quantidade, 0),
    [cart]
  );
  const pendingQty = qtyDigits === '' ? 1 : Math.max(1, parseInt(qtyDigits, 10) || 1);
  const canPay = cart.length > 0 && !pagando;

  const cashCentavos = cashDigits === '' ? 0 : parseInt(cashDigits, 10) || 0;
  const cashRecebido = cashCentavos / 100;
  const troco = Math.round((cashRecebido - total) * 100) / 100;
  const cashOk = cashRecebido + 0.001 >= total;

  useEffect(() => {
    void window.pdvDesktop?.listPrinters().then((list) => {
      setPrinters(list);
      if (!printerName) {
        const def = list.find((p) => p.isDefault) || list[0];
        if (def) setPrinterName(def.name);
      }
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const add = useCallback((p: PdvProduct, qtd = pendingQty) => {
    const n = Math.max(1, qtd);
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) {
        return prev.map((i) =>
          i.id === p.id ? { ...i, quantidade: i.quantidade + n } : i
        );
      }
      return [...prev, { ...p, quantidade: n }];
    });
    setQtyDigits('');
  }, [pendingQty]);

  const setQty = (id: string, quantidade: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantidade } : i))
        .filter((i) => i.quantidade > 0)
    );
  };

  const limpar = () => {
    setCart([]);
    setQtyDigits('');
    setErro('');
  };

  const entrar = async () => {
    setErro('');
    setLoading(true);
    try {
      setApiBase(apiUrl);
      const cfg = await loadEvento(codigo);
      setConfig(cfg);
      localStorage.setItem('pdvCodigo', cfg.codigo);
      setToast(`Conectado: ${cfg.nomeFestival}`);
    } catch {
      setConfig(null);
      setErro('Evento nÃ£o encontrado. Confira o cÃ³digo e a URL da API.');
    } finally {
      setLoading(false);
    }
  };

  const imprimirFichas = async (
    itens: Array<{
      nome: string;
      quantidade: number;
      imprime_ficha?: boolean;
      ficha_logo_data?: string | null;
    }>,
    nomeFestival: string
  ) => {
    const tickets = expandFichas(itens);
    if (tickets.length === 0) return;
    const pages: string[] = [];
    for (const t of tickets) {
      pages.push(await renderFichaBitmap(t, nomeFestival));
    }
    localStorage.setItem('pdvPrinter', printerName);
    if (window.pdvDesktop?.printFichasSilent) {
      await window.pdvDesktop.printFichasSilent(pages, printerName);
    }
  };

  const finalizarManual = async (metodo: 'dinheiro' | 'cartao_fisico') => {
    if (!config || cart.length === 0) return;
    setPagando(metodo);
    setErro('');
    try {
      const sale = await criarVenda({
        codigo: config.codigo,
        clientTransactionId: uuid(),
        items: cart.map((i) => ({
          productId: i.id,
          quantidade: i.quantidade,
        })),
        total: Math.round(total * 100) / 100,
        metodo,
      });
      await imprimirFichas(
        sale.itens.map((i) => ({
          nome: i.nome,
          quantidade: i.quantidade,
          imprime_ficha: i.imprime_ficha,
          ficha_logo_data: i.ficha_logo_data ?? null,
        })),
        sale.nomeFestival || config.nomeFestival
      );
      limpar();
      setCashOpen(false);
      setCashDigits('');
      setToast('Venda registrada!');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.message ||
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        'Falha ao registrar venda';
      setErro(String(msg));
    } finally {
      setPagando(null);
    }
  };

  const abrirDinheiro = () => {
    if (!canPay) return;
    setCashDigits('');
    setCashOpen(true);
    setErro('');
  };

  // Atalhos iguais ao site
  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => {
      if (cashOpen) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          setCashDigits((d) => (d + e.key).slice(0, 8));
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          setCashDigits((d) => d.slice(0, -1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (cashOk) void finalizarManual('dinheiro');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setCashOpen(false);
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setQtyDigits((d) => (d + e.key).slice(0, 4));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (qtyDigits) setQtyDigits((d) => d.slice(0, -1));
        else if (cart.length > 0) {
          const last = cart[cart.length - 1];
          setQty(last.id, last.quantidade - 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (qtyDigits) setQtyDigits('');
        else limpar();
      } else if (e.key === 'Enter' || e.key.toLowerCase() === 'd') {
        e.preventDefault();
        abrirDinheiro();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (canPay) void finalizarManual('cartao_fisico');
      } else if (/^F[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key.slice(1)) - 1;
        if (produtos[idx]) add(produtos[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!config) {
    return (
      <div style={shell}>
        <div
          style={{
            flex: 1,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: 'min(420px, 100%)',
              background: '#1c1917',
              border: '2px solid #ea580c',
              borderRadius: 16,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={pdvBadge}>PDV</span>
              <strong>Entrar no evento</strong>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#a8a29e' }}>
              CÃ³digo do evento
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="FESTA3K9"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && void entrar()}
                style={inputDark}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#a8a29e' }}>
              URL da API
              <input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                style={inputDark}
              />
            </label>
            {erro && <div style={erroBox}>{erro}</div>}
            <button
              type="button"
              disabled={loading || !codigo.trim()}
              onClick={() => void entrar()}
              style={{
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: '#ea580c',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                opacity: loading || !codigo.trim() ? 0.5 : 1,
              }}
            >
              {loading ? 'Entrandoâ€¦' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        @media (max-width: 800px) {
          .pdv-body { grid-template-columns: 1fr !important; }
          .pdv-sidebar { border-left: none !important; border-top: 2px solid #ea580c !important; }
        }
      `}</style>

      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={pdvBadge}>PDV</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              VENDA RÃPIDA
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{config.nomeFestival}</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
          style={{
            ...hdrBtn,
            maxWidth: 200,
            appearance: 'auto' as const,
          }}
          title="Impressora"
        >
          <option value="">Impressora padrÃ£o</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowHelp((v) => !v)} style={hdrBtn}>
          Atalhos
        </button>
        <button
          type="button"
          onClick={limpar}
          style={hdrBtn}
          disabled={cart.length === 0}
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => {
            setConfig(null);
            limpar();
          }}
          style={hdrBtn}
        >
          Sair
        </button>
      </header>

      {showHelp && (
        <div style={helpBar}>
          <span>0â€“9 quantidade</span>
          <span>F1â€“F9 produto</span>
          <span>D/Enter dinheiro</span>
          <span>F cartÃ£o fÃ­sico</span>
          <span>Esc limpa</span>
          <span>CÃ³digo: {config.codigo}</span>
        </div>
      )}

      <div className="pdv-body" style={body}>
        <main style={gridArea}>
          <div style={qtyBar}>
            <div style={qtyDisplay}>
              <span style={{ fontSize: 12, color: '#a8a29e', fontWeight: 700 }}>
                QTD
              </span>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 32,
                  color: '#ea580c',
                  lineHeight: 1,
                }}
              >
                {pendingQty}
              </span>
            </div>
            {[2, 5, 10, 20, 50].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQtyDigits(String(n))}
                style={{
                  ...qtyChip,
                  background: pendingQty === n ? '#ea580c' : '#292524',
                }}
              >
                Ã—{n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQtyDigits('')}
              style={{ ...qtyChip, background: '#44403c' }}
            >
              Ã—1
            </button>
          </div>

          {produtos.length === 0 ? (
            <div style={{ color: '#a8a29e', padding: 40, textAlign: 'center' }}>
              Nenhum produto ativo neste evento.
            </div>
          ) : (
            <div style={productGrid}>
              {produtos.map((p, idx) => {
                const atalho = idx < 9 ? `F${idx + 1}` : null;
                const qtd = cart.find((c) => c.id === p.id)?.quantidade ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => add(p)}
                    style={{
                      ...productBtn,
                      borderColor: p.cor,
                      background:
                        qtd > 0 ? 'rgba(234,88,12,0.15)' : '#1c1917',
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
                    {p.imprime_ficha && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#a8a29e',
                          letterSpacing: 0.5,
                        }}
                      >
                        FICHA
                      </span>
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
            {cart.length === 0 ? (
              <div style={emptyCart}>
                Toque nos produtos
                <br />
                ou use F1â€“F9
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} style={cartRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {item.emoji} {item.nome}
                    </div>
                    <div style={{ color: '#a8a29e', fontSize: 12 }}>
                      {formatPreco(item.preco)}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={qtyBtn}
                    onClick={() => setQty(item.id, item.quantidade - 1)}
                  >
                    âˆ’
                  </button>
                  <strong style={{ minWidth: 32, textAlign: 'center', fontSize: 16 }}>
                    {item.quantidade}
                  </strong>
                  <button
                    type="button"
                    style={qtyBtn}
                    onClick={() => setQty(item.id, item.quantidade + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    style={{ ...qtyBtn, width: 40, fontSize: 12 }}
                    onClick={() => setQty(item.id, item.quantidade + 5)}
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    style={{ ...qtyBtn, width: 44, fontSize: 12 }}
                    onClick={() => setQty(item.id, item.quantidade + 10)}
                  >
                    +10
                  </button>
                  <div
                    style={{
                      minWidth: 72,
                      textAlign: 'right',
                      fontWeight: 800,
                      color: '#ea580c',
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
              label="CARTÃƒO FÃSICO"
              hint="F"
              color="#2563eb"
              disabled={!canPay}
              loading={pagando === 'cartao_fisico'}
              onClick={() => void finalizarManual('cartao_fisico')}
            />
          </div>
        </aside>
      </div>

      {toast && <div style={toastStyle}>{toast}</div>}

      {cashOpen && (
        <div
          style={modalOverlay}
          onClick={() => setCashOpen(false)}
        >
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#a8a29e' }}>
              DINHEIRO
            </div>
            <div style={{ marginTop: 4, color: '#d6d3d1', fontSize: 14 }}>
              Total: <strong style={{ color: '#ea580c' }}>{formatPreco(total)}</strong>
            </div>
            <div style={{ marginTop: 18, color: '#a8a29e', fontSize: 13 }}>
              Valor recebido
            </div>
            <div
              style={{
                marginTop: 6,
                background: '#0c0a09',
                borderRadius: 10,
                padding: '14px 16px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 40,
                color: '#fff',
                letterSpacing: 1,
              }}
            >
              {formatPreco(cashRecebido)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {[total, 10, 20, 50, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  style={cashChip}
                  onClick={() =>
                    setCashDigits(String(Math.round(v * 100)))
                  }
                >
                  {formatPreco(v)}
                </button>
              ))}
              <button
                type="button"
                style={{ ...cashChip, background: '#44403c' }}
                onClick={() => setCashDigits('')}
              >
                Limpar
              </button>
            </div>
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: cashOk ? '#14532d' : '#44403c',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>Troco</span>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 32,
                  color: cashOk ? '#86efac' : '#a8a29e',
                }}
              >
                {formatPreco(Math.max(0, troco))}
              </span>
            </div>
            {erro && <div style={{ ...erroBox, marginTop: 10 }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setCashOpen(false)}
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
                Voltar
              </button>
              <button
                type="button"
                disabled={!cashOk || !!pagando}
                onClick={() => void finalizarManual('dinheiro')}
                style={{
                  flex: 1.4,
                  padding: 14,
                  borderRadius: 10,
                  border: 'none',
                  background: cashOk ? '#16a34a' : '#44403c',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: cashOk ? 'pointer' : 'default',
                  opacity: cashOk ? 1 : 0.5,
                }}
              >
                {pagando === 'dinheiro' ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputDark: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #44403c',
  background: '#0c0a09',
  color: '#fff',
  fontSize: 16,
};

const shell: CSSProperties = {
  minHeight: '100vh',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#0c0a09',
  color: '#fff',
  overflow: 'hidden',
};

const header: CSSProperties = {
  background: 'linear-gradient(90deg, #c2410c, #ea580c)',
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const pdvBadge: CSSProperties = {
  background: '#fff',
  color: '#c2410c',
  fontWeight: 900,
  fontSize: 13,
  padding: '6px 10px',
  borderRadius: 6,
  letterSpacing: 1,
};

const hdrBtn: CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: 'none',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 13,
};

const helpBar: CSSProperties = {
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

const body: CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '1fr minmax(300px, 380px)',
  minHeight: 0,
};

const gridArea: CSSProperties = {
  padding: 12,
  overflowY: 'auto',
  minHeight: 0,
};

const qtyBar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
};

const qtyDisplay: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1c1917',
  borderRadius: 10,
  padding: '6px 14px',
  minWidth: 72,
};

const qtyChip: CSSProperties = {
  border: 'none',
  color: '#fff',
  fontWeight: 800,
  fontSize: 16,
  padding: '12px 14px',
  borderRadius: 10,
  cursor: 'pointer',
  minWidth: 52,
};

const productGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 10,
  alignContent: 'start',
};

const productBtn: CSSProperties = {
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

const keyBadge: CSSProperties = {
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

const qtyBadge: CSSProperties = {
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

const productName: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.2,
};

const productPrice: CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 26,
  lineHeight: 1,
};

const sidebar: CSSProperties = {
  background: '#1c1917',
  borderLeft: '2px solid #ea580c',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  padding: 12,
};

const sideTitle: CSSProperties = {
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: 1,
  color: '#a8a29e',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const cartList: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const emptyCart: CSSProperties = {
  color: '#78716c',
  fontSize: 14,
  textAlign: 'center',
  padding: '32px 12px',
  lineHeight: 1.5,
};

const cartRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#292524',
  borderRadius: 10,
  padding: '10px 8px',
};

const totalBlock: CSSProperties = {
  borderTop: '1px solid #44403c',
  paddingTop: 12,
  marginTop: 10,
  marginBottom: 10,
};

const totalValue: CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 44,
  color: '#ea580c',
  lineHeight: 1,
};

const erroBox: CSSProperties = {
  color: '#fecaca',
  background: '#7f1d1d',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  marginBottom: 8,
  textAlign: 'center',
};

const payGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const toastStyle: CSSProperties = {
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

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 300,
  padding: 16,
};

const modalCard: CSSProperties = {
  background: '#1c1917',
  borderRadius: 16,
  padding: 22,
  width: '100%',
  maxWidth: 420,
  border: '2px solid #ea580c',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
};

const cashChip: CSSProperties = {
  border: 'none',
  background: '#292524',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};

const qtyBtn: CSSProperties = {
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
