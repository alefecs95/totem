import { MercadoPagoConfig, Payment } from 'mercadopago';

export interface PixItem {
  nome: string;
  quantidade: number;
  preco: number;
}

interface CreatePixParams {
  accessToken: string;
  total: number;
  items: PixItem[];
  tenantId: string;
  webhookUrl?: string;
}

export interface CreatePixResult {
  paymentId: string;
  pixCode: string;
  qrCodeBase64: string;
  expiresIn: number;
}

export type PaymentStatus = 'approved' | 'pending' | 'rejected';

const MP_API_BASE = 'https://api.mercadopago.com';

interface CreateCardParams {
  accessToken: string;
  total: number;
  deviceId: string;
  items: PixItem[];
  tenantId: string;
  transactionId: string;
  webhookUrl?: string;
}

// Cria uma intenção de pagamento no Point Smart (cartão débito/crédito).
export async function createCardPayment({
  accessToken,
  total,
  deviceId,
  transactionId,
}: CreateCardParams): Promise<{ intentId: string }> {
  const response = await fetch(
    `${MP_API_BASE}/point/integration-api/devices/${deviceId}/payment-intents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-test-scope': 'sandbox',
      },
      body: JSON.stringify({
        amount: Math.round(total * 100),
        description: 'Fichas Festival',
        additional_info: {
          external_reference: transactionId,
          print_on_terminal: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Point intent failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { id: string };
  return { intentId: data.id };
}

// Consulta o status de uma intenção de pagamento do Point.
export async function getCardPaymentStatus({
  accessToken,
  intentId,
}: {
  accessToken: string;
  deviceId?: string;
  intentId: string;
}): Promise<{ status: PaymentStatus }> {
  const response = await fetch(
    `${MP_API_BASE}/point/integration-api/payment-intents/${intentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Point status failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { state?: string; status?: string };
  const raw = data.state ?? data.status;

  let status: PaymentStatus;
  if (raw === 'FINISHED') {
    status = 'approved';
  } else if (raw === 'CANCELED' || raw === 'ERROR') {
    status = 'rejected';
  } else {
    status = 'pending';
  }

  return { status };
}

// Cria uma cobrança Pix usando o access token do próprio tenant.
export async function createPixPayment({
  accessToken,
  total,
  tenantId,
  webhookUrl,
}: CreatePixParams): Promise<CreatePixResult> {
  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);

  const result = await payment.create({
    body: {
      transaction_amount: total,
      description: 'Fichas Festival',
      payment_method_id: 'pix',
      date_of_expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      payer: { email: 'cliente@festival.com' },
      notification_url: webhookUrl,
      metadata: { tenant_id: tenantId },
    },
  });

  const transactionData = result.point_of_interaction?.transaction_data;

  return {
    paymentId: String(result.id),
    pixCode: transactionData?.qr_code ?? '',
    qrCodeBase64: transactionData?.qr_code_base64 ?? '',
    expiresIn: 300,
  };
}

// ---------------------------------------------------------------------------
// Lojas (stores) e Caixas (POS) — pré-requisito do Point Smart em modo integrado.
// Docs: POST /users/{user_id}/stores e POST /pos
// ---------------------------------------------------------------------------

export interface MpStoreLocation {
  street_name?: string;
  street_number?: string;
  city_name: string;
  state_name: string;
  latitude: number;
  longitude: number;
  reference?: string;
}

// Resolve o user_id da conta dona do access token (necessário para criar lojas).
export async function getMpUserId(accessToken: string): Promise<string> {
  const response = await fetch(`${MP_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MP users/me failed (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as { id: number | string };
  return String(data.id);
}

// Cria uma loja (store) na conta do tenant.
export async function createMpStore({
  accessToken,
  userId,
  name,
  externalId,
  location,
}: {
  accessToken: string;
  userId: string;
  name: string;
  externalId: string;
  location: MpStoreLocation;
}): Promise<{ storeId: string }> {
  // O MP exige street_name (e costuma exigir street_number) mesmo com lat/long.
  const payload = {
    name,
    external_id: externalId,
    location: {
      street_name: location.street_name?.trim() || 'Local do evento',
      street_number: location.street_number?.trim() || 'S/N',
      city_name: location.city_name,
      state_name: location.state_name,
      latitude: location.latitude,
      longitude: location.longitude,
      ...(location.reference ? { reference: location.reference } : {}),
    },
  };

  const response = await fetch(`${MP_API_BASE}/users/${userId}/stores`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MP create store failed (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as { id: number | string };
  return { storeId: String(data.id) };
}

// Cria um caixa (POS) e associa a uma loja. Cada Point Smart em modo PDV
// precisa de um caixa próprio.
export async function createMpPos({
  accessToken,
  name,
  storeId,
  externalStoreId,
  externalId,
  category,
}: {
  accessToken: string;
  name: string;
  storeId: string;
  externalStoreId?: string;
  externalId: string;
  category: number;
}): Promise<{ posId: string; externalId: string }> {
  const response = await fetch(`${MP_API_BASE}/pos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      store_id: storeId,
      external_store_id: externalStoreId,
      external_id: externalId,
      category,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`MP create POS failed (${response.status}): ${detail}`);
  }
  const data = (await response.json()) as {
    id: number | string;
    external_id: string;
  };
  return { posId: String(data.id), externalId: data.external_id };
}

// Consulta o status de um pagamento e normaliza para o nosso domínio.
export async function getPaymentStatus(
  accessToken: string,
  paymentId: string
): Promise<{ status: PaymentStatus }> {
  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);

  const result = await payment.get({ id: paymentId });
  const raw = result.status;

  let status: PaymentStatus;
  if (raw === 'approved') {
    status = 'approved';
  } else if (raw === 'pending' || raw === 'in_process') {
    status = 'pending';
  } else {
    status = 'rejected';
  }

  return { status };
}
