import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, FileText, Users, UserCheck,
  ChevronRight, Calendar, ArrowUpDown, UserPlus, X, Save,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  procedimento_interesse: string | null
  status: string
  inicio_atendimento: string | null
  data_agendamento: string | null
  created_at: string
}

type Period = 'today' | 'yesterday' | '7d' | '14d' | 'month' | 'last_month' | 'year' | 'last_year' | 'custom'
type Tab = 'leads' | 'pacientes'

// ─── Constants ────────────────────────────────────────────────────────────────
const PATIENT_STATUS = ['consulta_realizada', 'paciente_recorrente']

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

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',      label: 'Hoje' },
  { key: 'yesterday',  label: 'Ontem' },
  { key: '7d',         label: '7 dias' },
  { key: '14d',        label: '14 dias' },
  { key: 'month',      label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'year',       label: 'Este ano' },
  { key: 'last_year',  label: 'Ano passado' },
  { key: 'custom',     label: 'Personalizado' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowSP() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })) }
function fmt(d: Date) { return d.toISOString().split('T')[0] }

function getRange(period: Period, custom: { from: string; to: string }) {
  const now = nowSP()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  switch (period) {
    case 'today':      return { from: fmt(now), to: fmt(now) }
    case 'yesterday':  { const y2 = new Date(y, m, d - 1); return { from: fmt(y2), to: fmt(y2) } }
    case '7d':         return { from: fmt(new Date(y, m, d - 6)), to: fmt(now) }
    case '14d':        return { from: fmt(new Date(y, m, d - 13)), to: fmt(now) }
    case 'month':      return { from: fmt(new Date(y, m, 1)), to: fmt(now) }
    case 'last_month': return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'year':       return { from: `${y}-01-01`, to: fmt(now) }
    case 'last_year':  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'custom':     return custom
  }
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? { label: status, bg: '#F5F5F5', color: '#555' }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: b.bg, color: b.color }}
    >
      {b.pulse && <span className="w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0" style={{ background: b.color }} />}
      {b.label}
    </span>
  )
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(leads: Lead[], tab: Tab) {
  const headers = ['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', 'Data Consulta']
  const rows = leads.map(l => [
    l.nome_lead ?? '',
    l.whatsapp_lead ?? '',
    l.procedimento_interesse ?? '',
    STATUS_BADGE[l.status]?.label ?? l.status,
    fmtDateTime(l.inicio_atendimento),
    fmtDateTime(l.data_agendamento),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${tab === 'leads' ? 'contatos' : 'pacientes'}_${fmt(nowSP())}.csv`
  a.click()
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportPDF(leads: Lead[], tab: Tab) {
  const title = tab === 'leads' ? 'Contatos (Leads)' : 'Pacientes (Clientes)'
  const rows = leads.map(l => `
    <tr>
      <td>${l.nome_lead ?? '—'}<br/><small>${l.whatsapp_lead ?? ''}</small></td>
      <td>${l.procedimento_interesse ?? '—'}</td>
      <td>${STATUS_BADGE[l.status]?.label ?? l.status}</td>
      <td>${fmtDateTime(l.inicio_atendimento)}</td>
      <td>${fmtDateTime(l.data_agendamento)}</td>
    </tr>`).join('')
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1A1A1A; padding: 24px; }
      h1 { font-size: 18px; margin-bottom: 4px; color: #B85C72; }
      p { font-size: 11px; color: #7A7A7A; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #F4F2EF; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 8px; border-bottom: 1px solid #EBEBEB; vertical-align: top; }
      tr:last-child td { border-bottom: none; }
      small { color: #7A7A7A; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>${title}</h1>
    <p>Exportado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${leads.length} registro(s)</p>
    <table>
      <thead><tr><th>Nome / Telefone</th><th>Procedimento</th><th>Status</th><th>Início</th><th>Consulta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 400)
}

// ─── Novo Contato Modal ───────────────────────────────────────────────────────
function NovoContatoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tipo: 'lead',
    nome_lead: '',
    whatsapp_lead: '',
    procedimento_interesse: '',
    data_nascimento: '',
    data_agendamento: '',
    anotacoes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const now = new Date().toISOString()
    const { error } = await supabase.from('leads_clinica').insert({
      nome_lead: form.nome_lead.trim(),
      whatsapp_lead: form.whatsapp_lead.trim(),
      status: form.tipo === 'paciente' ? 'consulta_realizada' : 'iniciou_conversa',
      procedimento_interesse: form.procedimento_interesse.trim() || null,
      data_nascimento: form.data_nascimento || null,
      data_agendamento: form.data_agendamento ? new Date(form.data_agendamento).toISOString() : null,
      anotacoes: form.anotacoes.trim() || null,
      inicio_atendimento: now,
      ultima_mensagem: now,
      minutos_ultima_mensagem: 0,
    })
    if (error) { setError('Erro ao cadastrar. Tente novamente.'); setSaving(false) }
    else { onSaved(); onClose() }
  }

  const field = (label: string, required: boolean, children: React.ReactNode) => (
    <div>
      <label className="block text-xs font-semibold text-[#7A7A7A] mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-[#B85C72]">*</span>}
      </label>
      {children}
    </div>
  )

  const inputCls = "w-full border border-[#EBEBEB] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all bg-white"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[18px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBEBEB]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F7EDF0] flex items-center justify-center">
              <UserPlus size={16} className="text-[#B85C72]" />
            </div>
            <div>
              <h3 className="font-bold text-[#1A1A1A] text-base">Novo Contato</h3>
              <p className="text-xs text-[#7A7A7A]">Cadastro manual pela secretaria</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#7A7A7A] hover:text-[#1A1A1A] transition-colors p-1 rounded-lg hover:bg-[#F4F2EF]">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-4">

            {/* Tipo — toggle visual */}
            {field('Tipo', true,
              <div className="flex gap-2">
                {[{ v: 'lead', label: 'Lead (Contato)', desc: 'Ainda não realizou consulta' },
                  { v: 'paciente', label: 'Paciente', desc: 'Já realizou consulta' }].map(opt => (
                  <button type="button" key={opt.v}
                    onClick={() => setForm(f => ({ ...f, tipo: opt.v }))}
                    className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-all
                      ${form.tipo === opt.v
                        ? 'border-[#B85C72] bg-[#F7EDF0]'
                        : 'border-[#EBEBEB] hover:border-[#D4849A]'}`}>
                    <p className={`text-sm font-semibold ${form.tipo === opt.v ? 'text-[#B85C72]' : 'text-[#1A1A1A]'}`}>{opt.label}</p>
                    <p className="text-[11px] text-[#7A7A7A] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Nome */}
            {field('Nome completo', true,
              <input required value={form.nome_lead}
                onChange={e => setForm(f => ({ ...f, nome_lead: e.target.value }))}
                placeholder="Ex: Ana Paula Ferreira"
                className={inputCls} />
            )}

            {/* WhatsApp */}
            {field('WhatsApp', true,
              <input required value={form.whatsapp_lead}
                onChange={e => setForm(f => ({ ...f, whatsapp_lead: e.target.value }))}
                placeholder="Ex: (11) 98765-4321"
                className={inputCls} />
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 h-px bg-[#EBEBEB]" />
              <span className="text-[10px] text-[#7A7A7A] font-medium uppercase tracking-wide">Opcionais</span>
              <div className="flex-1 h-px bg-[#EBEBEB]" />
            </div>

            {/* Procedimento */}
            {field('Procedimento de interesse', false,
              <input value={form.procedimento_interesse}
                onChange={e => setForm(f => ({ ...f, procedimento_interesse: e.target.value }))}
                placeholder="Ex: Lipoaspiração, Mamoplastia..."
                className={inputCls} />
            )}

            {/* Grid: nascimento + consulta */}
            <div className="grid grid-cols-2 gap-3">
              {field('Data de nascimento', false,
                <input type="date" value={form.data_nascimento}
                  onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
                  className={inputCls} />
              )}
              {field('Data da consulta', false,
                <input type="datetime-local" value={form.data_agendamento}
                  onChange={e => setForm(f => ({ ...f, data_agendamento: e.target.value }))}
                  className={inputCls} />
              )}
            </div>

            {/* Anotações */}
            {field('Anotações', false,
              <textarea rows={3} value={form.anotacoes}
                onChange={e => setForm(f => ({ ...f, anotacoes: e.target.value }))}
                placeholder="Observações internas sobre este contato..."
                className={`${inputCls} resize-none`} />
            )}

            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#EBEBEB] text-sm font-medium text-[#7A7A7A] hover:bg-[#F4F2EF] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={14} />}
              Cadastrar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('leads')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showNovoContato, setShowNovoContato] = useState(false)

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from('leads_clinica')
      .select('id, nome_lead, whatsapp_lead, procedimento_interesse, status, inicio_atendimento, data_agendamento, created_at')
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const range = getRange(period, custom)

  const filtered = useMemo(() => {
    let list = leads

    // Period filter on created_at
    list = list.filter(l => {
      const d = l.created_at.split('T')[0]
      return d >= range.from && d <= range.to
    })

    // Tab filter
    if (tab === 'leads') {
      list = list.filter(l => !PATIENT_STATUS.includes(l.status))
    } else {
      list = list.filter(l => PATIENT_STATUS.includes(l.status))
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        (l.nome_lead ?? '').toLowerCase().includes(q) ||
        (l.whatsapp_lead ?? '').toLowerCase().includes(q)
      )
    }

    // Sort by created_at
    list = [...list].sort((a, b) => {
      const diff = a.created_at.localeCompare(b.created_at)
      return sortDir === 'desc' ? -diff : diff
    })

    return list
  }, [leads, tab, search, range.from, range.to, sortDir])

  const leadsCount = useMemo(() => leads.filter(l => !PATIENT_STATUS.includes(l.status)).length, [leads])
  const patientsCount = useMemo(() => leads.filter(l => PATIENT_STATUS.includes(l.status)).length, [leads])

  return (
    <>
      {showNovoContato && (
        <NovoContatoModal
          onClose={() => setShowNovoContato(false)}
          onSaved={() => { fetchLeads(); setShowNovoContato(false) }}
        />
      )}
    <div className="p-6 h-full overflow-y-auto space-y-5">

      {/* Header */}
      <div className="fade-in-up flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Leads / Clientes</h1>
          <p className="text-sm text-[#7A7A7A] mt-0.5">Gestão de todos os seus contatos e pacientes</p>
        </div>
        <button
          onClick={() => setShowNovoContato(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B85C72] text-white text-sm font-semibold hover:bg-[#8F3F55] transition-all shadow-sm flex-shrink-0">
          <UserPlus size={15} />
          Novo Contato
        </button>
      </div>

      {/* Intro cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 fade-in-up stagger-1">
        <div className="bg-white border border-[#EBEBEB] rounded-[14px] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F7EDF0] flex items-center justify-center flex-shrink-0">
            <Users size={16} className="text-[#B85C72]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Contatos (Leads)</p>
            <p className="text-xs text-[#7A7A7A] mt-0.5">Pessoas que entraram em contato mas ainda não realizaram uma consulta</p>
          </div>
        </div>
        <div className="bg-white border border-[#EBEBEB] rounded-[14px] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#E8F8EF] flex items-center justify-center flex-shrink-0">
            <UserCheck size={16} className="text-[#1A7A48]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Pacientes (Clientes)</p>
            <p className="text-xs text-[#7A7A7A] mt-0.5">Pessoas que já tiveram a consulta realizada ou são pacientes recorrentes</p>
          </div>
        </div>
      </div>

      {/* Period filters */}
      <div className="fade-in-up stagger-2 flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button key={p.key}
            onClick={() => { setPeriod(p.key); if (p.key === 'custom') setShowCustom(true) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${period === p.key ? 'bg-[#B85C72] text-white shadow-sm' : 'bg-white border border-[#EBEBEB] text-[#7A7A7A] hover:border-[#D4849A] hover:text-[#B85C72]'}`}
          >{p.label}</button>
        ))}
      </div>

      {showCustom && period === 'custom' && (
        <div className="fade-in flex flex-wrap items-center gap-3 bg-white border border-[#EBEBEB] rounded-xl p-4">
          <label className="text-xs text-[#7A7A7A] font-medium">De:</label>
          <input type="date" value={custom.from} max={fmt(nowSP())}
            onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
            className="border border-[#EBEBEB] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#B85C72]" />
          <label className="text-xs text-[#7A7A7A] font-medium">Até:</label>
          <input type="date" value={custom.to} max={fmt(nowSP())}
            onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
            className="border border-[#EBEBEB] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#B85C72]" />
          <button onClick={() => setShowCustom(false)}
            className="ml-auto px-4 py-1.5 bg-[#B85C72] text-white rounded-lg text-xs font-medium hover:bg-[#8F3F55] transition-colors">
            Aplicar
          </button>
        </div>
      )}

      {/* Search + Export */}
      <div className="flex flex-wrap gap-3 items-center fade-in-up stagger-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7A7A]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#EBEBEB] bg-white text-sm text-[#1A1A1A]
                       placeholder:text-[#7A7A7A] outline-none focus:border-[#B85C72] focus:ring-2 focus:ring-[#B85C72]/10 transition-all"
          />
        </div>
        <button onClick={() => exportCSV(filtered, tab)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#EBEBEB] bg-white text-sm font-medium text-[#7A7A7A] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-all">
          <Download size={14} />
          CSV
        </button>
        <button onClick={() => exportPDF(filtered, tab)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#EBEBEB] bg-white text-sm font-medium text-[#7A7A7A] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-all">
          <FileText size={14} />
          PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-[#EBEBEB] rounded-xl p-1 w-fit fade-in-up stagger-4">
        {([
          { key: 'leads' as Tab, label: 'Contatos', count: leadsCount, icon: Users },
          { key: 'pacientes' as Tab, label: 'Pacientes', count: patientsCount, icon: UserCheck },
        ] as const).map(({ key, label, count, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? 'bg-[#B85C72] text-white shadow-sm' : 'text-[#7A7A7A] hover:text-[#1A1A1A]'}`}>
            <Icon size={14} />
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
              ${tab === key ? 'bg-white/20 text-white' : 'bg-[#F4F2EF] text-[#7A7A7A]'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#EBEBEB] rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden fade-in-up stagger-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-[#B85C72] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users size={36} className="text-[#D4849A]" />
            <p className="text-sm text-[#7A7A7A]">Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#FAFAFA]">
                  <th className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide px-5 py-3.5">Nome / Telefone</th>
                  <th className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide px-4 py-3.5">Procedimento</th>
                  <th className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide px-4 py-3.5">Status</th>
                  <th className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide px-4 py-3.5">
                    <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                      className="flex items-center gap-1 hover:text-[#1A1A1A] transition-colors">
                      Início <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="text-left text-[11px] font-semibold text-[#7A7A7A] uppercase tracking-wide px-4 py-3.5">
                    <span className="flex items-center gap-1"><Calendar size={11} /> Consulta</span>
                  </th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr key={lead.id}
                    className={`border-b border-[#F5F5F5] last:border-0 hover:bg-[#FAFAF8] transition-colors ${i % 2 === 1 ? 'bg-[#FDFDFC]' : ''}`}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[#1A1A1A]">{lead.nome_lead ?? '—'}</p>
                      <p className="text-[11px] text-[#7A7A7A] mt-0.5">{lead.whatsapp_lead ?? ''}</p>
                    </td>
                    <td className="px-4 py-3.5 text-[#7A7A7A] text-xs">{lead.procedimento_interesse ?? '—'}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#7A7A7A] whitespace-nowrap">{fmtDateTime(lead.inicio_atendimento)}</td>
                    <td className="px-4 py-3.5 text-xs text-[#7A7A7A] whitespace-nowrap">{fmtDateTime(lead.data_agendamento)}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => navigate(`/leads/${lead.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F7EDF0] text-[#B85C72] text-xs font-semibold hover:bg-[#B85C72] hover:text-white transition-all">
                        Detalhes <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-[#EBEBEB] bg-[#FAFAFA]">
            <p className="text-xs text-[#7A7A7A]">{filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
