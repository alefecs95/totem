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
      <div className="evento-page-head">
        <div>
          <div className="evento-kicker">Pontos de venda</div>
          <h1>Totens</h1>
          <p>Status e último acesso de cada totem locado para o seu festival.</p>
        </div>
      </div>

      {loading ? (
        <div className="evento-totem-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="evento-skel" />
          ))}
        </div>
      ) : totens.length === 0 ? (
        <div className="empty-state">
          Nenhum totem cadastrado. Peça ao super admin para criar.
        </div>
      ) : (
        <div className="evento-totem-grid">
          {totens.map((t) => (
            <article key={t.id} className="evento-totem">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h3>{t.nome}</h3>
                <span className={t.ativo ? 'badge badge-ok' : 'badge badge-off'}>
                  {t.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="evento-muted" style={{ margin: '8px 0 12px' }}>
                {t.local || 'Local não informado'}
              </p>
              <div className="evento-muted">
                Último acesso:{' '}
                {t.ultimo_acesso ? formatDateTime(t.ultimo_acesso) : 'nunca'}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
