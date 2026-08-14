import { useState } from 'react';
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
  total: number;
  gateway?: string;
  checkoutId?: string | null;
  pixCode?: string;
  qrCode?: string;
  summary?: string;
  minimized?: boolean;
  onMinimize: () => void;
  onCancel: () => void;
  onPaid: () => void;
};

export function PixModal({
  total,
  gateway,
  checkoutId,
  pixCode,
  qrCode,
  summary,
  minimized = false,
  onMinimize,
  onCancel,
  onPaid,
}: Props) {
  const [widgetErro, setWidgetErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const useWidget = gateway === 'sumup' && Boolean(checkoutId);

  return (
    <div
      className={`pdv-modal-overlay${minimized ? ' pdv-pix-minimized' : ''}`}
      onClick={minimized ? undefined : onMinimize}
      aria-hidden={minimized}
    >
      <div className="pdv-pix-card" onClick={(e) => e.stopPropagation()}>
        <div className="pdv-pix-head">
          <div>
            <div className="pdv-pix-kicker">Pagamento</div>
            <h2>{useWidget ? 'PIX SumUp' : 'PIX Mercado Pago'}</h2>
          </div>
          <div className="pdv-pix-total">{formatPreco(total)}</div>
        </div>

        {summary ? <p className="pdv-pix-hint">{summary}</p> : null}

        {useWidget && checkoutId ? (
          <div className="pdv-pix-widget">
            <p className="pdv-pix-hint">
              No widget, escolha <strong>PIX</strong>. Depois minimize e continue
              vendendo — o PDV avisa quando pagar.
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

        <p className="pdv-pix-wait">
          Aguardando pagamento. Esc ou minimizar libera o caixa.
        </p>
        <button
          type="button"
          className="pdv-btn pdv-btn-primary"
          onClick={onMinimize}
        >
          Minimizar e continuar vendendo
        </button>
        <button type="button" className="pdv-btn pdv-btn-ghost" onClick={onCancel}>
          Cancelar PIX
        </button>
      </div>
    </div>
  );
}
