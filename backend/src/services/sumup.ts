import type { PaymentStatus } from './mercadopago';

const SUMUP_API_BASE = 'https://api.sumup.com/v0.1';

interface CreateSumUpPixParams {
  apiKey: string;
  total: number;
  tenantId: string;
  payToEmail?: string;
}

export interface SumUpPixResult {
  checkoutId: string;
  pixCode: string;
  qrCodeBase64: string;
}

interface CreateSumUpCardParams {
  apiKey: string;
  total: number;
  readerId: string;
  tenantId: string;
}

// Cria um checkout Pix na SumUp (Cloud API).
export async function createSumUpPixPayment({
  apiKey,
  total,
  tenantId,
  payToEmail = 'conta@sumup.com',
}: CreateSumUpPixParams): Promise<SumUpPixResult> {
  const response = await fetch(`${SUMUP_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      checkout_reference: `${tenantId}-${Date.now()}`,
      amount: total,
      currency: 'BRL',
      description: 'Fichas Festival',
      pay_to_email: payToEmail,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp checkout failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    id: string;
    payment_instruments?: Array<{
      pix?: { qr_code?: string; qr_code_base64?: string };
    }>;
  };

  const pix = data.payment_instruments?.[0]?.pix;

  return {
    checkoutId: data.id,
    pixCode: pix?.qr_code ?? '',
    qrCodeBase64: pix?.qr_code_base64 ?? '',
  };
}

// Consulta o status de um checkout SumUp.
export async function getSumUpPaymentStatus(
  apiKey: string,
  checkoutId: string
): Promise<{ status: PaymentStatus }> {
  const response = await fetch(`${SUMUP_API_BASE}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp status failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { status?: string };

  let status: PaymentStatus;
  if (data.status === 'PAID') {
    status = 'approved';
  } else if (data.status === 'PENDING') {
    status = 'pending';
  } else {
    status = 'rejected';
  }

  return { status };
}

// Cria um pagamento de cartão no leitor físico SumUp (Solo).
export async function createSumUpCardPayment({
  apiKey,
  total,
  readerId,
}: CreateSumUpCardParams): Promise<{ paymentId: string }> {
  const response = await fetch(
    `${SUMUP_API_BASE}/terminal/readers/${readerId}/checkout`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: total,
        currency: 'BRL',
        description: 'Fichas Festival',
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp reader checkout failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { id?: string; data?: { client_transaction_id?: string } };
  const paymentId = data.id ?? data.data?.client_transaction_id ?? '';

  return { paymentId };
}
