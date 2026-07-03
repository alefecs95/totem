// Geocoding gratuito via Nominatim (OpenStreetMap). Sem chave de API.
// A política de uso exige um User-Agent identificável e no máximo 1 req/s.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

// Converte um endereço em coordenadas. Retorna null se nada for encontrado.
export async function geocodeAddress(
  q: string
): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&addressdetails=0&countrycodes=br&q=${encodeURIComponent(
    q
  )}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TotemFestival/1.0 (totem-festival)',
      'Accept-Language': 'pt-BR',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim failed (${response.status})`);
  }

  const data = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!data.length) return null;

  return {
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    displayName: data[0].display_name,
  };
}

export interface AddressParts {
  endereco?: string | null;
  numero?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

// Geocodifica um endereço brasileiro com fallback progressivo: se o endereço
// completo não for encontrado, tenta cidade+estado e, por fim, só a cidade.
// Assim cidades pequenas sempre resolvem ao menos para o centro do município.
export async function geocodeBrazil(
  parts: AddressParts
): Promise<GeocodeResult | null> {
  const { endereco, numero, cidade, estado } = parts;

  const attempts = [
    [endereco, numero, cidade, estado, 'Brasil'],
    [endereco, cidade, estado, 'Brasil'],
    [cidade, estado, 'Brasil'],
    [cidade, 'Brasil'],
  ];

  const tried = new Set<string>();
  for (const parts of attempts) {
    const q = parts.filter(Boolean).join(', ').trim();
    if (!q || tried.has(q)) continue;
    tried.add(q);

    try {
      const result = await geocodeAddress(q);
      if (result) return result;
    } catch {
      // tenta a próxima variação
    }
  }

  return null;
}
