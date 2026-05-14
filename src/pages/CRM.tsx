import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Clock, Copy, Check, UserRound, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  nome_lead: string | null
  procedimento_interesse: string | null
  status: string
  minutos_ultima_mensagem: number | null
  whatsapp_lead: string | null
}

// ─── Column definitions ───────────────────────────────────────────────────────
interface Column {
  id: string
  label: string
  color: string
  bg: string
}

const COLUMNS: Column[] = [
  { id: 'iniciou_conversa',   label: 'Iniciou Conversa',   color: '#B85C72', bg: '#F7EDF0' },
  { id: 'conversando',        label: 'Conversando',        color: '#2980B9', bg: '#EBF4FD' },
  { id: 'consulta_agendada',  label: 'Consulta Agendada',  color: '#1A7A48', bg: '#E8F8EF' },
  { id: 'follow_up_1_feito',  label: 'Follow-up 1',        color: '#B7770D', bg: '#FEF9EC' },
  { id: 'follow_up_2_feito',  label: 'Follow-up 2',        color: '#B7770D', bg: '#FEF9EC' },
  { id: 'follow_up_3_feito',  label: 'Follow-up 3',        color: '#B7770D', bg: '#FEF9EC' },
  { id: 'consulta_cancelada', label: 'Consulta Cancelada', color: '#C0392B', bg: '#FDECEA' },
  { id: 'consulta_realizada', label: 'Consulta Realizada', color: '#fff',    bg: '#1A7A48' },
  { id: 'paciente_recorrente',label: 'Paciente Recorrente',color: '#6C3483', bg: '#F0EBF8' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(minutos: number | null): string {
  if (minutos === null || minutos === undefined) return '—'
  if (minutos < 1) return 'Agora'
  if (minutos < 60) return `${Math.round(minutos)}min`
  const h = Math.floor(minutos / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
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
      <code className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono leading-none truncate max-w-[110px]">
        {value}
      </code>
      <button
        onClick={copy}
        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        title="Copiar status"
      >
        {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
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
  const col = COLUMNS.find(c => c.id === lead.status)

  const handleClick = () => {
    if (!overlay) navigate(`/leads/${lead.id}`)
  }

  return (
    <div
      onClick={handleClick}
      className={`
        bg-white border border-[#EBEBEB] rounded-[12px] p-3.5 select-none
        transition-all duration-150
        ${overlay ? 'shadow-[0_8px_32px_rgba(0,0,0,0.15)] rotate-1 scale-105' : ''}
        ${isDragging ? 'opacity-40' : ''}
        ${!overlay && !isDragging ? 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing' : ''}
      `}
    >
      {/* Name */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-[#F7EDF0] flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserRound size={13} className="text-[#B85C72]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1A1A1A] truncate leading-tight">
            {lead.nome_lead || 'Lead sem nome'}
          </p>
          {lead.whatsapp_lead && (
            <p className="text-[10px] text-[#7A7A7A] truncate">{lead.whatsapp_lead}</p>
          )}
        </div>
      </div>

      {/* Procedimento */}
      {lead.procedimento_interesse && (
        <p className="text-[11px] text-[#7A7A7A] mb-2 truncate">
          {lead.procedimento_interesse}
        </p>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#F5F5F5]">
        {/* Status badge */}
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: col?.bg ?? '#F5F5F5', color: col?.color ?? '#555' }}
        >
          {lead.status === 'iniciou_conversa' && (
            <span
              className="w-1.5 h-1.5 rounded-full pulse-dot flex-shrink-0"
              style={{ background: col?.color }}
            />
          )}
          {col?.label ?? lead.status}
        </span>

        {/* Tempo */}
        <span className="flex items-center gap-0.5 text-[10px] text-[#7A7A7A]">
          <Clock size={9} />
          {formatTime(lead.minutos_ultima_mensagem)}
        </span>
      </div>

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

  return (
    <div
      className="flex flex-col flex-shrink-0 w-[232px]"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: column.id === 'consulta_realizada' ? '#1A7A48' : column.color }}
        />
        <h3 className="text-xs font-semibold text-[#1A1A1A] flex-1 truncate">{column.label}</h3>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: column.bg, color: column.id === 'consulta_realizada' ? '#fff' : column.color }}
        >
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`
          flex flex-col gap-2.5 flex-1 min-h-[120px] p-2 rounded-[14px] transition-colors duration-150
          ${isOver ? 'bg-[#F7EDF0] ring-2 ring-[#B85C72]/30' : 'bg-[#EDEDEA]'}
        `}
      >
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 opacity-40">
            <Inbox size={22} className="text-[#7A7A7A]" />
            <p className="text-[11px] text-[#7A7A7A] text-center">Nenhum lead aqui</p>
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
  const [leads, setLeads] = useState<Lead[]>([])
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchLeads = useCallback(async () => {
    const { data } = await supabase
      .from('leads_clinica')
      .select('id, nome_lead, procedimento_interesse, status, minutos_ultima_mensagem, whatsapp_lead')
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
    setLoading(false)
  }, [])

  // Realtime subscription
  useEffect(() => {
    fetchLeads()

    channelRef.current = supabase
      .channel('leads_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_clinica' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Lead
            setLeads(prev =>
              prev.map(l => l.id === updated.id ? { ...l, ...updated } : l)
            )
          } else if (payload.eventType === 'INSERT') {
            setLeads(prev => [payload.new as Lead, ...prev])
          } else if (payload.eventType === 'DELETE') {
            setLeads(prev => prev.filter(l => l.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetchLeads])

  // dnd-kit: require 6px movement before drag starts (distinguishes click from drag)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find(l => l.id === event.active.id)
    setActiveLead(lead ?? null)
  }

  const handleDragOver = (event: { over: { id: string } | null }) => {
    setOverColumnId(event.over?.id ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveLead(null)
    setOverColumnId(null)

    if (!over) return
    const leadId = active.id as string
    const newStatus = over.id as string

    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#B85C72] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 fade-in-up">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">CRM</h1>
        <p className="text-sm text-[#7A7A7A] mt-0.5">
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
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6">
          <div className="flex gap-4 h-full" style={{ width: 'max-content' }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.id}
                column={col}
                leads={leads.filter(l => l.status === col.id)}
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
    </div>
  )
}
