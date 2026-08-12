import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  createTotem,
  deleteTotem,
  getTotens,
  type Tenant,
  type Totem,
} from '../services/api';
import { formatDateTime } from '../utils/format';

interface TotensModalProps {
  tenant: Tenant;
  onClose: () => void;
}

function mensagemMpPos(motivo?: string): string {
  switch (motivo) {
    case 'loja_indisponivel':
      return 'Totem criado, mas o caixa do Mercado Pago não foi gerado: a loja do organizador ainda não existe. Edite o organizador preenchendo Access Token e localização.';
    case 'mp_pos_failed':
      return 'Totem criado, mas houve erro ao criar o caixa no Mercado Pago. Verifique o Access Token do organizador.';
    default:
      return 'Totem criado, mas o caixa do Mercado Pago não foi gerado.';
  }
}

export default function TotensModal({ tenant, onClose }: TotensModalProps) {
  const [totens, setTotens] = useState<Totem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState('');
  const [local, setLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [qrTotem, setQrTotem] = useState<Totem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = () => {
    setLoading(true);
    getTotens(tenant.id)
      .then(setTotens)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [tenant.id]);

  useEffect(() => {
    if (!qrTotem?.setupUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(qrTotem.setupUrl, { width: 280, margin: 2, color: {
      dark: '#0f172a',
      light: '#ffffff',
    }}).then(setQrDataUrl);
  }, [qrTotem]);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAviso('');
    try {
      const { totem, mpPos } = await createTotem(tenant.id, {
        nome,
        local: local || undefined,
      });
      setNome('');
      setLocal('');
      carregar();
      setQrTotem(totem);
      if (tenant.gateway === 'mercadopago' && mpPos && !mpPos.ok) {
        setAviso(mensagemMpPos(mpPos.motivo));
      }
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (totem: Totem) => {
    if (!window.confirm(`Desativar o totem "${totem.nome}"?`)) return;
    await deleteTotem(totem.id);
    if (qrTotem?.id === totem.id) setQrTotem(null);
    carregar();
  };

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ width: 'min(640px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 4px' }}>Totens — {tenant.nome}</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
              Crie um totem e escaneie o QR Code no tablet para configurar.
            </p>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Fechar">
            ✕
          </button>
        </div>

        <form
          onSubmit={criar}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 12,
            marginTop: 20,
            alignItems: 'end',
          }}
        >
          <label style={label}>
            Nome do totem
            <input
              style={input}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Totem Entrada"
              required
            />
          </label>
          <label style={label}>
            Local
            <input
              style={input}
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Portão 1 — Setor A"
            />
          </label>
          <button type="submit" disabled={saving} style={primaryBtn}>
            {saving ? '...' : '+ Criar'}
          </button>
        </form>

        {aviso && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fef3c7',
              color: '#92400e',
              fontSize: 13,
            }}
          >
            {aviso}
          </div>
        )}

        {loading ? (
          <p style={{ marginTop: 20 }}>Carregando totens...</p>
        ) : (
          <table style={{ ...tableStyle, marginTop: 20 }}>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Local</th>
                <th style={th}>Caixa MP</th>
                <th style={th}>Último acesso</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {totens.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{t.nome}</td>
                  <td style={td}>{t.local ?? '—'}</td>
                  <td style={td}>{t.mp_pos_id ?? '—'}</td>
                  <td style={td}>
                    {t.ultimo_acesso ? formatDateTime(t.ultimo_acesso) : '—'}
                  </td>
                  <td style={td}>
                    <span style={{ color: t.ativo ? '#16a34a' : '#dc2626' }}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {t.ativo && (
                      <>
                        <button
                          onClick={() => setQrTotem(t)}
                          style={linkBtn}
                        >
                          QR Code
                        </button>
                        <button
                          onClick={() => desativar(t)}
                          style={{ ...linkBtn, color: '#dc2626' }}
                        >
                          Desativar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {totens.length === 0 && (
                <tr>
                  <td style={td} colSpan={6}>
                    Nenhum totem cadastrado para este organizador.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {qrTotem && qrDataUrl && (
          <div
            style={{
              marginTop: 24,
              padding: 20,
              background: '#f8fafc',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px' }}>QR Code — {qrTotem.nome}</h3>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
              Escaneie com a câmera do tablet para configurar automaticamente.
            </p>
            <img
              src={qrDataUrl}
              alt="QR Code de configuração do totem"
              width={280}
              height={280}
              style={{ borderRadius: 8 }}
            />
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 11,
                color: '#94a3b8',
                wordBreak: 'break-all',
              }}
            >
              {qrTotem.setupUrl}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  cursor: 'pointer',
  color: '#64748b',
  lineHeight: 1,
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  color: '#334155',
  fontWeight: 600,
};

const input: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  fontWeight: 400,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  height: 42,
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0ea5e9',
  cursor: 'pointer',
  fontWeight: 600,
  marginLeft: 12,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  color: '#64748b',
  textTransform: 'uppercase',
  borderBottom: '1px solid #e2e8f0',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
};
