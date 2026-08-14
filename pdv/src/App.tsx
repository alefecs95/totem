import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  criarVenda,
  createCardPayment,
  getApiBase,
  getCardPaymentStatus,
  cancelCardPayment,
  createPixPayment,
  getPaymentStatus,
  getPdvSales,
  listSumupReaders,
  loadEvento,
  selectSumupReader,
  setApiBase,
  type CardType,
  type PayGateway,
  type PdvConfig,
  type PdvProduct,
  type PdvSale,
  type SumUpReader,
} from './api';
import {
  computeCardSurchargeForCardType,
  formatSurchargePercent,
} from './cardSurcharge';
import {
  countOfflineQueue,
  enqueueOfflineSale,
  flushOfflineQueue,
  type QueuedPdvSale,
} from './offline';
import { expandFichas, renderFichaPage, countDualUnits, type PrintItem } from './printFichas';
import { PixModal } from './PixModal';

type CartLine = PdvProduct & { quantidade: number };

type PendingCard = {
  localId: string;
  intentId: string;
  chargedAmount: number;
  printItems: PrintItem[];
  gateway: PayGateway;
  nomeFestival: string;
  startedAt: number;
  summary: string;
};

type PendingPix = {
  localId: string;
  paymentId: string;
  checkoutId: string | null;
  pixCode: string;
  qrCode: string;
  gateway: PayGateway;
  total: number;
  printItems: PrintItem[];
  nomeFestival: string;
  startedAt: number;
  summary: string;
};

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

function uuid(): string {
  return crypto.randomUUID();
}

function playSaleBeep(dual: boolean): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    };
    beep(880, 0, 0.08);
    if (dual) {
      beep(1175, 0.12, 0.1);
      beep(880, 0.26, 0.08);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* ignore */
  }
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
        boxShadow: primary ? '0 8px 20px rgba(0,0,0,0.28)' : 'none',
        letterSpacing: 0.4,
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
  /** Parte inteira em reais (ex. "100"). */
  const [cashInt, setCashInt] = useState('');
  /** Casas decimais apos a virgula (0-2 digitos). */
  const [cashDec, setCashDec] = useState('');
  /** Se true, digitos vao para as casas decimais. */
  const [cashComma, setCashComma] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [readersOpen, setReadersOpen] = useState(false);
  const [readers, setReaders] = useState<SumUpReader[]>([]);
  const [readersLoading, setReadersLoading] = useState(false);
  const [selectedReaderId, setSelectedReaderId] = useState(
    () => localStorage.getItem('pdvSumupReaderId') || ''
  );
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [gatewayPickerOpen, setGatewayPickerOpen] = useState(false);
  const [pendingPix, setPendingPix] = useState<PendingPix[]>(() => {
    try {
      const raw = sessionStorage.getItem('pdvPendingPix');
      return raw ? (JSON.parse(raw) as PendingPix[]) : [];
    } catch {
      return [];
    }
  });
  const [pixDetailId, setPixDetailId] = useState<string | null>(null);
  const pixDoneRef = useRef(new Set<string>());
  const [salesOpen, setSalesOpen] = useState(false);
  const [sales, setSales] = useState<PdvSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [pendingCards, setPendingCards] = useState<PendingCard[]>(() => {
    try {
      const raw = sessionStorage.getItem('pdvPendingCards');
      return raw ? (JSON.parse(raw) as PendingCard[]) : [];
    } catch {
      return [];
    }
  });
  const [cardDetailId, setCardDetailId] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSync, setPendingSync] = useState(() => countOfflineQueue());
  const [flashId, setFlashId] = useState<string | null>(null);
  const [soDrinks, setSoDrinks] = useState(
    () => localStorage.getItem('pdvSoDrinks') === '1'
  );
  const [saleFlash, setSaleFlash] = useState(false);
  const [lastPrint, setLastPrint] = useState<{
    tickets: import('./printFichas').FichaTicket[];
    nomeFestival: string;
    itens: PrintItem[];
  } | null>(() => {
    try {
      const raw = localStorage.getItem('pdvLastPrint');
      return raw
        ? (JSON.parse(raw) as {
            tickets: import('./printFichas').FichaTicket[];
            nomeFestival: string;
            itens: PrintItem[];
          })
        : null;
    } catch {
      return null;
    }
  });
  const [printers, setPrinters] = useState<
    Array<{ name: string; displayName: string; isDefault: boolean }>
  >([]);
  const [printerName, setPrinterName] = useState(
    () => localStorage.getItem('pdvPrinter') || ''
  );

  const produtosAll = config?.produtos ?? [];
  const produtos = soDrinks
    ? produtosAll.filter((p) => p.ficha_2_vias)
    : produtosAll;
  const productById = useRef<Map<string, PdvProduct>>(new Map());
  useEffect(() => {
    productById.current = new Map(produtosAll.map((p) => [p.id, p]));
  }, [produtosAll]);

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.preco * i.quantidade, 0),
    [cart]
  );
  const totalItems = useMemo(
    () => cart.reduce((s, i) => s + i.quantidade, 0),
    [cart]
  );
  const pendingQty =
    qtyDigits === '' ? 1 : Math.max(1, parseInt(qtyDigits, 10) || 1);
  const canPay = cart.length > 0 && !pagando;
  const pixOk = Boolean(config?.pagamentos?.pix);
  const hasPendingCard = pendingCards.length > 0;
  const hasPendingPix = pendingPix.length > 0;
  const cardDetail = cardDetailId
    ? pendingCards.find((p) => p.localId === cardDetailId) ?? null
    : null;
  const pixDetail = pixDetailId
    ? pendingPix.find((p) => p.localId === pixDetailId) ?? null
    : null;
  const sumupOk = Boolean(config?.pagamentos?.sumup);
  const mpOk = Boolean(config?.pagamentos?.mercadopago);
  const cartaoMaquininha = sumupOk || mpOk || Boolean(config?.pagamentos?.cartao);
  const sumupSurcharge = config?.sumupSurcharge ?? null;
  const needsCardType = Boolean(sumupSurcharge?.enabled);
  const debitPreview =
    cardPickerOpen && needsCardType && sumupSurcharge
      ? computeCardSurchargeForCardType({
          netAmount: total,
          config: sumupSurcharge,
          cardType: 'debit',
        })
      : null;
  const creditPreview =
    cardPickerOpen && needsCardType && sumupSurcharge
      ? computeCardSurchargeForCardType({
          netAmount: total,
          config: sumupSurcharge,
          cardType: 'credit',
        })
      : null;

  const cashRecebido = useMemo(() => {
    const reais = cashInt === '' ? 0 : parseInt(cashInt, 10) || 0;
    if (!cashComma) return reais;
    const dec = (cashDec + '00').slice(0, 2);
    return Math.round((reais + Number(`0.${dec}`)) * 100) / 100;
  }, [cashInt, cashDec, cashComma]);
  const troco = Math.round((cashRecebido - total) * 100) / 100;
  const cashOk = cashRecebido + 0.001 >= total;

  const setCashFromValue = (v: number) => {
    const fixed = Math.max(0, Math.round(v * 100) / 100);
    const [i, d] = fixed.toFixed(2).split('.');
    setCashInt(String(Number(i)));
    setCashDec(d === '00' ? '' : d);
    setCashComma(d !== '00');
  };

  const limparCash = () => {
    setCashInt('');
    setCashDec('');
    setCashComma(false);
  };

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
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('pdvPendingCards', JSON.stringify(pendingCards));
    } catch {
      /* ignore */
    }
  }, [pendingCards]);

  useEffect(() => {
    try {
      sessionStorage.setItem('pdvPendingPix', JSON.stringify(pendingPix));
    } catch {
      /* ignore */
    }
  }, [pendingPix]);

  const reclaimFocus = useCallback(() => {
    void window.pdvDesktop?.focusMainWindow?.();
    const el = shellRef.current;
    if (el) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === 'SELECT' ||
        active.tagName === 'BUTTON' ||
        active.tagName === 'A')
    ) {
      active.blur();
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Recupera foco do teclado apos blur / impressao / clique fora
  useEffect(() => {
    const onFocus = () => reclaimFocus();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reclaimFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const id = window.setInterval(() => {
      if (!document.hasFocus()) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement === shellRef.current) return;
      if (document.activeElement === document.body) reclaimFocus();
    }, 2000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(id);
    };
  }, [reclaimFocus]);

  // Kiosk: esconde cursor apos 5s sem movimento; volta ao mexer
  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      setCursorHidden(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 5000);
    };
    bump();
    window.addEventListener('mousemove', bump);
    window.addEventListener('mousedown', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('touchstart', bump);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('mousedown', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('touchstart', bump);
    };
  }, []);

  // F11 alterna tela cheia
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        void window.pdvDesktop?.toggleFullscreen?.();
        window.setTimeout(() => reclaimFocus(), 200);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reclaimFocus]);

  const syncPending = useCallback(async () => {
    if (!config || !navigator.onLine) {
      setPendingSync(countOfflineQueue());
      return;
    }
    const { synced, remaining } = await flushOfflineQueue(async (sale) => {
      await criarVenda({
        codigo: sale.codigo,
        clientTransactionId: sale.id,
        items: sale.items,
        total: sale.total,
        metodo: sale.metodo,
      });
    });
    setPendingSync(remaining);
    if (synced > 0) setToast(`${synced} venda(s) sincronizada(s)`);
  }, [config]);

  useEffect(() => {
    if (!config || !online) return;
    void syncPending();
    const id = window.setInterval(() => void syncPending(), 12000);
    return () => window.clearInterval(id);
  }, [config, online, syncPending]);

  const add = useCallback(
    (p: PdvProduct, qtd = pendingQty) => {
      const n = Math.max(1, qtd);
      setFlashId(p.id);
      window.setTimeout(() => setFlashId((cur) => (cur === p.id ? null : cur)), 120);
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
    },
    [pendingQty]
  );

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
      localStorage.setItem('pdvConfigCache', JSON.stringify(cfg));
      if (cfg.sumupReaderId) {
        setSelectedReaderId(cfg.sumupReaderId);
        localStorage.setItem('pdvSumupReaderId', cfg.sumupReaderId);
      }
      setToast(`Conectado: ${cfg.nomeFestival}`);
    } catch {
      // Tenta cache local se estiver offline
      try {
        const raw = localStorage.getItem('pdvConfigCache');
        const cached = raw ? (JSON.parse(raw) as PdvConfig) : null;
        if (
          cached &&
          cached.codigo === codigo.trim().toUpperCase().replace(/\s+/g, '')
        ) {
          setConfig(cached);
          setToast(`Offline - usando cache de ${cached.nomeFestival}`);
          return;
        }
      } catch {
        /* ignore */
      }
      setConfig(null);
      setErro('Evento nao encontrado. Confira o codigo e a URL da API.');
    } finally {
      setLoading(false);
    }
  };

  const imprimirFichasBg = (
    itens: PrintItem[],
    nomeFestival: string,
    opts?: { isReprint?: boolean; tickets?: import('./printFichas').FichaTicket[] }
  ) => {
    void (async () => {
      try {
        const tickets = opts?.tickets ?? expandFichas(itens);
        if (tickets.length === 0) {
          if (!opts?.isReprint) setToast('Venda sem fichas para imprimir');
          return;
        }
        const dual =
          tickets.some((t) => t.via === 'barman' || t.via === 'cliente') ||
          countDualUnits(itens) > 0;
        if (!opts?.isReprint) {
          const payload = { tickets, itens, nomeFestival };
          setLastPrint(payload);
          try {
            localStorage.setItem('pdvLastPrint', JSON.stringify(payload));
          } catch {
            /* quota */
          }
          playSaleBeep(dual);
          if (dual) {
            setSaleFlash(true);
            window.setTimeout(() => setSaleFlash(false), 450);
          }
        }
        const pages: Array<{ dataUrl: string; heightMm: number }> = [];
        for (const t of tickets) {
          pages.push(await renderFichaPage(t, nomeFestival));
        }
        localStorage.setItem('pdvPrinter', printerName);
        if (window.pdvDesktop?.printFichasSilent) {
          await window.pdvDesktop.printFichasSilent(pages, printerName);
        }
        reclaimFocus();
        if (opts?.isReprint) setToast('Reimpressao enviada');
      } catch {
        setToast(
          opts?.isReprint
            ? 'Falha na reimpressao'
            : 'Venda ok, mas falhou a impressao - tente de novo'
        );
        reclaimFocus();
      }
    })();
  };

  const reimprimirUltima = () => {
    if (!lastPrint?.tickets?.length) {
      setToast('Nenhuma venda para reimprimir');
      return;
    }
    imprimirFichasBg(lastPrint.itens || [], lastPrint.nomeFestival, {
      isReprint: true,
      tickets: lastPrint.tickets,
    });
  };

  const finalizarManual = async (metodo: 'dinheiro' | 'cartao_fisico') => {
    if (!config || cart.length === 0) return;
    setPagando(metodo);
    setErro('');

    const snapshot = cart.map((i) => ({ ...i }));
    const saleTotal = Math.round(total * 100) / 100;
    const clientId = uuid();
    const printPayload = snapshot.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      imprime_ficha: i.imprime_ficha,
      ficha_2_vias: i.ficha_2_vias,
      ficha_logo_data: i.ficha_logo_data,
    }));

    // UI libera na hora - operador segue vendendo
    limpar();
    setCashOpen(false);
    limparCash();

    const tryOnline = async () => {
      const sale = await criarVenda({
        codigo: config.codigo,
        clientTransactionId: clientId,
        items: snapshot.map((i) => ({
          productId: i.id,
          quantidade: i.quantidade,
        })),
        total: saleTotal,
        metodo,
      });
      imprimirFichasBg(
        sale.itens.map((i) => ({
          nome: i.nome,
          quantidade: i.quantidade,
          imprime_ficha: i.imprime_ficha,
          ficha_2_vias: i.ficha_2_vias,
          ficha_logo_data: i.ficha_logo_data ?? null,
        })),
        sale.nomeFestival || config.nomeFestival
      );
      setToast('Venda registrada!');
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      await tryOnline();
    } catch {
      const queued: QueuedPdvSale = {
        id: clientId,
        codigo: config.codigo,
        items: snapshot.map((i) => ({
          productId: i.id,
          quantidade: i.quantidade,
        })),
        total: saleTotal,
        metodo,
        createdAt: new Date().toISOString(),
        printItems: printPayload,
        nomeFestival: config.nomeFestival,
      };
      enqueueOfflineSale(queued);
      setPendingSync(countOfflineQueue());
      imprimirFichasBg(printPayload, config.nomeFestival);
      setToast('Sem internet - venda salva e fichas impressas');
    } finally {
      setPagando(null);
    }
  };

  const abrirMaquininhas = async () => {
    if (!config) return;
    setReadersOpen(true);
    setReadersLoading(true);
    setErro('');
    try {
      const data = await listSumupReaders(config.codigo);
      setReaders(data.readers);
      if (data.selectedReaderId) {
        setSelectedReaderId(data.selectedReaderId);
        localStorage.setItem('pdvSumupReaderId', data.selectedReaderId);
      }
      if (data.readers.length === 0) {
        setToast('Nenhuma maquininha pareada. Pareie no admin.');
      }
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setErro(detalhe || 'Falha ao buscar maquininhas SumUp.');
    } finally {
      setReadersLoading(false);
    }
  };

  const escolherMaquininha = async (reader: SumUpReader) => {
    if (!config) return;
    try {
      await selectSumupReader(config.codigo, reader.id);
      setSelectedReaderId(reader.id);
      localStorage.setItem('pdvSumupReaderId', reader.id);
      setConfig((c) =>
        c
          ? {
              ...c,
              sumupReaderId: reader.id,
              pagamentos: {
                pix: c.pagamentos?.pix ?? false,
                cartao: true,
              },
            }
          : c
      );
      setToast(`Maquininha: ${reader.name || reader.id}`);
      setReadersOpen(false);
    } catch {
      setErro('Nao foi possivel selecionar a maquininha.');
    }
  };

  const pagarCartaoGateway = async (
    gateway: PayGateway,
    cardType?: CardType
  ) => {
    if (!config || cart.length === 0) return;
    if (pendingCards.length > 0) {
      setErro(
        'Ja ha cartao aguardando na maquininha. Minimize e continue vendendo em dinheiro, ou cancele o pendente na barra inferior.'
      );
      return;
    }
    setPagando('gateway');
    setErro('');
    setCardPickerOpen(false);
    setGatewayPickerOpen(false);
    const snapshot = cart.map((i) => ({ ...i }));
    const netTotal = Math.round(total * 100) / 100;
    const printPayload: PrintItem[] = snapshot.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      imprime_ficha: i.imprime_ficha,
      ficha_2_vias: i.ficha_2_vias,
      ficha_logo_data: i.ficha_logo_data,
    }));
    const summary = snapshot
      .map((i) => `${i.quantidade}x ${i.nome}`)
      .join(', ')
      .slice(0, 80);
    try {
      const payment = await createCardPayment({
        tenantId: config.tenantId,
        items: snapshot.map((i) => ({
          productId: i.id,
          quantidade: i.quantidade,
        })),
        total: netTotal,
        gateway,
        cardType: gateway === 'sumup' ? cardType : undefined,
        readerId:
          gateway === 'sumup'
            ? selectedReaderId || config.sumupReaderId || undefined
            : undefined,
        deviceId:
          gateway === 'mercadopago'
            ? config.mpDeviceId || undefined
            : undefined,
      });
      limpar();
      const pending: PendingCard = {
        localId: uuid(),
        intentId: payment.intentId,
        chargedAmount: payment.chargedAmount ?? netTotal,
        printItems: printPayload,
        gateway,
        nomeFestival: config.nomeFestival,
        startedAt: Date.now(),
        summary,
      };
      setPendingCards((list) => [...list, pending]);
      // Nao bloqueia o PDV — fica na barra (segundo plano)
      setCardDetailId(null);
      setToast(
        `Cartao ${formatPreco(pending.chargedAmount)} na maquininha — continue vendendo`
      );
      reclaimFocus();
    } catch (err: unknown) {
      const data = (
        err as {
          response?: {
            data?: { error?: string; detalhe?: string; message?: string };
          };
        }
      )?.response?.data;
      setErro(
        data?.detalhe ||
          data?.message ||
          data?.error ||
          'Falha ao iniciar cartao na maquininha.'
      );
    } finally {
      setPagando(null);
    }
  };

  const iniciarSumupComTipo = () => {
    if (needsCardType) {
      setGatewayPickerOpen(false);
      setCardPickerOpen(true);
      return;
    }
    void pagarCartaoGateway('sumup');
  };

  const iniciarLeitor = () => {
    if (!canPay) return;
    if (pendingCards.length > 0) {
      setErro(
        'Cartao em andamento. Venda em dinheiro/cartao fisico, ou cancele o pendente.'
      );
      return;
    }
    if (sumupOk && mpOk) {
      setGatewayPickerOpen(true);
      return;
    }
    if (sumupOk) {
      if (!selectedReaderId && !config?.sumupReaderId) {
        setErro('Selecione a maquininha SumUp (botao Maquininha).');
        void abrirMaquininhas();
        return;
      }
      iniciarSumupComTipo();
      return;
    }
    if (mpOk) {
      void pagarCartaoGateway('mercadopago');
      return;
    }
    setErro('Nenhuma maquininha configurada (SumUp ou Mercado Pago).');
    void abrirMaquininhas();
  };

  const abrirHistorico = async () => {
    if (!config) return;
    setSalesOpen(true);
    setSalesLoading(true);
    try {
      setSales(await getPdvSales(config.codigo, 40));
    } catch {
      setErro('Falha ao carregar historico.');
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  };

  const notifyCardApproved = (amount: number) => {
    playSaleBeep(true);
    setSaleFlash(true);
    window.setTimeout(() => setSaleFlash(false), 600);
    setToast(`Cartao APROVADO ${formatPreco(amount)} — fichas imprimindo`);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Totem PDV', {
          body: `Cartao aprovado ${formatPreco(amount)}`,
        });
      } else if (
        typeof Notification !== 'undefined' &&
        Notification.permission !== 'denied'
      ) {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
  };

  const notifyPixApproved = (amount: number) => {
    playSaleBeep(true);
    setSaleFlash(true);
    window.setTimeout(() => setSaleFlash(false), 600);
    setToast(`PIX APROVADO ${formatPreco(amount)} — fichas imprimindo`);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Totem PDV', {
          body: `PIX aprovado ${formatPreco(amount)}`,
        });
      } else if (
        typeof Notification !== 'undefined' &&
        Notification.permission !== 'denied'
      ) {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
  };

  const concluirPixPendente = (item: PendingPix) => {
    if (pixDoneRef.current.has(item.localId)) return;
    pixDoneRef.current.add(item.localId);
    setPendingPix((list) => list.filter((p) => p.localId !== item.localId));
    setPixDetailId((cur) => (cur === item.localId ? null : cur));
    notifyPixApproved(item.total);
    imprimirFichasBg(item.printItems, item.nomeFestival);
    reclaimFocus();
  };

  const cancelarPixPendente = (localId: string) => {
    setPendingPix((list) => list.filter((p) => p.localId !== localId));
    if (pixDetailId === localId) setPixDetailId(null);
    setToast('PIX cancelado no PDV');
    reclaimFocus();
  };

  const cancelarCartaoPendente = async (localId: string) => {
    const item = pendingCards.find((p) => p.localId === localId);
    if (!item || !config) {
      setPendingCards((list) => list.filter((p) => p.localId !== localId));
      setCardDetailId(null);
      return;
    }
    setPendingCards((list) => list.filter((p) => p.localId !== localId));
    if (cardDetailId === localId) setCardDetailId(null);
    setToast('Cancelando na maquininha...');
    try {
      await cancelCardPayment({
        tenantId: config.tenantId,
        intentId: item.intentId,
        readerId:
          item.gateway === 'sumup'
            ? selectedReaderId || config.sumupReaderId || undefined
            : undefined,
        deviceId:
          item.gateway === 'mercadopago'
            ? config.mpDeviceId || undefined
            : undefined,
      });
      setToast('Pagamento cancelado na maquininha');
    } catch {
      setToast(
        'Cancelado no PDV — se a maquininha continuar cobrando, cancele nela tambem'
      );
    }
    reclaimFocus();
  };

  const pendingCardsRef = useRef(pendingCards);
  pendingCardsRef.current = pendingCards;
  const pendingPixRef = useRef(pendingPix);
  pendingPixRef.current = pendingPix;

  useEffect(() => {
    if (!config) return;
    const tenantId = config.tenantId;
    const id = window.setInterval(async () => {
      const cards = [...pendingCardsRef.current];
      for (const pending of cards) {
        try {
          const result = await getCardPaymentStatus(pending.intentId, tenantId);
          if (result.status === 'approved') {
            setPendingCards((list) =>
              list.filter((p) => p.localId !== pending.localId)
            );
            setCardDetailId((cur) =>
              cur === pending.localId ? null : cur
            );
            notifyCardApproved(pending.chargedAmount);
            imprimirFichasBg(pending.printItems, pending.nomeFestival);
            reclaimFocus();
          } else if (
            result.status === 'rejected' ||
            result.status === 'cancelled'
          ) {
            setPendingCards((list) =>
              list.filter((p) => p.localId !== pending.localId)
            );
            setCardDetailId((cur) =>
              cur === pending.localId ? null : cur
            );
            setToast('Cartao recusado / cancelado na maquininha');
            reclaimFocus();
          }
        } catch {
          /* keep polling */
        }
      }

      const pixList = [...pendingPixRef.current];
      for (const pending of pixList) {
        try {
          const { status } = await getPaymentStatus(pending.paymentId);
          if (status === 'approved') {
            concluirPixPendente(pending);
          } else if (status === 'rejected' || status === 'cancelled') {
            setPendingPix((list) =>
              list.filter((p) => p.localId !== pending.localId)
            );
            setPixDetailId((cur) =>
              cur === pending.localId ? null : cur
            );
            setToast('PIX recusado / expirado');
            reclaimFocus();
          }
        } catch {
          /* keep polling */
        }
      }
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.tenantId]);

  const abrirDinheiro = () => {
    if (!canPay) return;
    limparCash();
    setCashOpen(true);
    setErro('');
  };

  const abrirPix = async () => {
    if (!canPay || !config) return;
    setPagando('pix');
    setErro('');
    const snapshot = cart.map((i) => ({ ...i }));
    const netTotal = Math.round(total * 100) / 100;
    const printPayload: PrintItem[] = snapshot.map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      imprime_ficha: i.imprime_ficha,
      ficha_2_vias: i.ficha_2_vias,
      ficha_logo_data: i.ficha_logo_data,
    }));
    const summary = snapshot
      .map((i) => `${i.quantidade}x ${i.nome}`)
      .join(', ')
      .slice(0, 80);
    try {
      const res = await createPixPayment({
        tenantId: config.tenantId,
        items: snapshot.map((i) => ({
          productId: i.id,
          quantidade: i.quantidade,
        })),
        total: netTotal,
      });
      limpar();
      const pending: PendingPix = {
        localId: uuid(),
        paymentId: res.paymentId,
        checkoutId: res.checkoutId || res.paymentId,
        pixCode: res.pixCode || '',
        qrCode: res.qrCodeBase64 || '',
        gateway: res.gateway === 'sumup' ? 'sumup' : 'mercadopago',
        total: netTotal,
        printItems: printPayload,
        nomeFestival: config.nomeFestival,
        startedAt: Date.now(),
        summary,
      };
      setPendingPix((list) => [...list, pending]);
      setPixDetailId(pending.localId);
      setToast(
        `PIX ${formatPreco(netTotal)} aberto — minimize e continue vendendo`
      );
    } catch (err: unknown) {
      const data = (
        err as {
          response?: { data?: { detalhe?: string; error?: string } };
        }
      )?.response?.data;
      setErro(data?.detalhe || data?.error || 'Falha ao criar PIX.');
    } finally {
      setPagando(null);
    }
  };

  useEffect(() => {
    if (!config) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (tag === 'SELECT') {
        (e.target as HTMLElement).blur();
        reclaimFocus();
      }

      if (pixDetail) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPixDetailId(null);
          reclaimFocus();
        }
        return;
      }

      if (cardDetail) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setCardDetailId(null);
          reclaimFocus();
        }
        return;
      }

      if (cashOpen) {
        if (e.key >= '0' && e.key <= '9') {
          e.preventDefault();
          if (cashComma) {
            setCashDec((d) => (d + e.key).slice(0, 2));
          } else {
            setCashInt((d) => (d + e.key).replace(/^0+(?=\d)/, '').slice(0, 6));
          }
        } else if (e.key === ',' || e.key === '.') {
          e.preventDefault();
          setCashComma(true);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (cashComma) {
            if (cashDec) setCashDec((d) => d.slice(0, -1));
            else setCashComma(false);
          } else {
            setCashInt((d) => d.slice(0, -1));
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (cashOk) void finalizarManual('dinheiro');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setCashOpen(false);
          reclaimFocus();
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
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (pixOk) void abrirPix();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (canPay) void finalizarManual('cartao_fisico');
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        iniciarLeitor();
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        void abrirHistorico();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reimprimirUltima();
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSoDrinks((v) => {
          const next = !v;
          localStorage.setItem('pdvSoDrinks', next ? '1' : '0');
          return next;
        });
      } else if (/^F[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key.slice(1)) - 1;
        if (produtos[idx]) add(produtos[idx]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!config) {
    return (
      <div style={{ ...shell, cursor: cursorHidden ? 'none' : 'default' }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
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
              <div>
                <strong style={{ fontSize: 18 }}>Totem Festival</strong>
                <div style={{ fontSize: 13, color: '#a8a29e', marginTop: 2 }}>
                  Caixa do evento
                </div>
              </div>
            </div>
            <p style={{ margin: '4px 0 0', color: '#a8a29e', fontSize: 13, lineHeight: 1.45 }}>
              Digite o codigo do festival para carregar produtos e maquininhas.
            </p>
            <label style={labelDark}>
              Codigo do evento
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="FESTA3K9"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && void entrar()}
                style={inputDark}
              />
            </label>
            <label style={labelDark}>
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
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <p style={{ margin: 0, fontSize: 12, color: '#a8a29e', lineHeight: 1.4 }}>
              Sem internet: depois de entrar, as vendas continuam (ficam na fila e
              sincronizam quando a rede voltar).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      style={{ ...shell, cursor: cursorHidden ? 'none' : 'default', outline: 'none' }}
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          window.setTimeout(() => reclaimFocus(), 0);
        }
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        @media (max-width: 800px) {
          .pdv-body { grid-template-columns: 1fr !important; }
          .pdv-sidebar { border-left: none !important; border-top: 2px solid #ea580c !important; }
        }
        .pdv-product:active { transform: scale(0.97); }
      `}</style>

      <header style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={pdvBadge}>PDV</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>
              VENDA RAPIDA
            </div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{config.nomeFestival}</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            ...syncBadge,
            background: online ? '#dcfce7' : '#fee2e2',
            color: online ? '#166534' : '#991b1b',
          }}
        >
          {online ? 'Online' : 'Offline'}
          {pendingSync > 0 ? ` | ${pendingSync} pend.` : ''}
        </span>
        <select
          value={printerName}
          onChange={(e) => {
            setPrinterName(e.target.value);
            localStorage.setItem('pdvPrinter', e.target.value);
            e.currentTarget.blur();
            reclaimFocus();
          }}
          style={{ ...hdrBtn, maxWidth: 180 }}
          title="Impressora"
        >
          <option value="">Impressora padrao</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void abrirHistorico()}
          style={hdrBtn}
          title="Historico de vendas (H)"
        >
          Historico
        </button>
        <button
          type="button"
          onClick={() => void abrirMaquininhas()}
          style={{
            ...hdrBtn,
            background: selectedReaderId ? '#dcfce7' : '#fff',
            maxWidth: 160,
          }}
          title="Escolher maquininha SumUp"
        >
          Maquininha
        </button>
        <button
          type="button"
          onClick={() => {
            setSoDrinks((v) => {
              const next = !v;
              localStorage.setItem('pdvSoDrinks', next ? '1' : '0');
              return next;
            });
          }}
          style={{
            ...hdrBtn,
            background: soDrinks ? '#ea580c' : '#fff',
            color: soDrinks ? '#fff' : '#9a3412',
            borderColor: soDrinks ? '#c2410c' : '#fed7aa',
          }}
          title="Filtrar so drinks 2 vias (B)"
        >
          {soDrinks ? 'Drinks' : 'Todos'}
        </button>
        <button
          type="button"
          onClick={reimprimirUltima}
          style={hdrBtn}
          disabled={!lastPrint}
          title="Reimprimir ultima venda (R)"
        >
          Reimprimir
        </button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} style={hdrBtn}>
          Atalhos
        </button>
        <button type="button" onClick={limpar} style={hdrBtn} disabled={cart.length === 0}>
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
          <span>0-9 quantidade</span>
          <span>F1-F9 produto</span>
          <span>D/Enter dinheiro</span>
          <span>P PIX SumUp</span>
          <span>F cartao fisico</span>
          <span>L leitor (SumUp/MP)</span>
          <span>H historico</span>
          <span>B filtro drinks</span>
          <span>R reimprimir</span>
          <span>F11 tela cheia</span>
          <span>Esc limpa</span>
          <span>Codigo: {config.codigo}</span>
        </div>
      )}

      {saleFlash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(234,88,12,0.28)',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
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
                x{n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQtyDigits('')}
              style={{ ...qtyChip, background: '#44403c' }}
            >
              x1
            </button>
          </div>

          {produtos.length === 0 ? (
            <div style={{ color: '#a8a29e', padding: 40, textAlign: 'center' }}>
              {soDrinks
                ? 'Nenhum produto 2 vias. Desligue o filtro Drinks ou marque 2 vias no admin.'
                : 'Nenhum produto ativo neste evento.'}
            </div>
          ) : (
            <div style={productGrid}>
              {produtos.map((p, idx) => {
                const atalho = idx < 9 ? `F${idx + 1}` : null;
                const qtd = cart.find((c) => c.id === p.id)?.quantidade ?? 0;
                const flashed = flashId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="pdv-product"
                    onClick={() => add(p)}
                    style={{
                      ...productBtn,
                      borderColor: p.cor,
                      background: flashed
                        ? 'rgba(234,88,12,0.35)'
                        : qtd > 0
                          ? 'rgba(234,88,12,0.15)'
                          : '#1c1917',
                      transition: 'background 0.12s, transform 0.08s',
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
                    {(p.imprime_ficha || p.ficha_2_vias) && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#a8a29e',
                          letterSpacing: 0.5,
                        }}
                      >
                        {p.ficha_2_vias ? '2 VIAS' : 'FICHA'}
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
                ou use F1-F9
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
                    -
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
            {pixOk && (
              <PayBtn
                label="PIX"
                hint={
                  config.gateway === 'sumup' ? 'P · SumUp' : 'P · Mercado Pago'
                }
                color="#0f766e"
                disabled={!canPay}
                loading={pagando === 'pix'}
                onClick={() => void abrirPix()}
                primary
              />
            )}
            <PayBtn
              label="DINHEIRO"
              hint="D / Enter"
              color="#16a34a"
              disabled={!canPay}
              loading={pagando === 'dinheiro'}
              onClick={abrirDinheiro}
              primary={!pixOk}
            />
            <PayBtn
              label="CARTAO FISICO"
              hint="F"
              color="#2563eb"
              disabled={!canPay}
              loading={pagando === 'cartao_fisico'}
              onClick={() => void finalizarManual('cartao_fisico')}
            />
            {(cartaoMaquininha || config.gateway === 'sumup') && (
              <PayBtn
                label="LEITOR"
                hint="L"
                color="#1d4ed8"
                disabled={!canPay}
                loading={pagando === 'gateway'}
                onClick={iniciarLeitor}
              />
            )}
          </div>
        </aside>
      </div>

      {pendingPix.map((p) => (
        <PixModal
          key={p.localId}
          total={p.total}
          gateway={p.gateway}
          checkoutId={p.checkoutId}
          pixCode={p.pixCode}
          qrCode={p.qrCode}
          summary={p.summary}
          minimized={pixDetailId !== p.localId}
          onMinimize={() => {
            setPixDetailId(null);
            reclaimFocus();
          }}
          onCancel={() => cancelarPixPendente(p.localId)}
          onPaid={() => concluirPixPendente(p)}
        />
      ))}

      {toast && <div style={toastStyle}>{toast}</div>}

      {readersOpen && (
        <div style={modalOverlay} onClick={() => setReadersOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
              Escolher maquininha SumUp
            </div>
            <p style={{ margin: '8px 0 0', color: '#a8a29e', fontSize: 13 }}>
              Clique na maquina para usar neste PDV.
            </p>
            {readersLoading ? (
              <p style={{ color: '#a8a29e', marginTop: 16 }}>Buscando...</p>
            ) : readers.length === 0 ? (
              <p style={{ color: '#fca5a5', marginTop: 16 }}>
                Nenhuma maquininha. Pareie no admin primeiro.
              </p>
            ) : (
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 360,
                  overflow: 'auto',
                }}
              >
                {readers.map((r) => {
                  const selected = selectedReaderId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void escolherMaquininha(r)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: selected
                          ? '2px solid #16a34a'
                          : '1px solid #57534e',
                        background: selected ? '#14532d' : '#292524',
                        color: '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {r.name || r.id}
                        {selected ? ' (selecionada)' : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 4 }}>
                        {r.id}
                        {r.deviceStatus != null
                          ? ` | aparelho ${r.deviceStatus}`
                          : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={() => setReadersOpen(false)}
              style={{
                marginTop: 16,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1px solid #57534e',
                background: 'transparent',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {gatewayPickerOpen && (
        <div style={modalOverlay} onClick={() => setGatewayPickerOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Passar cartao em</div>
            <p style={{ color: '#a8a29e', fontSize: 13, marginTop: 6 }}>
              Escolha a maquininha desta venda
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {sumupOk && (
                <button
                  type="button"
                  disabled={!!pagando}
                  onClick={iniciarSumupComTipo}
                  style={{
                    padding: 18,
                    borderRadius: 10,
                    border: 'none',
                    background: '#0f766e',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  SUMUP
                </button>
              )}
              {mpOk && (
                <button
                  type="button"
                  disabled={!!pagando}
                  onClick={() => void pagarCartaoGateway('mercadopago')}
                  style={{
                    padding: 18,
                    borderRadius: 10,
                    border: 'none',
                    background: '#009ee3',
                    color: '#fff',
                    fontWeight: 900,
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  MERCADO PAGO
                </button>
              )}
              <button
                type="button"
                onClick={() => setGatewayPickerOpen(false)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #57534e',
                  background: 'transparent',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {salesOpen && (
        <div style={modalOverlay} onClick={() => setSalesOpen(false)}>
          <div
            style={{ ...modalCard, width: 'min(520px, 96vw)', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18 }}>Historimas vendas</div>
              <button
                type="button"
                onClick={() => void abrirHistorico()}
                style={{ ...hdrBtn, padding: '6px 10px' }}
              >
                Atualizar
              </button>
            </div>
            <div
              style={{
                marginTop: 12,
                overflow: 'auto',
                maxHeight: '60vh',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {salesLoading ? (
                <p style={{ color: '#a8a29e' }}>Carregando...</p>
              ) : sales.length === 0 ? (
                <p style={{ color: '#a8a29e' }}>Nenhuma venda ainda.</p>
              ) : (
                sales.map((s) => {
                  const itens = Array.isArray(s.itens)
                    ? (s.itens as Array<{ nome?: string; quantidade?: number }>)
                    : [];
                  const resumo = itens
                    .map((i) => `${i.quantidade ?? 1}x ${i.nome ?? '?'}`)
                    .join(', ');
                  const when = new Date(s.criado_em).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: '#292524',
                        border: '1px solid #44403c',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <strong style={{ color: '#ea580c' }}>
                          {formatPreco(s.valor_bruto)}
                        </strong>
                        <span style={{ fontSize: 12, color: '#a8a29e' }}>{when}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#d6d3d1', marginTop: 4 }}>
                        {s.metodo}
                        {s.gateway ? ` · ${s.gateway}` : ''}
                      </div>
                      {resumo && (
                        <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 2 }}>
                          {resumo}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => setSalesOpen(false)}
              style={{
                marginTop: 14,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1px solid #57534e',
                background: 'transparent',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {cardPickerOpen && debitPreview && creditPreview && sumupSurcharge && (
        <div style={modalOverlay} onClick={() => setCardPickerOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Tipo de cartao</div>
            <p style={{ color: '#a8a29e', fontSize: 13, marginTop: 6 }}>
              Total base {formatPreco(total)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                disabled={!!pagando}
                onClick={() => void pagarCartaoGateway('sumup', 'debit')}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                DEBITO — {formatPreco(debitPreview.grossAmount)}
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>
                  taxa {formatSurchargePercent(sumupSurcharge.debitPercent)}
                </div>
              </button>
              <button
                type="button"
                disabled={!!pagando}
                onClick={() => void pagarCartaoGateway('sumup', 'credit')}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: 'none',
                  background: '#1d4ed8',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                CREDITO — {formatPreco(creditPreview.grossAmount)}
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>
                  taxa {formatSurchargePercent(sumupSurcharge.creditPercent)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCardPickerOpen(false)}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #57534e',
                  background: 'transparent',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {(hasPendingCard || hasPendingPix) && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 90,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {pendingPix.map((p) => (
            <div
              key={p.localId}
              style={{
                background: '#1c1917',
                border: '2px solid #22c55e',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{ fontSize: 22 }}>📱</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>
                  PIX aguardando · {formatPreco(p.total)}
                </div>
                <div
                  style={{
                    color: '#a8a29e',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.summary || p.gateway} — minimize e continue vendendo
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPixDetailId(p.localId)}
                style={{ ...hdrBtn, padding: '8px 10px' }}
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => cancelarPixPendente(p.localId)}
                style={{
                  ...hdrBtn,
                  padding: '8px 10px',
                  borderColor: '#7f1d1d',
                  color: '#fecaca',
                }}
              >
                Cancelar
              </button>
            </div>
          ))}
          {pendingCards.map((p) => (
            <div
              key={p.localId}
              style={{
                background: '#1c1917',
                border: '2px solid #ea580c',
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{ fontSize: 22 }}>💳</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>
                  Cartao aguardando · {formatPreco(p.chargedAmount)}
                </div>
                <div
                  style={{
                    color: '#a8a29e',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.summary || p.gateway} — passe na maquininha
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCardDetailId(p.localId)}
                style={{ ...hdrBtn, padding: '8px 10px' }}
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => void cancelarCartaoPendente(p.localId)}
                style={{
                  ...hdrBtn,
                  padding: '8px 10px',
                  borderColor: '#7f1d1d',
                  color: '#fecaca',
                }}
              >
                Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      {cardDetail && (
        <div style={modalOverlay}>
          <div style={{ ...modalCard, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>💳</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginTop: 8 }}>
              Passe o cartao na maquininha
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 40,
                color: '#ea580c',
                marginTop: 8,
              }}
            >
              {formatPreco(cardDetail.chargedAmount)}
            </div>
            <p style={{ color: '#a8a29e', marginTop: 8 }}>
              {cardDetail.summary}
            </p>
            <p style={{ color: '#a8a29e', marginTop: 4, fontSize: 13 }}>
              O PDV continua livre — minimize e venda em dinheiro enquanto aguarda.
            </p>
            <button
              type="button"
              onClick={() => {
                setCardDetailId(null);
                reclaimFocus();
              }}
              style={{
                marginTop: 16,
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: '#ea580c',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Minimizar e continuar vendendo
            </button>
            <button
              type="button"
              onClick={() => void cancelarCartaoPendente(cardDetail.localId)}
              style={{
                marginTop: 10,
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: '1px solid #57534e',
                background: 'transparent',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar na maquininha
            </button>
          </div>
        </div>
      )}

      {cashOpen && (
        <div style={modalOverlay} onClick={() => setCashOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#a8a29e' }}>
              DINHEIRO
            </div>
            <div style={{ marginTop: 4, color: '#d6d3d1', fontSize: 14 }}>
              Total:{' '}
              <strong style={{ color: '#ea580c' }}>{formatPreco(total)}</strong>
            </div>
            <div style={{ marginTop: 18, color: '#a8a29e', fontSize: 13 }}>
              Valor recebido — digite 100 = R$ 100,00 | virgula para centavos
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
                outline: cashComma ? '2px solid #ea580c' : 'none',
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
                  onClick={() => setCashFromValue(v)}
                >
                  {formatPreco(v)}
                </button>
              ))}
              <button
                type="button"
                style={{ ...cashChip, background: '#44403c' }}
                onClick={limparCash}
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

const labelDark: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#a8a29e',
};

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
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  background: 'linear-gradient(90deg, #c2410c, #ea580c)',
  flexWrap: 'wrap',
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

const syncBadge: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
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
