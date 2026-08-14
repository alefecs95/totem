export type SumUpWidgetResponseType = 'sent' | 'success' | 'fail' | string;

const CONFIRMED_STATUSES = new Set(['PAID', 'AUTHORIZED', 'SUCCESSFUL']);

export function getSumUpWidgetStatus(body: unknown): string {
  return String((body as { status?: string })?.status || '').toUpperCase();
}

export function isSumUpPaymentSent(type: SumUpWidgetResponseType): boolean {
  return type === 'sent';
}

export function isSumUpPaymentConfirmed(
  type: SumUpWidgetResponseType,
  body: unknown
): boolean {
  const status = getSumUpWidgetStatus(body);
  return type === 'success' && CONFIRMED_STATUSES.has(status);
}

export function isSumUpPaymentFailed(
  type: SumUpWidgetResponseType,
  body: unknown
): boolean {
  const status = getSumUpWidgetStatus(body);
  return type === 'fail' || (type === 'success' && status === 'FAILED');
}

export function getSumUpFailureMessage(
  body: unknown,
  fallback = 'Falha no pagamento SumUp'
): string {
  const message = (body as { status_message?: string })?.status_message;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : fallback;
}
