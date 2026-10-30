import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Clock, Stethoscope, FileText,
  CalendarDays, BanknoteIcon, NotebookPen, Save,
  PlusCircle, X, Inbox, Link as LinkIcon, ExternalLink,
  Pencil, Trash2, Check, UserX, RotateCcw, Bot, UserRound, Repeat2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STATUS_COLORS, DEFAULT_STATUS_COLOR, CONSULTA_STATUS_COLORS } from '../lib/statusColors'
import { useFunil } from '../hooks/useFunil'
import { fmtDateTime, fmtBRL } from '../lib/format'
import {
  hasConsultaRealizada, BLOQUEIO_SEM_CONSULTA_MSG,
  REQUIRES_CONSULTA_AGENDADA, hasConsultaAgendada, BLOQUEIO_SEM_AGENDAMENTO_MSG,
  BLOQUEIO_EXCLUSAO_ULTIMA_REALIZADA_MSG,
  ETAPAS_AUTOMATICAS, BLOQUEIO_ETAPA_AUTOMATICA_MSG, horasParado,
} from '../lib/statusRules'
import { Toast } from '../components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  procedimento_interesse: string | null
  resumo_conversa: string | null
  status: string
  inicio_atendimento: string | null
  ultima_mensagem: string | null
  data_agendamento: string | null
  data_nascimento: string | null
  valor_pago_acumulado: number | null
  anotacoes: string | null
  link_drive: string | null
  data_virou_recorrente: string | null
  data_prevista_retorno: string | null
  arquivado: boolean
  arquivado_em: string | null
  atendimento_manual: boolean
  tag_paciente_recorrente: boolean
  em_tratamento: boolean
  status_atualizado_em: string | null
}

interface Nota {
  data: string | null
  texto: string
}

interface Consulta {
  id: string
  procedimento: string
  data_consulta: string
  status: string
  valor_pago: number | null
  observacoes: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CLASSIFICACAO_RETORNO_OPTIONS: { meses: number; status: string; label: string }[] = [
  { meses: 3,  status: 'retornar_3_meses', label: '3 meses' },
  { meses: 6,  status: 'retornar_6_meses', label: '6 meses' },
  { meses: 12, status: 'retornar_1_ano',   label: '1 ano' },
]

const CONSULTA_LABELS: Record<string, string> = {
  agendada:  'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  faltou:    'Faltou',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toDatetimeLocalSafe(iso: string | null) {
  return iso ? toDatetimeLocal(iso) : ''
}
function classificacaoAtrasada(lead: Lead): boolean {
  if (lead.status !== 'orcamento_pendente' || lead.em_tratamento || !lead.data_virou_recorrente) return false
  const horas = (Date.now() - new Date(lead.data_virou_recorrente).getTime()) / (1000 * 60 * 60)
  return horas >= 24
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-accent" />
        </div>
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-text-secondary w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-text-primary font-medium flex-1">{value || '—'}</span>
    </div>
  )
}

// ─── Consulta Form (criação e edição) ─────────────────────────────────────────
function ConsultaModal({ leadId, consulta, initialData, onClose, onSaved }: {
  leadId: string
  consulta?: Consulta
  initialData?: { procedimento?: string; data_consulta?: string; status?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!consulta
  const [form, setForm] = useState({
    procedimento: consulta?.procedimento ?? initialData?.procedimento ?? '',
    data_consulta: consulta ? toDatetimeLocal(consulta.data_consulta) : (initialData?.data_consulta ?? ''),
    status: consulta?.status ?? initialData?.status ?? 'agendada',
    valor_pago: consulta?.valor_pago != null ? String(consulta.valor_pago) : '',
    observacoes: consulta?.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { clinicaId } = useAuth()
  const [servicos, setServicos] = useState<string[]>([])

  // Procedimentos vêm do catálogo ativo da clínica (Configurações → Procedimentos).
  useEffect(() => {
    if (!clinicaId) return
    supabase
      .from('servicos_clinica')
      .select('nome')
      .eq('clinica_id', clinicaId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setServicos((data ?? []).map(s => s.nome as string)))
  }, [clinicaId])

  // Mantém o procedimento atual mesmo que ele não esteja mais no catálogo.
  const opcoesProcedimento = form.procedimento && !servicos.includes(form.procedimento)
    ? [form.procedimento, ...servicos]
    : servicos

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.status === 'realizada' && new Date(form.data_consulta) > new Date()) {
      setError('Não é possível marcar como Realizada uma consulta com data futura.')
      return
    }

    setSaving(true)
    const payload = {
      procedimento: form.procedimento,
      data_consulta: form.data_consulta,
      status: form.status,
      valor_pago: form.valor_pago ? parseFloat(form.valor_pago) : null,
      observacoes: form.observacoes || null,
    }
    const { error } = isEdit
      ? await supabase.from('consultas').update(payload).eq('id', consulta!.id)
      : await supabase.from('consultas').insert({ lead_id: leadId, ...payload })
    if (error) {
      setError(error.message.includes('última consulta realizada')
        ? BLOQUEIO_EXCLUSAO_ULTIMA_REALIZADA_MSG
        : 'Erro ao salvar consulta. Tente novamente.')
      setSaving(false)
    }
    else { onSaved(); onClose() }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar Consulta' : 'Nova Consulta'} className="bg-card rounded-[14px] shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-bold text-text-primary">{isEdit ? 'Editar Consulta' : 'Nova Consulta'}</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Procedimento *</label>
            <select required autoFocus value={form.procedimento} onChange={e => setForm(f => ({ ...f, procedimento: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card">
              {!form.procedimento && <option value="">Escolha um procedimento</option>}
              {opcoesProcedimento.map(nome => <option key={nome} value={nome}>{nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Data da Consulta *</label>
            <input required type="datetime-local" value={form.data_consulta} onChange={e => setForm(f => ({ ...f, data_consulta: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Status *</label>
            <select required value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent transition-all bg-card">
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
              <option value="faltou">Faltou</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Valor Pago (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor_pago} onChange={e => setForm(f => ({ ...f, valor_pago: e.target.value }))}
              placeholder="0,00"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">Observações</label>
            <textarea rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all resize-none bg-card" />
          </div>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { clinicaId, loading: authLoading } = useAuth()
  const { visiveis, labels, exigeConsulta, statusExibido } = useFunil()
  const statusOptions = visiveis.map(e => ({ value: e.chave, label: e.rotulo }))
  const [lead, setLead] = useState<Lead | null>(null)
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [loading, setLoading] = useState(true)
  const [statusValue, setStatusValue] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [anotacoes, setAnotacoes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [novaNota, setNovaNota] = useState('')
  const [editandoNota, setEditandoNota] = useState<number | null>(null)
  const [textoEdicao, setTextoEdicao] = useState('')
  const [confirmRemoverNota, setConfirmRemoverNota] = useState<number | null>(null)
  const [linkDrive, setLinkDrive] = useState('')
  const [savingLinkDrive, setSavingLinkDrive] = useState(false)
  const [linkDriveSaved, setLinkDriveSaved] = useState(false)
  const [classificandoRetorno, setClassificandoRetorno] = useState(false)
  const [togglingArquivado, setTogglingArquivado] = useState(false)
  const [togglingAtendimentoManual, setTogglingAtendimentoManual] = useState(false)
  const [togglingTagRecorrente, setTogglingTagRecorrente] = useState(false)
  const [togglingEmTratamento, setTogglingEmTratamento] = useState(false)
  // Só campos que não são derivados do histórico de consultas nem da classificação de retorno.
  const [ficha, setFicha] = useState({
    data_nascimento: '',
    inicio_atendimento: '',
  })
  const [savingFicha, setSavingFicha] = useState(false)
  const [fichaSaved, setFichaSaved] = useState(false)
  const [showNovaConsulta, setShowNovaConsulta] = useState(false)
  const [novaConsultaInitial, setNovaConsultaInitial] = useState<{ procedimento?: string; data_consulta?: string; status?: string } | undefined>(undefined)
  const [editingConsulta, setEditingConsulta] = useState<Consulta | null>(null)
  const [confirmDeleteConsultaId, setConfirmDeleteConsultaId] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Etapa em que o lead aparece: uma etapa dobrada mostra a coluna de destino.
  const etapaExibida = (status: string) => statusExibido[status] ?? status

  const syncFicha = (data: Lead) => {
    setFicha({
      data_nascimento: data.data_nascimento ?? '',
      inicio_atendimento: toDatetimeLocalSafe(data.inicio_atendimento),
    })
  }

  const fetchLead = useCallback(async () => {
    if (!id || !clinicaId) return null
    const { data, error } = await supabase.from('leads_clinica').select('*').eq('id', id).eq('clinica_id', clinicaId).maybeSingle()
    if (error) setToastMsg('Não foi possível carregar o lead. Tente recarregar a página.')
    if (data) {
      setLead(data as Lead)
      setStatusValue(etapaExibida(data.status))
      setAnotacoes(data.anotacoes ?? '')
      setLinkDrive(data.link_drive ?? '')
      syncFicha(data as Lead)
    }
    setLoading(false)
    return data
  }, [id, clinicaId, statusExibido])

  const fetchConsultas = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('consultas').select('*').eq('lead_id', id).order('data_consulta', { ascending: false })
    setConsultas((data ?? []) as Consulta[])
  }, [id])

  useEffect(() => {
    if (authLoading) return
    if (!clinicaId) { setLoading(false); return }

    let cancelled = false

    ;(async () => {
      const found = await fetchLead()
      if (!found || cancelled) return
      await fetchConsultas()
      if (cancelled) return

      // Realtime — only subscribed once we've confirmed the lead belongs to this clinic
      const channel = supabase
        .channel(`lead_detail_${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads_clinica', filter: `id=eq.${id}` },
          (payload) => {
            const updated = payload.new as Lead
            setLead(updated)
            setStatusValue(etapaExibida(updated.status))
            setAnotacoes(updated.anotacoes ?? '')
            setLinkDrive(updated.link_drive ?? '')
            syncFicha(updated)
          })
        .subscribe()

      if (cancelled) { supabase.removeChannel(channel); return }
      channelRef.current = channel
    })()

    return () => {
      cancelled = true
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [id, clinicaId, authLoading, fetchLead, fetchConsultas])

  // Recebe a etapa escolhida; o seletor do cabeçalho salva ao trocar a opção.
  const saveStatus = async (valor: string) => {
    if (!id || !lead) return
    const exibida = etapaExibida(lead.status)
    // Já está nesta etapa (inclusive quando a chave gravada é uma etapa dobrada).
    if (valor === exibida) return

    if (!lead.atendimento_manual) {
      if (exigeConsulta.has(valor) && !exigeConsulta.has(lead.status)) {
        const ok = await hasConsultaRealizada(id)
        if (!ok) { setToastMsg(BLOQUEIO_SEM_CONSULTA_MSG); setStatusValue(exibida); return }
      }

      if (ETAPAS_AUTOMATICAS.has(valor)) {
        setToastMsg(BLOQUEIO_ETAPA_AUTOMATICA_MSG)
        setStatusValue(exibida)
        return
      }

      if (REQUIRES_CONSULTA_AGENDADA.has(valor) && !REQUIRES_CONSULTA_AGENDADA.has(lead.status)) {
        const ok = await hasConsultaAgendada(id)
        if (!ok) { setToastMsg(BLOQUEIO_SEM_AGENDAMENTO_MSG); setStatusValue(exibida); return }
      }
    }

    setSavingStatus(true)
    const { error } = await supabase.from('leads_clinica').update({ status: valor }).eq('id', id).eq('clinica_id', clinicaId)
    setSavingStatus(false)
    if (error) { setToastMsg('Não foi possível salvar o status. Tente novamente.'); setStatusValue(exibida); return }
    setLead(prev => prev ? { ...prev, status: valor } : prev)
  }

  const classificarRetorno = async (opt: { meses: number; status: string }) => {
    if (!id || !lead) return
    setClassificandoRetorno(true)
    const base = new Date(lead.data_virou_recorrente ?? Date.now())
    const dataPrevistaRetorno = new Date(base)
    dataPrevistaRetorno.setMonth(dataPrevistaRetorno.getMonth() + opt.meses)
    const payload = { status: opt.status, data_prevista_retorno: dataPrevistaRetorno.toISOString() }
    const { error } = await supabase.from('leads_clinica').update(payload).eq('id', id).eq('clinica_id', clinicaId)
    setClassificandoRetorno(false)
    if (error) { setToastMsg('Não foi possível classificar o retorno. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, ...payload } : prev)
    setStatusValue(etapaExibida(opt.status))
  }

  const toggleArquivado = async () => {
    if (!id || !lead) return
    setTogglingArquivado(true)
    const arquivado = !lead.arquivado
    const payload = { arquivado, arquivado_em: arquivado ? new Date().toISOString() : null }
    const { error } = await supabase.from('leads_clinica').update(payload).eq('id', id).eq('clinica_id', clinicaId)
    setTogglingArquivado(false)
    if (error) { setToastMsg('Não foi possível atualizar. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, ...payload } : prev)
  }

  const toggleAtendimentoManual = async () => {
    if (!id || !lead) return
    setTogglingAtendimentoManual(true)
    const novo = !lead.atendimento_manual
    const { error } = await supabase.from('leads_clinica').update({ atendimento_manual: novo }).eq('id', id).eq('clinica_id', clinicaId)
    setTogglingAtendimentoManual(false)
    if (error) { setToastMsg('Não foi possível atualizar. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, atendimento_manual: novo } : prev)
  }

  const toggleTagRecorrente = async () => {
    if (!id || !lead) return
    setTogglingTagRecorrente(true)
    const tagPacienteRecorrente = !lead.tag_paciente_recorrente
    const { data, error } = await supabase.from('leads_clinica')
      .update({ tag_paciente_recorrente: tagPacienteRecorrente })
      .eq('id', id).eq('clinica_id', clinicaId)
      .select('tag_paciente_recorrente')
      .single()
    setTogglingTagRecorrente(false)
    if (error) { setToastMsg('Não foi possível atualizar a tag. Verifique se a migration 028 foi aplicada.'); return }
    setLead(prev => prev ? { ...prev, tag_paciente_recorrente: data.tag_paciente_recorrente } : prev)
  }

  // Ao desligar, a classificação de retorno volta na hora (classificacaoAtrasada
  // usa data_virou_recorrente), então quem esqueceu de classificar aparece na fila.
  const toggleEmTratamento = async () => {
    if (!id || !lead) return
    setTogglingEmTratamento(true)
    const novo = !lead.em_tratamento
    const { error } = await supabase.from('leads_clinica').update({ em_tratamento: novo }).eq('id', id).eq('clinica_id', clinicaId)
    setTogglingEmTratamento(false)
    if (error) { setToastMsg('Não foi possível atualizar. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, em_tratamento: novo } : prev)
  }

  const saveFicha = async () => {
    if (!id) return
    setSavingFicha(true)
    const payload = {
      data_nascimento: ficha.data_nascimento || null,
      inicio_atendimento: ficha.inicio_atendimento ? new Date(ficha.inicio_atendimento).toISOString() : null,
    }
    const { error } = await supabase.from('leads_clinica').update(payload).eq('id', id).eq('clinica_id', clinicaId)
    setSavingFicha(false)
    if (error) { setToastMsg('Não foi possível salvar a ficha. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, ...payload } : prev)
    setFichaSaved(true)
    setTimeout(() => setFichaSaved(false), 2000)
  }

  // Anotações: uma linha por anotação no campo de texto existente, no formato
  // "data_iso|texto". Linhas antigas, sem data, continuam válidas.
  const notas: Nota[] = anotacoes
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(linha => {
      const m = linha.match(/^(\d{4}-\d{2}-\d{2}T\S+?)\|(.*)$/)
      return m ? { data: m[1], texto: m[2] } : { data: null, texto: linha }
    })

  const persistNotas = async (lista: Nota[]) => {
    if (!id) return false
    const texto = lista.map(n => (n.data ? `${n.data}|${n.texto}` : n.texto)).join('\n')
    setSavingNotes(true)
    const { error } = await supabase.from('leads_clinica').update({ anotacoes: texto }).eq('id', id).eq('clinica_id', clinicaId)
    setSavingNotes(false)
    if (error) { setToastMsg('Não foi possível salvar a anotação. Tente novamente.'); return false }
    setAnotacoes(texto)
    return true
  }

  const adicionarNota = async () => {
    const texto = novaNota.trim()
    if (!texto) return
    if (await persistNotas([...notas, { data: new Date().toISOString(), texto }])) setNovaNota('')
  }

  const salvarEdicaoNota = async () => {
    if (editandoNota === null) return
    const texto = textoEdicao.trim()
    if (!texto) return
    const lista = notas.map((n, i) => (i === editandoNota ? { ...n, texto } : n))
    if (await persistNotas(lista)) setEditandoNota(null)
  }

  const removerNota = async (indice: number) => {
    await persistNotas(notas.filter((_, i) => i !== indice))
    setConfirmRemoverNota(null)
  }

  const saveLinkDrive = async () => {
    if (!id) return
    setSavingLinkDrive(true)
    const { error } = await supabase.from('leads_clinica').update({ link_drive: linkDrive.trim() || null }).eq('id', id).eq('clinica_id', clinicaId)
    setSavingLinkDrive(false)
    if (error) { setToastMsg('Não foi possível salvar o link do Drive. Tente novamente.'); return }
    setLinkDriveSaved(true)
    setTimeout(() => setLinkDriveSaved(false), 2000)
  }

  const deleteConsulta = async (consultaId: string) => {
    const { error } = await supabase.from('consultas').delete().eq('id', consultaId)
    setConfirmDeleteConsultaId(null)
    if (error) {
      setToastMsg(error.message.includes('última consulta realizada')
        ? BLOQUEIO_EXCLUSAO_ULTIMA_REALIZADA_MSG
        : 'Não foi possível excluir a consulta. Tente novamente.')
      return
    }
    fetchConsultas()
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!lead) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-text-secondary">Lead não encontrado.</p>
      <button onClick={() => navigate('/crm')} className="text-sm text-accent hover:underline">Voltar para o CRM</button>
    </div>
  )

  const badgeColor = STATUS_COLORS[lead.status] ?? DEFAULT_STATUS_COLOR
  const badgeLabel = labels[lead.status] ?? lead.status
  const horasParadas = horasParado(lead)

  // Derivados do histórico: a próxima consulta agendada e o total já pago.
  const agora = Date.now()
  const proximaAgendada = consultas
    .filter(c => c.status === 'agendada' && new Date(c.data_consulta).getTime() >= agora)
    .sort((a, b) => new Date(a.data_consulta).getTime() - new Date(b.data_consulta).getTime())[0] ?? null
  const totalPago = consultas
    .filter(c => c.status === 'realizada')
    .reduce((soma, c) => soma + (c.valor_pago ?? 0), 0)

  return (
    <>
      {showNovaConsulta && (
        <ConsultaModal
          leadId={lead.id}
          initialData={novaConsultaInitial}
          onClose={() => { setShowNovaConsulta(false); setNovaConsultaInitial(undefined) }}
          onSaved={fetchConsultas}
        />
      )}

      {editingConsulta && (
        <ConsultaModal
          leadId={lead.id}
          consulta={editingConsulta}
          onClose={() => setEditingConsulta(null)}
          onSaved={fetchConsultas}
        />
      )}

      <div className="p-6 h-full overflow-y-auto space-y-5">

        {/* Back + Title */}
        <div className="fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate('/crm')}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent transition-colors">
              <ArrowLeft size={14} /> Voltar para o CRM
            </button>
            <div className="flex items-center gap-2">
              {(lead.status === 'orcamento_pendente' || lead.status === 'paciente_recorrente') && (
                <button onClick={toggleEmTratamento} disabled={togglingEmTratamento}
                  title={lead.em_tratamento ? 'Encerrar tratamento e classificar o retorno' : 'Marcar como em tratamento contínuo'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50
                    ${lead.em_tratamento
                      ? 'border-status-purple text-status-purple hover:bg-status-purple-light'
                      : 'border-border text-text-secondary hover:border-text-primary hover:text-text-primary'}`}>
                  {lead.em_tratamento ? 'Em tratamento' : 'Marcar em tratamento'}
                </button>
              )}
              <button onClick={toggleAtendimentoManual} disabled={togglingAtendimentoManual}
                title={lead.atendimento_manual ? 'Devolver a conversa para a IA' : 'Assumir o atendimento manualmente'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50
                  ${lead.atendimento_manual
                    ? 'border-status-warning text-status-warning hover:bg-status-warning-light'
                    : 'border-border text-text-secondary hover:border-text-primary hover:text-text-primary'}`}>
                {lead.atendimento_manual ? <UserRound size={13} /> : <Bot size={13} />}
                {lead.atendimento_manual ? 'Atendimento manual' : 'Assumir atendimento'}
              </button>
              <button onClick={toggleTagRecorrente} disabled={togglingTagRecorrente}
                aria-pressed={lead.tag_paciente_recorrente}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 ${lead.tag_paciente_recorrente ? 'border-status-purple text-status-purple bg-status-purple-light' : 'border-border text-text-secondary hover:border-status-purple hover:text-status-purple'}`}>
                <Repeat2 size={13} />
                {lead.tag_paciente_recorrente ? 'Paciente Recorrente' : 'Marcar recorrente'}
              </button>
              <button onClick={toggleArquivado} disabled={togglingArquivado}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50
                  ${lead.arquivado
                    ? 'border-success text-success hover:bg-success-light'
                    : 'border-border text-text-secondary hover:border-text-primary hover:text-text-primary'}`}>
                {lead.arquivado ? <RotateCcw size={13} /> : <UserX size={13} />}
                {lead.arquivado ? 'Reativar' : 'Marcar como Ex-Paciente'}
              </button>
            </div>
          </div>

          {/* Cabeçalho: identidade à esquerda, controles à direita */}
          <div className="bg-card border border-border rounded-card shadow-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-text-primary leading-tight">
                  {lead.nome_lead ?? 'Lead sem nome'}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badgeColor.badgeBg} ${badgeColor.badgeText}`}
                  >
                    {badgeColor.pulse && <span className={`w-1.5 h-1.5 rounded-full pulse-dot ${badgeColor.dot}`} />}
                    {badgeLabel}
                  </span>
                  {lead.tag_paciente_recorrente && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-status-purple-light text-status-purple">
                      <Repeat2 size={12} /> Paciente Recorrente
                    </span>
                  )}
                  {lead.data_virou_recorrente && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-status-purple-light text-status-purple">
                      Paciente ativo
                    </span>
                  )}
                  {lead.arquivado && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-page text-text-secondary">
                      <UserX size={11} /> Ex-Paciente{lead.arquivado_em ? ` desde ${fmtDateTime(lead.arquivado_em)}` : ''}
                    </span>
                  )}
                  {horasParadas !== null && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-status-danger-light text-status-danger">
                      <span className="w-1.5 h-1.5 rounded-full pulse-dot bg-status-danger" />
                      Parado há {horasParadas}h
                    </span>
                  )}
                  {lead.whatsapp_lead && (
                    <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                      <Phone size={13} /> {lead.whatsapp_lead}
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm text-text-secondary">
                  Interesse: <span className="text-text-primary">{lead.procedimento_interesse ?? '—'}</span>
                </p>
                {lead.resumo_conversa && (
                  <p className="mt-2 max-w-prose text-sm italic text-text-secondary line-clamp-2">{lead.resumo_conversa}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-5">
                {lead.ultima_mensagem && (
                  <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Clock size={12} />
                    Última interação {fmtDateTime(lead.ultima_mensagem)}
                  </p>
                )}

                <label className="flex flex-col items-end gap-1.5">
                  <span className="text-xs text-text-secondary">Etapa do funil</span>
                  <select
                    value={statusValue}
                    disabled={savingStatus}
                    onChange={e => { setStatusValue(e.target.value); saveStatus(e.target.value) }}
                    className="min-w-[13rem] border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card disabled:opacity-60"
                  >
                    {statusOptions.map(o => {
                      const automatica = ETAPAS_AUTOMATICAS.has(o.value) && o.value !== etapaExibida(lead.status)
                      return (
                        <option key={o.value} value={o.value} disabled={automatica}>
                          {o.label}{automatica ? ' (automática)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-text-secondary">Nascimento</span>
                    <input type="date" value={ficha.data_nascimento}
                      onChange={e => setFicha(f => ({ ...f, data_nascimento: e.target.value }))}
                      onBlur={saveFicha}
                      className="w-40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-text-secondary">Início do atendimento</span>
                    <input type="datetime-local" value={ficha.inicio_atendimento}
                      onChange={e => setFicha(f => ({ ...f, inicio_atendimento: e.target.value }))}
                      onBlur={saveFicha}
                      className="w-52 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card" />
                  </label>
                </div>
                {fichaSaved && <span className="-mt-3 text-xs font-medium text-success">Salvo</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Conteúdo em largura total, empilhado com o mesmo ritmo */}
        <div className="space-y-6">


            {/* Histórico de Consultas */}
            <Section title="Histórico de Consultas" icon={CalendarDays}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                  <span>{consultas.length} consulta{consultas.length !== 1 ? 's' : ''} registrada{consultas.length !== 1 ? 's' : ''}</span>
                  <span>
                    Próxima: <strong className="text-text-primary">
                      {proximaAgendada ? fmtDateTime(proximaAgendada.data_consulta) : 'nenhuma agendada'}
                    </strong>
                  </span>
                  <span>
                    Total pago: <strong className="text-text-primary">{fmtBRL(totalPago)}</strong>
                  </span>
                </div>
                <button onClick={() => { setNovaConsultaInitial(undefined); setShowNovaConsulta(true) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-all">
                  <PlusCircle size={12} /> Nova Consulta
                </button>
              </div>

              {consultas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-secondary">
                  <Inbox size={28} className="text-accent-medium" />
                  <p className="text-sm">Nenhuma consulta registrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Procedimento', 'Data', 'Status', 'Valor Pago', 'Observações'].map(h => (
                          <th key={h} className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide pb-2.5 pr-4">{h}</th>
                        ))}
                        <th className="pb-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {consultas.map(c => {
                        const cb = CONSULTA_STATUS_COLORS[c.status] ?? DEFAULT_STATUS_COLOR
                        const cbLabel = CONSULTA_LABELS[c.status] ?? c.status
                        return (
                          <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors">
                            <td className="py-3 pr-4 font-medium text-text-primary">{c.procedimento}</td>
                            <td className="py-3 pr-4 text-xs text-text-secondary whitespace-nowrap">{fmtDateTime(c.data_consulta)}</td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cb.badgeBg} ${cb.badgeText}`}>
                                {cbLabel}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-xs text-text-primary">{fmtBRL(c.valor_pago)}</td>
                            <td className="py-3 pr-4 text-xs text-text-secondary max-w-[160px] truncate">{c.observacoes ?? '—'}</td>
                            <td className="py-3">
                              {confirmDeleteConsultaId === c.id ? (
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="text-[10px] text-status-danger mr-1">Excluir?</span>
                                  <button onClick={() => deleteConsulta(c.id)}
                                    className="p-1 rounded-lg text-status-danger hover:bg-status-danger-light transition-all" title="Confirmar exclusão">
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => setConfirmDeleteConsultaId(null)}
                                    className="p-1 rounded-lg text-text-secondary hover:bg-surface-hover transition-all" title="Cancelar">
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setEditingConsulta(c)}
                                    className="p-1.5 rounded-lg text-text-secondary hover:bg-page hover:text-accent transition-all" title="Editar">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => setConfirmDeleteConsultaId(c.id)}
                                    className="p-1.5 rounded-lg text-text-secondary hover:bg-status-danger-light hover:text-status-danger transition-all" title="Excluir">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Anotações */}
            <Section title="Anotações" icon={NotebookPen}>
              <input
                value={novaNota}
                onChange={e => setNovaNota(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarNota() } }}
                disabled={savingNotes}
                placeholder="Escreva uma anotação e pressione Enter"
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary bg-card
                           outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all disabled:opacity-60"
              />

              {notas.length > 0 && (
                <ul className="mt-4 divide-y divide-border">
                  {[...notas.entries()].reverse().map(([i, nota]) => (
                    <li key={`${i}-${nota.data ?? ''}-${nota.texto}`} className="py-3 first:pt-0 last:pb-0">
                      {editandoNota === i ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={textoEdicao}
                            onChange={e => setTextoEdicao(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); salvarEdicaoNota() }
                              if (e.key === 'Escape') setEditandoNota(null)
                            }}
                            aria-label="Editar anotação"
                            className="flex-1 border border-accent rounded-lg px-3 py-2 text-sm text-text-primary bg-card outline-none ring-2 ring-accent/10"
                          />
                          <button type="button" onClick={() => setEditandoNota(null)}
                            className="px-2 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-4">
                          {nota.data ? (
                            <time dateTime={nota.data}
                              className="flex w-16 flex-shrink-0 flex-col items-center rounded-xl border border-border bg-page px-2 py-1.5 text-center leading-tight">
                              <span className="text-sm font-semibold text-text-primary tabular-nums">
                                {new Date(nota.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })}
                              </span>
                              <span className="mt-0.5 text-[11px] text-text-secondary tabular-nums">
                                {new Date(nota.data).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </time>
                          ) : (
                            <span className="flex w-16 flex-shrink-0 flex-col items-center rounded-xl border border-dashed border-border px-2 py-1.5 text-center text-[11px] leading-tight text-text-secondary">
                              Sem data
                            </span>
                          )}
                          <p className="flex-1 text-sm leading-relaxed text-text-primary break-words">{nota.texto}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" aria-label="Editar anotação"
                              onClick={() => { setEditandoNota(i); setTextoEdicao(nota.texto); setConfirmRemoverNota(null) }}
                              className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-page transition-colors">
                              <Pencil size={13} />
                            </button>
                            {confirmRemoverNota === i ? (
                              <button type="button" onClick={() => removerNota(i)} disabled={savingNotes}
                                className="px-2 py-1 rounded-md text-xs font-semibold text-status-danger bg-status-danger-light hover:opacity-90 transition-opacity disabled:opacity-60">
                                Excluir
                              </button>
                            ) : (
                              <button type="button" aria-label="Excluir anotação" onClick={() => setConfirmRemoverNota(i)}
                                className="p-1.5 rounded-md text-text-secondary hover:text-status-danger hover:bg-status-danger-light transition-colors">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Link do Drive */}
            <Section title="Link do Drive" icon={LinkIcon}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="url"
                  value={linkDrive}
                  onChange={e => setLinkDrive(e.target.value)}
                  placeholder="Cole aqui o link da pasta do Drive do cliente..."
                  className="w-full flex-1 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary bg-card
                             outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
                />
                <div className="flex items-center gap-3 md:flex-shrink-0">
                  {lead.link_drive && (
                    <a href={lead.link_drive} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-accent hover:underline whitespace-nowrap">
                      Abrir no Drive <ExternalLink size={11} />
                    </a>
                  )}
                  {linkDriveSaved && <span className="text-xs font-medium text-success">Salvo</span>}
                  <button onClick={saveLinkDrive} disabled={savingLinkDrive}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 whitespace-nowrap">
                    {savingLinkDrive
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save size={13} />}
                    Salvar
                  </button>
                </div>
              </div>
            </Section>

            {/* Classificar Retorno */}
            {lead.status === 'orcamento_pendente' && (
              <Section title="Classificar Retorno" icon={CalendarDays}>
                {classificacaoAtrasada(lead) && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-status-danger bg-status-danger-light rounded-lg px-3 py-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full pulse-dot bg-status-danger flex-shrink-0" />
                    Classificação pendente há mais de 24h
                  </p>
                )}
                <p className="text-xs text-text-secondary mb-3">
                  Em quanto tempo esta paciente deve retornar para uma nova consulta?
                </p>
                {lead.data_prevista_retorno && (
                  <p className="text-xs text-text-primary mb-3">
                    Retorno previsto: <strong>{fmtDateTime(lead.data_prevista_retorno)}</strong>
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {CLASSIFICACAO_RETORNO_OPTIONS.map(opt => (
                    <button
                      key={opt.status}
                      onClick={() => classificarRetorno(opt)}
                      disabled={classificandoRetorno}
                      className="py-2.5 rounded-xl border border-border text-xs font-semibold text-text-primary
                                 hover:border-status-teal hover:bg-status-teal-light hover:text-status-teal transition-all disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Section>
            )}
        </div>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </>
  )
}
