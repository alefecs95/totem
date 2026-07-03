import { useEffect, useState, type FormEvent } from 'react';
import {
  createTenant,
  deleteTenant,
  geocode,
  getTenants,
  updateTenant,
  type Tenant,
  type TenantInput,
} from '../services/api';
import TotensModal from '../components/TotensModal';

const emptyForm: TenantInput = {
  nome: '',
  responsavel: '',
  telefone: '',
  email: '',
  gateway: 'mercadopago',
  comissao_pct: 5,
  mp_access_token: '',
  mp_webhook_secret: '',
  mp_device_id: '',
  sumup_api_key: '',
  endereco: '',
  numero: '',
  cidade: '',
  estado: '',
  latitude: undefined,
  longitude: undefined,
};

function mensagemMpStore(motivo?: string): string {
  switch (motivo) {
    case 'sem_access_token':
      return 'Organizador salvo. A loja do Mercado Pago não foi criada: preencha o MP Access Token.';
    case 'localizacao_incompleta':
      return 'Organizador salvo. A loja do Mercado Pago não foi criada: preencha o endereço (Cidade e Estado) e clique em Localizar.';
    case 'mp_store_failed':
      return 'Organizador salvo, mas houve erro ao criar a loja no Mercado Pago. Verifique o Access Token.';
    default:
      return 'Organizador salvo, mas a loja do Mercado Pago não foi criada.';
  }
}

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [enderecoOk, setEnderecoOk] = useState('');
  const [enderecoErro, setEnderecoErro] = useState('');
  const [totensTenant, setTotensTenant] = useState<Tenant | null>(null);

  const carregar = () => {
    setLoading(true);
    getTenants()
      .then(setTenants)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, []);

  const limparFeedback = () => {
    setAviso('');
    setEnderecoOk('');
    setEnderecoErro('');
  };

  const abrirNovo = () => {
    setEditingId(null);
    setForm(emptyForm);
    limparFeedback();
    setModalOpen(true);
  };

  const abrirEdicao = (t: Tenant) => {
    setEditingId(t.id);
    limparFeedback();
    setForm({
      nome: t.nome,
      responsavel: t.responsavel,
      telefone: t.telefone ?? '',
      email: t.email ?? '',
      gateway: t.gateway,
      comissao_pct: Number(t.comissao_pct),
      mp_access_token: t.mp_access_token ?? '',
      mp_webhook_secret: t.mp_webhook_secret ?? '',
      mp_device_id: t.mp_device_id ?? '',
      sumup_api_key: t.sumup_api_key ?? '',
      endereco: t.endereco ?? '',
      numero: t.numero ?? '',
      cidade: t.cidade ?? '',
      estado: t.estado ?? '',
      latitude: t.latitude != null ? Number(t.latitude) : undefined,
      longitude: t.longitude != null ? Number(t.longitude) : undefined,
    });
    setModalOpen(true);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAviso('');
    try {
      const { mpStore } = editingId
        ? await updateTenant(editingId, form)
        : await createTenant(form);
      carregar();
      if (form.gateway === 'mercadopago' && mpStore && !mpStore.ok) {
        setAviso(mensagemMpStore(mpStore.motivo));
      } else {
        setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (t: Tenant) => {
    if (!window.confirm(`Desativar o organizador "${t.nome}"?`)) return;
    await deleteTenant(t.id);
    carregar();
  };

  const setField = (
    key: keyof TenantInput,
    value: string | number | undefined
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const buscarCoordenadas = async () => {
    setEnderecoOk('');
    setEnderecoErro('');
    if (!form.cidade || !form.estado) {
      setEnderecoErro('Preencha ao menos Cidade e Estado.');
      return;
    }
    setGeocoding(true);
    try {
      const result = await geocode({
        endereco: form.endereco ?? undefined,
        numero: form.numero ?? undefined,
        cidade: form.cidade ?? undefined,
        estado: form.estado ?? undefined,
      });
      setField('latitude', result.latitude);
      setField('longitude', result.longitude);
      setEnderecoOk(`Local encontrado: ${result.displayName}`);
    } catch {
      setEnderecoErro(
        'Endereço não encontrado. Revise a cidade e o estado e tente novamente.'
      );
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1 style={{ margin: 0, color: '#0f172a' }}>Organizadores</h1>
        <button onClick={abrirNovo} style={primaryBtn}>
          + Novo Tenant
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Nome</th>
              <th style={th}>Responsável</th>
              <th style={th}>Gateway</th>
              <th style={th}>Comissão</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td style={td}>{t.nome}</td>
                <td style={td}>{t.responsavel}</td>
                <td style={td}>{t.gateway}</td>
                <td style={td}>{Number(t.comissao_pct)}%</td>
                <td style={td}>
                  <span style={{ color: t.ativo ? '#16a34a' : '#dc2626' }}>
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {t.ativo && (
                    <button
                      onClick={() => setTotensTenant(t)}
                      style={linkBtn}
                    >
                      Totens
                    </button>
                  )}
                  <button onClick={() => abrirEdicao(t)} style={linkBtn}>
                    Editar
                  </button>
                  {t.ativo && (
                    <button
                      onClick={() => desativar(t)}
                      style={{ ...linkBtn, color: '#dc2626' }}
                    >
                      Desativar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  Nenhum organizador cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {totensTenant && (
        <TotensModal
          tenant={totensTenant}
          onClose={() => setTotensTenant(null)}
        />
      )}

      {modalOpen && (
        <div style={overlay} onClick={() => setModalOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={salvar}
            style={modal}
          >
            <h2 style={{ marginTop: 0 }}>
              {editingId ? 'Editar organizador' : 'Novo organizador'}
            </h2>

            <Field label="Nome do festival">
              <input
                style={input}
                value={form.nome ?? ''}
                onChange={(e) => setField('nome', e.target.value)}
                required
              />
            </Field>

            <Field label="Responsável">
              <input
                style={input}
                value={form.responsavel ?? ''}
                onChange={(e) => setField('responsavel', e.target.value)}
                required
              />
            </Field>

            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Telefone">
                <input
                  style={input}
                  value={form.telefone ?? ''}
                  onChange={(e) => setField('telefone', e.target.value)}
                />
              </Field>
              <Field label="E-mail">
                <input
                  style={input}
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Gateway">
                <select
                  style={input}
                  value={form.gateway}
                  onChange={(e) =>
                    setField('gateway', e.target.value as TenantInput['gateway'] as string)
                  }
                >
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="sumup">SumUp</option>
                </select>
              </Field>
              <Field label="Comissão (%)">
                <input
                  style={input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.comissao_pct ?? 0}
                  onChange={(e) =>
                    setField('comissao_pct', Number(e.target.value))
                  }
                />
              </Field>
            </div>

            {form.gateway === 'mercadopago' ? (
              <>
                <Field label="MP Access Token">
                  <input
                    style={input}
                    value={form.mp_access_token ?? ''}
                    onChange={(e) => setField('mp_access_token', e.target.value)}
                  />
                </Field>
                <Field label="MP Webhook Secret">
                  <input
                    style={input}
                    value={form.mp_webhook_secret ?? ''}
                    onChange={(e) =>
                      setField('mp_webhook_secret', e.target.value)
                    }
                  />
                </Field>
                <Field label="MP Device ID (Point Smart)">
                  <input
                    style={input}
                    value={form.mp_device_id ?? ''}
                    onChange={(e) => setField('mp_device_id', e.target.value)}
                    placeholder="ID da maquininha no Mercado Pago"
                  />
                </Field>

                <div
                  style={{
                    marginTop: 8,
                    padding: 16,
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>
                    Endereço da loja
                  </strong>
                  <p style={{ margin: '4px 0 12px', fontSize: 12, color: '#64748b' }}>
                    Necessário para criar a loja no Mercado Pago. Preencha o
                    endereço e clique em <b>Localizar</b> — as coordenadas são
                    preenchidas automaticamente.
                  </p>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 3 }}>
                      <Field label="Rua / Avenida">
                        <input
                          style={input}
                          value={form.endereco ?? ''}
                          onChange={(e) => setField('endereco', e.target.value)}
                          placeholder="Av. Brasil"
                        />
                      </Field>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Field label="Número">
                        <input
                          style={input}
                          value={form.numero ?? ''}
                          onChange={(e) => setField('numero', e.target.value)}
                          placeholder="123"
                        />
                      </Field>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 2 }}>
                      <Field label="Cidade">
                        <input
                          style={input}
                          value={form.cidade ?? ''}
                          onChange={(e) => setField('cidade', e.target.value)}
                          placeholder="Fortaleza"
                        />
                      </Field>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Field label="Estado (UF)">
                        <input
                          style={input}
                          value={form.estado ?? ''}
                          onChange={(e) => setField('estado', e.target.value)}
                          placeholder="CE"
                        />
                      </Field>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={buscarCoordenadas}
                    disabled={geocoding}
                    style={{
                      marginTop: 4,
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: '1px solid #0ea5e9',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      fontWeight: 600,
                      cursor: geocoding ? 'default' : 'pointer',
                    }}
                  >
                    {geocoding ? 'Localizando...' : '📍 Localizar endereço'}
                  </button>

                  {enderecoOk && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: '#15803d',
                      }}
                    >
                      ✓ {enderecoOk}
                    </div>
                  )}
                  {enderecoErro && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: '#dc2626',
                      }}
                    >
                      {enderecoErro}
                    </div>
                  )}

                  {form.latitude != null && form.longitude != null && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        color: '#64748b',
                      }}
                    >
                      Coordenadas: {Number(form.latitude).toFixed(6)},{' '}
                      {Number(form.longitude).toFixed(6)}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Field label="SumUp API Key">
                <input
                  style={input}
                  value={form.sumup_api_key ?? ''}
                  onChange={(e) => setField('sumup_api_key', e.target.value)}
                />
              </Field>
            )}

            {aviso && (
              <div
                style={{
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

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={secondaryBtn}
              >
                {aviso ? 'Fechar' : 'Cancelar'}
              </button>
              <button type="submit" disabled={saving} style={primaryBtn}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block', flex: 1, marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  fontWeight: 600,
  cursor: 'pointer',
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
  background: '#fff',
  borderRadius: 12,
  overflow: 'hidden',
  marginTop: 16,
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
  padding: '12px 16px',
  fontSize: 14,
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
};

const input: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 100,
};

const modal: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 24,
  width: 520,
  maxWidth: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
};
