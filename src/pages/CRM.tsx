import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Clock, Copy, Check, UserRound, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { STATUS_COLORS, DEFAULT_STATUS_COLOR } from '../lib/statusColors'
import {
  hasConsultaRealizada, BLOQUEIO_SEM_CONSULTA_MSG,
  REQUIRES_CONSULTA_AGENDADA, hasConsultaAgendada, BLOQUEIO_SEM_AGENDAMENTO_MSG,
  ETAPAS_AUTOMATICAS, BLOQUEIO_ETAPA_AUTOMATICA_MSG, horasParado,
} from '../lib/statusRules'
import { useFunil } from '../hooks/useFunil'
import { Toast } from '../components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  nome_lead: string | null
  procedimento_interesse: string | null
  status: string
  minutos_ultima_mensagem: number | null
  whatsapp_lead: string | null
  data_virou_recorrente: string | null
  arquivado: boolean
  em_tratamento: boolean
  atendimento_manual: boolean
  status_atualizado_em: string | null
}

// ─── Column definitions ───────────────────────────────────────────────────────
interface Column {
  id: string
  label: string
}

const CLASSIFICACAO_ATRASADA_HORAS = 24

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(minutos: number | null): string {
  if (minutos === null || minutos === undefined) return '—'
  if (minutos < 1) return 'Agora'
  if (minutos < 60) return `${Math.round(minutos)}min`
  const h = Math.floor(minutos / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function classificacaoAtrasada(lead: Lead): boolean {
  if (lead.status !== 'orcamento_pendente' || lead.em_tratamento || !lead.data_virou_recorrente) return false
  const horas = (Date.now() - new Date(lead.data_virou_recorrente).getTime()) / (1000 * 60 * 60)
  return horas >= CLASSIFICACAO_ATRASADA_HORAS
}

// ─── Copy badge ───────────────────────────────────────────────────────────────
function CopyBadge({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-1 mt-1">
      <code className="text-[9px] bg-border-subtle text-text-secondary px-1.5 py-0.5 rounded font-mono leading-none truncate max-w-[110px]">
        {value}
      </code>
      <button
        onClick={copy}
        className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
        title="Copiar status"
      >
        {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
      </button>
    </div>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({
  lead,
  overlay = false,
  isDragging = false,
}: {
  lead: Lead
  overlay?: boolean
  isDragging?: boolean
}) {
  const navigate = useNavigate()
  const { labels } = useFunil()
  const statusColor = STATUS_COLORS[lead.status] ?? DEFAULT_STATUS_COLOR
  const atrasado = classificacaoAtrasada(lead)
  const horasParadas = horasParado(lead)

  const handleClick = () => {
    if (!overlay) navigate(`/leads/${lead.id}`)
  }

  return (
    <div
      onClick={handleClick}
      className={`
        bg-card border rounded-[12px] p-3.5 select-none
        transition-all duration-150
        ${atrasado ? 'border-status-danger ring-1 ring-status-danger/30' : 'border-border'}
        ${overlay ? 'shadow-[0_8px_32px_rgba(0,0,0,0.15)] rotate-1 scale-105' : ''}
        ${isDragging ? 'opacity-40' : ''}
        ${!overlay && !isDragging ? 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing' : ''}
      `}
    >
      {horasParadas !== null && (
        <div className="flex items-center gap-1 mb-2 text-[10px] font-semibold text-status-danger">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot bg-status-danger flex-shrink-0" />
          Parado há {formatTime(horasParadas * 60)}
        </div>
      )}
      {atrasado && (
        <div className="flex items-center gap-1 mb-2 text-[10px] font-semibold text-status-danger">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot bg-status-danger flex-shrink-0" />
          Classificação pendente há mais de 24h
        </div>
      )}
      {/* Name */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserRound size={13} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate leading-tight">
            {lead.nome_lead || 'Lead sem nome'}
          </p>
          {lead.whatsapp_lead && (
            <p className="text-[10px] text-text-secondary truncate">{lead.whatsapp_lead}</p>
          )}
        </div>
      </div>

      {/* Procedimento */}
      {lead.procedimento_interesse && (
        <p className="text-[11px] text-text-secondary mb-2 truncate">
          {lead.procedimento_interesse}
        </p>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
        {/* Status badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor.badgeBg} ${statusColor.badgeText}`}
        >
          {statusColor.pulse && (
            <span className={`w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0 ${statusColor.dot}`} />
          )}
          {labels[lead.status] ?? lead.status}
        </span>

        {/* Tempo */}
        <span className="flex items-center gap-0.5 text-[10px] text-text-secondary">
          <Clock size={9} />
          {formatTime(lead.minutos_ultima_mensagem)}
        </span>
      </div>

      {/* Tag do cliente: só quem já passou por uma consulta realizada */}
      {lead.data_virou_recorrente && (
        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-purple-light text-status-purple">
          Paciente ativo
        </span>
      )}

      {lead.em_tratamento && (
        <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-purple-light text-status-purple">
          Em tratamento
        </span>
      )}

      {lead.atendimento_manual && (
        <span className="inline-block mt-1 mr-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-warning-light text-status-warning">
          Atendimento manual
        </span>
      )}

      {/* Dev copy badge */}
      <CopyBadge value={lead.status} />
    </div>
  )
}

// ─── Draggable Card ───────────────────────────────────────────────────────────
function DraggableCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <LeadCard lead={lead} isDragging={isDragging} />
    </div>
  )
}

// ─── Droppable Column ─────────────────────────────────────────────────────────
function KanbanColumn({
  column,
  leads,
  isOver,
}: {
  column: Column
  leads: Lead[]
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: column.id })
  const statusColor = STATUS_COLORS[column.id] ?? DEFAULT_STATUS_COLOR

  return (
    <div
      className="flex flex-col flex-shrink-0 w-[232px]"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor.dot}`} />
        <h3 className="text-xs font-semibold text-text-primary flex-1 truncate">{column.label}</h3>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor.badgeBg} ${statusColor.badgeText}`}>
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        data-kanban-column
        className={`
          flex flex-col gap-2.5 flex-1 min-h-[120px] p-2 rounded-[14px] transition-colors duration-150 overflow-y-auto
          ${isOver ? 'bg-accent-light ring-2 ring-accent/30' : 'bg-border-subtle'}
        `}
      >
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 opacity-40">
            <Inbox size={22} className="text-text-secondary" />
            <p className="text-[11px] text-text-secondary text-center">Nenhum lead aqui</p>
          </div>
        ) : (
          leads.map(lead => <DraggableCard key={lead.id} lead={lead} />)
        )}
      </div>
    </div>
  )
}

// ─── Main CRM ─────────────────────────────────────────────────────────────────
export default function CRM() {
  const { clinicaId, loading: authLoading } = useAuth()
  const { visiveis, exigeConsulta, statusExibido } = useFunil()
  const columns = useMemo<Column[]>(() => visiveis.map(e => ({ id: e.chave, label: e.rotulo })), [visiveis])
  const [leads, setLeads] = useState<Lead[]>([])
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchLeads = useCallback(async () => {
    if (!clinicaId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('leads_clinica')
      .select('id, nome_lead, procedimento_interesse, status, minutos_ultima_mensagem, whatsapp_lead, data_virou_recorrente, arquivado, em_tratamento, atendimento_manual, status_atualizado_em')
      .eq('clinica_id', clinicaId)
      .eq('arquivado', false)
      .order('created_at', { ascending: false })
    if (error) setToastMsg('Não foi possível carregar os leads. Tente recarregar a página.')
    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }, [clinicaId])

  // Realtime subscription
  useEffect(() => {
    if (authLoading || !clinicaId) return
    fetchLeads()

    channelRef.current = supabase
      .channel('leads_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_clinica', filter: `clinica_id=eq.${clinicaId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Lead
            setLeads(prev => {
              if (updated.arquivado) return prev.filter(l => l.id !== updated.id)
              const exists = prev.some(l => l.id === updated.id)
              return exists
                ? prev.map(l => l.id === updated.id ? { ...l, ...updated } : l)
                : [updated, ...prev]
            })
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Lead
            if (!inserted.arquivado) setLeads(prev => [inserted, ...prev])
          } else if (payload.eventType === 'DELETE') {
            setLeads(prev => prev.filter(l => l.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetchLeads, authLoading, clinicaId])

  // dnd-kit: require 6px movement before drag starts (distinguishes click from drag)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  // Lets the mouse wheel pan the board horizontally, unless the cursor is over
  // a column that still has vertical room to scroll — that column takes priority.
  const handleBoardWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return // trackpad already scrolling horizontally

    const column = (event.target as HTMLElement).closest('[data-kanban-column]') as HTMLElement | null
    if (column) {
      const atTop = column.scrollTop <= 0
      const atBottom = column.scrollTop + column.clientHeight >= column.scrollHeight - 1
      const columnCanConsume = (event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)
      if (columnCanConsume) return
    }

    event.currentTarget.scrollLeft += event.deltaY
    event.preventDefault()
  }

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find(l => l.id === event.active.id)
    setActiveLead(lead ?? null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverColumnId(event.over ? String(event.over.id) : null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveLead(null)
    setOverColumnId(null)

    if (!over) return
    const leadId = active.id as string
    const newStatus = over.id as string

    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    // Card já está nesta coluna (etapa dobrada na coluna de destino): nada a gravar.
    if ((statusExibido[lead.status] ?? lead.status) === newStatus) return

    if (ETAPAS_AUTOMATICAS.has(newStatus)) {
      setToastMsg(BLOQUEIO_ETAPA_AUTOMATICA_MSG)
      return
    }

    if (exigeConsulta.has(newStatus) && !exigeConsulta.has(lead.status)) {
      const ok = await hasConsultaRealizada(leadId)
      if (!ok) {
        setToastMsg(BLOQUEIO_SEM_CONSULTA_MSG)
        return
      }
    }

    if (REQUIRES_CONSULTA_AGENDADA.has(newStatus) && !REQUIRES_CONSULTA_AGENDADA.has(lead.status)) {
      const ok = await hasConsultaAgendada(leadId)
      if (!ok) {
        setToastMsg(BLOQUEIO_SEM_AGENDAMENTO_MSG)
        return
      }
    }

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))

    // Persist to Supabase
    const { error } = await supabase
      .from('leads_clinica')
      .update({ status: newStatus })
      .eq('id', leadId)

    if (error) {
      // Rollback on error
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: lead.status } : l))
      console.warn('Falha ao atualizar status do lead')
    }
  }

  if (authLoading || loading) {
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 fade-in-up">
        <h1 className="text-2xl font-bold text-text-primary">CRM</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Arraste os leads entre as colunas para atualizar o status do funil
        </p>
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6" onWheel={handleBoardWheel}>
          <div className="flex gap-4 h-full" style={{ width: 'max-content' }}>
            {columns.map(col => (
              <KanbanColumn
                key={col.id}
                column={col}
                leads={leads.filter(l => (statusExibido[l.status] ?? l.status) === col.id)}
                isOver={overColumnId === col.id}
              />
            ))}
          </div>
        </div>

        {/* Drag overlay — the floating card while dragging */}
        <DragOverlay>
          {activeLead ? (
            <div className="w-[232px]">
              <LeadCard lead={activeLead} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
    </div>
  )
}
