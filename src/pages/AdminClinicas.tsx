import { Fragment, useEffect, useState, useCallback } from 'react'
import { Building2, Plus, X, Save, Pencil, UserPlus, Phone, Mail, ChevronDown, ChevronUp, Users, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/format'
import { Toast } from '../components/Toast'
import { FunilEditor } from '../components/FunilEditor'
import { useAuth } from '../contexts/AuthContext'
import { isNicho, type Nicho } from '../lib/funil'
import { convidarUsuario } from '../lib/auth'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Clinica {
  id: string
  nome_clinica: string | null
  numero_whatsapp: string | null
  nicho: string
  created_at: string
}

interface UsuarioPendente {
  id: string
  nome: string | null
}

interface UsuarioClinica {
  id: string
  nome: string | null
  clinica_id: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_HORARIOS = [0, 1, 2, 3, 4, 5, 6].map(dia => ({
  dia_semana: dia,
  ativo: dia >= 1 && dia <= 5,
  hora_inicio: '09:00:00',
  hora_fim: '18:00:00',
}))

// ─── Modal Nova/Editar Clínica ─────────────────────────────────────────────────
function ClinicaModal({ clinica, onClose, onSaved }: { clinica?: Clinica; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!clinica
  const [nome, setNome] = useState(clinica?.nome_clinica ?? '')
  const [numero, setNumero] = useState(clinica?.numero_whatsapp ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (isEdit) {
      const { error } = await supabase.from('configuracoes_clinica')
        .update({ nome_clinica: nome.trim(), numero_whatsapp: numero.trim() || null })
        .eq('id', clinica!.id)
      if (error) {
        setError(error.code === '23505' ? 'Esse número de WhatsApp já está em uso por outra clínica.' : 'Erro ao salvar. Tente novamente.')
        setSaving(false)
        return
      }
      onSaved(); onClose()
      return
    }

    const { data, error } = await supabase.from('configuracoes_clinica')
      .insert({ nome_clinica: nome.trim(), numero_whatsapp: numero.trim() || null })
      .select('id')
      .single()
    if (error) {
      setError(error.code === '23505' ? 'Esse número de WhatsApp já está em uso por outra clínica.' : 'Erro ao criar clínica. Tente novamente.')
      setSaving(false)
      return
    }

    const { error: horariosError } = await supabase.from('horario_comercial')
      .insert(DEFAULT_HORARIOS.map(h => ({ ...h, clinica_id: data.id })))
    if (horariosError) {
      setError('Clínica criada, mas houve um erro ao gerar os horários padrão. Configure manualmente depois.')
      setSaving(false)
      onSaved()
      return
    }

    onSaved(); onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar Clínica' : 'Nova Clínica'} className="bg-card rounded-[14px] shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-bold text-text-primary">{isEdit ? 'Editar Clínica' : 'Nova Clínica'}</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Nome da Clínica *</label>
            <input required autoFocus value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Clínica Bella Vita"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Número de WhatsApp *</label>
            <input required value={numero} onChange={e => setNumero(e.target.value)}
              placeholder="Ex: 5511987654321"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
            <p className="text-[10px] text-text-secondary mt-1">Número que recebe as mensagens desta clínica — usado para identificar de qual clínica é um lead recebido.</p>
          </div>
          {!isEdit && (
            <p className="text-[11px] text-text-secondary bg-page rounded-lg px-3 py-2">
              Ao criar, 7 linhas de horário comercial (seg–sex 09h–18h ativo, fim de semana inativo) são geradas automaticamente. Ajuste depois em Configurações.
            </p>
          )}
          {error && <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Vincular Usuário à Clínica ─────────────────────────────────────────────────
function VincularUsuario({ clinicas, pendentes, onLinked }: {
  clinicas: Clinica[]
  pendentes: UsuarioPendente[]
  onLinked: () => void
}) {
  const [selectedExisting, setSelectedExisting] = useState<Record<string, string>>({})
  const [linking, setLinking] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteClinica, setInviteClinica] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteClinica) return
    setInviting(true)
    setInviteError('')
    setInviteMsg('')

    const erro = await convidarUsuario(inviteEmail, inviteClinica)
    setInviting(false)
    if (erro) { setInviteError(erro); return }
    setInviteMsg('Convite enviado! Ao clicar no link, a pessoa define a própria senha e já entra direto na clínica escolhida.')
    setInviteEmail('')
    setInviteClinica('')
  }

  const linkExisting = async (usuarioId: string) => {
    const clinicaId = selectedExisting[usuarioId]
    if (!clinicaId) return
    setLinking(true)
    const { error } = await supabase.from('usuarios').update({ clinica_id: clinicaId }).eq('id', usuarioId)
    setLinking(false)
    if (error) { setToastMsg('Não foi possível vincular. Tente novamente.'); return }
    onLinked()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Convidar por e-mail</p>
        <form onSubmit={sendInvite} className="flex flex-wrap items-center gap-2">
          <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@daclinica.com"
            className="flex-1 min-w-[220px] border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent bg-card" />
          <select required value={inviteClinica} onChange={e => setInviteClinica(e.target.value)}
            className="border border-border rounded-lg px-2 py-2 text-xs outline-none focus:border-accent bg-card">
            <option value="">Selecione a clínica...</option>
            {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome_clinica || 'Sem nome'}</option>)}
          </select>
          <button type="submit" disabled={!inviteEmail.trim() || !inviteClinica || inviting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50">
            {inviting ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Mail size={13} />}
            Enviar convite
          </button>
        </form>
        <p className="text-[10px] text-text-secondary mt-1.5">A pessoa recebe um link por e-mail para definir a própria senha. Assim que clicar, já tem acesso direto à clínica escolhida acima (não precisa vincular depois).</p>
        {inviteMsg && <p className="text-xs text-success bg-success-light border border-success/20 rounded-lg px-3 py-2 mt-2">{inviteMsg}</p>}
        {inviteError && <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2 mt-2">{inviteError}</p>}
      </div>

      {pendentes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Usuários sem clínica (exceção)</p>
          <p className="text-[10px] text-text-secondary mb-2">Normalmente ninguém deveria aparecer aqui — isso só acontece se a conta foi criada fora do fluxo de convite acima.</p>
          <div className="space-y-2">
            {pendentes.map(u => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 p-3 border border-border rounded-xl">
                <span className="text-sm text-text-primary flex-1 min-w-[100px] truncate">{u.nome || 'Sem nome ainda'}</span>
                <select value={selectedExisting[u.id] ?? ''} onChange={e => setSelectedExisting(s => ({ ...s, [u.id]: e.target.value }))}
                  className="border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-accent bg-card">
                  <option value="">Selecione a clínica...</option>
                  {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome_clinica || 'Sem nome'}</option>)}
                </select>
                <button onClick={() => linkExisting(u.id)} disabled={!selectedExisting[u.id] || linking}
                  className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50">
                  Vincular
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  )
}

// ─── Modal Nicho e funil ──────────────────────────────────────────────────────
function FunilModal({ clinica, onClose, onSaved }: { clinica: Clinica; onClose: () => void; onSaved: (nicho: Nicho) => void }) {
  const nicho: Nicho = isNicho(clinica.nicho) ? clinica.nicho : 'estetica'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Nicho e funil"
        className="bg-card rounded-[14px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
              <Layers size={15} className="text-accent" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-sm">Nicho e funil</h3>
              <p className="text-xs text-text-secondary">{clinica.nome_clinica || 'Sem nome'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <FunilEditor clinicaId={clinica.id} nicho={nicho} onSaved={onSaved} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminClinicas() {
  const { clinicaId: minhaClinicaId } = useAuth()
  const [clinicas, setClinicas] = useState<Clinica[]>([])
  const [pendentes, setPendentes] = useState<UsuarioPendente[]>([])
  const [usuariosPorClinica, setUsuariosPorClinica] = useState<Record<string, UsuarioClinica[]>>({})
  const [loading, setLoading] = useState(true)
  const [showNova, setShowNova] = useState(false)
  const [editing, setEditing] = useState<Clinica | null>(null)
  const [funilDe, setFunilDe] = useState<Clinica | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [{ data: c }, { data: p }, { data: u }] = await Promise.all([
      supabase.from('configuracoes_clinica').select('id, nome_clinica, numero_whatsapp, nicho, created_at').order('created_at', { ascending: false }),
      supabase.from('usuarios').select('id, nome').is('clinica_id', null).order('nome'),
      supabase.from('usuarios').select('id, nome, clinica_id').not('clinica_id', 'is', null).eq('is_super_admin', false).order('nome'),
    ])
    setClinicas((c ?? []) as Clinica[])
    setPendentes((p ?? []) as UsuarioPendente[])
    const grouped: Record<string, UsuarioClinica[]> = {}
    for (const usr of (u ?? []) as UsuarioClinica[]) {
      (grouped[usr.clinica_id] ??= []).push(usr)
    }
    setUsuariosPorClinica(grouped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <>
      {showNova && <ClinicaModal onClose={() => setShowNova(false)} onSaved={fetchAll} />}
      {editing && <ClinicaModal clinica={editing} onClose={() => setEditing(null)} onSaved={fetchAll} />}
      {funilDe && (
        <FunilModal
          clinica={funilDe}
          onClose={() => setFunilDe(null)}
          onSaved={() => {
            fetchAll()
            if (funilDe.id === minhaClinicaId) window.dispatchEvent(new Event('clinic-logo-updated'))
          }}
        />
      )}

      <div className="p-6 h-full overflow-y-auto space-y-5">
        <div className="fade-in-up flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Administração de Clínicas</h1>
            <p className="text-sm text-text-secondary mt-0.5">Área restrita — criar e gerenciar as clínicas atendidas por este sistema</p>
          </div>
          <button onClick={() => setShowNova(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-all shadow-sm flex-shrink-0">
            <Plus size={15} /> Nova Clínica
          </button>
        </div>

        <div className="bg-card border border-border rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden fade-in-up stagger-1">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : clinicas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Building2 size={32} className="text-accent-medium" />
              <p className="text-sm text-text-secondary">Nenhuma clínica cadastrada ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-5 py-3.5">Clínica</th>
                    <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">WhatsApp</th>
                    <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">Criada em</th>
                    <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">Usuários</th>
                    <th className="px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {clinicas.map(c => {
                    const usuariosDaClinica = usuariosPorClinica[c.id] ?? []
                    const isExpanded = expandedId === c.id
                    return (
                      <Fragment key={c.id}>
                        <tr className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-text-primary">{c.nome_clinica || 'Sem nome'}</td>
                          <td className="px-4 py-3.5 text-xs text-text-secondary">
                            <span className="flex items-center gap-1.5"><Phone size={11} /> {c.numero_whatsapp || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-text-secondary">{fmtDate(c.created_at)}</td>
                          <td className="px-4 py-3.5">
                            <button onClick={() => setExpandedId(isExpanded ? null : c.id)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-page text-text-secondary text-xs font-semibold hover:bg-surface-hover hover:text-text-primary transition-all">
                              <Users size={12} />
                              {usuariosDaClinica.length}
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setFunilDe(c)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-page text-text-secondary text-xs font-semibold hover:bg-surface-hover hover:text-text-primary transition-all">
                                <Layers size={12} /> Nicho e funil
                              </button>
                              <button onClick={() => setEditing(c)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-all">
                                <Pencil size={12} /> Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border-subtle last:border-0 bg-page">
                            <td colSpan={5} className="px-5 py-3">
                              {usuariosDaClinica.length === 0 ? (
                                <p className="text-xs text-text-secondary">Nenhum usuário cadastrado nesta clínica ainda.</p>
                              ) : (
                                <ul className="flex flex-wrap gap-2">
                                  {usuariosDaClinica.map(u => (
                                    <li key={u.id}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-xs text-text-primary">
                                      <Users size={11} className="text-text-secondary" />
                                      {u.nome || 'Sem nome ainda'}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5 fade-in-up stagger-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
              <UserPlus size={15} className="text-accent" />
            </div>
            <h2 className="text-sm font-bold text-text-primary">Vincular Usuário à Clínica</h2>
          </div>
          {clinicas.length === 0 ? (
            <p className="text-sm text-text-secondary">Cadastre uma clínica primeiro.</p>
          ) : (
            <VincularUsuario clinicas={clinicas} pendentes={pendentes} onLinked={fetchAll} />
          )}
        </div>
      </div>
    </>
  )
}
