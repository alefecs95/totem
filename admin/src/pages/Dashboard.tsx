import { useEffect, useState } from 'react';
import { getDashboard, type DashboardData } from '../services/api';
import { formatBRL } from '../utils/format';

interface CardDef {
  label: string;
  value: string;
  accent: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => setErro('Falha ao carregar o dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Carregando...</p>;
  if (erro) return <p style={{ color: '#dc2626' }}>{erro}</p>;
  if (!data) return null;

  const cards: CardDef[] = [
    { label: 'Total de vendas', value: formatBRL(data.totalVendas), accent: '#0ea5e9' },
    { label: 'Total de comissões', value: formatBRL(data.totalComissoes), accent: '#f97316' },
    { label: 'Líquido dos organizadores', value: formatBRL(data.totalLiquido), accent: '#22c55e' },
    { label: 'Vendas hoje', value: String(data.vendasHoje), accent: '#8b5cf6' },
    { label: 'Pendentes de repasse', value: String(data.vendasPendentesRepasse), accent: '#ef4444' },
  ];

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#0f172a' }}>Dashboard</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              borderLeft: `4px solid ${card.accent}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ fontSize: 13, color: '#64748b' }}>{card.label}</div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: '#0f172a',
                marginTop: 8,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
