// Funil do lead por nicho.
//
// As CHAVES abaixo são fixas: o fluxo n8n/Chatwoot grava essas chaves em
// leads_clinica.status, e os triggers do banco (migrations 006 e 007) dependem
// delas. Cada clínica só altera rótulo, ordem e as regras de cada etapa, que
// ficam em public.funil_etapas.
//
// Uma etapa pode ser DOBRADA em outra (funil_etapas.mapeia_para): a chave
// continua valendo no banco, mas o lead aparece na coluna da etapa de destino.

export const NICHOS = [
  { value: 'estetica', label: 'Estética' },
  { value: 'medica', label: 'Médica' },
  { value: 'odontologica', label: 'Odontológica' },
  { value: 'generico', label: 'Genérico' },
] as const

export type Nicho = typeof NICHOS[number]['value']

export interface Etapa {
  chave: string
  rotulo: string
  ordem: number
  /** Só pode ser atingida depois de uma consulta realizada registrada. */
  exige_consulta_realizada: boolean
  /** Entra na aba "Pacientes" em vez de "Contatos". */
  e_paciente: boolean
  /** Chave em que esta etapa é exibida; null = coluna própria. */
  mapeia_para: string | null
}

/** Ordem do Kanban e do funil. Chaves técnicas: não renomear. */
export const CHAVES_FUNIL = [
  'iniciou_conversa',
  'conversando',
  'follow_up_1_feito',
  'follow_up_2_feito',
  'consulta_agendada',
  'follow_up_3_feito',
  'consulta_confirmada',
  'consulta_cancelada',
  'consulta_realizada',
  'orcamento_pendente',
  'paciente_recorrente',
  'retornar_3_meses',
  'retornar_6_meses',
  'retornar_1_ano',
] as const

const CHAVES_PACIENTE = new Set<string>([
  'consulta_realizada',
  'orcamento_pendente',
  'paciente_recorrente',
  'retornar_3_meses',
  'retornar_6_meses',
  'retornar_1_ano',
])

// Hoje, toda etapa de paciente também exige consulta realizada.
const CHAVES_EXIGEM_CONSULTA = CHAVES_PACIENTE

type Gabarito = Record<typeof CHAVES_FUNIL[number], string>

export const GABARITO: Record<Nicho, Gabarito> = {
  estetica: {
    iniciou_conversa:    'Iniciou Conversa',
    conversando:         'Conversando',
    follow_up_1_feito:   'Reengajamento',
    follow_up_2_feito:   'Reengajamento 2',
    consulta_agendada:   'Consulta Agendada',
    follow_up_3_feito:   'Aguardando Confirmação',
    consulta_confirmada: 'Confirmado',
    consulta_cancelada:  'Cancelada / Falta',
    consulta_realizada:  'Consulta Realizada',
    orcamento_pendente:  'Orçamento Pendente',
    paciente_recorrente: 'Reagendado',
    retornar_3_meses:    'Retorno',
    retornar_6_meses:    'Retorno 6 meses',
    retornar_1_ano:      'Retorno 1 ano',
  },
  medica: {
    iniciou_conversa:    'Novo Contato',
    conversando:         'Em Atendimento',
    follow_up_1_feito:   'Reengajamento',
    follow_up_2_feito:   'Reengajamento 2',
    consulta_agendada:   'Consulta Agendada',
    follow_up_3_feito:   'Aguardando Confirmação',
    consulta_confirmada: 'Confirmado',
    consulta_cancelada:  'Cancelada / Falta',
    consulta_realizada:  'Consulta Realizada',
    orcamento_pendente:  'Orçamento Pendente',
    paciente_recorrente: 'Reagendado',
    retornar_3_meses:    'Retorno',
    retornar_6_meses:    'Retorno 6 meses',
    retornar_1_ano:      'Retorno 1 ano',
  },
  odontologica: {
    iniciou_conversa:    'Novo Contato',
    conversando:         'Orçamento em Negociação',
    follow_up_1_feito:   'Reengajamento',
    follow_up_2_feito:   'Reengajamento 2',
    consulta_agendada:   'Avaliação Agendada',
    follow_up_3_feito:   'Aguardando Confirmação',
    consulta_confirmada: 'Confirmado',
    consulta_cancelada:  'Cancelada / Falta',
    consulta_realizada:  'Avaliação Realizada',
    orcamento_pendente:  'Orçamento Pendente',
    paciente_recorrente: 'Reagendado',
    retornar_3_meses:    'Retorno',
    retornar_6_meses:    'Retorno 6 meses',
    retornar_1_ano:      'Retorno 1 ano',
  },
  generico: {
    iniciou_conversa:    'Novo Contato',
    conversando:         'Em Conversa',
    follow_up_1_feito:   'Reengajamento',
    follow_up_2_feito:   'Reengajamento 2',
    consulta_agendada:   'Agendado',
    follow_up_3_feito:   'Aguardando Confirmação',
    consulta_confirmada: 'Confirmado',
    consulta_cancelada:  'Cancelada / Falta',
    consulta_realizada:  'Concluído',
    orcamento_pendente:  'Orçamento Pendente',
    paciente_recorrente: 'Reagendado',
    retornar_3_meses:    'Retorno',
    retornar_6_meses:    'Retorno 6 meses',
    retornar_1_ano:      'Retorno 1 ano',
  },
}

/** Dobre padrão do gabarito: a segunda etapa de reengajamento aparece na primeira. */
export const MAPA_PADRAO: Record<string, string> = {
  follow_up_2_feito: 'follow_up_1_feito',
  retornar_6_meses: 'retornar_3_meses',
  retornar_1_ano: 'retornar_3_meses',
}

/** Dobras do layout enxuto; as chaves técnicas e regras permanecem inalteradas. */
export const DOBRAS_LAYOUT_SIMPLIFICADO: Record<string, string> = {
  follow_up_1_feito: 'conversando',
  follow_up_2_feito: 'conversando',
  follow_up_3_feito: 'consulta_confirmada',
  consulta_realizada: 'orcamento_pendente',
  paciente_recorrente: 'conversando',
  retornar_6_meses: 'retornar_3_meses',
  retornar_1_ano: 'retornar_3_meses',
}

/** Preset visual; mantém as chaves e regras originais do funil. */
export function aplicarLayoutSimplificado(etapas: Etapa[]): Etapa[] {
  const chaves = new Set(etapas.map(e => e.chave))
  return etapas.map(e => {
    const destino = DOBRAS_LAYOUT_SIMPLIFICADO[e.chave]
    return {
      ...e,
      rotulo: e.chave === 'conversando' ? 'Orçamento em Negociação' : e.rotulo,
      mapeia_para: destino ? (chaves.has(destino) ? destino : null) : null,
    }
  })
}

/** Etapas do nicho, com a ordem padrão. Usado enquanto a clínica não tem linhas em funil_etapas. */
export function etapasPadrao(nicho: Nicho = 'estetica'): Etapa[] {
  return CHAVES_FUNIL.map((chave, i) => ({
    chave,
    rotulo: GABARITO[nicho][chave],
    ordem: i + 1,
    exige_consulta_realizada: CHAVES_EXIGEM_CONSULTA.has(chave),
    e_paciente: CHAVES_PACIENTE.has(chave),
    mapeia_para: MAPA_PADRAO[chave] ?? null,
  }))
}

export interface FunilResolvido {
  visiveis: Etapa[]
  ocultas: Etapa[]
  labels: Record<string, string>
  exigeConsulta: Set<string>
  pacienteKeys: string[]
  /** chave do lead -> chave da coluna em que ele aparece. Ausente = já é coluna. */
  statusExibido: Record<string, string>
}

const MAX_SALTOS_DOBRA = 10

/**
 * Aplica as dobras (mapeia_para) do funil da clínica.
 * A chave da etapa dobrada continua no banco; o board e o seletor só mostram a
 * coluna de destino.
 */
export function resolverFunil(etapas: Etapa[]): FunilResolvido {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem)
  const porChave = new Map(ordenadas.map(e => [e.chave, e]))

  const ocultas: Etapa[] = []
  const destino = new Map<string, string>()
  for (const e of ordenadas) {
    if (!e.mapeia_para) continue
    // Segue a cadeia de dobras. Chave inexistente ou ciclo mantém a coluna,
    // para o lead não desaparecer do board.
    let alvo = e.mapeia_para
    let resolvido = false
    for (let salto = 0; salto < MAX_SALTOS_DOBRA; salto++) {
      const proxima = porChave.get(alvo)
      if (!proxima) break
      if (!proxima.mapeia_para) { resolvido = true; break }
      alvo = proxima.mapeia_para
    }
    if (!resolvido) continue
    ocultas.push(e)
    destino.set(e.chave, alvo)
  }

  const visiveis = ordenadas.filter(e => !destino.has(e.chave))

  const labels: Record<string, string> = {}
  const exigeConsulta = new Set<string>()
  const pacienteKeys: string[] = []
  const statusExibido: Record<string, string> = {}

  // Regras valem para a chave gravada, dobrada ou não: um lead em retornar_6_meses
  // continua sendo paciente mesmo que apareça na coluna "Retorno".
  for (const e of ordenadas) {
    if (e.exige_consulta_realizada) exigeConsulta.add(e.chave)
    if (e.e_paciente) pacienteKeys.push(e.chave)
  }
  for (const e of visiveis) labels[e.chave] = e.rotulo
  for (const e of ocultas) {
    const alvo = destino.get(e.chave)!
    statusExibido[e.chave] = alvo
    labels[e.chave] = labels[alvo]
  }

  return { visiveis, ocultas, labels, exigeConsulta, pacienteKeys, statusExibido }
}

export function isNicho(value: unknown): value is Nicho {
  return NICHOS.some(n => n.value === value)
}
