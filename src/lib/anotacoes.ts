// Anotações do lead: uma linha por anotação em leads_clinica.anotacoes.
//
//   "<data_iso>|<texto>"                 anotação geral (formato original)
//   "<data_iso>|@<consulta_id>|<texto>"  anotação vinculada a uma consulta
//   "<texto>"                            anotação antiga, sem data (continua válida)
//
// O vínculo vai no próprio texto para não exigir migration. Notas gravadas pelo n8n
// (n8n_chamar_humano) usam o formato geral e continuam sendo lidas normalmente.

export interface Nota {
  data: string | null
  texto: string
  consultaId: string | null
}

const LINHA = /^(\d{4}-\d{2}-\d{2}T\S+?)\|(?:@([0-9a-fA-F-]{36})\|)?(.*)$/

export function parseNotas(anotacoes: string | null | undefined): Nota[] {
  return (anotacoes ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(linha => {
      const m = linha.match(LINHA)
      return m
        ? { data: m[1], consultaId: m[2] ?? null, texto: m[3] }
        : { data: null, consultaId: null, texto: linha }
    })
}

export function serializeNotas(notas: Nota[]): string {
  return notas
    .map(n => {
      if (!n.data) return n.texto
      return `${n.data}|${n.consultaId ? `@${n.consultaId}|` : ''}${n.texto}`
    })
    .join('\n')
}

export interface GrupoNotas {
  /** null = anotações gerais (sem vínculo, ou cuja consulta foi excluída). */
  consultaId: string | null
  /** Posição de cada nota na lista original (para editar/excluir). */
  itens: { indice: number; nota: Nota }[]
}

/**
 * Agrupa por consulta, na ordem recebida em `consultaIds`, e deixa as gerais por
 * último. Grupos de consultas sem anotação não aparecem. Dentro do grupo, a mais
 * recente vem primeiro.
 */
export function agruparNotas(notas: Nota[], consultaIds: string[]): GrupoNotas[] {
  const existentes = new Set(consultaIds)
  const porConsulta = new Map<string | null, GrupoNotas['itens']>()
  notas.forEach((nota, indice) => {
    const chave = nota.consultaId && existentes.has(nota.consultaId) ? nota.consultaId : null
    const lista = porConsulta.get(chave) ?? []
    lista.push({ indice, nota })
    porConsulta.set(chave, lista)
  })
  const ordem: (string | null)[] = [...consultaIds, null]
  return ordem
    .filter(id => porConsulta.has(id))
    .map(id => ({ consultaId: id, itens: [...porConsulta.get(id)!].reverse() }))
}
