// Aniversariantes de hoje e dos próximos dias.
// Datas de calendário são comparadas em UTC para não sofrer com fuso/horário de verão.

export interface LeadAniversario {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  /** 'YYYY-MM-DD' */
  data_nascimento: string
  /** 'YYYY-MM-DD' ou null */
  ultimo_aniversario_enviado: string | null
}

export type StatusAniversario = 'enviada' | 'pendente' | 'agendada'

export interface Aniversariante {
  id: string
  nome: string
  whatsapp: string | null
  /** 'dd/mm' */
  diaMes: string
  /** 0 = hoje */
  diasAte: number
  /** idade que a pessoa completa */
  idade: number
  status: StatusAniversario
}

export interface DataCalendario {
  y: number
  /** 1 a 12 */
  m: number
  /** 1 a 31 */
  d: number
}

const DIA_MS = 86_400_000

function ehBissexto(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** Data de aniversário no ano dado. 29/02 em ano não bissexto vira 28/02. */
function aniversarioNoAno(mes: number, dia: number, ano: number): number {
  const d = mes === 2 && dia === 29 && !ehBissexto(ano) ? 28 : dia
  return Date.UTC(ano, mes - 1, d)
}

/**
 * Lista quem faz aniversário hoje ou em até `dias` dias, ordenado por proximidade.
 * `hoje` é a data de calendário de São Paulo (use nowSP() de dateRange.ts).
 * Status:
 *  - 'enviada'  : é hoje e a mensagem deste ano já foi marcada como enviada
 *  - 'pendente' : é hoje e ainda não foi enviada
 *  - 'agendada' : cai nos próximos dias
 */
export function proximosAniversarios(
  leads: LeadAniversario[],
  hoje: DataCalendario,
  dias = 7,
): Aniversariante[] {
  const hojeUTC = Date.UTC(hoje.y, hoje.m - 1, hoje.d)
  const resultado: Aniversariante[] = []

  for (const lead of leads) {
    const [ano, mes, dia] = lead.data_nascimento.split('-').map(Number)
    if (!ano || !mes || !dia) continue

    let proximo = aniversarioNoAno(mes, dia, hoje.y)
    let anoProximo = hoje.y
    if (proximo < hojeUTC) {
      anoProximo = hoje.y + 1
      proximo = aniversarioNoAno(mes, dia, anoProximo)
    }

    const diasAte = Math.round((proximo - hojeUTC) / DIA_MS)
    if (diasAte > dias) continue

    const enviada = !!lead.ultimo_aniversario_enviado
      && Number(lead.ultimo_aniversario_enviado.slice(0, 4)) === hoje.y

    let status: StatusAniversario = 'agendada'
    if (diasAte === 0) status = enviada ? 'enviada' : 'pendente'

    resultado.push({
      id: lead.id,
      nome: (lead.nome_lead ?? '').trim() || 'Sem nome',
      whatsapp: lead.whatsapp_lead,
      diaMes: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`,
      diasAte,
      idade: anoProximo - ano,
      status,
    })
  }

  return resultado.sort((a, b) => a.diasAte - b.diasAte || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Primeiro nome de quem recebe a mensagem; 'cliente' quando não há nome. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'cliente'
}

/**
 * Troca as variáveis do texto de aniversário pelas da clínica/lead:
 * `{nome}` (primeiro nome do cliente) e `{clinica}` (nome da clínica do tenant).
 * O mesmo texto é renderizado no banco por aniversariantes_do_dia(); manter as
 * duas implementações iguais para a prévia não mentir sobre o que é enviado.
 */
export function renderizarMensagem(template: string, dados: { nome: string | null; clinica: string | null }): string {
  return template
    .replace(/\{nome\}/g, primeiroNome(dados.nome))
    .replace(/\{clinica\}/g, (dados.clinica ?? '').trim() || 'nossa clínica')
}
