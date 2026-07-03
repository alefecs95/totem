// Nomes aceitos pela API de lojas do Mercado Pago (state_name).
const UF_TO_STATE: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

const STATE_TO_UF = Object.fromEntries(
  Object.entries(UF_TO_STATE).map(([uf, name]) => [name.toLowerCase(), uf])
) as Record<string, string>;

// Converte UF (MA) ou nome parcial para o nome completo exigido pelo MP.
export function normalizeBrazilStateName(estado: string): string {
  const trimmed = estado.trim();
  if (!trimmed) return trimmed;

  const upper = trimmed.toUpperCase();
  if (UF_TO_STATE[upper]) return UF_TO_STATE[upper];

  const lower = trimmed.toLowerCase();
  for (const [name] of Object.entries(STATE_TO_UF)) {
    if (name === lower || name.startsWith(lower)) {
      return UF_TO_STATE[STATE_TO_UF[name]];
    }
  }

  // Já pode estar no formato correto (ex.: "Maranhão").
  for (const fullName of Object.values(UF_TO_STATE)) {
    if (fullName.toLowerCase() === lower) return fullName;
  }

  return trimmed;
}
