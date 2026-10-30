import { describe, it, expect } from 'vitest'
import { parseNotas, serializeNotas, agruparNotas } from './anotacoes'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

describe('parseNotas / serializeNotas', () => {
  it('lê o formato original, o vinculado e o antigo sem data', () => {
    const texto = [
      '2026-10-30T12:00:00.000Z|Gente boa',
      `2026-10-30T13:00:00.000Z|@${ID_A}|Pediu orçamento | com parcelamento`,
      'nota antiga',
    ].join('\n')
    expect(parseNotas(texto)).toEqual([
      { data: '2026-10-30T12:00:00.000Z', consultaId: null, texto: 'Gente boa' },
      { data: '2026-10-30T13:00:00.000Z', consultaId: ID_A, texto: 'Pediu orçamento | com parcelamento' },
      { data: null, consultaId: null, texto: 'nota antiga' },
    ])
  })

  it('ida e volta preserva o conteúdo', () => {
    const texto = `2026-10-30T12:00:00.000Z|Gente boa\n2026-10-30T13:00:00.000Z|@${ID_B}|Retorno em 3 meses\nnota antiga`
    expect(serializeNotas(parseNotas(texto))).toBe(texto)
  })

  it('lê a nota gravada pelo n8n como geral', () => {
    const [n] = parseNotas('2026-10-30T15:00:00Z|[Atendimento] Pediu para falar com a equipe')
    expect(n.consultaId).toBeNull()
    expect(n.texto).toBe('[Atendimento] Pediu para falar com a equipe')
  })

  it('texto vazio ou nulo gera lista vazia', () => {
    expect(parseNotas('')).toEqual([])
    expect(parseNotas(null)).toEqual([])
  })

  it('nota sem data não carrega vínculo na serialização', () => {
    expect(serializeNotas([{ data: null, consultaId: ID_A, texto: 'solta' }])).toBe('solta')
  })
})

describe('agruparNotas', () => {
  const notas = parseNotas([
    `2026-10-01T10:00:00Z|@${ID_A}|a1`,
    '2026-10-02T10:00:00Z|geral 1',
    `2026-10-03T10:00:00Z|@${ID_A}|a2`,
    `2026-10-04T10:00:00Z|@${ID_B}|b1`,
    `2026-10-05T10:00:00Z|@${'3'.repeat(8)}-3333-4333-8333-${'3'.repeat(12)}|consulta apagada`,
  ].join('\n'))

  it('agrupa na ordem das consultas, gerais por último, mais recente primeiro', () => {
    const grupos = agruparNotas(notas, [ID_B, ID_A])
    expect(grupos.map(g => g.consultaId)).toEqual([ID_B, ID_A, null])
    expect(grupos[1].itens.map(i => i.nota.texto)).toEqual(['a2', 'a1'])
    expect(grupos[2].itens.map(i => i.nota.texto)).toEqual(['consulta apagada', 'geral 1'])
  })

  it('guarda o índice original para editar e excluir', () => {
    const grupos = agruparNotas(notas, [ID_A, ID_B])
    expect(grupos[0].itens.map(i => i.indice)).toEqual([2, 0])
  })

  it('omite consultas sem anotação', () => {
    expect(agruparNotas(notas, [ID_A, ID_B, 'sem-notas']).map(g => g.consultaId)).toEqual([ID_A, ID_B, null])
  })
})
