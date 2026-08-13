import { useEffect, useState, type FormEvent } from 'react';
import {
  createTenant,
  deleteTenant,
  geocode,
  getTenantSumUpReaders,
  getTenantTerminals,
  getTenants,
  pairTenantSumUpReader,
  resetTenantSenha,
  setTerminalPdv,
  syncTenantMp,
  updateTenant,
  type Tenant,
  type TenantInput,
  type MpTerminal,
  type SumUpReader,
} from '../services/api';
import TotensModal from '../components/TotensModal';
import ProductsModal from '../components/ProductsModal';
import MapPicker from '../components/MapPicker';
import { getCidades, getEstados, type UF } from '../services/ibge';

const emptyForm: TenantInput = {
  nome: '',
  responsavel: '',
  telefone: '',
  email: '',
  operador_email: '',
  gateway: 'mercadopago',
  comissao_pct: 5,
  codigo_evento: '',
  mp_access_token: '',
  mp_webhook_secret: '',
  mp_device_id: '',
  sumup_api_key: '',
  sumup_reader_id: '',
  sumup_merchant_code: '',
  sumup_affiliate_key: '',
  sumup_affiliate_app_id: '',
  sumup_pay_to_email: '',
  sumup_surcharge_enabled: false,
  sumup_debit_surcharge_percent: 0,
  sumup_credit_surcharge_percent: 0,
  ficha_logo_data: null,
  endereco: '',
  numero: '',
  bairro: '',
  cidade: '',
  estado: '',
  latitude: undefined,
  longitude: undefined,
  portal_senha: '',
  operador_senha: '',
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
  const [sumupReaders, setSumupReaders] = useState<SumUpReader[]>([]);
  const [buscandoReaders, setBuscandoReaders] = useState(false);
  const [readersMsg, setReadersMsg] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pareando, setPareando] = useState(false);
  const [totensTenant, setTotensTenant] = useState<Tenant | null>(null);
  const [produtosTenant, setProdutosTenant] = useState<Tenant | null>(null);
  const [resetandoSenha, setResetandoSenha] = useState<string | null>(null);

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

  const selecionarSumupReader = (reader: SumUpReader) => {
    setField('sumup_reader_id', reader.id);
    setReadersMsg(
      `Maquininha selecionada: ${reader.name || reader.id}. Clique em Salvar para gravar.`
    );
  };

  const buscarSumupReaders = async () => {
    if (!editingId) {
      setReadersMsg('Salve o organizador primeiro, depois edite.');
      return;
    }
    if (!form.sumup_api_key?.trim() || !form.sumup_merchant_code?.trim()) {
      setReadersMsg('Preencha API Key e Merchant Code antes de buscar.');
      return;
    }
    setBuscandoReaders(true);
    setReadersMsg('');
    try {
      const lista = await getTenantSumUpReaders(editingId, { live: true });
      setSumupReaders(lista);
      if (lista.length === 0) {
        setReadersMsg(
          'Nenhum leitor pareado. Pareie a Solo (Conexoes → API → Conectar).'
        );
      } else if (lista.length === 1 && lista[0]) {
        selecionarSumupReader(lista[0]);
      } else {
        setReadersMsg(
          `${lista.length} leitores encontrados. Clique em um para selecionar.`
        );
      }
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      setReadersMsg(detalhe ?? 'Falha ao buscar leitores. Verifique API Key/Merchant.');
      setSumupReaders([]);
    } finally {
      setBuscandoReaders(false);
    }
  };

  const parearReader = async () => {
    if (!editingId) {
      setReadersMsg('Salve o organizador primeiro, depois edite.');
      return;
    }
    if (!pairingCode.trim()) {
      setReadersMsg('Digite o código de pareamento da maquininha.');
      return;
    }
    setPareando(true);
    setReadersMsg('');
    try {
      const reader = await pairTenantSumUpReader(editingId, pairingCode.trim());
      setField('sumup_reader_id', reader.id);
      setSumupReaders([reader]);
      setPairingCode('');
      setReadersMsg(`Leitor pareado: ${reader.id}. Salve o organizador.`);
    } catch (err: unknown) {
      const detalhe = (
        err as { response?: { data?: { detalhe?: string } } }
      )?.response?.data?.detalhe;
      const msg = detalhe ?? 'Falha ao parear. Confira o código e a conta.';
      if (msg.includes('no pairing for code')) {
        setReadersMsg(
          'Código inválido ou expirado. Na Solo: deslogue → Conexões → API → Conectar → gere um código novo (válido por 5 min).'
        );
      } else {
        setReadersMsg(msg);
      }
    } finally {
      setPareando(false);
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
      codigo_evento: t.codigo_evento ?? '',
      responsavel: t.responsavel,
      telefone: t.telefone ?? '',
      email: t.email ?? '',
      operador_email: t.operador_email ?? '',
      gateway: t.gateway,
      comissao_pct: Number(t.comissao_pct),
      mp_access_token: t.mp_access_token ?? '',
      mp_webhook_secret: t.mp_webhook_secret ?? '',
      mp_device_id: t.mp_device_id ?? '',
      sumup_api_key: t.sumup_api_key ?? '',
      sumup_reader_id: t.sumup_reader_id ?? '',
      sumup_merchant_code: t.sumup_merchant_code ?? '',
      sumup_affiliate_key: t.sumup_affiliate_key ?? '',
      sumup_affiliate_app_id: t.sumup_affiliate_app_id ?? '',
      sumup_pay_to_email: t.sumup_pay_to_email ?? '',
      sumup_surcharge_enabled: Boolean(t.sumup_surcharge_enabled),
      sumup_debit_surcharge_percent: Number(t.sumup_debit_surcharge_percent ?? 0),
      sumup_credit_surcharge_percent: Number(t.sumup_credit_surcharge_percent ?? 0),
      ficha_logo_data: t.ficha_logo_data ?? null,
      endereco: t.endereco ?? '',
      numero: t.numero ?? '',
      bairro: t.bairro ?? '',
      cidade: t.cidade ?? '',
      estado: t.estado ?? '',
      latitude: t.latitude != null ? Number(t.latitude) : undefined,
      longitude: t.longitude != null ? Number(t.longitude) : undefined,
      portal_senha: '',
      operador_senha: '',
    });
    setModalOpen(true);
  };

  const resetarSenha = async (
    t: Tenant,
    tipo: 'portal' | 'operador'
  ) => {
    const label =
      tipo === 'portal' ? 'adm do evento (portal)' : 'operador web';
    const custom = window.prompt(
      `Nova senha do ${label} para "${t.nome}".\n\nDigite a senha (mín. 4) ou deixe em branco para GERAR automaticamente:`
    );
    if (custom === null) return;
    const senha = custom.trim();
    if (senha && senha.length < 4) {
      window.alert('Senha muito curta (mínimo 4 caracteres).');
      return;
    }
    setResetandoSenha(`${t.id}-${tipo}`);
    try {
      const result = await resetTenantSenha(
        t.id,
        tipo,
        senha || undefined
      );
      carregar();
      window.alert(
        `Senha redefinida para portal e operador (mesmo e-mail).\n\nSenha: ${result.senha}\n\nAnote agora. Use este e-mail + esta senha no portal e no /operador.`
      );
    } catch {
      window.alert('Falha ao resetar senha. Tente novamente.');
    } finally {
      setResetandoSenha(null);
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAviso('');
    try {
      const payload: TenantInput = { ...form };
      if (!payload.portal_senha?.trim()) {
        delete payload.portal_senha;
      }
      if (!payload.operador_senha?.trim()) {
        delete payload.operador_senha;
      }
      payload.operador_email = payload.operador_email?.trim()
        ? payload.operador_email.trim()
        : null;
      if (!editingId && !payload.portal_senha) {
        setAviso('Defina a senha do portal (mínimo 4 caracteres) para o organizador.');
        return;
      }
      const { mpStore } = editingId
        ? await updateTenant(editingId, payload)
        : await createTenant(payload);
      carregar();
      if (form.gateway === 'mercadopago' && mpStore && !mpStore.ok) {
        const base = mensagemMpStore(mpStore.motivo);
        setAviso(mpStore.detalhe ? `${base}\n\nDetalhe: ${mpStore.detalhe}` : base);
      } else {
        setModalOpen(false);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Falha ao salvar. Tente novamente.';
      setAviso(
        msg === 'invalid_body'
          ? 'Dados inválidos. Confira e-mail e senha do portal (mín. 4 caracteres).'
          : String(msg)
      );
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
    value: string | number | boolean | null | undefined
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
      <div className="admin-page-head">
        <div>
          <h1>Organizadores</h1>
          <p>Festivais, códigos PDV, maquininhas e comissões.</p>
        </div>
        <button type="button" onClick={abrirNovo} className="btn btn-primary">
          + Novo organizador
        </button>
      </div>

      {loading ? (
        <p className="muted">Carregando...</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código PDV</th>
                <th>Responsável</th>
                <th>Gateway</th>
                <th>Comissão</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700 }}>{t.nome}</td>
                  <td>
                    <span className="code-pill">{t.codigo_evento || '—'}</span>
                  </td>
                  <td>{t.responsavel}</td>
                  <td>
                    <span className="badge badge-soft">{t.gateway}</span>
                  </td>
                  <td>{Number(t.comissao_pct)}%</td>
                  <td>
                    <span className={t.ativo ? 'badge badge-ok' : 'badge badge-off'}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {t.ativo && (
                      <button
                        type="button"
                        onClick={() => setProdutosTenant(t)}
                        className="btn-link"
                      >
                        Produtos
                      </button>
                    )}
                    {t.ativo && (
                      <button
                        type="button"
                        onClick={() => setTotensTenant(t)}
                        className="btn-link"
                      >
                        Totens
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => abrirEdicao(t)}
                      className="btn-link"
                    >
                      Editar
                    </button>
                    {t.ativo && (
                      <button
                        type="button"
                        onClick={() => void resetarSenha(t, 'portal')}
                        className="btn-link"
                        disabled={resetandoSenha === `${t.id}-portal`}
                        title="Resetar senha do portal (adm do evento)"
                      >
                        {resetandoSenha === `${t.id}-portal`
                          ? '...'
                          : 'Senha portal'}
                      </button>
                    )}
                    {t.ativo && (
                      <button
                        type="button"
                        onClick={() => void resetarSenha(t, 'operador')}
                        className="btn-link"
                        disabled={resetandoSenha === `${t.id}-operador`}
                        title="Resetar senha do modo operador"
                      >
                        {resetandoSenha === `${t.id}-operador`
                          ? '...'
                          : 'Senha operador'}
                      </button>
                    )}
                    {t.ativo && (
                      <button
                        type="button"
                        onClick={() => desativar(t)}
                        className="btn-danger-text"
                      >
                        Desativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      Nenhum organizador cadastrado.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totensTenant && (
        <TotensModal
          tenant={totensTenant}
          onClose={() => setTotensTenant(null)}
        />
      )}

      {produtosTenant && (
        <ProductsModal
          tenant={produtosTenant}
          onClose={() => setProdutosTenant(null)}
        />
      )}

      {modalOpen && (
        <div className="admin-overlay" onClick={() => setModalOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={salvar}
            className="admin-modal"
            style={{ width: 'min(640px, 100%)', maxHeight: '90vh', overflow: 'auto' }}
          >
            <h2>
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

            <Field label="Código do evento (PDV Electron)">
              <input
                style={input}
                value={form.codigo_evento ?? ''}
                onChange={(e) =>
                  setField(
                    'codigo_evento',
                    e.target.value.toUpperCase().replace(/\s+/g, '')
                  )
                }
                placeholder="Ex.: FESTA3K9 (gerado se vazio)"
                maxLength={32}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                O app PDV usa só este código para carregar o evento e vender/imprimir
                fichas.
              </p>
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
              <Field label="E-mail do portal (adm do evento)">
                <input
                  style={input}
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </Field>
            </div>

            <Field label="E-mail do operador (opcional)">
              <input
                style={input}
                type="email"
                value={form.operador_email ?? ''}
                onChange={(e) => setField('operador_email', e.target.value)}
                placeholder="Se vazio, usa o e-mail do portal"
              />
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Login separado em /operador. Pode ser outro e-mail + outra senha.
              </span>
            </Field>

            <Field label="Senha do portal (adm do evento)">
              <input
                style={input}
                type="password"
                value={form.portal_senha ?? ''}
                onChange={(e) => setField('portal_senha', e.target.value)}
                placeholder={
                  editingId
                    ? 'Nova senha do portal (opcional ao salvar)'
                    : 'Mínimo 4 caracteres — login do portal'
                }
                minLength={4}
                autoComplete="new-password"
              />
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Acesso ao painel do organizador (totem-portal). Para resetar sem
                editar tudo, use o botão <strong>Senha portal</strong> na lista.
              </span>
            </Field>

            <Field label="Senha do operador (modo operador web)">
              <input
                style={input}
                type="password"
                value={form.operador_senha ?? ''}
                onChange={(e) => setField('operador_senha', e.target.value)}
                placeholder={
                  editingId
                    ? 'Nova senha do operador (opcional ao salvar)'
                    : 'Opcional — se vazio, usa a mesma do portal'
                }
                minLength={4}
                autoComplete="new-password"
              />
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Login em /operador no PWA. Use <strong>Senha operador</strong> na
                lista para resetar.
              </span>
            </Field>

            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Gateway padrao">
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
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                  Configure MP e SumUp abaixo. No PDV Electron o operador escolhe
                  qual maquininha usar em cada venda.
                </p>
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

            {(
              <>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  marginTop: 4,
                  color: '#0f172a',
                }}
              >
                Mercado Pago
              </div>
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
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  marginTop: 16,
                  color: '#0f172a',
                }}
              >
                SumUp
              </div>
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
                <Field label="SumUp Affiliate App ID">
                  <input
                    style={input}
                    value={form.sumup_affiliate_app_id ?? ''}
                    onChange={(e) =>
                      setField('sumup_affiliate_app_id', e.target.value)
                    }
                    placeholder="com.sumup.xxx ou UUID do app"
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    Obrigatório para Solo (Cloud API). Crie em me.sumup.com →
                    Developers → Affiliate App.
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
                    Obrigatória para a maquininha Solo. Gere em me.sumup.com →
                    Developers → Affiliate Keys.
                  </p>
                </Field>
                <Field label="Pay To Email (Pix SumUp)">
                  <input
                    style={input}
                    value={form.sumup_pay_to_email ?? ''}
                    onChange={(e) =>
                      setField('sumup_pay_to_email', e.target.value)
                    }
                    placeholder="email@conta.sumup.com"
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                    E-mail da conta SumUp que recebe Pix online. Obrigatório para
                    Pix quando o gateway é SumUp.
                  </p>
                </Field>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      cursor: 'pointer',
                      marginBottom: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(form.sumup_surcharge_enabled)}
                      onChange={(e) =>
                        setField('sumup_surcharge_enabled', e.target.checked)
                      }
                      style={{ marginTop: 4 }}
                    />
                    <span>
                      <strong>Repassar taxa da maquininha ao cliente</strong>
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12,
                          color: '#64748b',
                          fontWeight: 400,
                        }}
                      >
                        A venda continua valendo o valor dos produtos. A taxa é
                        somada só no valor cobrado no cartão, para o organizador
                        receber o líquido cheio.
                      </p>
                    </span>
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: '#334155',
                        }}
                      >
                        Taxa débito (%)
                      </label>
                      <input
                        style={input}
                        inputMode="decimal"
                        value={form.sumup_debit_surcharge_percent ?? 0}
                        onChange={(e) =>
                          setField(
                            'sumup_debit_surcharge_percent',
                            Number(e.target.value.replace(',', '.')) || 0
                          )
                        }
                        placeholder="Ex: 1,99"
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: '#334155',
                        }}
                      >
                        Taxa crédito (%)
                      </label>
                      <input
                        style={input}
                        inputMode="decimal"
                        value={form.sumup_credit_surcharge_percent ?? 0}
                        onChange={(e) =>
                          setField(
                            'sumup_credit_surcharge_percent',
                            Number(e.target.value.replace(',', '.')) || 0
                          )
                        }
                        placeholder="Ex: 4,99"
                      />
                    </div>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#64748b' }}>
                    Use as taxas do contrato SumUp (app/extrato da Solo). Exemplo
                    em venda de R$ 100: débito 1,99% → cobra ~R$ 102,04; crédito
                    4,99% → cobra ~R$ 105,25. Informe o cliente sobre diferença
                    débito/crédito (Lei 13.455/2017).
                  </p>
                </div>
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

                {editingId && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-end',
                        flexWrap: 'wrap',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 13,
                            fontWeight: 600,
                            marginBottom: 4,
                            color: '#334155',
                          }}
                        >
                          Código de pareamento (da maquininha)
                        </label>
                        <input
                          style={input}
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value)}
                          placeholder="Ex.: 4WLFDSBF"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={parearReader}
                        disabled={pareando}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 8,
                          border: '1px solid #16a34a',
                          background: '#dcfce7',
                          color: '#15803d',
                          fontWeight: 600,
                          cursor: pareando ? 'default' : 'pointer',
                        }}
                      >
                        {pareando ? 'Pareando...' : '🔗 Parear maquininha'}
                      </button>
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
                      <b>Sandbox:</b> API Key <code>sk_test_</code> + Virtual Solo
                      (mesma conta). <b>Produção:</b> Solo física — deslogue do app,
                      Wi‑Fi only, firmware ≥ 3.3.39. Status &quot;paired&quot; ≠ online.
                    </p>
                    <button
                      type="button"
                      onClick={buscarSumupReaders}
                      disabled={buscandoReaders}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #0ea5e9',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontWeight: 600,
                        cursor: buscandoReaders ? 'default' : 'pointer',
                      }}
                    >
                      {buscandoReaders
                        ? 'Buscando...'
                        : '🔍 Buscar leitores SumUp pareados'}
                    </button>
                    {readersMsg && (
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: 13,
                          color:
                            readersMsg.startsWith('Leitor pareado') ||
                            readersMsg.startsWith('Maquininha selecionada') ||
                            readersMsg.includes('encontrados')
                              ? '#15803d'
                              : '#dc2626',
                        }}
                      >
                        {readersMsg}
                      </p>
                    )}
                    {sumupReaders.length > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#334155',
                          }}
                        >
                          Clique na maquininha para selecionar:
                        </p>
                        {sumupReaders.map((r) => {
                          const selected = form.sumup_reader_id === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => selecionarSumupReader(r)}
                              style={{
                                textAlign: 'left',
                                padding: '12px 14px',
                                borderRadius: 10,
                                border: selected
                                  ? '2px solid #16a34a'
                                  : '2px solid #94a3b8',
                                background: selected ? '#dcfce7' : '#f8fafc',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                boxShadow: selected
                                  ? '0 0 0 3px rgba(22,163,74,0.2)'
                                  : 'none',
                              }}
                            >
                              <span
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  border: selected
                                    ? '6px solid #16a34a'
                                    : '2px solid #64748b',
                                  background: '#fff',
                                  flexShrink: 0,
                                  boxSizing: 'border-box',
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: '#0f172a',
                                  }}
                                >
                                  {r.name || r.id}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: '#64748b',
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {r.id} · {r.model || 'reader'} · pareamento{' '}
                                  <b
                                    style={{
                                      color:
                                        r.status === 'paired'
                                          ? '#15803d'
                                          : '#dc2626',
                                    }}
                                  >
                                    {r.status}
                                  </b>
                                  {r.deviceStatus != null && (
                                    <>
                                      {' '}
                                      · aparelho{' '}
                                      <b
                                        style={{
                                          color:
                                            r.deviceStatus === 'online'
                                              ? '#15803d'
                                              : '#dc2626',
                                        }}
                                      >
                                        {r.deviceStatus}
                                      </b>
                                    </>
                                  )}
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: selected ? '#15803d' : '#0369a1',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {selected ? 'Selecionada' : 'Usar esta'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
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
    <label className="field" style={{ marginBottom: 12 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid #c2410c',
  background: '#ea580c',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: '1px solid #d6d3d1',
  background: '#fff',
  color: '#1c1917',
  fontWeight: 600,
  cursor: 'pointer',
};

const input: React.CSSProperties = {
  width: '100%',
  marginTop: 0,
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #d6d3d1',
  fontSize: 14,
  background: '#fff',
};
