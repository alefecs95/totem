import { useEffect, useState } from 'react';
import {
  getTenants,
  getTransactions,
  marcarRepasse,
  type Tenant,
  type Transaction,
} from '../services/api';
import { formatBRL, formatDateTime } from '../utils/format';

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const [tenantId, setTenantId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  useEffect(() => {
    getTenants().then(setTenants).catch(() => undefined);
  }, []);

  const carregar = () => {
    setLoading(true);
    getTransactions({
      tenantId: tenantId || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      page,
      limit: 20,
    })
      .then((res) => {
        setTransactions(res.transactions);
        setTotalPaginas(res.totalPaginas);
      })
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [tenantId, dataInicio, dataFim, page]);

  const repassar = async (t: Transaction) => {
    await marcarRepasse(t.id);
    carregar();
  };

  const totalBruto = transactions.reduce((s, t) => s + Number(t.valor_bruto), 0);
  const totalComissao = transactions.reduce(
    (s, t) => s + Number(t.comissao_valor),
    0
  );
  const totalLiquido = transactions.reduce(
    (s, t) => s + Number(t.valor_liquido),
    0
  );

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#0f172a' }}>Transações</h1>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          alignItems: 'flex-end',
        }}
      >
        <label style={filtroLabel}>
          Organizador
          <select
            style={filtroInput}
            value={tenantId}
            onChange={(e) => {
              setPage(1);
              setTenantId(e.target.value);
            }}
          >
            <option value="">Todos</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={filtroLabel}>
          De
          <input
            type="date"
            style={filtroInput}
            value={dataInicio}
            onChange={(e) => {
              setPage(1);
              setDataInicio(e.target.value);
            }}
          />
        </label>
        <label style={filtroLabel}>
          Até
          <input
            type="date"
            style={filtroInput}
            value={dataFim}
            onChange={(e) => {
              setPage(1);
              setDataFim(e.target.value);
            }}
          />
        </label>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Data</th>
              <th style={th}>Organizador</th>
              <th style={th}>Método</th>
              <th style={{ ...th, textAlign: 'right' }}>Bruto</th>
              <th style={{ ...th, textAlign: 'right' }}>Comissão</th>
              <th style={{ ...th, textAlign: 'right' }}>Líquido</th>
              <th style={th}>Status</th>
              <th style={th}>Repasse</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td style={td}>{formatDateTime(t.criado_em)}</td>
                <td style={td}>{t.tenant_nome ?? '—'}</td>
                <td style={td}>{t.metodo}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {formatBRL(t.valor_bruto)}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {formatBRL(t.comissao_valor)}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {formatBRL(t.valor_liquido)}
                </td>
                <td style={td}>{t.status}</td>
                <td style={td}>
                  <span
                    style={{
                      color:
                        t.repasse_status === 'repassado'
                          ? '#16a34a'
                          : '#d97706',
                    }}
                  >
                    {t.repasse_status}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {t.repasse_status !== 'repassado' &&
                    t.status === 'approved' && (
                      <button onClick={() => repassar(t)} style={linkBtn}>
                        Marcar como Repassado
                      </button>
                    )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td style={td} colSpan={9}>
                  Nenhuma transação encontrada.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td style={tfoot} colSpan={3}>
                Totais da página
              </td>
              <td style={{ ...tfoot, textAlign: 'right' }}>
                {formatBRL(totalBruto)}
              </td>
              <td style={{ ...tfoot, textAlign: 'right' }}>
                {formatBRL(totalComissao)}
              </td>
              <td style={{ ...tfoot, textAlign: 'right' }}>
                {formatBRL(totalLiquido)}
              </td>
              <td style={tfoot} colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginTop: 16,
          alignItems: 'center',
        }}
      >
        <button
          style={pagerBtn}
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Anterior
        </button>
        <span style={{ fontSize: 14, color: '#64748b' }}>
          Página {page} de {totalPaginas}
        </span>
        <button
          style={pagerBtn}
          disabled={page >= totalPaginas}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}

const filtroLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#334155',
  fontWeight: 600,
};

const filtroInput: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  minWidth: 180,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#fff',
  borderRadius: 12,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 12,
  color: '#64748b',
  textTransform: 'uppercase',
  borderBottom: '1px solid #e2e8f0',
};

const td: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
};

const tfoot: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 700,
  color: '#0f172a',
  background: '#f8fafc',
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0ea5e9',
  cursor: 'pointer',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const pagerBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  color: '#334155',
};
