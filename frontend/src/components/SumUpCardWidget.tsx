import { useEffect, useId, useMemo, useRef, useState } from 'react';

type SumUpResponseType = 'sent' | 'success' | 'fail' | string;

type Props = {
  checkoutId: string;
  currency?: string;
  locale?: string;
  onResponse?: (type: SumUpResponseType, body: unknown) => void;
};

declare global {
  interface Window {
    SumUpCard?: {
      mount: (config: {
        id: string;
        checkoutId: string;
        currency?: string;
        locale?: string;
        country?: string;
        showEmail?: boolean;
        showFooter?: boolean;
        showAmount?: boolean;
        onResponse?: (type: string, body: unknown) => void;
      }) => void;
    };
    SumUpCheckout?: {
      mount: (config: {
        id: string;
        checkoutId: string;
        onResponse?: (type: string, body: unknown) => void;
        showLoading?: boolean;
      }) => void;
    };
  }
}

const SUMUP_SDK_SRC = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js';

function loadSumUpScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.SumUpCheckout?.mount || window.SumUpCard?.mount) return resolve();

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SUMUP_SDK_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load SumUp SDK')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = SUMUP_SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load SumUp SDK'));
    document.body.appendChild(script);
  });
}

export function SumUpCardWidget({
  checkoutId,
  currency = 'BRL',
  locale = 'pt-BR',
  onResponse,
}: Props) {
  const reactId = useId();
  const containerId = useMemo(
    () => `sumup-container-${reactId.replace(/[:]/g, '')}`,
    [reactId]
  );
  const onResponseRef = useRef(onResponse);
  onResponseRef.current = onResponse;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    void loadSumUpScript()
      .then(() => {
        if (cancelled) return;
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';

        const handleResponse = (type: string, body: unknown) => {
          onResponseRef.current?.(type, body);
        };

        if (window.SumUpCard?.mount) {
          window.SumUpCard.mount({
            id: containerId,
            checkoutId,
            currency,
            locale,
            country: 'BR',
            showEmail: false,
            showFooter: true,
            showAmount: true,
            onResponse: handleResponse,
          });
        } else if (window.SumUpCheckout?.mount) {
          window.SumUpCheckout.mount({
            id: containerId,
            checkoutId,
            showLoading: true,
            onResponse: handleResponse,
          });
        } else {
          throw new Error('Widget SumUp indisponível');
        }
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar pagamento');
      });

    return () => {
      cancelled = true;
    };
  }, [checkoutId, containerId, currency, locale]);

  if (error) {
    return (
      <p style={{ color: '#FF3D6B', textAlign: 'center' }}>
        Erro no widget SumUp: {error}
      </p>
    );
  }

  return (
    <div>
      {!ready && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Carregando pagamento SumUp...
        </p>
      )}
      <div id={containerId} />
    </div>
  );
}
