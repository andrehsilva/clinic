import { describe, it, expect } from 'vitest'
import { aplicarLayoutSimplificado, ehOrcamento, etapasPadrao, resolverFunil, type Etapa } from './funil'
import { ETAPAS_AUTOMATICAS } from './statusRules'

/** Aplica um patch a uma etapa do funil padrão e devolve a lista resolvida. */
function resolverCom(patch: (e: Etapa) => Etapa) {
  return resolverFunil(etapasPadrao('medica').map(patch))
}

const chaves = (etapas: Etapa[]) => etapas.map(e => e.chave)

describe('resolverFunil', () => {
  it('esconde as etapas dobradas do board', () => {
    const f = resolverCom(e => e)
    expect(chaves(f.visiveis)).toHaveLength(11)
    expect(chaves(f.ocultas)).toEqual(['follow_up_2_feito', 'retornar_6_meses', 'retornar_1_ano'])
    expect(chaves(f.visiveis)).toContain('follow_up_1_feito')
    expect(chaves(f.visiveis)).toContain('retornar_3_meses')
  })

  it('usa o rótulo da coluna de destino para a etapa dobrada', () => {
    const f = resolverCom(e => e)
    expect(f.labels['follow_up_1_feito']).toBe('Reengajamento')
    expect(f.labels['follow_up_2_feito']).toBe('Reengajamento')
    expect(f.labels['retornar_3_meses']).toBe('Retorno')
    expect(f.labels['retornar_6_meses']).toBe('Retorno')
    expect(f.labels['retornar_1_ano']).toBe('Retorno')
    expect(f.labels['consulta_confirmada']).toBe('Confirmado')
    expect(f.labels['consulta_cancelada']).toBe('Cancelada / Falta')
  })

  it('mapeia o status dobrado para a coluna onde ele aparece', () => {
    const f = resolverCom(e => e)
    expect(f.statusExibido['follow_up_2_feito']).toBe('follow_up_1_feito')
    expect(f.statusExibido['retornar_6_meses']).toBe('retornar_3_meses')
    expect(f.statusExibido['retornar_1_ano']).toBe('retornar_3_meses')
    expect(f.statusExibido['conversando']).toBeUndefined()
  })

  it('não expõe etapa manual de contato', () => {
    const f = resolverCom(e => e)
    expect(chaves(f.visiveis)).not.toContain('contato_manual_feito')
    expect(ETAPAS_AUTOMATICAS.has('conversando')).toBe(false)
  })

  it('segue a cadeia de dobras até a coluna final', () => {
    const f = resolverCom(e =>
      e.chave === 'follow_up_1_feito' ? { ...e, mapeia_para: 'conversando' } : e)
    expect(f.statusExibido['follow_up_1_feito']).toBe('conversando')
    expect(f.statusExibido['follow_up_2_feito']).toBe('conversando')
  })

  it('mantém a coluna quando a dobra aponta para chave inexistente', () => {
    const f = resolverCom(e =>
      e.chave === 'follow_up_2_feito' ? { ...e, mapeia_para: 'nao_existe' } : e)
    expect(chaves(f.visiveis)).toContain('follow_up_2_feito')
    expect(chaves(f.ocultas)).not.toContain('follow_up_2_feito')
    expect(f.statusExibido['follow_up_2_feito']).toBeUndefined()
  })

  it('mantém as regras da chave gravada mesmo quando ela é dobrada', () => {
    const f = resolverCom(e =>
      e.chave === 'follow_up_2_feito' ? { ...e, e_paciente: true } : e)
    expect(f.pacienteKeys).toContain('follow_up_2_feito')
    expect(f.pacienteKeys).toContain('retornar_6_meses')
    expect(f.pacienteKeys).toContain('orcamento_pendente')
  })
})

describe('aplicarLayoutSimplificado', () => {
  it('merges Reagendar and Reengajamento into negotiation', () => {
    const originais = etapasPadrao('odontologica')
    const f = resolverFunil(aplicarLayoutSimplificado(originais))

    expect(chaves(f.visiveis)).toHaveLength(7)
    expect(chaves(f.visiveis)).toContain('conversando')
    expect(chaves(f.visiveis)).not.toContain('paciente_recorrente')
    expect(chaves(f.visiveis)).toContain('retornar_3_meses')
    expect(f.labels.conversando).toBe('Orçamento em Negociação')
    expect(f.statusExibido.paciente_recorrente).toBe('conversando')
    expect(f.statusExibido.follow_up_1_feito).toBe('conversando')
    expect(f.statusExibido.follow_up_2_feito).toBe('conversando')
    expect(f.statusExibido.retornar_6_meses).toBe('retornar_3_meses')
    expect(f.statusExibido.retornar_1_ano).toBe('retornar_3_meses')
  })
  it('preserves technical keys and patient rules for automations', () => {
    const originais = etapasPadrao('odontologica')
    const simplificadas = aplicarLayoutSimplificado(originais)
    const f = resolverFunil(simplificadas)

    expect(simplificadas.map(e => e.chave)).toEqual(originais.map(e => e.chave))
    expect(simplificadas.map(e => [e.chave, e.exige_consulta_realizada, e.e_paciente]))
      .toEqual(originais.map(e => [e.chave, e.exige_consulta_realizada, e.e_paciente]))
    expect(f.exigeConsulta.has('paciente_recorrente')).toBe(true)
    expect(f.pacienteKeys).toContain('paciente_recorrente')
  })
})

describe('ehOrcamento', () => {
  it('cobre orçamento pendente e consulta realizada, não as demais etapas', () => {
    expect(ehOrcamento('orcamento_pendente')).toBe(true)
    expect(ehOrcamento('consulta_realizada')).toBe(true)
    expect(ehOrcamento('retornar_3_meses')).toBe(false)
    expect(ehOrcamento('conversando')).toBe(false)
  })
})
