import { useEffect, useMemo, useState } from 'react';
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

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function uuid(): string {
  return crypto.randomUUID();
}

export default function App() {
  const [codigo, setCodigo] = useState(
    () => localStorage.getItem('pdvCodigo') || ''
  );
  const [apiUrl, setApiUrl] = useState(getApiBase());
  const [config, setConfig] = useState<PdvConfig | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);
  const [erro, setErro] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [metodo, setMetodo] = useState<'dinheiro' | 'cartao_fisico'>('dinheiro');
  const [printers, setPrinters] = useState<
    Array<{ name: string; displayName: string; isDefault: boolean }>
  >([]);
  const [printerName, setPrinterName] = useState(
    () => localStorage.getItem('pdvPrinter') || ''
  );

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.preco * i.quantidade, 0),
    [cart]
  );

  useEffect(() => {
    void window.pdvDesktop?.listPrinters().then((list) => {
      setPrinters(list);
      if (!printerName) {
        const def = list.find((p) => p.isDefault) || list[0];
        if (def) setPrinterName(def.name);
      }
    });
  }, []);

  const entrar = async () => {
    setErro('');
    setOkMsg('');
    setLoading(true);
    try {
      setApiBase(apiUrl);
      const cfg = await loadEvento(codigo);
      setConfig(cfg);
      localStorage.setItem('pdvCodigo', cfg.codigo);
      setOkMsg(`Conectado: ${cfg.nomeFestival}`);
    } catch {
      setConfig(null);
      setErro('Evento não encontrado. Confira o código e a URL da API.');
    } finally {
      setLoading(false);
    }
  };

  const add = (p: PdvProduct) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) {
        return prev.map((i) =>
          i.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i
        );
      }
      return [...prev, { ...p, quantidade: 1 }];
    });
  };

  const dec = (id: string) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i
        )
        .filter((i) => i.quantidade > 0)
    );
  };

  const limpar = () => setCart([]);

  const finalizar = async () => {
    if (!config || cart.length === 0) return;
    setSelling(true);
    setErro('');
    setOkMsg('');
    try {
      localStorage.setItem('pdvPrinter', printerName);
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

      const tickets = expandFichas(
        sale.itens.map((i) => ({
          nome: i.nome,
          quantidade: i.quantidade,
          imprime_ficha: i.imprime_ficha,
          ficha_logo_data: i.ficha_logo_data ?? null,
        }))
      );

      if (tickets.length > 0) {
        const pages: string[] = [];
        for (const t of tickets) {
          pages.push(
            await renderFichaBitmap(t, sale.nomeFestival || config.nomeFestival)
          );
        }

        if (window.pdvDesktop?.printFichasSilent) {
          await window.pdvDesktop.printFichasSilent(pages, printerName);
          setOkMsg(
            `Venda OK · ${tickets.length} ficha(s) enviada(s) à impressora`
          );
        } else {
          // Fallback browser (dev no Vite sem Electron)
          for (const page of pages) {
            const w = window.open('');
            if (!w) continue;
            w.document.write(
              `<img src="${page}" style="width:80mm;height:35mm" />`
            );
            w.document.close();
            w.print();
            w.close();
          }
          setOkMsg(`Venda OK · ${tickets.length} ficha(s) (preview browser)`);
        }
      } else {
        setOkMsg('Venda registrada (nenhum produto com ficha).');
      }

      limpar();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })
          ?.response?.data?.message ||
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        'Falha ao registrar venda / imprimir';
      setErro(String(msg));
    } finally {
      setSelling(false);
    }
  };

  if (!config) {
    return (
      <div className="login">
        <div className="card">
          <h1>Totem PDV</h1>
          <p className="muted">Digite o código do evento para começar</p>
          <label>
            Código do evento
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="FESTA3K9"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
            />
          </label>
          <label>
            URL da API
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://sua-api/api"
            />
          </label>
          {erro && <div className="erro">{erro}</div>}
          <button disabled={loading || !codigo.trim()} onClick={() => void entrar()}>
            {loading ? 'Entrando…' : 'Entrar no evento'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pdv">
      <header className="top">
        <div>
          <strong>{config.nomeFestival}</strong>
          <span className="badge">{config.codigo}</span>
        </div>
        <div className="top-right">
          <label className="printer">
            Impressora
            <select
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            >
              <option value="">Padrão do Windows</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName || p.name}
                  {p.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ghost"
            onClick={() => {
              setConfig(null);
              setCart([]);
            }}
          >
            Trocar evento
          </button>
        </div>
      </header>

      <div className="body">
        <section className="products">
          {config.produtos.map((p) => (
            <button
              key={p.id}
              className="product"
              style={{ borderColor: p.cor }}
              onClick={() => add(p)}
            >
              <span className="emoji">{p.emoji}</span>
              <span className="name">{p.nome}</span>
              <span className="price">{formatBRL(p.preco)}</span>
              {p.imprime_ficha && <span className="tag">Ficha</span>}
            </button>
          ))}
        </section>

        <aside className="cart">
          <h2>Carrinho</h2>
          {cart.length === 0 ? (
            <p className="muted">Toque nos produtos para adicionar</p>
          ) : (
            <ul>
              {cart.map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>
                      {i.emoji} {i.nome}
                    </strong>
                    <div className="muted">
                      {formatBRL(i.preco)} × {i.quantidade}
                    </div>
                  </div>
                  <div className="qty">
                    <button onClick={() => dec(i.id)}>−</button>
                    <span>{i.quantidade}</span>
                    <button onClick={() => add(i)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="total">
            <span>Total</span>
            <strong>{formatBRL(total)}</strong>
          </div>

          <div className="metodos">
            <label>
              <input
                type="radio"
                checked={metodo === 'dinheiro'}
                onChange={() => setMetodo('dinheiro')}
              />
              Dinheiro
            </label>
            <label>
              <input
                type="radio"
                checked={metodo === 'cartao_fisico'}
                onChange={() => setMetodo('cartao_fisico')}
              />
              Cartão (maquininha)
            </label>
          </div>

          {erro && <div className="erro">{erro}</div>}
          {okMsg && <div className="ok">{okMsg}</div>}

          <button
            className="pay"
            disabled={selling || cart.length === 0}
            onClick={() => void finalizar()}
          >
            {selling ? 'Processando…' : 'Finalizar e imprimir fichas'}
          </button>
          <button className="ghost" disabled={cart.length === 0} onClick={limpar}>
            Limpar
          </button>
        </aside>
      </div>
    </div>
  );
}
