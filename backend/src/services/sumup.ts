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
  merchantCode: string;
  affiliateKey?: string;
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

export interface SumUpReader {
  id: string;
  name: string;
  status: string;
  model: string;
}

// Lista os leitores (readers) pareados na conta SumUp do merchant.
export async function listSumUpReaders(
  apiKey: string,
  merchantCode: string
): Promise<SumUpReader[]> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp list readers failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      name?: string;
      status?: string;
      device?: { model?: string };
    }>;
  };

  return (data.items ?? []).map((r) => ({
    id: r.id,
    name: r.name ?? '',
    status: r.status ?? 'unknown',
    model: r.device?.model ?? '',
  }));
}

// Pareia (vincula) um leitor Solo à conta usando o código de pareamento
// gerado na maquininha (Conexões → API → Conectar).
export async function pairSumUpReader(
  apiKey: string,
  merchantCode: string,
  pairingCode: string,
  name = 'Totem'
): Promise<SumUpReader> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pairing_code: pairingCode, name }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp pair reader failed (${response.status}): ${detail}`);
  }

  const r = (await response.json()) as {
    id: string;
    name?: string;
    status?: string;
    device?: { model?: string };
  };
  return {
    id: r.id,
    name: r.name ?? '',
    status: r.status ?? 'unknown',
    model: r.device?.model ?? '',
  };
}

// Cria um pagamento de cartão no leitor físico SumUp Solo (Cloud API / Readers).
// Retorna o client_transaction_id usado depois para consultar o status.
export async function createSumUpCardPayment({
  apiKey,
  total,
  readerId,
  merchantCode,
  affiliateKey,
}: CreateSumUpCardParams): Promise<{ paymentId: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (affiliateKey) headers['X-Affiliate-Key'] = affiliateKey;

  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(
      merchantCode
    )}/readers/${encodeURIComponent(readerId)}/checkout`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        total_amount: {
          currency: 'BRL',
          minor_unit: 2,
          value: Math.round(total * 100),
        },
        description: 'Fichas Festival',
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `SumUp reader checkout failed (${response.status}): ${detail}`
    );
  }

  const data = (await response.json()) as {
    data?: { client_transaction_id?: string };
  };
  const paymentId = data.data?.client_transaction_id ?? '';

  return { paymentId };
}

// Consulta o status de uma transação do leitor SumUp pelo client_transaction_id.
export async function getSumUpReaderStatus(
  apiKey: string,
  merchantCode: string,
  clientTransactionId: string
): Promise<{ status: PaymentStatus }> {
  const params = new URLSearchParams({
    client_transaction_id: clientTransactionId,
  });
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(
      merchantCode
    )}/transactions?${params.toString()}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  // Enquanto o cliente não passa o cartão, a transação ainda não existe (404).
  if (response.status === 404) {
    return { status: 'pending' };
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SumUp status failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { status?: string };
  const raw = (data.status ?? '').toUpperCase();

  let status: PaymentStatus;
  if (raw === 'SUCCESSFUL' || raw === 'PAID') {
    status = 'approved';
  } else if (raw === 'PENDING' || raw === 'PROCESSING' || raw === '') {
    status = 'pending';
  } else {
    // FAILED, CANCELLED, etc.
    status = 'rejected';
  }

  return { status };
}
