import { useEffect, useState } from 'react';
import {
  getTotens,
  getTransactions,
  type Totem,
  type Transaction,
} from '../services/api';
import { formatBRL, formatDateTime } from '../utils/format';

function statusClass(status: string) {
  if (status === 'approved') return 'badge badge-ok';
  if (status === 'pending') return 'badge badge-soft';
  return 'badge badge-off';
}

function statusLabel(status: string) {
  switch (status) {
    case 'approved':
      return 'Aprovada';
    case 'pending':
      return 'Pendente';
    case 'rejected':
      return 'Recusada';
    default:
      return status;
  }
}

export default function Sales() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totens, setTotens] = useState<Totem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totemId, setTotemId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  useEffect(() => {
    getTotens().then(setTotens).catch(() => undefined);
  }, []);

  const carregar = () => {
    setLoading(true);
    getTransactions({
      totemId: totemId || undefined,
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

  useEffect(carregar, [totemId, dataInicio, dataFim, page]);

  return (
    <div>
      <div className="evento-page-head">
        <div>
          <div className="evento-kicker">Caixa</div>
          <h1>Vendas</h1>
          <p>Filtre por totem e período para conferir cada transação e o repasse.</p>
        </div>
      </div>

      <div className="filters">
        <label className="field">
          <span>Totem</span>
          <select
            className="input"
            value={totemId}
            onChange={(e) => {
              setPage(1);
              setTotemId(e.target.value);
            }}
          >
            <option value="">Todos</option>
            {totens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
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
        <label className="field">
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
        <div className="evento-skel" style={{ height: 280 }} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Totem</th>
                  <th>Itens</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Repasse</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDateTime(t.criado_em)}</td>
                    <td>{t.totem_nome ?? '—'}</td>
                    <td>
                      {(t.itens ?? []).map((item, i) => (
                        <div key={i} className="evento-muted">
                          {item.quantidade}× {item.nome}
                        </div>
                      ))}
                    </td>
                    <td>{t.metodo}</td>
                    <td style={{ fontWeight: 700 }}>{formatBRL(t.valor_bruto)}</td>
                    <td>
                      <span className={statusClass(t.status)}>
                        {statusLabel(t.status)}
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
                        {t.repasse_status === 'repassado' ? 'Repassado' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">Nenhuma venda neste filtro.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="evento-muted">
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
          )}
        </>
      )}
    </div>
  );
}
