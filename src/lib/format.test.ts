import { describe, it, expect } from 'vitest'
import { fmtDateTime, fmtBRL, fmtDate } from './format'

describe('fmtDateTime', () => {
  it('returns em dash for null', () => {
    expect(fmtDateTime(null)).toBe('—')
  })

  it('formats an ISO string as pt-BR short date/time', () => {
    const result = fmtDateTime('2026-03-10T14:30:00Z')
    expect(result).not.toBe('—')
    expect(typeof result).toBe('string')
  })
})

describe('fmtBRL', () => {
  it('returns em dash for null', () => {
    expect(fmtBRL(null)).toBe('—')
  })

  it('returns em dash for undefined', () => {
    expect(fmtBRL(undefined as unknown as null)).toBe('—')
  })

  it('formats a number as BRL currency', () => {
    const result = fmtBRL(1500.5)
    expect(result).toContain('1.500,50')
  })

  it('formats zero correctly', () => {
    const result = fmtBRL(0)
    expect(result).toContain('0,00')
  })
})

describe('fmtDate', () => {
  it('formats an ISO string as a pt-BR date', () => {
    const result = fmtDate('2026-03-10T12:00:00Z')
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})
