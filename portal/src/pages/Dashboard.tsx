import { useEffect, useState } from 'react';
import { getDashboard, type DashboardData } from '../services/api';
import { formatBRL } from '../utils/format';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => setErro('Falha ao carregar o resumo.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Carregando...</p>;
  if (erro) return <p style={{ color: '#dc2626' }}>{erro}</p>;
  if (!data) return null;

  const cards = [
    { label: 'Total vendido', value: formatBRL(data.totalVendas), accent: '#ea580c' },
    { label: 'Seu líquido', value: formatBRL(data.totalLiquido), accent: '#16a34a' },
    { label: 'Vendas hoje', value: String(data.vendasHoje), accent: '#0ea5e9' },
    { label: 'Transações aprovadas', value: String(data.totalTransacoes), accent: '#8b5cf6' },
    { label: 'Aguardando repasse', value: String(data.repassePendente), accent: '#f59e0b' },
  ];

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#9a3412' }}>Resumo</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
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
            <div style={{ fontSize: 13, color: '#78716c' }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#292524', marginTop: 8 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Section title="Vendas por produto">
          {data.vendasPorProduto.length === 0 ? (
            <p style={{ color: '#78716c', margin: 0 }}>Nenhuma venda ainda.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Produto</th>
                  <th style={th}>Qtd</th>
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.vendasPorProduto.map((p) => (
                  <tr key={p.nome}>
                    <td style={td}>{p.nome}</td>
                    <td style={td}>{p.quantidade}</td>
                    <td style={td}>{formatBRL(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Vendas por totem">
          {data.vendasPorTotem.length === 0 ? (
            <p style={{ color: '#78716c', margin: 0 }}>Nenhuma venda por totem.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Totem</th>
                  <th style={th}>Vendas</th>
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.vendasPorTotem.map((t) => (
                  <tr key={t.totemId}>
                    <td style={td}>{t.totemNome}</td>
                    <td style={td}>{t.vendas}</td>
                    <td style={td}>{formatBRL(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 16, color: '#44403c' }}>{title}</h2>
      {children}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 4px',
  borderBottom: '1px solid #e7e5e4',
  color: '#78716c',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '8px 4px',
  borderBottom: '1px solid #f5f5f4',
  color: '#292524',
};
