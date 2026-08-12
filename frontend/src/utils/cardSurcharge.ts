export type CardType = 'credit' | 'debit';

export type CardSurchargeConfig = {
  enabled: boolean;
  debitPercent: number;
  creditPercent: number;
};

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

export function normalizeSurchargePercent(value: unknown): number {
  const parsed =
    typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (parsed >= 100) return 0;
  return roundCentavos(parsed);
}

export function getSurchargePercentForCardType(
  config: CardSurchargeConfig | null | undefined,
  cardType: CardType | null | undefined
): number {
  if (!config?.enabled || !cardType) return 0;
  const percent = cardType === 'debit' ? config.debitPercent : config.creditPercent;
  return normalizeSurchargePercent(percent);
}

export function computeCardSurcharge(
  netAmount: number,
  surchargePercent: number
): CardSurchargeResult {
  const net = roundCentavos(Number(netAmount) || 0);
  const percent = normalizeSurchargePercent(surchargePercent);

  if (net <= 0 || percent <= 0) {
    return { netAmount: net, surchargeAmount: 0, grossAmount: net, surchargePercent: 0 };
  }

  const gross = ceilCentavos(net / (1 - percent / 100));

  return {
    netAmount: net,
    surchargeAmount: roundCentavos(gross - net),
    grossAmount: gross,
    surchargePercent: percent,
  };
}

export function computeCardSurchargeForCardType(input: {
  netAmount: number;
  config: CardSurchargeConfig | null | undefined;
  cardType: CardType | null | undefined;
}): CardSurchargeResult {
  return computeCardSurcharge(
    input.netAmount,
    getSurchargePercentForCardType(input.config, input.cardType)
  );
}

export function formatSurchargePercent(percent: number): string {
  return `${normalizeSurchargePercent(percent).toFixed(2).replace('.', ',')}%`;
}

export function readSumupSurchargeConfig(): CardSurchargeConfig | null {
  try {
    const raw = localStorage.getItem('sumupSurcharge');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CardSurchargeConfig;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      enabled: Boolean(parsed.enabled),
      debitPercent: normalizeSurchargePercent(parsed.debitPercent),
      creditPercent: normalizeSurchargePercent(parsed.creditPercent),
    };
  } catch {
    return null;
  }
}

export function isSumupGateway(): boolean {
  return localStorage.getItem('gateway') === 'sumup';
}
