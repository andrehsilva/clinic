import { useEffect, useState, useRef, useCallback } from 'react'
import { User, Clock, Stethoscope, Camera, Save, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp, Users, Mail, UserMinus, Cake, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { MensagensProgramadas } from '../components/MensagensProgramadas'
import { MIN_SENHA, convidarUsuario, trocarSenha } from '../lib/auth'
import { renderizarMensagem } from '../lib/aniversario'

type Tab = 'perfil' | 'horarios' | 'procedimentos' | 'mensagens' | 'usuarios'

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const inputCls = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card'

// ── Upload Image Helper ───────────────────────────────────────────────────────
function UploadAvatar({ url, bucket, path, label, circle, onUploaded }: {
  url: string | null; bucket: string; path: string; label: string; circle?: boolean; onUploaded: (url: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  const upload = async (file: File) => {
    setError('')
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Tipo de arquivo não permitido. Use JPG, PNG, WebP ou GIF.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Arquivo muito grande. Tamanho máximo: 5MB.')
      return
    }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const filePath = `${path}.${ext}`
    const { error: uploadErr } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true })
    if (uploadErr) {
      setError('Erro no upload: ' + uploadErr.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
    onUploaded(data.publicUrl + '?t=' + Date.now())
    setUploading(false)
  }

  const rounded = circle ? 'rounded-full' : 'rounded-xl'

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className={`relative w-20 h-20 bg-page ${rounded} overflow-hidden flex-shrink-0 border border-border`}>
          {url
            ? <img src={url} alt={label} className={`w-full h-full object-cover ${rounded}`} />
            : <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm font-semibold">{label}</div>}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div>
          <button onClick={() => ref.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:border-accent hover:text-accent transition-all">
            <Camera size={13} /> {uploading ? 'Enviando...' : 'Alterar foto'}
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}

// ── ABA PERFIL ────────────────────────────────────────────────────────────────
function TabPerfil() {
  const { profile, clinic, clinicaId, loading: authLoading } = useAuth()
  const [nome, setNome] = useState(profile?.nome ?? '')
  const [nomeClinima, setNomeClinica] = useState(clinic?.nome_clinica ?? '')
  const [savingNome, setSavingNome] = useState(false)
  const [nomeSaved, setNomeSaved] = useState(false)
  const [savingClinica, setSavingClinica] = useState(false)
  const [clinicaSaved, setClinicaSaved] = useState(false)
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [senhaMsg, setSenhaMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => { setNome(profile?.nome ?? '') }, [profile?.nome])
  useEffect(() => { setNomeClinica(clinic?.nome_clinica ?? '') }, [clinic?.nome_clinica])

  const saveNome = async () => {
    if (!profile) return
    setSavingNome(true)
    const { error } = await supabase.from('usuarios').update({ nome }).eq('id', profile.id)
    setSavingNome(false)
    if (error) { setToastMsg('Não foi possível salvar o nome. Tente novamente.'); return }
    setNomeSaved(true)
    setTimeout(() => setNomeSaved(false), 2500)
    window.dispatchEvent(new Event('user-profile-updated'))
  }

  const saveAvatar = async (url: string) => {
    if (!profile) return
    const { error } = await supabase.from('usuarios').update({ avatar_url: url }).eq('id', profile.id)
    if (error) { setToastMsg('Não foi possível salvar o avatar. Tente novamente.'); return }
    window.dispatchEvent(new Event('user-profile-updated'))
  }

  const saveLogo = async (url: string) => {
    if (!clinicaId) return
    const { error } = await supabase.from('configuracoes_clinica').update({ logo_url: url }).eq('id', clinicaId)
    if (error) { setToastMsg('Não foi possível salvar o logo. Tente novamente.'); return }
    window.dispatchEvent(new Event('clinic-logo-updated'))
  }

  const saveClinica = async () => {
    if (!clinicaId) return
    setSavingClinica(true)
    const { error } = await supabase.from('configuracoes_clinica').update({ nome_clinica: nomeClinima }).eq('id', clinicaId)
    setSavingClinica(false)
    if (error) { setToastMsg('Não foi possível salvar o nome da clínica. Tente novamente.'); return }
    setClinicaSaved(true)
    setTimeout(() => setClinicaSaved(false), 2500)
    window.dispatchEvent(new Event('clinic-logo-updated'))
  }

  const salvarSenha = async () => {
    setSenhaMsg(null)
    if (novaSenha.length < MIN_SENHA) {
      setSenhaMsg({ ok: false, texto: `A nova senha precisa ter pelo menos ${MIN_SENHA} caracteres.` })
      return
    }
    if (novaSenha !== confirmarSenha) {
      setSenhaMsg({ ok: false, texto: 'A confirmação não bate com a nova senha.' })
      return
    }
    setSalvandoSenha(true)
    const erro = await trocarSenha(senhaAtual, novaSenha)
    setSalvandoSenha(false)
    if (erro) { setSenhaMsg({ ok: false, texto: erro }); return }
    setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('')
    setSenhaMsg({ ok: true, texto: 'Senha alterada. Use a nova senha no próximo acesso.' })
  }

  const initials = nome
    ? nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  if (authLoading) return (
    <div className="flex justify-center py-12">
      <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Foto */}
      <Card title="Foto de Perfil" icon={User}>
        <UploadAvatar
          url={profile?.avatar_url ?? null}
          bucket="avatars"
          path={`avatar_${profile?.id}`}
          label={initials}
          circle
          onUploaded={saveAvatar}
        />
      </Card>

      {/* Nome do usuário */}
      <Card title="Nome do Usuário" icon={User}>
        <div className="flex gap-3">
          <input value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Seu nome completo" className={inputCls} />
          <button onClick={saveNome} disabled={savingNome}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 whitespace-nowrap">
            {savingNome ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : nomeSaved ? <Check size={14} /> : <Save size={14} />}
            {nomeSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </Card>

      {/* Senha */}
      <Card title="Senha de acesso" icon={KeyRound}>
        <div className="space-y-3">
          <input type={mostrarSenha ? 'text' : 'password'} value={senhaAtual}
            onChange={e => { setSenhaAtual(e.target.value); setSenhaMsg(null) }}
            placeholder="Senha atual" autoComplete="current-password" className={inputCls} />
          <input type={mostrarSenha ? 'text' : 'password'} value={novaSenha}
            onChange={e => { setNovaSenha(e.target.value); setSenhaMsg(null) }}
            placeholder={`Nova senha (mínimo ${MIN_SENHA} caracteres)`} autoComplete="new-password" className={inputCls} />
          <input type={mostrarSenha ? 'text' : 'password'} value={confirmarSenha}
            onChange={e => { setConfirmarSenha(e.target.value); setSenhaMsg(null) }}
            placeholder="Confirmar nova senha" autoComplete="new-password" className={inputCls} />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input type="checkbox" checked={mostrarSenha} onChange={e => setMostrarSenha(e.target.checked)} />
              Mostrar senhas
            </label>
            <button onClick={salvarSenha} disabled={salvandoSenha || !senhaAtual || !novaSenha || !confirmarSenha}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 whitespace-nowrap">
              {salvandoSenha ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <KeyRound size={14} />}
              Trocar senha
            </button>
          </div>
          {senhaMsg && (
            <p className={`text-xs rounded-lg px-3 py-2 border ${senhaMsg.ok
              ? 'text-success bg-success-light border-success/20'
              : 'text-status-danger bg-status-danger-light border-status-danger/20'}`}>
              {senhaMsg.texto}
            </p>
          )}
          <p className="text-xs text-text-secondary">
            Informe a senha atual para confirmar a troca. Se esqueceu, saia e use "Esqueci minha senha" na tela de login.
          </p>
        </div>
      </Card>

      {clinicaId ? (
        <>
          {/* Logo */}
          <Card title="Logo da Clínica" icon={Stethoscope}>
            <UploadAvatar
              url={clinic?.logo_url ?? null}
              bucket="logos"
              path={`clinic_logo_${clinicaId}`}
              label="Sem logo"
              onUploaded={saveLogo}
            />
            <p className="text-xs text-text-secondary mt-3">Recomendado: PNG com fundo transparente, mínimo 200×200px.</p>
          </Card>

          {/* Nome da clínica */}
          <Card title="Nome da Clínica" icon={Stethoscope}>
            <div className="flex gap-3">
              <input value={nomeClinima} onChange={e => setNomeClinica(e.target.value)}
                placeholder="Nome da clínica" className={inputCls} />
              <button onClick={saveClinica} disabled={savingClinica}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 whitespace-nowrap">
                {savingClinica ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : clinicaSaved ? <Check size={14} /> : <Save size={14} />}
                {clinicaSaved ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">Exibido no topo da barra lateral ao lado da logo.</p>
          </Card>
        </>
      ) : (
        <Card title="Clínica" icon={Stethoscope}>
          <p className="text-sm text-text-secondary">
            Sua conta ainda não está vinculada a nenhuma clínica. Fale com o administrador do sistema para concluir seu cadastro.
          </p>
        </Card>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  )
}

// ── ABA HORÁRIOS ──────────────────────────────────────────────────────────────
interface HorarioRow { id: string; dia_semana: number; ativo: boolean; hora_inicio: string; hora_fim: string }

function TabHorarios() {
  const { clinicaId } = useAuth()
  const [rows, setRows] = useState<HorarioRow[]>([])
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!clinicaId) return
    supabase.from('horario_comercial').select('*').eq('clinica_id', clinicaId).order('dia_semana')
      .then(({ data, error }) => {
        if (error) { setToastMsg('Não foi possível carregar os horários. Tente recarregar a página.'); return }
        if (data) setRows(data as HorarioRow[])
      })
  }, [clinicaId])

  const update = (dia: number, patch: Partial<HorarioRow>) => {
    setRows(prev => prev.map(r => r.dia_semana === dia ? { ...r, ...patch } : r))
  }

  const save = async (row: HorarioRow) => {
    setSaving(s => ({ ...s, [row.dia_semana]: true }))
    const { error } = await supabase.from('horario_comercial').update({
      ativo: row.ativo, hora_inicio: row.hora_inicio, hora_fim: row.hora_fim
    }).eq('id', row.id).eq('clinica_id', clinicaId)
    setSaving(s => ({ ...s, [row.dia_semana]: false }))
    if (error) { setToastMsg('Não foi possível salvar o horário. Tente novamente.'); return }
    setSaved(s => ({ ...s, [row.dia_semana]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [row.dia_semana]: false })), 2000)
  }

  if (!clinicaId) return (
    <Card title="Horários de Funcionamento" icon={Clock}>
      <p className="text-sm text-text-secondary">Sua conta ainda não está vinculada a nenhuma clínica.</p>
    </Card>
  )

  return (
    <Card title="Horários de Funcionamento" icon={Clock}>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.dia_semana}
            className={`flex flex-wrap items-center gap-3 p-4 rounded-xl border transition-colors ${row.ativo ? 'border-border bg-card' : 'border-border-subtle bg-surface-hover'}`}>

            {/* Toggle */}
            <button onClick={() => update(row.dia_semana, { ativo: !row.ativo })}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${row.ativo ? 'bg-accent' : 'bg-border'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${row.ativo ? 'left-5' : 'left-1'}`} />
            </button>

            {/* Day name */}
            <span className={`text-sm font-semibold w-32 flex-shrink-0 ${row.ativo ? 'text-text-primary' : 'text-text-secondary'}`}>
              {DIAS[row.dia_semana]}
            </span>

            {/* Hours */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input type="time" value={row.hora_inicio} disabled={!row.ativo}
                onChange={e => update(row.dia_semana, { hora_inicio: e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-card" />
              <span className="text-xs text-text-secondary">até</span>
              <input type="time" value={row.hora_fim} disabled={!row.ativo}
                onChange={e => update(row.dia_semana, { hora_fim: e.target.value })}
                className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-card" />
            </div>

            {/* Save */}
            <button onClick={() => save(row)} disabled={!!saving[row.dia_semana]}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-all disabled:opacity-60 flex-shrink-0">
              {saving[row.dia_semana] ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : saved[row.dia_semana] ? <Check size={12} /> : <Save size={12} />}
              {saved[row.dia_semana] ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        ))}
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </Card>
  )
}

// ── ABA PROCEDIMENTOS ─────────────────────────────────────────────────────────
interface Procedimento { id: string; nome: string; descricao: string | null; ativo: boolean }

function TabProcedimentos() {
  const { clinicaId } = useAuth()
  const [items, setItems] = useState<Procedimento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', descricao: '' })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!clinicaId) return
    const { data, error } = await supabase.from('servicos_clinica').select('*').eq('clinica_id', clinicaId).order('nome')
    if (error) setToastMsg('Não foi possível carregar os procedimentos. Tente recarregar a página.')
    setItems((data ?? []) as Procedimento[])
  }, [clinicaId])

  useEffect(() => { fetch() }, [fetch])

  const openNew = () => { setEditId(null); setForm({ nome: '', descricao: '' }); setShowForm(true) }
  const openEdit = (p: Procedimento) => { setEditId(p.id); setForm({ nome: p.nome, descricao: p.descricao ?? '' }); setShowForm(true) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clinicaId) return
    setSaving(true)
    if (editId) {
      const { error } = await supabase.from('servicos_clinica').update({ nome: form.nome, descricao: form.descricao }).eq('id', editId).eq('clinica_id', clinicaId)
      if (error) { setSaving(false); setToastMsg('Não foi possível salvar. Tente novamente.'); return }
    } else {
      const { error } = await supabase.from('servicos_clinica').insert({ nome: form.nome, descricao: form.descricao, ativo: true, clinica_id: clinicaId })
      if (error) { setSaving(false); setToastMsg('Não foi possível adicionar. Tente novamente.'); return }
    }
    setSaving(false); setShowForm(false); fetch()
  }

  const toggleAtivo = async (p: Procedimento) => {
    await supabase.from('servicos_clinica').update({ ativo: !p.ativo }).eq('id', p.id).eq('clinica_id', clinicaId)
    setItems(prev => prev.map(i => i.id === p.id ? { ...i, ativo: !i.ativo } : i))
  }

  const deleteProcedimento = async (id: string) => {
    await supabase.from('servicos_clinica').delete().eq('id', id).eq('clinica_id', clinicaId)
    setConfirmDelete(null); fetch()
  }

  if (!clinicaId) return (
    <Card title="Procedimentos" icon={Stethoscope}>
      <p className="text-sm text-text-secondary">Sua conta ainda não está vinculada a nenhuma clínica.</p>
    </Card>
  )

  return (
    <Card title="Procedimentos" icon={Stethoscope}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-text-secondary">{items.length} procedimento{items.length !== 1 ? 's' : ''} cadastrado{items.length !== 1 ? 's' : ''}</p>
        <button onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-dark transition-colors">
          <Plus size={13} /> Novo Procedimento
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form onSubmit={submit} className="mb-4 p-4 border-2 border-accent/30 rounded-xl bg-accent-light space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-text-primary">{editId ? 'Editar Procedimento' : 'Novo Procedimento'}</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary transition-colors"><X size={16} /></button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Nome <span className="text-accent">*</span></label>
            <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className={inputCls} placeholder="Ex: Lipoaspiração" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Descrição <span className="text-accent">*</span></label>
            <textarea required rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className={`${inputCls} resize-none`} placeholder="Descrição do procedimento..." />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-border text-sm text-text-secondary hover:bg-page transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className={`border rounded-xl transition-all ${p.ativo ? 'border-border' : 'border-border-subtle bg-surface-hover'}`}>
            <div className="flex items-center gap-3 p-4">
              {/* Toggle ativo */}
              <button onClick={() => toggleAtivo(p)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${p.ativo ? 'bg-accent' : 'bg-border'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.ativo ? 'left-4' : 'left-0.5'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${p.ativo ? 'text-text-primary' : 'text-text-secondary'}`}>{p.nome}</p>
                {p.descricao && !expanded[p.id] && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">{p.descricao}</p>
                )}
                {p.descricao && expanded[p.id] && (
                  <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{p.descricao}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.descricao && (
                  <button onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-page hover:text-accent transition-all">
                    {expanded[p.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button onClick={() => openEdit(p)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-page hover:text-accent transition-all">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDelete(p.id)}
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-status-danger-light hover:text-status-danger transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Delete confirm */}
            {confirmDelete === p.id && (
              <div className="px-4 pb-4 flex items-center gap-3 border-t border-status-danger-light pt-3 bg-status-danger-light rounded-b-xl">
                <p className="text-xs text-status-danger flex-1">Tem certeza que deseja excluir <strong>{p.nome}</strong>?</p>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-hover transition-colors">Cancelar</button>
                <button onClick={() => deleteProcedimento(p.id)}
                  className="px-3 py-1.5 rounded-lg bg-status-danger text-white text-xs font-semibold hover:bg-status-danger/90 transition-colors">Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </Card>
  )
}

// ── ABA USUÁRIOS ──────────────────────────────────────────────────────────────
interface UsuarioClinica { id: string; nome: string | null }
interface ConviteClinica { id: string; email: string; created_at: string }

function TabUsuarios() {
  const { clinicaId, profile } = useAuth()
  const [usuarios, setUsuarios] = useState<UsuarioClinica[]>([])
  const [convites, setConvites] = useState<ConviteClinica[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!clinicaId) { setLoading(false); return }
    const [{ data: u }, { data: c }] = await Promise.all([
      supabase.from('usuarios').select('id, nome').eq('clinica_id', clinicaId).order('nome'),
      supabase.from('convites_clinica').select('id, email, created_at').eq('clinica_id', clinicaId).order('created_at'),
    ])
    setUsuarios((u ?? []) as UsuarioClinica[])
    setConvites((c ?? []) as ConviteClinica[])
    setLoading(false)
  }, [clinicaId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clinicaId) return
    setInviting(true)
    setInviteError('')
    setInviteMsg('')

    const erro = await convidarUsuario(email, clinicaId)
    setInviting(false)
    if (erro) { setInviteError(erro); return }
    setInviteMsg('Convite enviado! Ao clicar no link, a pessoa define a própria senha e já entra na clínica.')
    setEmail('')
    fetchAll()
  }

  const cancelarConvite = async (id: string) => {
    await supabase.from('convites_clinica').delete().eq('id', id)
    fetchAll()
  }

  const removerAcesso = async (id: string) => {
    await supabase.from('usuarios').update({ clinica_id: null }).eq('id', id)
    setConfirmRemove(null)
    fetchAll()
  }

  if (!clinicaId) return (
    <Card title="Usuários" icon={Users}>
      <p className="text-sm text-text-secondary">Sua conta ainda não está vinculada a nenhuma clínica.</p>
    </Card>
  )

  if (loading) return (
    <Card title="Usuários" icon={Users}>
      <div className="flex justify-center py-8">
        <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    </Card>
  )

  return (
    <div className="space-y-5">
      <Card title="Convidar Usuário" icon={Mail}>
        <p className="text-xs text-text-secondary mb-3">
          A pessoa recebe um link por e-mail para entrar — sem senha. Assim que ela clicar, já tem acesso a esta clínica automaticamente.
        </p>
        <form onSubmit={sendInvite} className="flex flex-wrap items-center gap-2">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@daclinica.com"
            className="flex-1 min-w-[220px] border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent bg-card" />
          <button type="submit" disabled={!email.trim() || inviting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50">
            {inviting ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Mail size={14} />}
            Enviar convite
          </button>
        </form>
        {inviteMsg && <p className="text-xs text-success bg-success-light border border-success/20 rounded-lg px-3 py-2 mt-3">{inviteMsg}</p>}
        {inviteError && <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2 mt-3">{inviteError}</p>}
      </Card>

      <Card title="Quem tem acesso a esta clínica" icon={Users}>
        {usuarios.length === 0 ? (
          <p className="text-sm text-text-secondary">Nenhum usuário vinculado ainda.</p>
        ) : (
          <div className="space-y-2">
            {usuarios.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
                <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 text-accent text-xs font-bold">
                  {(u.nome || '?').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <p className="text-sm font-medium text-text-primary flex-1 truncate">{u.nome || 'Sem nome ainda'}</p>
                {u.id === profile?.id ? (
                  <span className="text-[10px] text-text-secondary uppercase tracking-wide">Você</span>
                ) : confirmRemove === u.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-status-danger">Remover?</span>
                    <button onClick={() => removerAcesso(u.id)}
                      className="px-2 py-1 rounded-lg bg-status-danger text-white text-[11px] font-semibold hover:bg-status-danger/90 transition-colors">Confirmar</button>
                    <button onClick={() => setConfirmRemove(null)}
                      className="px-2 py-1 rounded-lg border border-border text-[11px] text-text-secondary hover:bg-surface-hover transition-colors">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRemove(u.id)} title="Remover acesso à clínica"
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-status-danger-light hover:text-status-danger transition-all">
                    <UserMinus size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {convites.length > 0 && (
        <Card title="Convites Pendentes" icon={Mail}>
          <div className="space-y-2">
            {convites.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 border border-border rounded-xl">
                <p className="text-sm text-text-primary flex-1 truncate">{c.email}</p>
                <span className="text-[10px] text-text-secondary">Aguardando login</span>
                <button onClick={() => cancelarConvite(c.id)} title="Cancelar convite"
                  className="p-1.5 rounded-lg text-text-secondary hover:bg-status-danger-light hover:text-status-danger transition-all">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Mensagens automáticas ─────────────────────────────────────────────────────
const MENSAGEM_MAX = 1000

function TabMensagens() {
  const { clinicaId, clinic, profile } = useAuth()
  const [ativo, setAtivo] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [salvo, setSalvo] = useState({ ativo: false, mensagem: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!clinicaId) { setLoading(false); return }
    supabase
      .from('configuracoes_clinica')
      .select('aniversario_ativo, mensagem_aniversario')
      .eq('id', clinicaId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setToastMsg('Não foi possível carregar as mensagens. Tente recarregar a página.'); setLoading(false); return }
        const a = !!data?.aniversario_ativo
        const m = (data?.mensagem_aniversario as string | null) ?? ''
        setAtivo(a); setMensagem(m); setSalvo({ ativo: a, mensagem: m })
        setLoading(false)
      })
  }, [clinicaId])

  if (!clinicaId) return (
    <Card title="Mensagem de aniversário" icon={Cake}>
      <p className="text-sm text-text-secondary">Sua conta ainda não está vinculada a nenhuma clínica.</p>
    </Card>
  )

  const dirty = ativo !== salvo.ativo || mensagem !== salvo.mensagem
  // Prévia com os dados deste tenant: nome de exemplo para o cliente e o nome
  // real da clínica, igual ao que o envio diário vai usar.
  const preview = renderizarMensagem(mensagem, {
    nome: profile?.nome ?? null,
    clinica: clinic?.nome_clinica ?? null,
  })

  const salvar = async () => {
    if (!mensagem.trim()) { setToastMsg('Escreva a mensagem antes de salvar.'); return }
    if (mensagem.length > MENSAGEM_MAX) { setToastMsg(`A mensagem pode ter no máximo ${MENSAGEM_MAX} caracteres.`); return }
    setSaving(true)
    const { error } = await supabase
      .from('configuracoes_clinica')
      .update({ aniversario_ativo: ativo, mensagem_aniversario: mensagem })
      .eq('id', clinicaId)
    setSaving(false)
    if (error) { setToastMsg('Não foi possível salvar. Tente novamente.'); return }
    setSalvo({ ativo, mensagem })
    setToastMsg('Configuração salva.')
  }

  return (
    <div className="space-y-5">
    <Card title="Mensagem de aniversário" icon={Cake}>
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-semibold text-text-primary">Enviar mensagem no aniversário dos clientes</span>
              <span className="block text-[11px] text-text-secondary mt-0.5">
                Todo dia, o sistema envia a mensagem pelo WhatsApp a quem faz aniversário e tem data de nascimento cadastrada. Cada cliente recebe uma vez por ano.
              </span>
            </span>
          </label>

          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Texto da mensagem</label>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={5}
              maxLength={MENSAGEM_MAX}
              className={`${inputCls} mt-1.5 resize-y`}
            />
            <div className="flex justify-between text-[11px] text-text-secondary mt-1">
              <span>Use <code>{'{nome}'}</code> para o primeiro nome e <code>{'{clinica}'}</code> para o nome da clínica.</span>
              <span>{mensagem.length}/{MENSAGEM_MAX}</span>
            </div>
          </div>

          <div className="bg-page border border-border rounded-xl p-3">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Prévia com os dados desta clínica</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{preview || '—'}</p>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={!dirty || saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60">
              <Save size={14} /> Salvar
            </button>
          </div>
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </Card>

    <MensagensProgramadas />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'perfil', label: 'Perfil', icon: User },
  { key: 'horarios', label: 'Horários de Funcionamento', icon: Clock },
  { key: 'procedimentos', label: 'Procedimentos', icon: Stethoscope },
  { key: 'mensagens', label: 'Mensagens', icon: Cake },
  { key: 'usuarios', label: 'Usuários', icon: Users },
]

export default function Configuracoes() {
  const [tab, setTab] = useState<Tab>('perfil')

  return (
    <div className="p-6 h-full overflow-y-auto space-y-5">
      <div className="fade-in-up">
        <h1 className="text-2xl font-bold text-text-primary">Configurações</h1>
        <p className="text-sm text-text-secondary mt-0.5">Gerencie o perfil, horários e procedimentos da clínica</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit fade-in-up stagger-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fade-in-up stagger-2 max-w-2xl">
        {tab === 'perfil' && <TabPerfil />}
        {tab === 'horarios' && <TabHorarios />}
        {tab === 'procedimentos' && <TabProcedimentos />}
        {tab === 'mensagens' && <TabMensagens />}
        {tab === 'usuarios' && <TabUsuarios />}
      </div>
    </div>
  )
}
