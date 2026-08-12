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
      <div className="admin-page-head">
        <div>
          <h1>Transações</h1>
          <p>Filtre por organizador e período para conferir repasses.</p>
        </div>
      </div>

      <div className="filters">
        <label className="field">
          <span>Organizador</span>
          <select
            className="input"
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
        <label className="field" style={{ maxWidth: 180 }}>
          <span>De</span>
          <input
            className="input"
            type="date"
            value={dataInicio}
            onChange={(e) => {
              setPage(1);
              setDataInicio(e.target.value);
            }}
          />
        </label>
        <label className="field" style={{ maxWidth: 180 }}>
          <span>Até</span>
          <input
            className="input"
            type="date"
            value={dataFim}
            onChange={(e) => {
              setPage(1);
              setDataFim(e.target.value);
            }}
          />
        </label>
      </div>

      {loading ? (
        <p className="muted">Carregando...</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Organizador</th>
                <th>Método</th>
                <th style={{ textAlign: 'right' }}>Bruto</th>
                <th style={{ textAlign: 'right' }}>Comissão</th>
                <th style={{ textAlign: 'right' }}>Líquido</th>
                <th>Status</th>
                <th>Repasse</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{formatDateTime(t.criado_em)}</td>
                  <td>{t.tenant_nome ?? '—'}</td>
                  <td>{t.metodo}</td>
                  <td style={{ textAlign: 'right' }}>{formatBRL(t.valor_bruto)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {formatBRL(t.comissao_valor)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatBRL(t.valor_liquido)}
                  </td>
                  <td>
                    <span
                      className={
                        t.status === 'approved' ? 'badge badge-ok' : 'badge badge-soft'
                      }
                    >
                      {t.status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        t.repasse_status === 'repassado'
                          ? 'badge badge-ok'
                          : 'badge badge-soft'
                      }
                    >
                      {t.repasse_status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {t.repasse_status !== 'repassado' && t.status === 'approved' && (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => void repassar(t)}
                      >
                        Marcar repassado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">Nenhuma transação encontrada.</div>
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700, padding: '14px 16px' }}>
                  Totais da página
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '14px 16px' }}>
                  {formatBRL(totalBruto)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '14px 16px' }}>
                  {formatBRL(totalComissao)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, padding: '14px 16px' }}>
                  {formatBRL(totalLiquido)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
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
          type="button"
          className="btn btn-secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Anterior
        </button>
        <span className="muted">
          Página {page} de {totalPaginas}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page >= totalPaginas}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
