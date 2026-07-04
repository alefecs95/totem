import { useEffect, useState, type FormEvent } from 'react';
import {
  createTenant,
  deleteTenant,
  geocode,
  getTenantTerminals,
  getTenants,
  setTerminalPdv,
  syncTenantMp,
  updateTenant,
  type Tenant,
  type TenantInput,
  type MpTerminal,
} from '../services/api';
import TotensModal from '../components/TotensModal';
import MapPicker from '../components/MapPicker';
import { getCidades, getEstados, type UF } from '../services/ibge';

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
  sumup_reader_id: '',
  sumup_merchant_code: '',
  sumup_affiliate_key: '',
  endereco: '',
  numero: '',
  bairro: '',
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
  const [estados, setEstados] = useState<UF[]>([]);
  const [cidades, setCidades] = useState<string[]>([]);
  const [carregandoCidades, setCarregandoCidades] = useState(false);
  const [terminais, setTerminais] = useState<MpTerminal[]>([]);
  const [carregandoTerminais, setCarregandoTerminais] = useState(false);
  const [terminaisErro, setTerminaisErro] = useState('');
  const [ativandoPdv, setAtivandoPdv] = useState(false);
  const [pdvMsg, setPdvMsg] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [totensTenant, setTotensTenant] = useState<Tenant | null>(null);

  const carregar = () => {
    setLoading(true);
    getTenants()
      .then(setTenants)
      .finally(() => setLoading(false));
  };

  useEffect(carregar, []);

  useEffect(() => {
    getEstados()
      .then(setEstados)
      .catch(() => setEstados([]));
  }, []);

  // Carrega as cidades sempre que o estado selecionado muda.
  const carregarCidades = (uf: string) => {
    if (!uf) {
      setCidades([]);
      return;
    }
    setCarregandoCidades(true);
    getCidades(uf)
      .then(setCidades)
      .catch(() => setCidades([]))
      .finally(() => setCarregandoCidades(false));
  };

  // Dado o nome completo do estado salvo, acha a sigla (UF).
  const ufDoEstado = (estadoNome?: string | null): string => {
    if (!estadoNome) return '';
    const match = estados.find(
      (e) =>
        e.nome.toLowerCase() === estadoNome.toLowerCase() ||
        e.sigla.toLowerCase() === estadoNome.toLowerCase()
    );
    return match?.sigla ?? '';
  };

  const limparFeedback = () => {
    setAviso('');
    setEnderecoOk('');
    setEnderecoErro('');
    setTerminaisErro('');
  };

  const buscarMaquininhas = async () => {
    if (!editingId) {
      setTerminaisErro('Salve o organizador primeiro, depois edite para buscar.');
      return;
    }
    if (!form.mp_access_token?.trim()) {
      setTerminaisErro('Preencha o MP Access Token antes de buscar.');
      return;
    }
    setCarregandoTerminais(true);
    setTerminaisErro('');
    try {
      const lista = await getTenantTerminals(editingId);
      setTerminais(lista);
      if (lista.length === 0) {
        setTerminaisErro(
          'Nenhuma maquininha encontrada. Pareie o Point Smart na conta MP e coloque em modo PDV.'
        );
      }
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setTerminaisErro(
        detalhe ?? 'Falha ao buscar maquininhas. Verifique o Access Token.'
      );
      setTerminais([]);
    } finally {
      setCarregandoTerminais(false);
    }
  };

  const sincronizarMp = async () => {
    if (!editingId) {
      setSyncMsg('Salve o organizador primeiro, depois edite.');
      return;
    }
    setSincronizando(true);
    setSyncMsg('');
    try {
      const r = await syncTenantMp(editingId);
      const linhas: string[] = [];
      if (r.storeId) {
        linhas.push(`Loja OK (store_id ${r.storeId}).`);
      } else {
        linhas.push(
          `Loja NÃO criada: ${r.store.detalhe ?? r.store.motivo ?? 'erro'}.`
        );
      }
      const posOk = r.totens.filter((t) => t.ok).length;
      linhas.push(`Caixas: ${posOk}/${r.totens.length} OK.`);
      const falhas = r.totens.filter((t) => !t.ok);
      for (const f of falhas) {
        linhas.push(`• ${f.nome}: ${f.detalhe ?? f.motivo ?? 'erro'}`);
      }
      setSyncMsg(linhas.join('\n'));
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setSyncMsg(detalhe ?? 'Falha ao sincronizar com o Mercado Pago.');
    } finally {
      setSincronizando(false);
    }
  };

  const ativarModoPdv = async (deviceId?: string) => {
    if (!editingId) {
      setPdvMsg('Salve o organizador primeiro, depois edite.');
      return;
    }
    const alvo = deviceId ?? form.mp_device_id;
    if (!alvo?.trim()) {
      setPdvMsg('Selecione ou informe o Device ID da maquininha primeiro.');
      return;
    }
    setAtivandoPdv(true);
    setPdvMsg('');
    try {
      await setTerminalPdv(editingId, alvo);
      setPdvMsg('Maquininha colocada em modo PDV. Teste o pagamento no totem.');
      try {
        setTerminais(await getTenantTerminals(editingId));
      } catch {
        // lista é só informativa
      }
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setPdvMsg(
        detalhe ??
          'Falha ao ativar PDV. Ative pelo app Mercado Pago (Point → Modo de uso → PDV/Integrado).'
      );
    } finally {
      setAtivandoPdv(false);
    }
  };

  const abrirNovo = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCidades([]);
    setTerminais([]);
    limparFeedback();
    setModalOpen(true);
  };

  const abrirEdicao = (t: Tenant) => {
    setEditingId(t.id);
    limparFeedback();
    carregarCidades(ufDoEstado(t.estado));
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
      sumup_reader_id: t.sumup_reader_id ?? '',
      sumup_merchant_code: t.sumup_merchant_code ?? '',
      sumup_affiliate_key: t.sumup_affiliate_key ?? '',
      endereco: t.endereco ?? '',
      numero: t.numero ?? '',
      bairro: t.bairro ?? '',
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
        const base = mensagemMpStore(mpStore.motivo);
        setAviso(mpStore.detalhe ? `${base}\n\nDetalhe: ${mpStore.detalhe}` : base);
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

  const usarLocalizacaoAtual = () => {
    setEnderecoOk('');
    setEnderecoErro('');
    if (!('geolocation' in navigator)) {
      setEnderecoErro('Este dispositivo não suporta geolocalização.');
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setField('latitude', pos.coords.latitude);
        setField('longitude', pos.coords.longitude);
        setEnderecoOk('Localização atual capturada.');
        setGeocoding(false);
      },
      (err) => {
        setEnderecoErro(
          err.code === err.PERMISSION_DENIED
            ? 'Permissão de localização negada. Autorize no navegador e tente de novo.'
            : 'Não foi possível obter a localização atual.'
        );
        setGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

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
        bairro: form.bairro ?? undefined,
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
                    placeholder="NEWLAND_N950__N950NCB801293324"
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Formato: <code>MODELO__NUMERO_SERIE</code>. Não use o ID do
                    caixa (POS) — é o ID da maquininha física.
                  </p>
                </Field>

                {editingId && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={buscarMaquininhas}
                      disabled={carregandoTerminais}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #0ea5e9',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 600,
                        cursor: carregandoTerminais ? 'default' : 'pointer',
                      }}
                    >
                      {carregandoTerminais
                        ? 'Buscando...'
                        : '🔍 Buscar maquininhas na conta MP'}
                    </button>
                    <button
                      type="button"
                      onClick={() => ativarModoPdv()}
                      disabled={ativandoPdv}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #16a34a',
                        background: '#dcfce7',
                        color: '#15803d',
                        fontWeight: 600,
                        cursor: ativandoPdv ? 'default' : 'pointer',
                      }}
                    >
                      {ativandoPdv ? 'Ativando...' : '⚙️ Ativar modo PDV'}
                    </button>
                    <button
                      type="button"
                      onClick={sincronizarMp}
                      disabled={sincronizando}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #7c3aed',
                        background: '#ede9fe',
                        color: '#6d28d9',
                        fontWeight: 600,
                        cursor: sincronizando ? 'default' : 'pointer',
                      }}
                    >
                      {sincronizando
                        ? 'Sincronizando...'
                        : '🔄 Criar loja/caixa no MP'}
                    </button>
                    </div>
                    {syncMsg && (
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: 13,
                          color: '#0f172a',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {syncMsg}
                      </p>
                    )}
                    {pdvMsg && (
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#0f172a' }}>
                        {pdvMsg}
                      </p>
                    )}
                    {terminaisErro && (
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>
                        {terminaisErro}
                      </p>
                    )}
                    {terminais.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {terminais.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setField('mp_device_id', t.id)}
                            style={{
                              textAlign: 'left',
                              padding: '10px 12px',
                              borderRadius: 8,
                              border:
                                form.mp_device_id === t.id
                                  ? '2px solid #0f172a'
                                  : '1px solid #cbd5e1',
                              background:
                                form.mp_device_id === t.id ? '#f1f5f9' : '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{t.id}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              Modo:{' '}
                              <b
                                style={{
                                  color:
                                    t.operatingMode === 'PDV'
                                      ? '#15803d'
                                      : '#dc2626',
                                }}
                              >
                                {t.operatingMode}
                              </b>
                              {t.operatingMode !== 'PDV'
                                ? ' (precisa ser PDV)'
                                : ''}
                              {t.posId != null ? ` · POS ${t.posId}` : ''}
                            </div>
                            {t.operatingMode !== 'PDV' && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  ativarModoPdv(t.id);
                                }}
                                style={{
                                  display: 'inline-block',
                                  marginTop: 6,
                                  fontSize: 12,
                                  color: '#15803d',
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                }}
                              >
                                Colocar em PDV
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                    Escolha o estado e a cidade nas listas, informe bairro e rua.
                    Depois clique em <b>Buscar pelo endereço</b> ou use o mapa /
                    localização atual.
                  </p>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <Field label="Estado">
                        <select
                          style={input}
                          value={ufDoEstado(form.estado)}
                          onChange={(e) => {
                            const uf = e.target.value;
                            const estadoNome =
                              estados.find((x) => x.sigla === uf)?.nome ?? '';
                            setField('estado', estadoNome);
                            setField('cidade', '');
                            carregarCidades(uf);
                          }}
                        >
                          <option value="">Selecione o estado</option>
                          {estados.map((e) => (
                            <option key={e.id} value={e.sigla}>
                              {e.nome}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Field label="Cidade">
                        <select
                          style={input}
                          value={form.cidade ?? ''}
                          disabled={!form.estado || carregandoCidades}
                          onChange={(e) => setField('cidade', e.target.value)}
                        >
                          <option value="">
                            {carregandoCidades
                              ? 'Carregando...'
                              : !form.estado
                                ? 'Escolha o estado antes'
                                : 'Selecione a cidade'}
                          </option>
                          {cidades.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 2 }}>
                      <Field label="Bairro">
                        <input
                          style={input}
                          value={form.bairro ?? ''}
                          onChange={(e) => setField('bairro', e.target.value)}
                          placeholder="Centro"
                        />
                      </Field>
                    </div>
                  </div>
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

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={usarLocalizacaoAtual}
                      disabled={geocoding}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#0f172a',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: geocoding ? 'default' : 'pointer',
                      }}
                    >
                      🎯 Usar localização atual
                    </button>
                    <button
                      type="button"
                      onClick={buscarCoordenadas}
                      disabled={geocoding}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #0ea5e9',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 600,
                        cursor: geocoding ? 'default' : 'pointer',
                      }}
                    >
                      {geocoding ? 'Buscando...' : '📍 Buscar pelo endereço'}
                    </button>
                  </div>

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

                  <div style={{ marginTop: 12 }}>
                    <MapPicker
                      latitude={
                        form.latitude != null
                          ? Number(form.latitude)
                          : undefined
                      }
                      longitude={
                        form.longitude != null
                          ? Number(form.longitude)
                          : undefined
                      }
                      onChange={(lat, lng) => {
                        setField('latitude', lat);
                        setField('longitude', lng);
                        setEnderecoErro('');
                        setEnderecoOk('Local definido pelo mapa.');
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <Field label="SumUp API Key">
                  <input
                    style={input}
                    value={form.sumup_api_key ?? ''}
                    onChange={(e) => setField('sumup_api_key', e.target.value)}
                    placeholder="sup_sk_..."
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Gere em me.sumup.com → Configurações → Chaves de API.
                  </p>
                </Field>
                <Field label="SumUp Merchant Code">
                  <input
                    style={input}
                    value={form.sumup_merchant_code ?? ''}
                    onChange={(e) =>
                      setField('sumup_merchant_code', e.target.value)
                    }
                    placeholder="MXXXXXXX"
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Está em me.sumup.com → Configurações (código do comerciante).
                  </p>
                </Field>
                <Field label="SumUp Affiliate Key">
                  <input
                    style={input}
                    value={form.sumup_affiliate_key ?? ''}
                    onChange={(e) =>
                      setField('sumup_affiliate_key', e.target.value)
                    }
                    placeholder="sup_afk_..."
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Obrigatória para a maquininha. Gere em me.sumup.com →
                    Configurações → Affiliate Keys.
                  </p>
                </Field>
                <Field label="SumUp Reader ID (maquininha Solo)">
                  <input
                    style={input}
                    value={form.sumup_reader_id ?? ''}
                    onChange={(e) =>
                      setField('sumup_reader_id', e.target.value)
                    }
                    placeholder="rdr_XXXXXXXXXXXXXXXXXXXXXXXXXX"
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Pareie a Solo (Conexões → API → Conectar) e cole o ID
                    retornado (começa com <code>rdr_</code>).
                  </p>
                </Field>
              </>
            )}

            {aviso && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
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
