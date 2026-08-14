import { useEffect, useState } from 'react';
import {
  getTotens,
  getTransactions,
  type Totem,
  type Transaction,
} from '../services/api';
import { formatBRL, formatDateTime } from '../utils/format';

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

  const statusLabel = (status: string) => {
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
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#9a3412' }}>Vendas</h1>

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
          Totem
          <select
            style={filtroInput}
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
        <>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Totem</th>
                <th style={th}>Itens</th>
                <th style={th}>Método</th>
                <th style={th}>Valor</th>
                <th style={th}>Status</th>
                <th style={th}>Repasse</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{formatDateTime(t.criado_em)}</td>
                  <td style={td}>{t.totem_nome ?? '—'}</td>
                  <td style={td}>
                    {(t.itens ?? []).map((item, i) => (
                      <div key={i} style={{ fontSize: 13 }}>
                        {item.quantidade}x {item.nome}
                      </div>
                    ))}
                  </td>
                  <td style={td}>{t.metodo}</td>
                  <td style={td}>{formatBRL(t.valor_bruto)}</td>
                  <td style={td}>{statusLabel(t.status)}</td>
                  <td style={td}>
                    {t.repasse_status === 'repassado' ? 'Repassado' : 'Pendente'}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} style={td}>
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPaginas > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                style={pageBtn}
              >
                Anterior
              </button>
              <span style={{ alignSelf: 'center', color: '#78716c' }}>
                Página {page} de {totalPaginas}
              </span>
              <button
                disabled={page >= totalPaginas}
                onClick={() => setPage((p) => p + 1)}
                style={pageBtn}
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

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: '#fff',
  borderRadius: 12,
  borderCollapse: 'collapse',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  fontSize: 14,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 12,
  borderBottom: '1px solid #e7e5e4',
  color: '#78716c',
};

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #f5f5f4',
  verticalAlign: 'top',
};

const filtroLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: 13,
  fontWeight: 600,
  color: '#44403c',
};

const filtroInput: React.CSSProperties = {
  marginTop: 4,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  minWidth: 140,
};

const pageBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #d6d3d1',
  background: '#fff',
  cursor: 'pointer',
};
