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
  const url = `${NOMINATIM_URL}?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(
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
