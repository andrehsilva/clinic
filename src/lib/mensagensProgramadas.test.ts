import { describe, it, expect } from 'vitest'
import { descreverData, proximaExecucao } from './mensagensProgramadas'

const hoje = { y: 2026, m: 10, d: 24 }

describe('proximaExecucao', () => {
  it('campanha anual ainda neste ano usa a data deste ano', () => {
    expect(proximaExecucao({ dia: 25, mes: 12, ano: null }, hoje)).toBe('2026-12-25')
  })

  it('campanha anual que já passou cai no ano seguinte', () => {
    expect(proximaExecucao({ dia: 1, mes: 1, ano: null }, hoje)).toBe('2027-01-01')
  })

  it('campanha anual no próprio dia dispara hoje', () => {
    expect(proximaExecucao({ dia: 24, mes: 10, ano: null }, hoje)).toBe('2026-10-24')
  })

  it('campanha de ano único no futuro mantém a data', () => {
    expect(proximaExecucao({ dia: 27, mes: 11, ano: 2026 }, hoje)).toBe('2026-11-27')
  })

  it('campanha de ano único já passada não tem próxima execução', () => {
    expect(proximaExecucao({ dia: 27, mes: 11, ano: 2025 }, hoje)).toBeNull()
  })

  it('data inexistente no mês não tem execução', () => {
    expect(proximaExecucao({ dia: 31, mes: 4, ano: null }, hoje)).toBeNull()
  })

  it('29 de fevereiro em ano não bissexto não dispara', () => {
    expect(proximaExecucao({ dia: 29, mes: 2, ano: 2026 }, hoje)).toBeNull()
    expect(proximaExecucao({ dia: 29, mes: 2, ano: 2028 }, hoje)).toBe('2028-02-29')
  })
})

describe('descreverData', () => {
  it('mostra a data e o "todo ano" só na campanha anual', () => {
    expect(descreverData({ dia: 25, mes: 12, ano: null })).toBe('25/12 · todo ano')
    expect(descreverData({ dia: 1, mes: 1, ano: null })).toBe('01/01 · todo ano')
    expect(descreverData({ dia: 27, mes: 11, ano: 2026 })).toBe('27/11/2026')
  })
})
