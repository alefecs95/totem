import { useCallback, useEffect, useState } from 'react';
import { createPixPayment, getPaymentStatus } from './api';
import { SumUpCardWidget } from './SumUpCardWidget';
import {
  getSumUpFailureMessage,
  isSumUpPaymentConfirmed,
  isSumUpPaymentFailed,
  isSumUpPaymentSent,
} from './sumupResponse';

function formatPreco(preco: number): string {
  return `R$ ${preco.toFixed(2).replace('.', ',')}`;
}

type Props = {
  tenantId: string;
  total: number;
  items: Array<{ productId: string; quantidade: number }>;
  gateway?: string;
  onClose: () => void;
  onPaid: () => void;
};

export function PixModal({
  tenantId,
  total,
  items,
  gateway,
  onClose,
  onPaid,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [widgetErro, setWidgetErro] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [checkoutId, setCheckoutId] = useState('');
  const [useWidget, setUseWidget] = useState(false);
  const [pixCode, setPixCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copiado, setCopiado] = useState(false);

  const iniciar = useCallback(async () => {
    setLoading(true);
    setErro('');
    setWidgetErro('');
    try {
      const res = await createPixPayment({ tenantId, items, total });
      setPaymentId(res.paymentId);
      setCheckoutId(res.checkoutId || res.paymentId);
      setUseWidget(res.gateway === 'sumup');
      setPixCode(res.pixCode || '');
      setQrCode(res.qrCodeBase64 || '');
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string; error?: string } } }
      )?.response?.data;
      setErro(detalhe?.detalhe || detalhe?.error || 'Falha ao criar PIX.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, items, total]);

  useEffect(() => {
    void iniciar();
  }, [iniciar]);

  useEffect(() => {
    if (!paymentId || erro) return;
    const id = window.setInterval(async () => {
      try {
        const { status } = await getPaymentStatus(paymentId);
        if (status === 'approved') onPaid();
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [paymentId, erro, onPaid]);

  return (
    <div className="pdv-modal-overlay" onClick={onClose}>
      <div
        className="pdv-pix-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdv-pix-head">
          <div>
            <div className="pdv-pix-kicker">Pagamento</div>
            <h2>
              {gateway === 'sumup' || useWidget
                ? 'PIX SumUp'
                : 'PIX Mercado Pago'}
            </h2>
          </div>
          <div className="pdv-pix-total">{formatPreco(total)}</div>
        </div>

        {loading ? (
          <p className="pdv-pix-hint">Abrindo cobrança...</p>
        ) : erro ? (
          <div>
            <p className="pdv-pix-error">{erro}</p>
            <button type="button" className="pdv-btn pdv-btn-primary" onClick={() => void iniciar()}>
              Tentar de novo
            </button>
          </div>
        ) : useWidget && checkoutId ? (
          <div className="pdv-pix-widget">
            <p className="pdv-pix-hint">
              No widget, escolha <strong>PIX</strong>. O cliente paga no celular.
            </p>
            <SumUpCardWidget
              checkoutId={checkoutId}
              onResponse={(type, body) => {
                if (isSumUpPaymentSent(type)) return;
                if (isSumUpPaymentFailed(type, body)) {
                  setWidgetErro(getSumUpFailureMessage(body));
                  return;
                }
                if (isSumUpPaymentConfirmed(type, body)) onPaid();
              }}
            />
            {widgetErro && <p className="pdv-pix-error">{widgetErro}</p>}
          </div>
        ) : (
          <div className="pdv-pix-qr">
            {qrCode ? (
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="QR Pix"
                width={240}
                height={240}
              />
            ) : (
              <p className="pdv-pix-hint">QR nao disponivel. Use o codigo.</p>
            )}
            {pixCode ? (
              <button
                type="button"
                className="pdv-btn pdv-btn-ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(pixCode);
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 2000);
                }}
              >
                {copiado ? 'Codigo copiado' : 'Copiar codigo PIX'}
              </button>
            ) : null}
          </div>
        )}

        <p className="pdv-pix-wait">Aguardando pagamento... Esc fecha</p>
        <button type="button" className="pdv-btn pdv-btn-ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
