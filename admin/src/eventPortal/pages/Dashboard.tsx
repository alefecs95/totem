import { useEffect, useState } from 'react';
import { getDashboard, getStoredTenant, type DashboardData } from '../services/api';
import { formatBRL } from '../utils/format';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Dashboard() {
  const tenant = getStoredTenant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => setErro('Não foi possível carregar o resumo agora.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="evento-kpi-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="evento-skel" />
        ))}
      </div>
    );
  }
  if (erro) return <p className="evento-error">{erro}</p>;
  if (!data) return null;

  const ticket =
    data.totalTransacoes > 0 ? data.totalVendas / data.totalTransacoes : 0;

  const cards = [
    {
      label: 'Total vendido',
      value: formatBRL(data.totalVendas),
      kpi: '#ea580c',
    },
    {
      label: 'Seu líquido',
      value: formatBRL(data.totalLiquido),
      kpi: '#16a34a',
    },
    {
      label: 'Vendas hoje',
      value: String(data.vendasHoje),
      kpi: '#0284c7',
    },
    {
      label: 'Aprovadas',
      value: String(data.totalTransacoes),
      kpi: '#7c3aed',
    },
    {
      label: 'Ticket médio',
      value: formatBRL(ticket),
      kpi: '#d97706',
    },
  ];

  const maxProduto = Math.max(...data.vendasPorProduto.map((p) => p.total), 1);
  const maxTotem = Math.max(...data.vendasPorTotem.map((t) => t.total), 1);

  return (
    <div>
      <div className="evento-page-head">
        <div>
          <div className="evento-kicker">{greeting()}</div>
          <h1>{tenant?.nome || 'Resumo'}</h1>
          <p>
            Acompanhe o caixa do festival em tempo real. O líquido já desconta a
            comissão da plataforma.
          </p>
        </div>
      </div>

      <div className="evento-kpi-grid">
        {cards.map((card) => (
          <div key={card.label} className="evento-kpi" style={{ ['--kpi' as string]: card.kpi }}>
            <div className="evento-kpi-label">{card.label}</div>
            <div className="evento-kpi-value">{card.value}</div>
          </div>
        ))}
      </div>

      {data.repassePendente > 0 && (
        <p className="evento-muted" style={{ marginTop: -8, marginBottom: 18 }}>
          {data.repassePendente} venda(s) ainda aguardando repasse.
        </p>
      )}

      <div className="evento-grid-2">
        <section className="evento-card">
          <h2>Ranking de produtos</h2>
          {data.vendasPorProduto.length === 0 ? (
            <p className="evento-muted" style={{ margin: 0 }}>
              Nenhuma venda ainda. Quando o caixa girar, o ranking aparece aqui.
            </p>
          ) : (
            data.vendasPorProduto.map((p) => (
              <div key={p.nome}>
                <div className="evento-rank-row">
                  <span className="evento-rank-name">{p.nome}</span>
                  <span className="evento-rank-meta">{p.quantidade} un.</span>
                  <strong>{formatBRL(p.total)}</strong>
                </div>
                <div className="evento-rank-track">
                  <div
                    className="evento-rank-fill"
                    style={{ width: `${Math.max(6, (p.total / maxProduto) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="evento-card">
          <h2>Vendas por totem</h2>
          {data.vendasPorTotem.length === 0 ? (
            <p className="evento-muted" style={{ margin: 0 }}>
              Nenhum totem vendeu ainda.
            </p>
          ) : (
            data.vendasPorTotem.map((t) => (
              <div key={t.totemId}>
                <div className="evento-rank-row">
                  <span className="evento-rank-name">{t.totemNome}</span>
                  <span className="evento-rank-meta">{t.vendas} vendas</span>
                  <strong>{formatBRL(t.total)}</strong>
                </div>
                <div className="evento-rank-track">
                  <div
                    className="evento-rank-fill"
                    style={{
                      width: `${Math.max(6, (t.total / maxTotem) * 100)}%`,
                      background: 'linear-gradient(90deg, #38bdf8, #0284c7)',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
