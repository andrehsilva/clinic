import { supabase } from './supabase'

export interface ConsultaAgendada {
  id: string
  lead_id: string
  procedimento: string
  data_consulta: string
  status: string
}

export function consultasVencidas<T extends Pick<ConsultaAgendada, 'status' | 'data_consulta'>>(
  consultas: T[],
  agora = Date.now(),
): T[] {
  return consultas.filter(consulta => {
    if (consulta.status !== 'agendada') return false
    const instante = Date.parse(consulta.data_consulta)
    return Number.isFinite(instante) && instante <= agora
  })
}

/** Busca todas as consultas que já passaram do horário; o RLS limita à clínica atual. */
export async function buscarConsultasVencidas(agora = new Date()): Promise<ConsultaAgendada[]> {
  const pageSize = 1000
  const resultado: ConsultaAgendada[] = []
  const corte = agora.toISOString()

  for (let inicio = 0; ; inicio += pageSize) {
    const { data, error } = await supabase
      .from('consultas')
      .select('id, lead_id, procedimento, data_consulta, status')
      .eq('status', 'agendada')
      .lte('data_consulta', corte)
      .order('data_consulta', { ascending: true })
      .range(inicio, inicio + pageSize - 1)
    if (error) throw error
    const pagina = (data ?? []) as ConsultaAgendada[]
    resultado.push(...pagina)
    if (pagina.length < pageSize) return resultado
  }
}
