import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Ícone padrão do Leaflet quebra com bundlers (paths). Usa o CDN do unpkg.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Centro aproximado do Brasil (fallback quando não há coordenadas).
const BRASIL_CENTER: [number, number] = [-14.235, -51.925];

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({
  latitude,
  longitude,
  onChange,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Evita closure defasada no handler de clique (o mapa é criado uma vez só).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasCoords = latitude != null && longitude != null;
    const center: [number, number] = hasCoords
      ? [latitude as number, longitude as number]
      : BRASIL_CENTER;

    const map = L.map(containerRef.current).setView(center, hasCoords ? 16 : 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    // O container do modal pode não ter tamanho no primeiro render.
    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza o pino sempre que as coordenadas mudam (clique, busca ou edição).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude == null || longitude == null) return;

    const pos: [number, number] = [latitude, longitude];
    if (!markerRef.current) {
      const marker = L.marker(pos, {
        icon: markerIcon,
        draggable: true,
      }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChangeRef.current(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(pos);
    }

    map.setView(pos, Math.max(map.getZoom(), 16));
  }, [latitude, longitude]);

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          height: 280,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
        }}
      />
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
        Clique no mapa ou arraste o pino para ajustar o local exato.
      </p>
    </div>
  );
}
