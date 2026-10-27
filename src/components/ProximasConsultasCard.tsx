import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DIAS_JANELA = 7

interface ConsultaProxima {
  id: string
  procedimento: string
  data_consulta: string
  lead: { id: string; nome_lead: string | null; whatsapp_lead: string | null } | null
}

// Chave de dia no fuso de São Paulo (YYYY-MM-DD), para comparar "hoje" e "amanhã".
function chaveDia(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function rotuloDia(iso: string, hojeKey: string, amanhaKey: string) {
  const key = chaveDia(new Date(iso))
  if (key === hojeKey) return 'Hoje'
  if (key === amanhaKey) return 'Amanhã'
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit',
  }).replace('.', '')
}

export default function ProximasConsultasCard() {
  const { clinicaId } = useAuth()
  const [consultas, setConsultas] = useState<ConsultaProxima[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!clinicaId) return
    let ativo = true
    const agora = new Date()
    const limite = new Date(agora.getTime() + DIAS_JANELA * 24 * 60 * 60 * 1000)
    setLoading(true)
    supabase
      .from('consultas')
      .select('id, procedimento, data_consulta, lead:leads_clinica!inner(id, nome_lead, whatsapp_lead, clinica_id)')
      .eq('status', 'agendada')
      .eq('leads_clinica.clinica_id', clinicaId)
      .gte('data_consulta', agora.toISOString())
      .lte('data_consulta', limite.toISOString())
      .order('data_consulta', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) { setErro(true); setLoading(false); return }
        setConsultas((data ?? []) as unknown as ConsultaProxima[])
        setErro(false)
        setLoading(false)
      })
    return () => { ativo = false }
  }, [clinicaId])

  const { hojeKey, amanhaKey } = useMemo(() => {
    const agora = new Date()
    const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
    return { hojeKey: chaveDia(agora), amanhaKey: chaveDia(amanha) }
  }, [])

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-card">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-light">
            <CalendarClock size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Próximas consultas</h2>
            <p className="text-xs text-text-secondary">Agendadas para os próximos {DIAS_JANELA} dias</p>
          </div>
        </div>
        {!loading && !erro && (
          <span className="rounded-full bg-page px-3 py-1 text-xs font-semibold text-text-primary tabular-nums">
            {consultas.length} {consultas.length === 1 ? 'consulta' : 'consultas'}
          </span>
        )}
      </header>

      {erro && (
        <p className="rounded-xl border border-status-danger/20 bg-status-danger-light px-4 py-3 text-xs text-status-danger">
          Não foi possível carregar as próximas consultas.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : !erro && consultas.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nenhuma consulta agendada nos próximos {DIAS_JANELA} dias.</p>
      ) : !erro && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {consultas.map(c => {
            const hoje = rotuloDia(c.data_consulta, hojeKey, amanhaKey) === 'Hoje'
            const hora = new Date(c.data_consulta).toLocaleTimeString('pt-BR', {
              timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
            })
            return (
              <li
                key={c.id}
                className={`flex items-center gap-4 rounded-xl border bg-page p-4 ${hoje ? 'border-accent ring-1 ring-accent/20' : 'border-border'}`}
              >
                <div className={`flex w-16 flex-shrink-0 flex-col items-center rounded-xl px-2 py-2 text-center leading-tight ${hoje ? 'bg-accent text-white' : 'bg-card text-text-primary border border-border'}`}>
                  <span className="text-[11px] font-medium opacity-80">{rotuloDia(c.data_consulta, hojeKey, amanhaKey)}</span>
                  <span className="mt-0.5 text-base font-bold tabular-nums">{hora}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{c.lead?.nome_lead ?? 'Sem nome'}</p>
                  <p className="truncate text-xs text-text-secondary">{c.procedimento}</p>
                  {c.lead?.whatsapp_lead && (
                    <p className="mt-0.5 text-[11px] text-text-secondary tabular-nums">{c.lead.whatsapp_lead}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
