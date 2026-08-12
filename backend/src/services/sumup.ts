import type { PaymentStatus } from './mercadopago';
import {
  normalizeCardSurchargeConfig,
  type CardSurchargeConfig,
} from '../utils/cardSurcharge';

const SUMUP_API_BASE =
  process.env.SUMUP_API_BASE ?? 'https://api.sumup.com/v0.1';
const SUMUP_TRANSACTIONS_API_BASE =
  process.env.SUMUP_TRANSACTIONS_API_BASE ?? 'https://api.sumup.com/v2.1';

type JsonBody = Record<string, unknown> & {
  message?: string;
  errors?: unknown;
  raw?: string;
  data?: unknown;
};

async function parseSumUpResponse(response: Response): Promise<JsonBody> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as JsonBody;
  } catch {
    return { raw: text };
  }
}

function formatSumUpError(status: number, body: JsonBody): string {
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  const errors = body.errors;
  if (errors != null) {
    if (typeof errors === 'object' && errors !== null && 'detail' in errors) {
      return String((errors as { detail: unknown }).detail);
    }
    return JSON.stringify(errors);
  }
  if (typeof body.raw === 'string' && body.raw.trim()) return body.raw;
  return JSON.stringify(body);
}

/** Mensagens amigáveis para erros comuns da Cloud API Solo. */
export function mapSumUpReaderCheckoutError(status: number, body: JsonBody): string {
  const raw = formatSumUpError(status, body);
  const lower = raw.toLowerCase();

  if (
    lower.includes('virtual-solo') &&
    lower.includes('non-sandbox')
  ) {
    return 'Código de pareamento do Virtual Solo (sandbox) não funciona em conta de produção. Use credenciais de teste (sk_test_) ou pareie um Solo físico com app deslogado.';
  }
  if (lower.includes('cannot pair virtual-solo')) {
    return 'Virtual Solo só funciona com conta sandbox (API Key sk_test_). Em produção, use Solo física: deslogue do app, Wi‑Fi only, código em Conexões → API.';
  }
  if (lower.includes('no pairing for code')) {
    return 'Código de pareamento inválido ou expirado. Gere um novo na Solo (Conexões → API → Conectar).';
  }
  if (lower.includes('device is offline') || lower.includes('reader is offline')) {
    return 'Maquininha OFFLINE. Solo na tela API, tomada, Wi‑Fi estável, firmware ≥ 3.3.39. Status "paired" ≠ online — use "Verificar leitores" no admin.';
  }
  if (lower.includes('busy') || lower.includes('already in progress')) {
    return 'Maquininha ocupada. Cancele a cobrança na Solo ou aguarde e tente de novo.';
  }
  if (status === 401 || status === 403) {
    return 'Credenciais SumUp inválidas (API Key / Affiliate App ID / Affiliate Key).';
  }

  return `SumUp (${status}): ${raw}`;
}

export class SumUpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'SumUpError';
  }
}

/** Campos SumUp gravados no tenant (admin) — única fonte de credenciais. */
export type TenantSumUpFields = {
  sumup_api_key?: string | null;
  sumup_merchant_code?: string | null;
  sumup_affiliate_app_id?: string | null;
  sumup_affiliate_key?: string | null;
  sumup_pay_to_email?: string | null;
  sumup_reader_id?: string | null;
  sumup_surcharge_enabled?: boolean | null;
  sumup_debit_surcharge_percent?: number | string | null;
  sumup_credit_surcharge_percent?: number | string | null;
};

function trimField(value: unknown): string {
  return String(value ?? '').trim();
}

export function resolveTenantSumUpConfig(tenant: TenantSumUpFields) {
  return {
    apiKey: trimField(tenant.sumup_api_key) || null,
    merchantCode: trimField(tenant.sumup_merchant_code) || null,
    affiliateAppId: trimField(tenant.sumup_affiliate_app_id) || null,
    affiliateKey: trimField(tenant.sumup_affiliate_key) || null,
    payToEmail: trimField(tenant.sumup_pay_to_email) || null,
    readerId: trimField(tenant.sumup_reader_id) || null,
    surcharge: getTenantCardSurchargeConfig(tenant),
  };
}

export function getTenantCardSurchargeConfig(
  tenant: TenantSumUpFields
): CardSurchargeConfig {
  return normalizeCardSurchargeConfig({
    enabled: tenant.sumup_surcharge_enabled,
    debitPercent: tenant.sumup_debit_surcharge_percent,
    creditPercent: tenant.sumup_credit_surcharge_percent,
  });
}

// ---------------------------------------------------------------------------
// Pix / checkout online
// ---------------------------------------------------------------------------

interface CreateSumUpPixParams {
  apiKey: string;
  total: number;
  tenantId: string;
  payToEmail: string;
  returnUrl?: string;
}

export interface SumUpPixResult {
  checkoutId: string;
  pixCode: string;
  qrCodeBase64: string;
}

export async function createSumUpPixPayment({
  apiKey,
  total,
  tenantId,
  payToEmail,
  returnUrl,
}: CreateSumUpPixParams): Promise<SumUpPixResult> {
  if (!payToEmail?.trim()) {
    throw new Error('Pay To Email não configurado para este organizador');
  }
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
      payment_types: ['card', 'pix'],
      ...(returnUrl ? { return_url: returnUrl } : {}),
    }),
  });

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(response.status, formatSumUpError(response.status, body));
  }

  const data = body as {
    id?: string;
    payment_instruments?: Array<{
      pix?: { qr_code?: string; qr_code_base64?: string };
    }>;
  };

  const pix = data.payment_instruments?.[0]?.pix;

  return {
    checkoutId: String(data.id ?? ''),
    pixCode: pix?.qr_code ?? '',
    qrCodeBase64: pix?.qr_code_base64 ?? '',
  };
}

export async function getSumUpPaymentStatus(
  apiKey: string,
  checkoutId: string
): Promise<{ status: PaymentStatus }> {
  const response = await fetch(`${SUMUP_API_BASE}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(response.status, formatSumUpError(response.status, body));
  }

  const statusRaw = String((body as { status?: string }).status ?? '').toUpperCase();
  let status: PaymentStatus;
  if (statusRaw === 'PAID') status = 'approved';
  else if (statusRaw === 'PENDING') status = 'pending';
  else status = 'rejected';

  return { status };
}

// ---------------------------------------------------------------------------
// Readers (Solo pairing)
// ---------------------------------------------------------------------------

export interface SumUpReader {
  id: string;
  name: string;
  status: string;
  model: string;
  deviceStatus?: string | null;
}

export async function listSumUpReaders(
  apiKey: string,
  merchantCode: string,
  options?: { includeDeviceStatus?: boolean }
): Promise<SumUpReader[]> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(response.status, formatSumUpError(response.status, body));
  }

  const items = Array.isArray((body as { items?: unknown[] }).items)
    ? (body as { items: Array<Record<string, unknown>> }).items
    : [];

  const readers: SumUpReader[] = items.map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    status: String(r.status ?? 'unknown'),
    model: String((r.device as { model?: string } | undefined)?.model ?? ''),
  }));

  if (options?.includeDeviceStatus) {
    await Promise.all(
      readers.map(async (reader) => {
        try {
          const ds = await getSumUpReaderDeviceStatus(apiKey, merchantCode, reader.id);
          reader.deviceStatus = ds.deviceStatus;
        } catch {
          reader.deviceStatus = null;
        }
      })
    );
  }

  return readers;
}

export async function getSumUpReaderDeviceStatus(
  apiKey: string,
  merchantCode: string,
  readerId: string
): Promise<{
  deviceStatus: string | null;
  firmwareVersion: string | null;
  batteryLevel: number | null;
}> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/status`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(response.status, formatSumUpError(response.status, body));
  }

  const data = (body.data && typeof body.data === 'object' ? body.data : body) as Record<
    string,
    unknown
  >;

  return {
    deviceStatus: data.status ? String(data.status).toLowerCase() : null,
    firmwareVersion: data.firmware_version ? String(data.firmware_version) : null,
    batteryLevel: typeof data.battery_level === 'number' ? data.battery_level : null,
  };
}

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
      body: JSON.stringify({ pairing_code: pairingCode.trim(), name }),
    }
  );

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(
      response.status,
      mapSumUpReaderCheckoutError(response.status, body)
    );
  }

  const r = body as {
    id?: string;
    name?: string;
    status?: string;
    device?: { model?: string };
  };

  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? name),
    status: String(r.status ?? 'unknown'),
    model: String(r.device?.model ?? ''),
  };
}

export async function deleteSumUpReader(
  apiKey: string,
  merchantCode: string,
  readerId: string
): Promise<void> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (response.ok || response.status === 404) return;

  const body = await parseSumUpResponse(response);
  throw new SumUpError(response.status, formatSumUpError(response.status, body));
}

// ---------------------------------------------------------------------------
// Solo in-person card (Cloud API reader checkout)
// ---------------------------------------------------------------------------

interface CreateSumUpCardParams {
  apiKey: string;
  total: number;
  readerId: string;
  merchantCode: string;
  affiliateAppId: string;
  affiliateKey: string;
  foreignTransactionId: string;
  returnUrl: string;
  cardType?: 'credit' | 'debit';
}

export async function createSumUpCardPayment({
  apiKey,
  total,
  readerId,
  merchantCode,
  affiliateAppId,
  affiliateKey,
  foreignTransactionId,
  returnUrl,
  cardType = 'credit',
}: CreateSumUpCardParams): Promise<{ paymentId: string; clientTransactionId: string }> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/checkout`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        total_amount: {
          currency: 'BRL',
          minor_unit: 2,
          value: Math.round(total * 100),
        },
        description: 'Fichas Festival',
        return_url: returnUrl,
        card_type: cardType,
        affiliate: {
          app_id: affiliateAppId,
          key: affiliateKey,
          foreign_transaction_id: foreignTransactionId,
        },
      }),
    }
  );

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(
      response.status,
      mapSumUpReaderCheckoutError(response.status, body)
    );
  }

  const data = (body.data && typeof body.data === 'object' ? body.data : body) as {
    client_transaction_id?: string;
  };
  const clientTransactionId = String(data.client_transaction_id ?? '').trim();
  if (!clientTransactionId) {
    throw new Error('SumUp não retornou client_transaction_id');
  }

  return {
    paymentId: clientTransactionId,
    clientTransactionId,
  };
}

export async function terminateSumUpReaderCheckout(
  apiKey: string,
  merchantCode: string,
  readerId: string
): Promise<void> {
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/terminate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (response.ok) return;
  const body = await parseSumUpResponse(response);
  throw new SumUpError(response.status, formatSumUpError(response.status, body));
}

function mapReaderTransactionStatus(raw: unknown): PaymentStatus {
  const status = String(raw ?? '').toLowerCase();
  if (status === 'successful' || status === 'paid' || status === 'success') {
    return 'approved';
  }
  if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
    return 'rejected';
  }
  return 'pending';
}

/** Consulta transação via API v2.1 (preferida para Solo). */
export async function getSumUpReaderStatus(
  apiKey: string,
  merchantCode: string,
  clientTransactionId: string,
  foreignTransactionId?: string
): Promise<{ status: PaymentStatus; rawStatus?: string }> {
  const attempts: Array<{ key: string; value: string }> = [
    { key: 'client_transaction_id', value: clientTransactionId },
  ];
  if (foreignTransactionId && foreignTransactionId !== clientTransactionId) {
    attempts.push({ key: 'foreign_transaction_id', value: foreignTransactionId });
  }

  for (const attempt of attempts) {
    const params = new URLSearchParams();
    params.set(attempt.key, attempt.value);

    const response = await fetch(
      `${SUMUP_TRANSACTIONS_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/transactions?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (response.status === 404) continue;

    const body = await parseSumUpResponse(response);
    if (!response.ok) continue;

    const rawStatus = String((body as { status?: string }).status ?? '');
    return {
      status: mapReaderTransactionStatus(rawStatus),
      rawStatus,
    };
  }

  // Fallback v0.1 (transação ainda não indexada)
  const params = new URLSearchParams({ client_transaction_id: clientTransactionId });
  const response = await fetch(
    `${SUMUP_API_BASE}/merchants/${encodeURIComponent(merchantCode)}/transactions?${params.toString()}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  if (response.status === 404) return { status: 'pending' };

  const body = await parseSumUpResponse(response);
  if (!response.ok) {
    throw new SumUpError(response.status, formatSumUpError(response.status, body));
  }

  const rawStatus = String((body as { status?: string }).status ?? '');
  return {
    status: mapReaderTransactionStatus(rawStatus),
    rawStatus,
  };
}
