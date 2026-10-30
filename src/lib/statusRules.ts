import { supabase } from './supabase'

// Quais etapas exigem consulta realizada vem do funil da clínica (ver useFunil).

export async function hasConsultaRealizada(leadId: string): Promise<boolean> {
  const { count } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('status', 'realizada')
  return (count ?? 0) > 0
}

export const BLOQUEIO_SEM_CONSULTA_MSG =
  'Este lead ainda não tem uma consulta realizada registrada. Registre a consulta como "Realizada" antes de mover para este status.'

// Etapas de agendamento exigem ao menos uma consulta agendada registrada.
// Chaves fixas do funil (não mudam por nicho). Só a tela checa isto:
// o bot do n8n move o status sem criar consulta, então não há trava no banco.
export const REQUIRES_CONSULTA_AGENDADA = new Set([
  'consulta_agendada', 'follow_up_3_feito', 'consulta_confirmada',
])

export async function hasConsultaAgendada(leadId: string): Promise<boolean> {
  const { count } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('status', 'agendada')
  return (count ?? 0) > 0
}

export const BLOQUEIO_SEM_AGENDAMENTO_MSG =
  'Este lead ainda não tem uma consulta agendada registrada. Registre a consulta como "Agendada" antes de mover para esta etapa.'

// Etapas de reengajamento automático: só o bot (workflows Follow UP 20min/24hrs/36hrs)
// move o lead para elas. A secretaria pode sair dessas etapas, mas não entrar.
export const ETAPAS_AUTOMATICAS = new Set(['follow_up_1_feito', 'follow_up_2_feito', 'follow_up_3_feito'])

export const BLOQUEIO_ETAPA_AUTOMATICA_MSG =
  'Esta etapa é preenchida automaticamente pelo reengajamento do WhatsApp, por isso não pode ser escolhida manualmente.'

export const BLOQUEIO_EXCLUSAO_ULTIMA_REALIZADA_MSG =
  'Não é possível remover a última consulta realizada de um paciente. Altere a etapa do lead antes.'

// Etapas em que ficar parado é gargalo: alerta depois de LIMITE_PARADO_HORAS sem
// mudança de etapa (status_atualizado_em). Consulta agendada/confirmada e
// retorno esperam por data, então não alertam; orcamento_pendente já tem o
// alerta de classificação de retorno (24h).
export const LIMITE_PARADO_HORAS = 48

export const ETAPAS_ALERTA_PARADO = new Set([
  'iniciou_conversa',
  'conversando',
  'follow_up_1_feito',
  'follow_up_2_feito',
  'follow_up_3_feito',
  'consulta_cancelada',
])

/** Horas paradas na etapa, ou null quando a etapa não alerta / ainda não passou do limite. */
export function horasParado(lead: { status: string; status_atualizado_em: string | null }): number | null {
  if (!ETAPAS_ALERTA_PARADO.has(lead.status) || !lead.status_atualizado_em) return null
  const horas = Math.floor((Date.now() - new Date(lead.status_atualizado_em).getTime()) / 3_600_000)
  return horas >= LIMITE_PARADO_HORAS ? horas : null
}
