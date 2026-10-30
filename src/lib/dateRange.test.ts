import { describe, it, expect } from 'vitest'
import { getRange, fmt, nowSP, diaSP, diaSemanaSP, PERIODS } from './dateRange'

describe('getRange', () => {
  const custom = { from: '2026-01-01', to: '2026-01-15' }

  it('today returns the same from/to', () => {
    const r = getRange('today', custom)
    expect(r.from).toBe(r.to)
    expect(r.from).toBe(fmt(nowSP()))
  })

  it('yesterday returns a single day before today', () => {
    const r = getRange('yesterday', custom)
    const expected = new Date(nowSP())
    expected.setDate(expected.getDate() - 1)
    expect(r.from).toBe(r.to)
    expect(r.from).toBe(fmt(expected))
  })

  it('7d spans exactly 7 days ending today', () => {
    const r = getRange('7d', custom)
    const from = new Date(r.from + 'T00:00:00')
    const to = new Date(r.to + 'T00:00:00')
    const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
    expect(days).toBe(6)
    expect(r.to).toBe(fmt(nowSP()))
  })

  it('year starts at January 1st of the current year', () => {
    const r = getRange('year', custom)
    const y = nowSP().getFullYear()
    expect(r.from).toBe(`${y}-01-01`)
  })

  it('last_year spans the entire previous year', () => {
    const r = getRange('last_year', custom)
    const y = nowSP().getFullYear()
    expect(r.from).toBe(`${y - 1}-01-01`)
    expect(r.to).toBe(`${y - 1}-12-31`)
  })

  it('custom returns the given range untouched', () => {
    const r = getRange('custom', custom)
    expect(r).toEqual(custom)
  })
})

describe('PERIODS', () => {
  it('has a label for every period key used by getRange', () => {
    const keys = PERIODS.map(p => p.key)
    expect(keys).toContain('today')
    expect(keys).toContain('custom')
    expect(keys.length).toBe(9)
  })
})

describe('fmt', () => {
  it('usa os componentes locais, sem virar o dia pelo UTC', () => {
    expect(fmt(new Date(2026, 9, 30, 23, 30))).toBe('2026-10-30')
    expect(fmt(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
  })
})

describe('diaSP / diaSemanaSP', () => {
  it('22h em São Paulo ainda é o mesmo dia (01h UTC do dia seguinte)', () => {
    expect(diaSP('2026-10-31T01:00:00Z')).toBe('2026-10-30')
  })
  it('dia da semana segue o fuso de São Paulo', () => {
    // 2026-10-31T01:00Z = sexta 22h em SP
    expect(diaSemanaSP('2026-10-31T01:00:00Z')).toBe(5)
  })
})
