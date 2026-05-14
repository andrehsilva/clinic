import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Clock, Stethoscope, FileText,
  CalendarDays, BanknoteIcon, NotebookPen, Save,
  PlusCircle, X, ShieldCheck, Inbox,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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
const STATUS_OPTIONS = [
  { value: 'iniciou_conversa',    label: 'Iniciou Conversa' },
  { value: 'conversando',         label: 'Conversando' },
  { value: 'consulta_agendada',   label: 'Consulta Agendada' },
  { value: 'consulta_cancelada',  label: 'Consulta Cancelada' },
  { value: 'follow_up_1_feito',   label: 'Follow-up 1 Feito' },
  { value: 'follow_up_2_feito',   label: 'Follow-up 2 Feito' },
  { value: 'follow_up_3_feito',   label: 'Follow-up 3 Feito' },
  { value: 'consulta_realizada',  label: 'Consulta Realizada' },
  { value: 'paciente_recorrente', label: 'Paciente Recorrente' },
]

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string; pulse?: boolean }> = {
  iniciou_conversa:    { label: 'Iniciou Conversa',   bg: '#F7EDF0', color: '#B85C72', pulse: true },
  conversando:         { label: 'Conversando',         bg: '#EBF4FD', color: '#2980B9' },
  consulta_agendada:   { label: 'Agendada',            bg: '#E8F8EF', color: '#1A7A48' },
  consulta_cancelada:  { label: 'Cancelada',           bg: '#FDECEA', color: '#C0392B' },
  follow_up_1_feito:   { label: 'Follow-up 1',         bg: '#FEF9EC', color: '#B7770D' },
  follow_up_2_feito:   { label: 'Follow-up 2',         bg: '#FEF9EC', color: '#B7770D' },
  follow_up_3_feito:   { label: 'Follow-up 3',         bg: '#FEF9EC', color: '#B7770D' },
  consulta_realizada:  { label: 'Realizada',           bg: '#1A7A48', color: '#fff' },
  paciente_recorrente: { label: 'Recorrente',          bg: '#F0EBF8', color: '#6C3483' },
}

const CONSULTA_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  agendada:  { label: 'Agendada',  bg: '#E8F8EF', color: '#1A7A48' },
  realizada: { label: 'Realizada', bg: '#1A7A48', color: '#fff' },
  cancelada: { label: 'Cancelada', bg: '#FDECEA', color: '#C0392B' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#F7EDF0] flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-[#B85C72]" />
        </div>
        <h2 className="text-sm font-bold text-[#1A1A1A]">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#F5F5F5] last:border-0">
      <span className="text-xs text-[#7A7A7A] w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-[#1A1A1A] font-medium flex-1">{value || '—'}</span>
    </div>
  )
}

// ─── New Consulta Form ────────────────────────────────────────────────────────
function NovaConsultaModal({ leadId, onClose, onSaved }: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ procedimento: '', data_consulta: '', status: 'agendada', valor_pago: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('consultas').insert({
      lead_id: leadId,
      procedimento: form.procedimento,
      data_consulta: form.data_consulta,
      status: form.status,
      valor_pago: form.valor_pago ? parseFloat(form.valor_pago) : null,
      observacoes: form.observacoes || null,
    })
    if (error) { setError('Erro ao salvar consulta. Tente novamente.'); setSaving(false) }
    else { onSaved(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[14px] shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[#EBEBEB]">
          <h3 className="font-bold text-[#1A1A1A]">Nova Consulta</h3>
          <button onClick={onClose} className="text-[#7A7A7A] hover:text-[#1A1A1A] transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">Procedimento *</label>
            <input required value={form.procedimento} onChange={e => setForm(f => ({ ...f, procedimento: e.target.value }))}
              className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">Data da Consulta *</label>
            <input required type="datetime-local" value={form.data_consulta} onChange={e => setForm(f => ({ ...f, data_consulta: e.target.value }))}
              className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">Status *</label>
            <select required value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] transition-all bg-white">
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">Valor Pago (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor_pago} onChange={e => setForm(f => ({ ...f, valor_pago: e.target.value }))}
              placeholder="0,00"
              className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">Observações</label>
            <textarea rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all resize-none" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#EBEBEB] text-sm font-medium text-[#7A7A7A] hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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
  const [lead, setLead] = useState<Lead | null>(null)
  const [consultas, setConsultas] = useState<Consulta[]>([])
  const [loading, setLoading] = useState(true)
  const [statusValue, setStatusValue] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [anotacoes, setAnotacoes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [showNovaConsulta, setShowNovaConsulta] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchLead = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('leads_clinica').select('*').eq('id', id).single()
    if (data) {
      setLead(data as Lead)
      setStatusValue(data.status)
      setAnotacoes(data.anotacoes ?? '')
    }
    setLoading(false)
  }, [id])

  const fetchConsultas = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('consultas').select('*').eq('lead_id', id).order('data_consulta', { ascending: false })
    setConsultas((data ?? []) as Consulta[])
  }, [id])

  useEffect(() => {
    fetchLead()
    fetchConsultas()

    // Realtime
    channelRef.current = supabase
      .channel(`lead_detail_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads_clinica', filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as Lead
          setLead(updated)
          setStatusValue(updated.status)
          setAnotacoes(updated.anotacoes ?? '')
        })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [id, fetchLead, fetchConsultas])

  const saveStatus = async () => {
    if (!id || !lead) return
    setSavingStatus(true)
    const { error } = await supabase.from('leads_clinica').update({ status: statusValue }).eq('id', id)
    setSavingStatus(false)
    if (error) { alert('Não foi possível salvar o status. Tente novamente.'); return }
    setLead(prev => prev ? { ...prev, status: statusValue } : prev)
  }

  const saveNotes = async () => {
    if (!id) return
    setSavingNotes(true)
    const { error } = await supabase.from('leads_clinica').update({ anotacoes }).eq('id', id)
    setSavingNotes(false)
    if (error) { alert('Não foi possível salvar as anotações. Tente novamente.'); return }
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-[#B85C72] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!lead) return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <p className="text-[#7A7A7A]">Lead não encontrado.</p>
      <button onClick={() => navigate('/leads')} className="text-sm text-[#B85C72] hover:underline">Voltar</button>
    </div>
  )

  const badge = STATUS_BADGE[lead.status] ?? { label: lead.status, bg: '#F5F5F5', color: '#555' }

  return (
    <>
      {showNovaConsulta && (
        <NovaConsultaModal
          leadId={lead.id}
          onClose={() => setShowNovaConsulta(false)}
          onSaved={fetchConsultas}
        />
      )}

      <div className="p-6 h-full overflow-y-auto space-y-5">

        {/* Back + Title */}
        <div className="fade-in-up">
          <button onClick={() => navigate('/leads')}
            className="flex items-center gap-1.5 text-sm text-[#7A7A7A] hover:text-[#B85C72] transition-colors mb-4">
            <ArrowLeft size={14} /> Voltar para Leads
          </button>

          {/* Header card */}
          <div className="bg-white border border-[#EBEBEB] rounded-[14px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#1A1A1A] mb-2">
                  {lead.nome_lead ?? 'Lead sem nome'}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.pulse && <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: badge.color }} />}
                    {badge.label}
                  </span>
                  {lead.whatsapp_lead && (
                    <span className="flex items-center gap-1.5 text-sm text-[#7A7A7A]">
                      <Phone size={13} /> {lead.whatsapp_lead}
                    </span>
                  )}
                </div>
              </div>
              {lead.ultima_mensagem && (
                <div className="flex items-center gap-1.5 text-xs text-[#7A7A7A] bg-[#F4F2EF] px-3 py-2 rounded-xl">
                  <Clock size={12} />
                  Última interação: {fmtDateTime(lead.ultima_mensagem)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2 col layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-5">

            {/* Informações da IA */}
            <Section title="Informações da IA" icon={Stethoscope}>
              <InfoRow label="Procedimento de Interesse" value={lead.procedimento_interesse} />
              <InfoRow label="Resumo da Conversa"
                value={lead.resumo_conversa
                  ? <span className="whitespace-pre-wrap text-sm text-[#1A1A1A] leading-relaxed">{lead.resumo_conversa}</span>
                  : <span className="text-[#7A7A7A] italic text-sm">Nenhum resumo gerado ainda</span>
                }
              />
            </Section>

            {/* Histórico de Consultas */}
            <Section title="Histórico de Consultas" icon={CalendarDays}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-[#7A7A7A]">{consultas.length} consulta{consultas.length !== 1 ? 's' : ''} registrada{consultas.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowNovaConsulta(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7EDF0] text-[#B85C72] text-xs font-semibold hover:bg-[#B85C72] hover:text-white transition-all">
                  <PlusCircle size={12} /> Nova Consulta
                </button>
              </div>

              {consultas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#7A7A7A]">
                  <Inbox size={28} className="text-[#D4849A]" />
                  <p className="text-sm">Nenhuma consulta registrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#EBEBEB]">
                        {['Procedimento', 'Data', 'Status', 'Valor Pago', 'Observações'].map(h => (
                          <th key={h} className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide pb-2.5 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {consultas.map(c => {
                        const cb = CONSULTA_BADGE[c.status] ?? { label: c.status, bg: '#F5F5F5', color: '#555' }
                        return (
                          <tr key={c.id} className="border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFAFA] transition-colors">
                            <td className="py-3 pr-4 font-medium text-[#1A1A1A]">{c.procedimento}</td>
                            <td className="py-3 pr-4 text-xs text-[#7A7A7A] whitespace-nowrap">{fmtDateTime(c.data_consulta)}</td>
                            <td className="py-3 pr-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: cb.bg, color: cb.color }}>
                                {cb.label}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-xs text-[#1A1A1A]">{fmtBRL(c.valor_pago)}</td>
                            <td className="py-3 text-xs text-[#7A7A7A] max-w-[160px] truncate">{c.observacoes ?? '—'}</td>
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
              <textarea
                rows={5}
                value={anotacoes}
                onChange={e => setAnotacoes(e.target.value)}
                placeholder="Adicione anotações internas sobre este lead..."
                className="w-full border border-[#EBEBEB] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#7A7A7A]
                           outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all resize-none"
              />
              <div className="flex items-center justify-end gap-3 mt-3">
                {notesSaved && <span className="text-xs text-[#1A7A48] font-medium">✓ Salvo com sucesso!</span>}
                <button onClick={saveNotes} disabled={savingNotes}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60">
                  {savingNotes
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save size={13} />}
                  Salvar
                </button>
              </div>
            </Section>
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-5">

            {/* Ficha Adicional */}
            <Section title="Ficha Adicional" icon={FileText}>
              <InfoRow label="Data de Nascimento" value={fmtDate(lead.data_nascimento)} />
              <InfoRow label="Valor Pago Acumulado" value={fmtBRL(lead.valor_pago_acumulado)} />
              <InfoRow label="Início do Atendimento" value={fmtDateTime(lead.inicio_atendimento)} />
              <InfoRow label="Consulta Agendada" value={fmtDateTime(lead.data_agendamento)} />
            </Section>

            {/* Status */}
            <Section title="Alterar Status" icon={ShieldCheck}>
              <select
                value={statusValue}
                onChange={e => setStatusValue(e.target.value)}
                className="w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] transition-all bg-white mb-3"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button onClick={saveStatus} disabled={savingStatus || statusValue === lead.status}
                className="w-full py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingStatus
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Save size={13} />}
                {statusValue === lead.status ? 'Status atual' : 'Salvar Status'}
              </button>
              <p className="text-[10px] text-[#7A7A7A] text-center mt-2">
                Refletido em tempo real no Kanban e Dashboard
              </p>
            </Section>

          </div>
        </div>
      </div>
    </>
  )
}
