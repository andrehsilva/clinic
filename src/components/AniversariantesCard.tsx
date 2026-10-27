import { useEffect, useMemo, useState } from 'react'
import { Cake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { nowSP } from '../lib/dateRange'
import { proximosAniversarios, type LeadAniversario, type StatusAniversario } from '../lib/aniversario'

const STATUS_UI: Record<StatusAniversario, { label: string; cls: string }> = {
  enviada:  { label: 'Mensagem enviada', cls: 'bg-success-light text-success' },
  pendente: { label: 'Aguardando envio', cls: 'bg-status-warning-light text-status-warning' },
  agendada: { label: 'Envio agendado',   cls: 'bg-accent-light text-accent' },
}

function rotuloDias(diasAte: number) {
  if (diasAte === 0) return 'Hoje'
  if (diasAte === 1) return 'Amanhã'
  return `Em ${diasAte} dias`
}

export default function AniversariantesCard() {
  const { clinicaId } = useAuth()
  const [leads, setLeads] = useState<LeadAniversario[]>([])
  const [flagAtiva, setFlagAtiva] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (!clinicaId) return
    let ativo = true
    setLoading(true)
    Promise.all([
      supabase
        .from('leads_clinica')
        .select('id, nome_lead, whatsapp_lead, data_nascimento, ultimo_aniversario_enviado')
        .eq('clinica_id', clinicaId)
        .eq('arquivado', false)
        .not('data_nascimento', 'is', null),
      supabase
        .from('configuracoes_clinica')
        .select('aniversario_ativo')
        .eq('id', clinicaId)
        .maybeSingle(),
    ]).then(([l, c]) => {
      if (!ativo) return
      if (l.error || c.error) { setErro(true); setLoading(false); return }
      setLeads((l.data ?? []) as LeadAniversario[])
      setFlagAtiva(!!c.data?.aniversario_ativo)
      setErro(false)
      setLoading(false)
    })
    return () => { ativo = false }
  }, [clinicaId])

  const lista = useMemo(() => {
    const h = nowSP()
    return proximosAniversarios(leads, { y: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() })
  }, [leads])

  return (
    <div className="bg-card border border-border rounded-card p-5 shadow-card fade-in-up stagger-2">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center">
          <Cake size={15} className="text-accent" />
        </div>
        <div>
          <h2 className="font-bold text-text-primary text-sm">Aniversariantes</h2>
          <p className="text-[11px] text-text-secondary">Hoje e nos próximos 7 dias</p>
        </div>
      </div>

      {flagAtiva === false && !erro && (
        <p className="text-xs text-text-secondary bg-page border border-border rounded-lg px-3 py-2 mb-4">
          O envio automático está desativado. Ative em Configurações → Mensagens.
        </p>
      )}

      {erro && (
        <p className="text-xs text-status-danger bg-status-danger-light border border-status-danger/20 rounded-lg px-3 py-2">
          Não foi possível carregar os aniversariantes. Confira se a migration 015 foi aplicada.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !erro && lista.length === 0 ? (
        <p className="text-sm text-text-secondary py-4 text-center">Nenhum aniversariante nos próximos 7 dias.</p>
      ) : !erro && (
        <ul className="divide-y divide-border">
          {lista.map(a => {
            const ui = STATUS_UI[a.status]
            return (
              <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{a.nome}</p>
                  <p className="text-[11px] text-text-secondary">
                    {a.diaMes} · completa {a.idade} anos{a.whatsapp ? ` · ${a.whatsapp}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ui.cls}`}>{ui.label}</span>
                  <span className="text-[11px] text-text-secondary">{rotuloDias(a.diasAte)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
