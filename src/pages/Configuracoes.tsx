import { useEffect, useState, useRef, useCallback } from 'react'
import { User, Clock, Stethoscope, Camera, Save, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Tab = 'perfil' | 'horarios' | 'procedimentos'

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const inputCls = 'w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all bg-white'

// ── Shared Section Card ───────────────────────────────────────────────────────
function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-[14px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-[#F7EDF0] flex items-center justify-center"><Icon size={15} className="text-[#B85C72]" /></div>
        <h2 className="font-bold text-[#1A1A1A] text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}

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
        <div className={`relative w-20 h-20 bg-[#F4F2EF] ${rounded} overflow-hidden flex-shrink-0 border border-[#EBEBEB]`}>
          {url
            ? <img src={url} alt={label} className={`w-full h-full object-cover ${rounded}`} />
            : <div className="w-full h-full flex items-center justify-center text-[#7A7A7A] text-sm font-semibold">{label}</div>}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div>
          <button onClick={() => ref.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#EBEBEB] text-xs font-medium text-[#7A7A7A] hover:border-[#B85C72] hover:text-[#B85C72] transition-all">
            <Camera size={13} /> {uploading ? 'Enviando...' : 'Alterar foto'}
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
    </div>
  )
}

// ── ABA PERFIL ────────────────────────────────────────────────────────────────
function TabPerfil() {
  const [userId, setUserId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [nomeClinima, setNomeClinica] = useState('')
  const [savingNome, setSavingNome] = useState(false)
  const [nomeSaved, setNomeSaved] = useState(false)
  const [savingClinica, setSavingClinica] = useState(false)
  const [clinicaSaved, setClinicaSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // 1. Load logged user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      // 2. Upsert row in usuarios (creates if missing)
      const { data: u } = await supabase
        .from('usuarios')
        .upsert({ id: user.id, nome: '', avatar_url: null }, { onConflict: 'id', ignoreDuplicates: true })
        .select('nome, avatar_url')
        .single()

      // Fallback: just select if upsert returns null
      const { data: uFetch } = await supabase
        .from('usuarios').select('nome, avatar_url').eq('id', user.id).single()
      if (uFetch) { setNome(uFetch.nome ?? ''); setAvatarUrl(uFetch.avatar_url) }
      else if (u) { setNome(u.nome ?? ''); setAvatarUrl(u.avatar_url) }

      // 3. Load clinic config — insert default row if empty
      let { data: c } = await supabase
        .from('configuracoes_clinica').select('id, logo_url, nome_clinica').limit(1).maybeSingle()
      if (!c) {
        const { data: inserted } = await supabase
          .from('configuracoes_clinica')
          .insert({ nome_clinica: 'Minha Clínica', logo_url: null })
          .select('id, logo_url, nome_clinica').single()
        c = inserted
      }
      if (c) { setClinicId(c.id); setLogoUrl(c.logo_url); setNomeClinica(c.nome_clinica ?? '') }

      setLoading(false)
    }
    load()
  }, [])

  const saveNome = async () => {
    if (!userId) return
    setSavingNome(true)
    const { error } = await supabase.from('usuarios').update({ nome }).eq('id', userId)
    setSavingNome(false)
    if (error) { alert('Não foi possível salvar o nome. Tente novamente.'); return }
    setNomeSaved(true)
    setTimeout(() => setNomeSaved(false), 2500)
    window.dispatchEvent(new Event('user-profile-updated'))
  }

  const saveAvatar = async (url: string) => {
    if (!userId) return
    setAvatarUrl(url)
    const { error } = await supabase.from('usuarios').update({ avatar_url: url }).eq('id', userId)
    if (error) { alert('Não foi possível salvar o avatar. Tente novamente.'); return }
    window.dispatchEvent(new Event('user-profile-updated'))
  }

  const saveLogo = async (url: string) => {
    setLogoUrl(url)
    if (clinicId) {
      const { error } = await supabase.from('configuracoes_clinica').update({ logo_url: url }).eq('id', clinicId)
      if (error) { alert('Não foi possível salvar o logo. Tente novamente.'); return }
    }
    window.dispatchEvent(new Event('clinic-logo-updated'))
  }

  const saveClinica = async () => {
    if (!clinicId) return
    setSavingClinica(true)
    const { error } = await supabase.from('configuracoes_clinica').update({ nome_clinica: nomeClinima }).eq('id', clinicId)
    setSavingClinica(false)
    if (error) { alert('Não foi possível salvar o nome da clínica. Tente novamente.'); return }
    setClinicaSaved(true)
    setTimeout(() => setClinicaSaved(false), 2500)
    window.dispatchEvent(new Event('clinic-logo-updated'))
  }

  const initials = nome
    ? nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  if (loading) return (
    <div className="flex justify-center py-12">
      <span className="w-6 h-6 border-2 border-[#B85C72] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Foto */}
      <Card title="Foto de Perfil" icon={User}>
        <UploadAvatar
          url={avatarUrl}
          bucket="avatars"
          path={`avatar_${userId}`}
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60 whitespace-nowrap">
            {savingNome ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : nomeSaved ? <Check size={14} /> : <Save size={14} />}
            {nomeSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </Card>

      {/* Logo */}
      <Card title="Logo da Clínica" icon={Stethoscope}>
        <UploadAvatar
          url={logoUrl}
          bucket="logos"
          path="clinic_logo"
          label="Sem logo"
          onUploaded={saveLogo}
        />
        <p className="text-xs text-[#7A7A7A] mt-3">Recomendado: PNG com fundo transparente, mínimo 200×200px.</p>
      </Card>

      {/* Nome da clínica */}
      <Card title="Nome da Clínica" icon={Stethoscope}>
        <div className="flex gap-3">
          <input value={nomeClinima} onChange={e => setNomeClinica(e.target.value)}
            placeholder="Nome da clínica" className={inputCls} />
          <button onClick={saveClinica} disabled={savingClinica}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60 whitespace-nowrap">
            {savingClinica ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : clinicaSaved ? <Check size={14} /> : <Save size={14} />}
            {clinicaSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
        <p className="text-xs text-[#7A7A7A] mt-2">Exibido no topo da barra lateral ao lado da logo.</p>
      </Card>
    </div>
  )
}

// ── ABA HORÁRIOS ──────────────────────────────────────────────────────────────
interface HorarioRow { id: string; dia_semana: number; ativo: boolean; hora_inicio: string; hora_fim: string }

function TabHorarios() {
  const [rows, setRows] = useState<HorarioRow[]>([])
  const [saving, setSaving] = useState<Record<number, boolean>>({})
  const [saved, setSaved] = useState<Record<number, boolean>>({})

  useEffect(() => {
    supabase.from('horario_comercial').select('*').order('dia_semana')
      .then(({ data }) => { if (data) setRows(data as HorarioRow[]) })
  }, [])

  const update = (dia: number, patch: Partial<HorarioRow>) => {
    setRows(prev => prev.map(r => r.dia_semana === dia ? { ...r, ...patch } : r))
  }

  const save = async (row: HorarioRow) => {
    setSaving(s => ({ ...s, [row.dia_semana]: true }))
    const { error } = await supabase.from('horario_comercial').update({
      ativo: row.ativo, hora_inicio: row.hora_inicio, hora_fim: row.hora_fim
    }).eq('id', row.id)
    setSaving(s => ({ ...s, [row.dia_semana]: false }))
    if (error) { alert('Não foi possível salvar o horário. Tente novamente.'); return }
    setSaved(s => ({ ...s, [row.dia_semana]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [row.dia_semana]: false })), 2000)
  }

  return (
    <Card title="Horários de Funcionamento" icon={Clock}>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.dia_semana}
            className={`flex flex-wrap items-center gap-3 p-4 rounded-xl border transition-colors ${row.ativo ? 'border-[#EBEBEB] bg-white' : 'border-[#F0F0F0] bg-[#FAFAFA]'}`}>

            {/* Toggle */}
            <button onClick={() => update(row.dia_semana, { ativo: !row.ativo })}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${row.ativo ? 'bg-[#B85C72]' : 'bg-[#D4D4D4]'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${row.ativo ? 'left-5' : 'left-1'}`} />
            </button>

            {/* Day name */}
            <span className={`text-sm font-semibold w-32 flex-shrink-0 ${row.ativo ? 'text-[#1A1A1A]' : 'text-[#7A7A7A]'}`}>
              {DIAS[row.dia_semana]}
            </span>

            {/* Hours */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input type="time" value={row.hora_inicio} disabled={!row.ativo}
                onChange={e => update(row.dia_semana, { hora_inicio: e.target.value })}
                className="border border-[#EBEBEB] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#B85C72] transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white" />
              <span className="text-xs text-[#7A7A7A]">até</span>
              <input type="time" value={row.hora_fim} disabled={!row.ativo}
                onChange={e => update(row.dia_semana, { hora_fim: e.target.value })}
                className="border border-[#EBEBEB] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#B85C72] transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white" />
            </div>

            {/* Save */}
            <button onClick={() => save(row)} disabled={!!saving[row.dia_semana]}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7EDF0] text-[#B85C72] text-xs font-semibold hover:bg-[#B85C72] hover:text-white transition-all disabled:opacity-60 flex-shrink-0">
              {saving[row.dia_semana] ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : saved[row.dia_semana] ? <Check size={12} /> : <Save size={12} />}
              {saved[row.dia_semana] ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── ABA PROCEDIMENTOS ─────────────────────────────────────────────────────────
interface Procedimento { id: string; nome: string; descricao: string | null; ativo: boolean }

function TabProcedimentos() {
  const [items, setItems] = useState<Procedimento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', descricao: '' })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('servicos_clinica').select('*').order('nome')
    setItems((data ?? []) as Procedimento[])
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openNew = () => { setEditId(null); setForm({ nome: '', descricao: '' }); setShowForm(true) }
  const openEdit = (p: Procedimento) => { setEditId(p.id); setForm({ nome: p.nome, descricao: p.descricao ?? '' }); setShowForm(true) }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    if (editId) {
      const { error } = await supabase.from('servicos_clinica').update({ nome: form.nome, descricao: form.descricao }).eq('id', editId)
      if (error) { setSaving(false); alert('Não foi possível salvar. Tente novamente.'); return }
    } else {
      const { error } = await supabase.from('servicos_clinica').insert({ nome: form.nome, descricao: form.descricao, ativo: true })
      if (error) { setSaving(false); alert('Não foi possível adicionar. Tente novamente.'); return }
    }
    setSaving(false); setShowForm(false); fetch()
  }

  const toggleAtivo = async (p: Procedimento) => {
    await supabase.from('servicos_clinica').update({ ativo: !p.ativo }).eq('id', p.id)
    setItems(prev => prev.map(i => i.id === p.id ? { ...i, ativo: !i.ativo } : i))
  }

  const deleteProcedimento = async (id: string) => {
    await supabase.from('servicos_clinica').delete().eq('id', id)
    setConfirmDelete(null); fetch()
  }

  return (
    <Card title="Procedimentos" icon={Stethoscope}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-[#7A7A7A]">{items.length} procedimento{items.length !== 1 ? 's' : ''} cadastrado{items.length !== 1 ? 's' : ''}</p>
        <button onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#B85C72] text-white text-xs font-semibold hover:bg-[#8F3F55] transition-colors">
          <Plus size={13} /> Novo Procedimento
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <form onSubmit={submit} className="mb-4 p-4 border-2 border-[#B85C72]/30 rounded-xl bg-[#FDF8F9] space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-bold text-[#1A1A1A]">{editId ? 'Editar Procedimento' : 'Novo Procedimento'}</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-[#7A7A7A] hover:text-[#1A1A1A] transition-colors"><X size={16} /></button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] uppercase tracking-wide mb-1.5">Nome <span className="text-[#B85C72]">*</span></label>
            <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className={inputCls} placeholder="Ex: Lipoaspiração" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] uppercase tracking-wide mb-1.5">Descrição <span className="text-[#B85C72]">*</span></label>
            <textarea required rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className={`${inputCls} resize-none`} placeholder="Descrição do procedimento..." />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-[#EBEBEB] text-sm text-[#7A7A7A] hover:bg-[#F4F2EF] transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className={`border rounded-xl transition-all ${p.ativo ? 'border-[#EBEBEB]' : 'border-[#F0F0F0] bg-[#FAFAFA]'}`}>
            <div className="flex items-center gap-3 p-4">
              {/* Toggle ativo */}
              <button onClick={() => toggleAtivo(p)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${p.ativo ? 'bg-[#B85C72]' : 'bg-[#D4D4D4]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.ativo ? 'left-4' : 'left-0.5'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${p.ativo ? 'text-[#1A1A1A]' : 'text-[#7A7A7A]'}`}>{p.nome}</p>
                {p.descricao && !expanded[p.id] && (
                  <p className="text-xs text-[#7A7A7A] truncate mt-0.5">{p.descricao}</p>
                )}
                {p.descricao && expanded[p.id] && (
                  <p className="text-xs text-[#7A7A7A] mt-0.5 leading-relaxed">{p.descricao}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {p.descricao && (
                  <button onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}
                    className="p-1.5 rounded-lg text-[#7A7A7A] hover:bg-[#F4F2EF] hover:text-[#B85C72] transition-all">
                    {expanded[p.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button onClick={() => openEdit(p)}
                  className="p-1.5 rounded-lg text-[#7A7A7A] hover:bg-[#F4F2EF] hover:text-[#B85C72] transition-all">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDelete(p.id)}
                  className="p-1.5 rounded-lg text-[#7A7A7A] hover:bg-[#FDECEA] hover:text-[#C0392B] transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Delete confirm */}
            {confirmDelete === p.id && (
              <div className="px-4 pb-4 flex items-center gap-3 border-t border-[#FDECEA] pt-3 bg-[#FFF8F8] rounded-b-xl">
                <p className="text-xs text-[#C0392B] flex-1">Tem certeza que deseja excluir <strong>{p.nome}</strong>?</p>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#EBEBEB] text-xs text-[#7A7A7A] hover:bg-gray-50 transition-colors">Cancelar</button>
                <button onClick={() => deleteProcedimento(p.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#C0392B] text-white text-xs font-semibold hover:bg-[#922B21] transition-colors">Excluir</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'perfil', label: 'Perfil', icon: User },
  { key: 'horarios', label: 'Horários de Funcionamento', icon: Clock },
  { key: 'procedimentos', label: 'Procedimentos', icon: Stethoscope },
]

export default function Configuracoes() {
  const [tab, setTab] = useState<Tab>('perfil')

  return (
    <div className="p-6 h-full overflow-y-auto space-y-5">
      <div className="fade-in-up">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Configurações</h1>
        <p className="text-sm text-[#7A7A7A] mt-0.5">Gerencie o perfil, horários e procedimentos da clínica</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-[#EBEBEB] rounded-xl p-1 w-fit fade-in-up stagger-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? 'bg-[#B85C72] text-white shadow-sm' : 'text-[#7A7A7A] hover:text-[#1A1A1A]'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="fade-in-up stagger-2 max-w-2xl">
        {tab === 'perfil' && <TabPerfil />}
        {tab === 'horarios' && <TabHorarios />}
        {tab === 'procedimentos' && <TabProcedimentos />}
      </div>
    </div>
  )
}
