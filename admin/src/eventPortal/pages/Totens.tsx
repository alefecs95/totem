import { useEffect, useState } from 'react';
import { getTotens, type Totem } from '../services/api';
import { formatDateTime } from '../utils/format';

export default function Totens() {
  const [totens, setTotens] = useState<Totem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTotens()
      .then(setTotens)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#9a3412' }}>Totens</h1>
      <p style={{ color: '#78716c', marginTop: 0 }}>
        Acompanhe o status e a última atividade de cada totem locado.
      </p>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Local</th>
              <th style={th}>Status</th>
              <th style={th}>Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {totens.map((t) => (
              <tr key={t.id}>
                <td style={td}>{t.nome}</td>
                <td style={td}>{t.local ?? '—'}</td>
                <td style={td}>
                  <span style={{ color: t.ativo ? '#16a34a' : '#dc2626' }}>
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td style={td}>
                  {t.ultimo_acesso
                    ? formatDateTime(t.ultimo_acesso)
                    : 'Nunca acessou'}
                </td>
              </tr>
            ))}
            {totens.length === 0 && (
              <tr>
                <td colSpan={4} style={td}>
                  Nenhum totem cadastrado. Peça ao administrador para criar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 12,
  borderBottom: '1px solid #e7e5e4',
  color: '#78716c',
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #f5f5f4',
};
