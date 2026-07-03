import { randomUUID } from 'crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { normalizeBrazilStateName } from '../utils/brazil-states';

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

// Formato oficial do terminal Point (ex.: NEWLAND_N950__N950NCB801293324).
export function isValidMpDeviceId(deviceId: string | null | undefined): boolean {
  if (!deviceId?.trim()) return false;
  return /^[A-Z0-9_]+__[A-Z0-9]+$/i.test(deviceId.trim());
}

export interface MpTerminal {
  id: string;
  posId: number | null;
  storeId: string | null;
  operatingMode: string;
}

// Endpoint novo (/terminals/v1/list) — só alguns modelos.
async function listFromTerminalsApi(
  accessToken: string,
  filters?: { storeId?: string; posId?: string }
): Promise<MpTerminal[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (filters?.storeId) params.set('store_id', filters.storeId);
  if (filters?.posId) params.set('pos_id', filters.posId);

  const response = await fetch(
    `${MP_API_BASE}/terminals/v1/list?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) return [];

  const body = (await response.json()) as {
    data?: {
      terminals?: Array<{
        id: string;
        pos_id?: number;
        store_id?: string;
        operating_mode?: string;
      }>;
    };
  };

  return (body.data?.terminals ?? []).map((t) => ({
    id: t.id,
    posId: t.pos_id ?? null,
    storeId: t.store_id ?? null,
    operatingMode: t.operating_mode ?? 'UNDEFINED',
  }));
}

// Endpoint clássico do Point (/point/integration-api/devices) — Point Smart etc.
async function listFromPointDevicesApi(
  accessToken: string
): Promise<MpTerminal[]> {
  const response = await fetch(
    `${MP_API_BASE}/point/integration-api/devices`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) return [];

  const body = (await response.json()) as {
    devices?: Array<{ id: string; operating_mode?: string; pos_id?: number }>;
  };

  return (body.devices ?? []).map((d) => ({
    id: d.id,
    posId: d.pos_id ?? null,
    storeId: null,
    operatingMode: d.operating_mode ?? 'UNDEFINED',
  }));
}

// Lista maquininhas Point vinculadas à conta, combinando os dois endpoints
// (modelos novos via /terminals e Point Smart via /point/integration-api/devices).
export async function listMpTerminals(
  accessToken: string,
  filters?: { storeId?: string; posId?: string }
): Promise<MpTerminal[]> {
  const [terminals, devices] = await Promise.all([
    listFromTerminalsApi(accessToken, filters),
    listFromPointDevicesApi(accessToken),
  ]);

  const map = new Map<string, MpTerminal>();
  for (const t of [...terminals, ...devices]) {
    if (!map.has(t.id)) map.set(t.id, t);
  }
  return Array.from(map.values());
}

// Coloca a maquininha em modo PDV (integrado) para receber cobranças do totem.
// Sem isso, o Point fica em STANDALONE e ignora as intenções de pagamento.
export async function setTerminalOperatingMode(
  accessToken: string,
  deviceId: string,
  operatingMode: 'PDV' | 'STANDALONE' = 'PDV'
): Promise<{ ok: boolean; detail?: string; mode?: string }> {
  // Tenta primeiro o endpoint novo (/terminals/v1/setup).
  const newApi = await fetch(`${MP_API_BASE}/terminals/v1/setup`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      terminals: [{ id: deviceId, operating_mode: operatingMode }],
    }),
  });
  if (newApi.ok) {
    return { ok: true, mode: operatingMode };
  }

  // Fallback: endpoint clássico do Point (/point/integration-api/devices/{id}).
  const legacy = await fetch(
    `${MP_API_BASE}/point/integration-api/devices/${encodeURIComponent(deviceId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operating_mode: operatingMode }),
    }
  );
  if (legacy.ok) {
    return { ok: true, mode: operatingMode };
  }

  const detail = await legacy.text();
  return { ok: false, detail };
}

interface CreateCardParams {
  accessToken: string;
  total: number;
  deviceId: string;
  items: PixItem[];
  tenantId: string;
  transactionId: string;
  webhookUrl?: string;
}

// IDs da API de Orders começam com "ORD"; os antigos (payment-intents) são UUID.
function isOrderId(id: string): boolean {
  return id.startsWith('ORD');
}

// Cancela uma cobrança (Order ou payment-intent legado) presa na maquininha.
export async function cancelCardPaymentIntent(
  accessToken: string,
  deviceId: string,
  intentId: string
): Promise<boolean> {
  if (isOrderId(intentId)) {
    const response = await fetch(
      `${MP_API_BASE}/v1/orders/${encodeURIComponent(intentId)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': randomUUID(),
          'x-allow-cancelable-status': 'at_terminal',
        },
      }
    );
    return response.ok;
  }

  const response = await fetch(
    `${MP_API_BASE}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return response.ok;
}

// Cria uma Order do Point (API nova, recomendada pelo Mercado Pago).
async function postCardOrder(
  accessToken: string,
  deviceId: string,
  total: number,
  transactionId: string
): Promise<Response> {
  return fetch(`${MP_API_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      type: 'point',
      external_reference: transactionId,
      description: 'Fichas Festival',
      config: {
        point: {
          terminal_id: deviceId,
          print_on_terminal: 'no_ticket',
        },
      },
      transactions: {
        payments: [{ amount: total.toFixed(2) }],
      },
    }),
  });
}

async function postCardPaymentIntent(
  accessToken: string,
  deviceId: string,
  total: number,
  transactionId: string,
  sandbox: boolean
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (sandbox) headers['x-test-scope'] = 'sandbox';

  return fetch(
    `${MP_API_BASE}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`,
    {
      method: 'POST',
      headers,
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
}

// Cria a cobrança no Point Smart (cartão débito/crédito).
// Usa a API de Orders (nova) e cai para payment-intents (legada) se falhar.
export async function createCardPayment({
  accessToken,
  total,
  deviceId,
  transactionId,
  sandbox = false,
  pendingIntentIds = [],
}: CreateCardParams & {
  sandbox?: boolean;
  pendingIntentIds?: string[];
}): Promise<{ intentId: string }> {
  // Limpa cobranças antigas presas na fila do dispositivo.
  for (const intentId of pendingIntentIds) {
    try {
      await cancelCardPaymentIntent(accessToken, deviceId, intentId);
    } catch {
      // best-effort
    }
  }

  // 1) Tenta a API de Orders (recomendada).
  let orderResp = await postCardOrder(
    accessToken,
    deviceId,
    total,
    transactionId
  );

  // 409 = já há uma order na fila da maquininha — cancela e tenta de novo.
  if (orderResp.status === 409 && pendingIntentIds.length > 0) {
    for (const intentId of pendingIntentIds) {
      try {
        await cancelCardPaymentIntent(accessToken, deviceId, intentId);
      } catch {
        // best-effort
      }
    }
    orderResp = await postCardOrder(accessToken, deviceId, total, transactionId);
  }

  if (orderResp.ok) {
    const data = (await orderResp.json()) as { id: string };
    return { intentId: data.id };
  }

  const orderDetail = await orderResp.text();
  console.warn(
    `Orders API falhou (${orderResp.status}): ${orderDetail}. Tentando payment-intents legado.`
  );

  // 2) Fallback: API legada de payment-intents.
  let response = await postCardPaymentIntent(
    accessToken,
    deviceId,
    total,
    transactionId,
    sandbox
  );

  if (response.status === 409 && pendingIntentIds.length > 0) {
    for (const intentId of pendingIntentIds) {
      await cancelCardPaymentIntent(accessToken, deviceId, intentId);
    }
    response = await postCardPaymentIntent(
      accessToken,
      deviceId,
      total,
      transactionId,
      sandbox
    );
  }

  if (!response.ok) {
    const detail = await response.text();
    // Propaga o erro mais informativo (Orders costuma ser mais claro).
    throw new Error(
      `Point charge failed. Orders(${orderResp.status}): ${orderDetail} | Intent(${response.status}): ${detail}`
    );
  }

  const data = (await response.json()) as { id: string };
  return { intentId: data.id };
}

// Consulta o status de uma Order do Point (API nova). Status self-contained.
async function getCardOrderStatus(
  accessToken: string,
  orderId: string
): Promise<{ status: PaymentStatus; mpPaymentId?: string }> {
  const response = await fetch(
    `${MP_API_BASE}/v1/orders/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Order status failed (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    status?: string;
    status_detail?: string;
    transactions?: {
      payments?: Array<{ reference_id?: string; status?: string }>;
    };
  };
  const raw = (data.status ?? '').toLowerCase();
  const mpPaymentId = data.transactions?.payments?.[0]?.reference_id;

  // Diagnóstico: mostra o estado real da Order (created = aparelho ainda não puxou).
  console.log(
    `Order ${orderId} status=${data.status ?? '?'} detail=${
      data.status_detail ?? '?'
    } payment=${data.transactions?.payments?.[0]?.status ?? '-'}`
  );

  let status: PaymentStatus;
  if (raw === 'processed') {
    status = 'approved';
  } else if (
    raw === 'failed' ||
    raw === 'canceled' ||
    raw === 'expired' ||
    raw === 'refunded'
  ) {
    status = 'rejected';
  } else {
    // created, at_terminal, action_required → ainda aguardando.
    status = 'pending';
  }

  return { status, mpPaymentId };
}

// Consulta o status de uma cobrança do Point (Order nova ou intent legado).
export async function getCardPaymentStatus({
  accessToken,
  intentId,
}: {
  accessToken: string;
  deviceId?: string;
  intentId: string;
}): Promise<{ status: PaymentStatus; mpPaymentId?: string }> {
  if (isOrderId(intentId)) {
    return getCardOrderStatus(accessToken, intentId);
  }

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

  const data = (await response.json()) as {
    state?: string;
    status?: string;
    payment?: { id?: number | string; state?: string; status?: string };
  };
  const raw = (data.state ?? data.status ?? '').toUpperCase();

  let status: PaymentStatus;
  let mpPaymentId: string | undefined;
  if (raw === 'FINISHED') {
    // FINISHED só indica fim do fluxo na Point — o resultado real está em payment.
    const paymentState = (
      data.payment?.state ??
      data.payment?.status ??
      ''
    ).toLowerCase();
    if (data.payment?.id != null) {
      mpPaymentId = String(data.payment.id);
    }
    if (paymentState === 'approved') {
      status = 'approved';
    } else if (
      paymentState === 'rejected' ||
      paymentState === 'cancelled' ||
      paymentState === 'refunded'
    ) {
      status = 'rejected';
    } else if (data.payment?.id != null) {
      const resolved = await getPaymentStatus(
        accessToken,
        String(data.payment.id)
      );
      status = resolved.status;
    } else {
      status = 'pending';
    }
  } else if (
    raw === 'CANCELED' ||
    raw === 'ERROR' ||
    raw === 'ABANDONED'
  ) {
    status = 'rejected';
  } else {
    status = 'pending';
  }

  return { status, mpPaymentId };
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
      state_name: normalizeBrazilStateName(location.state_name),
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

// external_id do POS aceita só letras e números (sem hífens/espaços).
function sanitizeExternalId(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40) || 'POS';
}

async function postMpPos(
  accessToken: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${MP_API_BASE}/pos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
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
  const cleanExternalId = sanitizeExternalId(externalId);
  const cleanExternalStoreId = externalStoreId
    ? sanitizeExternalId(externalStoreId)
    : undefined;

  const baseBody: Record<string, unknown> = {
    name,
    store_id: storeId,
    external_id: cleanExternalId,
    ...(cleanExternalStoreId
      ? { external_store_id: cleanExternalStoreId }
      : {}),
  };

  // 1) Tenta com a categoria informada.
  let response = await postMpPos(accessToken, {
    ...baseBody,
    category,
  });

  // Se o MCC não for válido para o país, cria sem categoria (fica genérica).
  if (!response.ok) {
    const detail = await response.text();
    if (detail.includes('pos_unknown_mcc') || detail.includes('INVALID_CATEGORY')) {
      response = await postMpPos(accessToken, baseBody);
    } else {
      throw new Error(`MP create POS failed (${response.status}): ${detail}`);
    }
  }

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
