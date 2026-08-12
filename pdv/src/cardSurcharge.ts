import type { CardType, SumupSurcharge } from './api';

export type CardSurchargeResult = {
  netAmount: number;
  surchargeAmount: number;
  grossAmount: number;
  surchargePercent: number;
};

function roundCentavos(value: number): number {
  return Math.round(value * 100) / 100;
}

function ceilCentavos(value: number): number {
  return Math.ceil(Number((value * 100).toFixed(6))) / 100;
}

function normalizePercent(value: unknown): number {
  const parsed =
    typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return 0;
  return roundCentavos(parsed);
}

export function computeCardSurchargeForCardType(input: {
  netAmount: number;
  config: SumupSurcharge | null | undefined;
  cardType: CardType | null | undefined;
}): CardSurchargeResult {
  const net = roundCentavos(Number(input.netAmount) || 0);
  if (!input.config?.enabled || !input.cardType || net <= 0) {
    return {
      netAmount: net,
      surchargeAmount: 0,
      grossAmount: net,
      surchargePercent: 0,
    };
  }
  const percent = normalizePercent(
    input.cardType === 'debit'
      ? input.config.debitPercent
      : input.config.creditPercent
  );
  if (percent <= 0) {
    return {
      netAmount: net,
      surchargeAmount: 0,
      grossAmount: net,
      surchargePercent: 0,
    };
  }
  const gross = ceilCentavos(net / (1 - percent / 100));
  return {
    netAmount: net,
    surchargeAmount: roundCentavos(gross - net),
    grossAmount: gross,
    surchargePercent: percent,
  };
}

export function formatSurchargePercent(percent: number): string {
  return `${normalizePercent(percent).toFixed(2).replace('.', ',')}%`;
}
