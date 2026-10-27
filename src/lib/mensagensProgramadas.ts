import type { DataCalendario } from './aniversario'

/** Campanha de mensagem programada, como fica em mensagens_programadas. */
export interface CampanhaMensagem {
  id: string
  clinica_id: string
  nome: string
  mensagem: string
  /** 1 a 31 */
  dia: number
  /** 1 a 12 */
  mes: number
  /** null = repete todo ano; preenchido = só naquele ano */
  ano: number | null
  ativo: boolean
  created_at: string
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function nomeDoMes(mes: number): string {
  return MESES[mes - 1] ?? ''
}

/** O dia existe no mês? Fevereiro aceita 29 (ano bissexto existe). */
export function diaValidoNoMes(mes: number, dia: number): boolean {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return false
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return false
  return new Date(Date.UTC(2024, mes - 1, dia)).getUTCDate() === dia
}

/** 'YYYY-MM-DD' quando a data existe no calendário; null quando não (31/02 e afins). */
function isoSeValida(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Próxima data de envio ('YYYY-MM-DD') a partir de `hoje`, ou null quando não
 * há próxima (campanha de ano único que já passou / data inexistente no mês).
 */
export function proximaExecucao(
  campanha: Pick<CampanhaMensagem, 'dia' | 'mes' | 'ano'>,
  hoje: DataCalendario,
): string | null {
  const { dia, mes, ano } = campanha

  if (ano !== null) {
    const data = isoSeValida(ano, mes, dia)
    if (!data) return null
    return data >= `${hoje.y}-${String(hoje.m).padStart(2, '0')}-${String(hoje.d).padStart(2, '0')}` ? data : null
  }

  const esteAno = isoSeValida(hoje.y, mes, dia)
  if (!esteAno) return null
  const hojeIso = `${hoje.y}-${String(hoje.m).padStart(2, '0')}-${String(hoje.d).padStart(2, '0')}`
  return esteAno >= hojeIso ? esteAno : isoSeValida(hoje.y + 1, mes, dia)
}

/** '25/12' ou '27/11/2026' — como a data é mostrada na lista. */
export function descreverData(campanha: Pick<CampanhaMensagem, 'dia' | 'mes' | 'ano'>): string {
  const base = `${String(campanha.dia).padStart(2, '0')}/${String(campanha.mes).padStart(2, '0')}`
  return campanha.ano === null ? `${base} · todo ano` : `${base}/${campanha.ano}`
}
