import { useEffect, useState, useCallback } from 'react'
import { Users, Calendar, TrendingUp } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, Cell,
  PieChart, Pie, Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAnimatedCounter } from '../hooks/useAnimatedCounter'

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | '7d' | '14d' | 'month' | 'last_month' | 'year' | 'last_year' | 'custom'

interface DateRange { from: string; to: string }
interface Lead { created_at: string; inicio_atendimento: string | null; data_marcacao_agendamento: string | null }
interface Consulta { lead_id: string; procedimento: string; data_consulta: string; status: string }
interface LeadRow { nome_lead: string | null; whatsapp_lead: string | null; data_agendamento: string | null; status: string | null }
interface HorarioRow { dia_semana: number; hora_inicio: string; hora_fim: string; ativo: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSP(d: Date) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}
function nowSP() { return toSP(new Date()) }
function fmt(d: Date) { return d.toISOString().split('T')[0] }

function getRange(period: Period, custom: { from: string; to: string }): DateRange {
  const now = nowSP()
  const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
  switch (period) {
    case 'today':      return { from: fmt(now), to: fmt(now) }
    case 'yesterday': { const y2 = new Date(y, m, day - 1); return { from: fmt(y2), to: fmt(y2) } }
    case '7d':         return { from: fmt(new Date(y, m, day - 6)), to: fmt(now) }
    case '14d':        return { from: fmt(new Date(y, m, day - 13)), to: fmt(now) }
    case 'month':      return { from: fmt(new Date(y, m, 1)), to: fmt(now) }
    case 'last_month': return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'year':       return { from: `${y}-01-01`, to: fmt(now) }
    case 'last_year':  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'custom':     return custom
  }
}

function dayLabel(n: number) { return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][n] }
function fmtDate(s: string) {
  const [, mm, dd] = s.split('-')
  return `${dd}/${mm}`
}

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string; pulse?: boolean }> = {
  iniciou_conversa:   { label: 'Iniciou conversa',   bg: '#F7EDF0', text: '#B85C72', pulse: true },
  conversando:        { label: 'Conversando',         bg: '#EBF4FD', text: '#2980B9' },
  consulta_agendada:  { label: 'Consulta agendada',   bg: '#E8F8EF', text: '#1A7A48' },
  consulta_cancelada: { label: 'Cancelada',           bg: '#FDECEA', text: '#C0392B' },
  follow_up_1_feito:  { label: 'Follow-up 1',         bg: '#FEF9EC', text: '#B7770D' },
  follow_up_2_feito:  { label: 'Follow-up 2',         bg: '#FEF9EC', text: '#B7770D' },
  follow_up_3_feito:  { label: 'Follow-up 3',         bg: '#FEF9EC', text: '#B7770D' },
  consulta_realizada: { label: 'Realizada',           bg: '#1A7A48', text: '#fff' },
  paciente_recorrente:{ label: 'Recorrente',          bg: '#F0EBF8', text: '#6C3483' },
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-border rounded-xl shadow-card-hover p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-text-primary mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="font-semibold text-text-primary ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, desc, color = '#B85C72', suffix = '', delay = '' }:
  { icon: React.ElementType; label: string; value: number; desc: string; color?: string; suffix?: string; delay?: string }) {
  const animated = useAnimatedCounter(value)
  return (
    <div className={`bg-card border border-border rounded-card p-5 shadow-card hover:shadow-card-hover transition-shadow fade-in-up ${delay}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + '18' }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-[11px] font-medium text-text-secondary bg-gray-50 px-2 py-0.5 rounded-full">{label}</span>
      </div>
      <p className="text-3xl font-bold text-text-primary mb-1">
        {animated}{suffix}
      </p>
      <p className="text-xs text-text-secondary">{desc}</p>
    </div>
  )
}

// ─── Period filters ───────────────────────────────────────────────────────────
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '14d', label: '14 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'year', label: 'Este ano' },
  { key: 'last_year', label: 'Ano passado' },
  { key: 'custom', label: 'Personalizado' },
]

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)
  const [userName, setUserName] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [horarios, setHorarios] = useState<HorarioRow[]>([])
  const [upcoming, setUpcoming] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)

  const range = getRange(period, custom)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
      setUserName(u?.nome ?? user.email ?? '')
    }

    const { data: leadsData } = await supabase
      .from('leads_clinica')
      .select('created_at, inicio_atendimento, data_marcacao_agendamento')
    setLeads((leadsData ?? []) as Lead[])

    const { data: hor } = await supabase.from('horario_comercial').select('*')
    setHorarios((hor ?? []) as HorarioRow[])

    const today = fmt(nowSP())
    const { data: upd } = await supabase
      .from('leads_clinica')
      .select('nome_lead, whatsapp_lead, data_agendamento, status')
      .gt('data_agendamento', today)
      .order('data_agendamento', { ascending: true })
      .limit(10)
    setUpcoming((upd ?? []) as LeadRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── KPIs ──
  const inRange = (d: string | null) => {
    if (!d) return false
    const s = d.split('T')[0]
    return s >= range.from && s <= range.to
  }

  const novosContatos = leads.filter(l => inRange(l.created_at)).length
  const consultasAgendadas = leads.filter(l => inRange(l.data_marcacao_agendamento)).length
  const taxaConversao = novosContatos > 0 ? Math.round((consultasAgendadas / novosContatos) * 100) : 0

  // ── Line Chart: atendimentos vs agendamentos por dia ──
  const days: string[] = []
  if (range.from && range.to) {
    const cur = new Date(range.from + 'T00:00:00')
    const end = new Date(range.to + 'T00:00:00')
    while (cur <= end && days.length < 60) {
      days.push(fmt(cur))
      cur.setDate(cur.getDate() + 1)
    }
  }
  const lineData = days.map(d => ({
    date: fmtDate(d),
    Atendimentos: leads.filter(l => l.inicio_atendimento?.split('T')[0] === d).length,
    Agendamentos: leads.filter(l => l.data_marcacao_agendamento?.split('T')[0] === d).length,
  }))

  // ── Bar Chart: dia da semana ──
  const weekCounts = [0, 1, 2, 3, 4, 5, 6].map(i => ({
    dia: dayLabel(i),
    total: leads.filter(l => {
      if (!l.inicio_atendimento || !inRange(l.inicio_atendimento)) return false
      return new Date(l.inicio_atendimento).getDay() === i
    }).length,
  }))
  const maxWeek = Math.max(...weekCounts.map(w => w.total), 1)

  // ── Donut: dentro vs fora do horário ──
  function isWithinHorario(iso: string | null): boolean {
    if (!iso) return false
    const dt = toSP(new Date(iso))
    const dow = dt.getDay()
    const hms = dt.toTimeString().slice(0, 5)
    return horarios.some(h =>
      h.dia_semana === dow && h.ativo && hms >= h.hora_inicio.slice(0, 5) && hms <= h.hora_fim.slice(0, 5)
    )
  }
  const dentroHorario = leads.filter(l => inRange(l.inicio_atendimento) && isWithinHorario(l.inicio_atendimento)).length
  const foraHorario = leads.filter(l => inRange(l.inicio_atendimento) && !isWithinHorario(l.inicio_atendimento)).length
  const donutData = [
    { name: 'Dentro do horário', value: dentroHorario, color: '#1A7A48' },
    { name: 'Fora do horário', value: foraHorario, color: '#E8955A' },
  ]

  const firstName = userName.split(' ')[0]

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">

      {/* Header */}
      <div className="fade-in-up">
        <h1 className="text-2xl font-bold text-text-primary">Olá, {firstName || 'bem-vinda'}! 👋</h1>
        <p className="text-sm text-text-secondary mt-0.5">Aqui está o resumo da sua clínica.</p>
      </div>

      {/* Period filters */}
      <div className="fade-in-up stagger-1 flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => { setPeriod(p.key); if (p.key === 'custom') setShowCustom(true) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${period === p.key
                ? 'bg-accent text-white shadow-sm'
                : 'bg-white border border-border text-text-secondary hover:border-accent-medium hover:text-accent'
              }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date picker */}
      {showCustom && period === 'custom' && (
        <div className="fade-in flex items-center gap-3 bg-white border border-border rounded-xl p-4">
          <label className="text-xs text-text-secondary font-medium">De:</label>
          <input type="date" value={custom.from} max={fmt(nowSP())}
            onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
            className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent" />
          <label className="text-xs text-text-secondary font-medium">Até:</label>
          <input type="date" value={custom.to} max={fmt(nowSP())}
            onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
            className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent" />
          <button onClick={() => setShowCustom(false)}
            className="ml-auto px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-dark transition-colors">
            Aplicar
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard icon={Users}       label="Novos Contatos"        value={novosContatos}      desc="Pessoas que entraram em contato no período"   delay="stagger-1" />
        <KpiCard icon={Calendar}    label="Consultas Agendadas"   value={consultasAgendadas} desc="Total de consultas marcadas no período"         delay="stagger-2" />
        <KpiCard icon={TrendingUp}  label="Taxa de Conversão"     value={taxaConversao}      desc="Contatos que viraram consulta agendada"        delay="stagger-3" suffix="%" color="#1A7A48" />
      </div>

      {/* Line Chart */}
      <div className="bg-card border border-border rounded-card p-5 shadow-card fade-in-up stagger-2">
        <h2 className="text-sm font-semibold text-text-primary">Atendimentos vs Agendamentos</h2>
        <p className="text-xs text-text-secondary mt-0.5 mb-5">Compare quantas pessoas entraram em contato e quantas marcaram consulta por dia no período selecionado</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7A7A7A' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#7A7A7A' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <ReTooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
            <Line type="monotone" dataKey="Atendimentos" stroke="#B85C72" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="Agendamentos" stroke="#1A7A48" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar: dias da semana */}
        <div className="bg-card border border-border rounded-card p-5 shadow-card fade-in-up stagger-3">
          <h2 className="text-sm font-semibold text-text-primary">Dias com Mais Movimento</h2>
          <p className="text-xs text-text-secondary mt-0.5 mb-5">Veja em quais dias a clínica recebe mais contatos</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekCounts} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EEE8" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#7A7A7A' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#7A7A7A' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <ReTooltip content={<ChartTooltip />} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {weekCounts.map((entry, i) => (
                  <Cell key={i} fill={entry.total === maxWeek && maxWeek > 0 ? '#B85C72' : '#F7EDF0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut: horário */}
        <div className="bg-card border border-border rounded-card p-5 shadow-card fade-in-up stagger-4">
          <h2 className="text-sm font-semibold text-text-primary">Horário dos Contatos</h2>
          <p className="text-xs text-text-secondary mt-0.5 mb-4">Contatos dentro e fora do horário de funcionamento da clínica</p>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="value" paddingAngle={3}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <ReTooltip formatter={(v: number, n: string) => [v, n]} contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3 flex-1">
              {donutData.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <div>
                    <p className="text-xs font-semibold text-text-primary">{d.value} leads</p>
                    <p className="text-[10px] text-text-secondary">{d.name}</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-text-secondary mt-1 border-t border-border pt-2">
                Horários geridos em Configurações
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Próximas consultas */}
      <div className="bg-card border border-border rounded-card p-5 shadow-card fade-in-up stagger-5">
        <h2 className="text-sm font-semibold text-text-primary">Próximas Consultas</h2>
        <p className="text-xs text-text-secondary mt-0.5 mb-5">Consultas já agendadas que ainda estão por acontecer</p>
        {upcoming.length === 0
          ? <p className="text-sm text-text-secondary text-center py-8">Nenhuma consulta futura agendada.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Paciente', 'Procedimento', 'Status', 'Data da Consulta'].map(h => (
                      <th key={h} className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((row, i) => {
                    const badge = STATUS_BADGE[row.status ?? ''] ?? { label: row.status, bg: '#F0EEE8', text: '#7A7A7A' }
                    const dt = row.data_agendamento ? new Date(row.data_agendamento) : null
                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-text-primary">{row.nome_lead ?? '—'}</p>
                          <p className="text-[11px] text-text-secondary">{row.whatsapp_lead ?? ''}</p>
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">—</td>
                        <td className="py-3 pr-4">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                            style={{ background: badge.bg, color: badge.text }}
                          >
                            {badge.pulse && (
                              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: badge.text }} />
                            )}
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 text-text-secondary text-xs">
                          {dt ? dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  )
}
