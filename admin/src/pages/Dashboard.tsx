import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, type DashboardData } from '../services/api';
import { formatBRL } from '../utils/format';

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

  if (loading) return <p className="muted">Carregando dashboard...</p>;
  if (erro) return <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>;
  if (!data) return null;

  const cards = [
    { label: 'Total de vendas', value: formatBRL(data.totalVendas), accent: '#ea580c' },
    { label: 'Comissões', value: formatBRL(data.totalComissoes), accent: '#c2410c' },
    { label: 'Líquido organizadores', value: formatBRL(data.totalLiquido), accent: '#15803d' },
    { label: 'Vendas hoje', value: String(data.vendasHoje), accent: '#0369a1' },
    {
      label: 'Pendentes de repasse',
      value: String(data.vendasPendentesRepasse),
      accent: '#b91c1c',
    },
  ];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Visão rápida do volume e das comissões da plataforma.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/tenants" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Organizadores
          </Link>
          <Link to="/transactions" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Ver transações
          </Link>
        </div>
      </div>

      <div className="admin-stat-grid">
        {cards.map((card) => (
          <div
            key={card.label}
            className="admin-stat"
            style={{ ['--stat-accent' as string]: card.accent }}
          >
            <div className="admin-stat-label">{card.label}</div>
            <div className="admin-stat-value">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
