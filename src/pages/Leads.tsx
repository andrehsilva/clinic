import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, FileText, Users, UserCheck, UserX, RotateCcw,
  ChevronRight, Calendar, ArrowUpDown, UserPlus, X, Save,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STATUS_COLORS, DEFAULT_STATUS_COLOR } from '../lib/statusColors'
import { useFunil } from '../hooks/useFunil'
import { type Period, nowSP, fmt, getRange, PERIODS } from '../lib/dateRange'
import { fmtDateTime } from '../lib/format'
import { Toast } from '../components/Toast'

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
  arquivado: boolean
  arquivado_em: string | null
}

type Tab = 'leads' | 'pacientes' | 'ex_pacientes'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const { labels } = useFunil()
  const c = STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR
  const label = labels[status] ?? status
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${c.badgeBg} ${c.badgeText}`}
    >
      {c.pulse && <span className={`w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0 ${c.dot}`} />}
      {label}
    </span>
  )
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(leads: Lead[], tab: Tab, labels: Record<string, string>) {
  const headers = ['Nome', 'Telefone', 'Procedimento', 'Status', 'Início Atendimento', 'Data Consulta']
  const rows = leads.map(l => [
    l.nome_lead ?? '',
    l.whatsapp_lead ?? '',
    l.procedimento_interesse ?? '',
    labels[l.status] ?? l.status,
    fmtDateTime(l.inicio_atendimento),
    fmtDateTime(l.data_agendamento),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const fileTag = tab === 'leads' ? 'contatos' : tab === 'pacientes' ? 'pacientes' : 'ex_pacientes'
  a.download = `${fileTag}_${fmt(nowSP())}.csv`
  a.click()
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function exportPDF(leads: Lead[], tab: Tab, labels: Record<string, string>) {
  const title = tab === 'leads' ? 'Contatos (Leads)' : tab === 'pacientes' ? 'Pacientes (Clientes)' : 'Ex-Pacientes (Arquivados)'
  const rows = leads.map(l => `
    <tr>
      <td>${escapeHtml(l.nome_lead ?? '—')}<br/><small>${escapeHtml(l.whatsapp_lead ?? '')}</small></td>
      <td>${escapeHtml(l.procedimento_interesse ?? '—')}</td>
      <td>${labels[l.status] ?? escapeHtml(l.status)}</td>
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
function NovoContatoModal({ clinicaId, onClose, onSaved }: { clinicaId: string; onClose: () => void; onSaved: () => void }) {
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
      clinica_id: clinicaId,
    })
    if (error) { setError('Erro ao cadastrar. Tente novamente.'); setSaving(false) }
    else { onSaved(); onClose() }
  }

  const field = (label: string, required: boolean, children: React.ReactNode) => (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
        {label} {required && <span className="text-accent">*</span>}
      </label>
      {children}
    </div>
  )

  const inputCls = "w-full border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all bg-card"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Novo Contato" className="bg-card rounded-[18px] shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center">
              <UserPlus size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-base">Novo Contato</h3>
              <p className="text-xs text-text-secondary">Cadastro manual pela secretaria</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-page">
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
                        ? 'border-accent bg-accent-light'
                        : 'border-border hover:border-accent-medium'}`}>
                    <p className={`text-sm font-semibold ${form.tipo === opt.v ? 'text-accent' : 'text-text-primary'}`}>{opt.label}</p>
                    <p className="text-[11px] text-text-secondary mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Nome */}
            {field('Nome completo', true,
              <input required autoFocus value={form.nome_lead}
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
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-text-secondary font-medium uppercase tracking-wide">Opcionais</span>
              <div className="flex-1 h-px bg-border" />
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

            {error && <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-xl px-3 py-2.5">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-page transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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
  const { clinicaId, loading: authLoading } = useAuth()
  const { labels, pacienteKeys } = useFunil()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('leads')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showNovoContato, setShowNovoContato] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(0)

  const fetchPage = useCallback(async (pageIndex: number, append: boolean) => {
    if (!clinicaId) return
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error, count } = await supabase
      .from('leads_clinica')
      .select('id, nome_lead, whatsapp_lead, procedimento_interesse, status, inicio_atendimento, data_agendamento, created_at, arquivado, arquivado_em', { count: 'exact' })
      .eq('clinica_id', clinicaId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) setToastMsg('Não foi possível carregar os leads. Tente recarregar a página.')
    setLeads(prev => append ? [...prev, ...((data ?? []) as Lead[])] : (data ?? []) as Lead[])
    setTotalCount(count ?? 0)
    pageRef.current = pageIndex
  }, [clinicaId])

  const fetchLeads = useCallback(async () => {
    if (!clinicaId) { setLoading(false); return }
    setLoading(true)
    await fetchPage(0, false)
    setLoading(false)
  }, [clinicaId, fetchPage])

  const loadMore = async () => {
    setLoadingMore(true)
    await fetchPage(pageRef.current + 1, true)
    setLoadingMore(false)
  }

  useEffect(() => { if (!authLoading) fetchLeads() }, [fetchLeads, authLoading])

  const range = getRange(period, custom)

  const filtered = useMemo(() => {
    let list = leads

    // Tab filter
    if (tab === 'ex_pacientes') {
      // Ex-pacientes ignora o filtro de período — mostra todos direto
      list = list.filter(l => l.arquivado)
    } else {
      // Período filtra só as abas de Contatos/Pacientes, por data de criação
      list = list.filter(l => {
        const d = l.created_at.split('T')[0]
        return d >= range.from && d <= range.to
      })
      list = list.filter(l => !l.arquivado)
      list = tab === 'leads'
        ? list.filter(l => !pacienteKeys.includes(l.status))
        : list.filter(l => pacienteKeys.includes(l.status))
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
  }, [leads, tab, search, range.from, range.to, sortDir, pacienteKeys])

  const leadsCount = useMemo(() => leads.filter(l => !l.arquivado && !pacienteKeys.includes(l.status)).length, [leads, pacienteKeys])
  const patientsCount = useMemo(() => leads.filter(l => !l.arquivado && pacienteKeys.includes(l.status)).length, [leads, pacienteKeys])
  const exPatientsCount = useMemo(() => leads.filter(l => l.arquivado).length, [leads])

  const toggleArquivado = async (lead: Lead) => {
    const arquivado = !lead.arquivado
    const { error } = await supabase
      .from('leads_clinica')
      .update({ arquivado, arquivado_em: arquivado ? new Date().toISOString() : null })
      .eq('id', lead.id)
      .eq('clinica_id', clinicaId)
    if (error) { setToastMsg('Não foi possível atualizar. Tente novamente.'); return }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, arquivado, arquivado_em: arquivado ? new Date().toISOString() : null } : l))
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!clinicaId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <p className="text-text-primary font-semibold">Sua conta ainda não está vinculada a nenhuma clínica.</p>
        <p className="text-sm text-text-secondary">Fale com o administrador do sistema para concluir seu cadastro.</p>
      </div>
    )
  }

  return (
    <>
      {showNovoContato && (
        <NovoContatoModal
          clinicaId={clinicaId}
          onClose={() => setShowNovoContato(false)}
          onSaved={() => { fetchLeads(); setShowNovoContato(false) }}
        />
      )}
    <div className="p-6 h-full overflow-y-auto space-y-5">

      {/* Header */}
      <div className="fade-in-up flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Leads / Clientes</h1>
          <p className="text-sm text-text-secondary mt-0.5">Gestão de todos os seus contatos e pacientes</p>
        </div>
        <button
          onClick={() => setShowNovoContato(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-all shadow-sm flex-shrink-0">
          <UserPlus size={15} />
          Novo Contato
        </button>
      </div>

      {/* Intro cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 fade-in-up stagger-1">
        <div className="bg-card border border-border rounded-[14px] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center flex-shrink-0">
            <Users size={16} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Contatos (Leads)</p>
            <p className="text-xs text-text-secondary mt-0.5">Pessoas que entraram em contato mas ainda não realizaram uma consulta</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-[14px] p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-success-light flex items-center justify-center flex-shrink-0">
            <UserCheck size={16} className="text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Pacientes (Clientes)</p>
            <p className="text-xs text-text-secondary mt-0.5">Pessoas que já tiveram a consulta realizada ou são pacientes recorrentes</p>
          </div>
        </div>
      </div>

      {/* Period filters — não se aplicam à aba Ex-Pacientes */}
      {tab !== 'ex_pacientes' && (
        <>
          <div className="fade-in-up stagger-2 flex flex-wrap gap-1.5">
            {PERIODS.map(p => (
              <button key={p.key}
                onClick={() => { setPeriod(p.key); if (p.key === 'custom') setShowCustom(true) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${period === p.key ? 'bg-accent text-white shadow-sm' : 'bg-card border border-border text-text-secondary hover:border-accent-medium hover:text-accent'}`}
              >{p.label}</button>
            ))}
          </div>

          {showCustom && period === 'custom' && (
            <div className="fade-in flex flex-wrap items-center gap-3 bg-card border border-border rounded-xl p-4">
              <label className="text-xs text-text-secondary font-medium">De:</label>
              <input type="date" value={custom.from} max={fmt(nowSP())}
                onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent bg-card" />
              <label className="text-xs text-text-secondary font-medium">Até:</label>
              <input type="date" value={custom.to} max={fmt(nowSP())}
                onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent bg-card" />
              <button onClick={() => setShowCustom(false)}
                className="ml-auto px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-dark transition-colors">
                Aplicar
              </button>
            </div>
          )}
        </>
      )}

      {/* Search + Export */}
      <div className="flex flex-wrap gap-3 items-center fade-in-up stagger-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-text-primary
                       placeholder:text-text-secondary outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all"
          />
        </div>
        <button onClick={() => exportCSV(filtered, tab, labels)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-text-secondary hover:text-text-primary hover:border-text-primary transition-all">
          <Download size={14} />
          CSV
        </button>
        <button onClick={() => exportPDF(filtered, tab, labels)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-text-secondary hover:text-text-primary hover:border-text-primary transition-all">
          <FileText size={14} />
          PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit fade-in-up stagger-4">
        {([
          { key: 'leads' as Tab, label: 'Contatos', count: leadsCount, icon: Users },
          { key: 'pacientes' as Tab, label: 'Pacientes', count: patientsCount, icon: UserCheck },
          { key: 'ex_pacientes' as Tab, label: 'Ex-Pacientes', count: exPatientsCount, icon: UserX },
        ] as const).map(({ key, label, count, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
            <Icon size={14} />
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
              ${tab === key ? 'bg-white/20 text-white' : 'bg-page text-text-secondary'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden fade-in-up stagger-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users size={36} className="text-accent-medium" />
            <p className="text-sm text-text-secondary">Nenhum registro encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-5 py-3.5">Nome / Telefone</th>
                  <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">Procedimento</th>
                  <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">Status</th>
                  <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">
                    <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                      className="flex items-center gap-1 hover:text-text-primary transition-colors">
                      Início <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide px-4 py-3.5">
                    <span className="flex items-center gap-1"><Calendar size={11} /> Consulta</span>
                  </th>
                  <th className="px-4 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr key={lead.id}
                    className={`border-b border-border-subtle last:border-0 hover:bg-surface-hover transition-colors ${i % 2 === 1 ? 'bg-border-subtle' : ''}`}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-text-primary">{lead.nome_lead ?? '—'}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">{lead.whatsapp_lead ?? ''}</p>
                    </td>
                    <td className="px-4 py-3.5 text-text-secondary text-xs">{lead.procedimento_interesse ?? '—'}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={lead.status} /></td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary whitespace-nowrap">{fmtDateTime(lead.inicio_atendimento)}</td>
                    <td className="px-4 py-3.5 text-xs text-text-secondary whitespace-nowrap">{fmtDateTime(lead.data_agendamento)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => navigate(`/leads/${lead.id}`)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-semibold hover:bg-accent hover:text-white transition-all">
                          Detalhes <ChevronRight size={12} />
                        </button>
                        <button onClick={() => toggleArquivado(lead)}
                          title={lead.arquivado ? 'Reativar' : 'Marcar como ex-paciente'}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-text-secondary text-xs font-semibold hover:border-text-primary hover:text-text-primary transition-all">
                          {lead.arquivado ? <RotateCcw size={12} /> : <UserX size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-surface-hover flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-text-secondary">{filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
            {leads.length < totalCount && (
              <button onClick={loadMore} disabled={loadingMore}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:bg-card transition-colors disabled:opacity-60">
                {loadingMore && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Carregar mais ({leads.length} de {totalCount})
              </button>
            )}
          </div>
        )}
      </div>
    </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </>
  )
}
