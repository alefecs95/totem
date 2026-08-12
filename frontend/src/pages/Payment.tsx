import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createCardPayment } from '../services/api';
import { useCartStore, type CartItem } from '../store/cartStore';
import {
  computeCardSurchargeForCardType,
  formatSurchargePercent,
  isSumupGateway,
  readSumupSurchargeConfig,
  type CardType,
} from '../utils/cardSurcharge';

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

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [cardPickerOpen, setCardPickerOpen] = useState(false);

  const sumupSurcharge = readSumupSurchargeConfig();
  const needsCardType =
    isSumupGateway() && Boolean(sumupSurcharge?.enabled);
  const debitPreview = needsCardType
    ? computeCardSurchargeForCardType({
        netAmount: total,
        config: sumupSurcharge,
        cardType: 'debit',
      })
    : null;
  const creditPreview = needsCardType
    ? computeCardSurchargeForCardType({
        netAmount: total,
        config: sumupSurcharge,
        cardType: 'credit',
      })
    : null;

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

  const mensagemErroPagamento = (code?: string): string => {
    switch (code) {
      case 'missing_access_token':
        return 'Mercado Pago não configurado. Preencha o Access Token no admin.';
      case 'missing_device_id':
        return 'Maquininha não configurada. Preencha o Device ID no admin.';
      case 'invalid_device_id':
        return 'Device ID inválido. Use "Buscar maquininhas" no admin.';
      case 'queued_intent':
        return 'Pagamento anterior ainda na maquininha. Cancele na Point e tente de novo.';
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

  const pagarPix = () => {
    setErro('');
    navigate('/pix', { state: { items, total } });
  };

  const pagarCartao = async (cardType?: CardType) => {
    setErro('');
    const tenantId = localStorage.getItem('tenantId');
    if (!tenantId) {
      setErro('Totem não configurado. Escaneie o QR Code novamente.');
      return;
    }

    setLoading(true);
    setCardPickerOpen(false);
    try {
      const payment = await createCardPayment(items, total, tenantId, cardType);
      navigate('/card', {
        state: {
          items,
          total,
          chargedAmount: payment.chargedAmount ?? total,
          intentId: payment.intentId,
          transactionId: payment.transactionId,
        },
      });
    } catch (err: unknown) {
      const data = (
        err as { response?: { data?: { error?: string; detalhe?: string } } }
      )?.response?.data;
      const base = mensagemErroPagamento(data?.error);
      setErro(data?.detalhe ? `${base}\n\n${data.detalhe}` : base);
      console.error('Falha ao ativar a maquininha:', err);
      setLoading(false);
    }
  };

  const iniciarCartao = () => {
    if (needsCardType) {
      setCardPickerOpen(true);
      return;
    }
    void pagarCartao();
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
          Enviando para a maquininha...
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 120 }}>
      <header style={{ padding: '24px 16px 8px', textAlign: 'center' }}>
        <button
          onClick={() => navigate('/cart')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          ← Alterar pedido
        </button>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 40,
            letterSpacing: 1,
          }}
        >
          Toque para pagar
        </h1>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 36,
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
        {pagamentos.pix && (
          <button
            onClick={pagarPix}
            className="card"
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              minHeight: 140,
            }}
          >
            <span style={{ fontSize: 48 }}>⚡</span>
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
              Toque aqui — QR Code na hora
            </span>
          </button>
        )}

        {pagamentos.cartao && (
          <button
            onClick={iniciarCartao}
            className="card"
            style={{
              textAlign: 'center',
              cursor: 'pointer',
              border: '2px solid transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              minHeight: 140,
            }}
          >
            <span style={{ fontSize: 48 }}>💳</span>
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
              Toque aqui — passe na maquininha
            </span>
          </button>
        )}

        {!pagamentos.pix && !pagamentos.cartao && (
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              background: 'rgba(220, 38, 38, 0.15)',
              color: '#fca5a5',
              textAlign: 'center',
              fontSize: 15,
            }}
          >
            Nenhum método de pagamento configurado. Avise o organizador.
          </div>
        )}
      </main>

      {cardPickerOpen && debitPreview && creditPreview && sumupSurcharge && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg-card, #1e293b)',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <h2
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                margin: '0 0 8px',
                textAlign: 'center',
              }}
            >
              Tipo de cartão
            </h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 14,
                margin: '0 0 16px',
              }}
            >
              Venda {formatPreco(total)} — escolha débito ou crédito na Solo.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void pagarCartao('debit')}
                style={{ minHeight: 72 }}
              >
                DÉBITO — {formatPreco(debitPreview.grossAmount)}
                {debitPreview.surchargeAmount > 0 && (
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.85 }}>
                    +{formatPreco(debitPreview.surchargeAmount)} taxa (
                    {formatSurchargePercent(sumupSurcharge.debitPercent)})
                  </span>
                )}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void pagarCartao('credit')}
                style={{ minHeight: 72, background: AZUL }}
              >
                CRÉDITO — {formatPreco(creditPreview.grossAmount)}
                {creditPreview.surchargeAmount > 0 && (
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.85 }}>
                    +{formatPreco(creditPreview.surchargeAmount)} taxa (
                    {formatSurchargePercent(sumupSurcharge.creditPercent)})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCardPickerOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #64748b',
                  color: '#94a3b8',
                  padding: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <footer
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            background: 'var(--bg)',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(220, 38, 38, 0.15)',
              color: '#fca5a5',
              fontSize: 14,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {erro}
          </div>
        </footer>
      )}
    </div>
  );
}
