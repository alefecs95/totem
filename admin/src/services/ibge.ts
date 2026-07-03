// API pública do IBGE (sem chave, com CORS liberado).
const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

export interface UF {
  id: number;
  sigla: string;
  nome: string;
}

export async function getEstados(): Promise<UF[]> {
  const res = await fetch(`${IBGE_BASE}/estados?orderBy=nome`);
  if (!res.ok) throw new Error('Falha ao carregar estados');
  return res.json();
}

export async function getCidades(uf: string): Promise<string[]> {
  const res = await fetch(`${IBGE_BASE}/estados/${uf}/municipios?orderBy=nome`);
  if (!res.ok) throw new Error('Falha ao carregar cidades');
  const data = (await res.json()) as Array<{ nome: string }>;
  return data.map((c) => c.nome);
}
