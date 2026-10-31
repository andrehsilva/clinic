import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, X, UserX } from 'lucide-react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDateTime } from '../lib/format'
import { type ConsultaAgendada, buscarConsultasVencidas } from '../lib/consultasVencidas'

interface ConsultaPendente extends ConsultaAgendada {
  nome_lead: string
}

const DESFECHOS = [
  { status: 'realizada', label: 'Realizada', icon: Check, classes: 'bg-success text-white hover:bg-success/90' },
  { status: 'cancelada', label: 'Cancelada', icon: X, classes: 'bg-status-danger text-white hover:bg-status-danger/90' },
  { status: 'faltou', label: 'Faltou', icon: UserX, classes: 'bg-status-warning text-white hover:bg-status-warning/90' },
] as const

export function ConsultaVencidaGate() {
  const { clinicaId, loading: authLoading } = useAuth()
  const [consultas, setConsultas] = useState<ConsultaPendente[]>([])
  const [verificando, setVerificando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const requisicaoAtiva = useRef(false)
  const primeiraVerificacaoConcluida = useRef(false)

  const verificar = useCallback(async () => {
    if (!clinicaId || requisicaoAtiva.current) return
    requisicaoAtiva.current = true
    if (!primeiraVerificacaoConcluida.current) setVerificando(true)
    try {
      const vencidas = await buscarConsultasVencidas(new Date())
      const leadIds = [...new Set(vencidas.map(consulta => consulta.lead_id))]
      let nomes: Record<string, string> = {}
      if (leadIds.length > 0) {
        const { data, error: erroLeads } = await supabase
          .from('leads_clinica')
          .select('id, nome_lead')
          .in('id', leadIds)
        if (erroLeads) throw erroLeads
        nomes = Object.fromEntries((data ?? []).map(lead => [lead.id, lead.nome_lead || 'Lead sem nome']))
      }
      setConsultas(vencidas.map(consulta => ({ ...consulta, nome_lead: nomes[consulta.lead_id] ?? 'Lead' })))
      setErro(null)
    } catch {
      setErro('Não foi possível verificar as consultas vencidas. A secretaria não pode continuar até a verificação funcionar.')
    } finally {
      primeiraVerificacaoConcluida.current = true
      requisicaoAtiva.current = false
      setVerificando(false)
    }
  }, [clinicaId])

  useEffect(() => {
    if (authLoading) return
    if (!clinicaId) {
      setConsultas([])
      setVerificando(false)
      primeiraVerificacaoConcluida.current = true
      return
    }
    void verificar()
    const timer = window.setInterval(() => { void verificar() }, 5_000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') void verificar() }
    document.addEventListener('visibilitychange', aoVoltar)
    const canal = supabase.channel(`consultas_vencidas_${clinicaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, () => { void verificar() })
      .subscribe()
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      void supabase.removeChannel(canal)
    }
  }, [authLoading, clinicaId, verificar])

  useEffect(() => {
    if (authLoading || !clinicaId || (!verificando && !erro && consultas.length === 0)) return
    const foco = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
    foco[0]?.focus()
    const prenderFoco = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return
      const botoes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
      if (!botoes.length) { evento.preventDefault(); return }
      const primeira = botoes[0]
      const ultima = botoes[botoes.length - 1]
      if (evento.shiftKey && (document.activeElement === primeira || !dialogRef.current?.contains(document.activeElement))) {
        evento.preventDefault(); ultima.focus()
      } else if (!evento.shiftKey && (document.activeElement === ultima || !dialogRef.current?.contains(document.activeElement))) {
        evento.preventDefault(); primeira.focus()
      }
    }
    document.addEventListener('keydown', prenderFoco)
    return () => document.removeEventListener('keydown', prenderFoco)
  }, [authLoading, clinicaId, verificando, erro, consultas.length])

  const classificar = async (consulta: ConsultaPendente, status: typeof DESFECHOS[number]['status']) => {
    if (salvandoId) return
    setSalvandoId(consulta.id)
    setErro(null)
    const { data, error: erroUpdate } = await supabase.from('consultas')
      .update({ status })
      .eq('id', consulta.id)
      .eq('status', 'agendada')
      .select('id')
      .single()
    setSalvandoId(null)
    if (erroUpdate || !data) {
      setErro(erroUpdate?.message.includes('vencida')
        ? erroUpdate.message
        : 'Não foi possível classificar esta consulta. Tente novamente.')
      await verificar()
      return
    }
    await verificar()
  }

  if (authLoading || !clinicaId || (!verificando && !erro && consultas.length === 0)) return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="consultas-vencidas-title" aria-describedby="consultas-vencidas-description"
        className="flex max-h-[min(88vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-status-danger/40 bg-card shadow-2xl">
        <header className="flex items-start gap-4 border-b border-status-danger/20 bg-status-danger-light/50 p-5 sm:p-6">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-status-danger-light text-status-danger"><AlertTriangle size={23} /></div>
          <div>
            <h2 id="consultas-vencidas-title" className="text-lg font-bold text-text-primary sm:text-xl">{verificando ? 'Verificando consultas vencidas' : erro ? 'Ação bloqueada' : 'Classifique as consultas vencidas'}</h2>
            <p id="consultas-vencidas-description" className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {verificando ? 'Aguarde enquanto verificamos os horários agendados.' : erro ? erro : `Há ${consultas.length} consulta${consultas.length === 1 ? '' : 's'} cujo horário já passou. Classifique como Realizada, Cancelada ou Faltou para continuar.`}
            </p>
          </div>
        </header>
        {erro && <div role="alert" className="mx-5 mt-4 rounded-xl border border-status-danger/30 bg-status-danger-light px-4 py-3 text-sm text-status-danger sm:mx-6">{erro}</div>}
        {consultas.length > 0 && <div className="flex-1 space-y-3 overflow-y-auto p-5 sm:p-6">
          {consultas.map(consulta => <article key={consulta.id} className="rounded-xl border border-border bg-page p-4">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-text-primary">{consulta.nome_lead}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary"><CalendarClock size={14} /> {fmtDateTime(consulta.data_consulta)}</p>
              <p className="mt-1 text-sm text-text-primary">{consulta.procedimento}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DESFECHOS.map(({ status, label, icon: Icon, classes }) => <button key={status} type="button" disabled={!!salvandoId}
                onClick={() => void classificar(consulta, status)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-opacity disabled:cursor-wait disabled:opacity-60 ${classes}`}>
                {salvandoId === consulta.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon size={16} />}{label}
              </button>)}
            </div>
          </article>)}
        </div>}
        {verificando && consultas.length === 0 && <div className="p-8 text-center text-sm text-text-secondary">Verificando se há consultas que precisam de classificação…</div>}
        {!verificando && erro && <footer className="flex justify-end border-t border-border p-4 sm:p-5">
          <button type="button" onClick={() => void verificar()} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">Verificar novamente</button>
        </footer>}
      </section>
    </div>,
    document.body,
  )
}
