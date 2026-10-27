import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from './supabase'
import { hasConsultaRealizada, BLOQUEIO_SEM_CONSULTA_MSG, horasParado, LIMITE_PARADO_HORAS } from './statusRules'
import { etapasPadrao } from './funil'

const REQUIRES_CONSULTA_REALIZADA = new Set(
  etapasPadrao('estetica').filter(e => e.exige_consulta_realizada).map(e => e.chave),
)

function makeChain(result: { count: number | null }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

describe('hasConsultaRealizada', () => {
  it('returns true when at least one realizada consulta exists', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeChain({ count: 2 }) as never)
    expect(await hasConsultaRealizada('lead-1')).toBe(true)
  })

  it('returns false when count is 0', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeChain({ count: 0 }) as never)
    expect(await hasConsultaRealizada('lead-1')).toBe(false)
  })

  it('returns false when count is null', async () => {
    vi.mocked(supabase.from).mockReturnValue(makeChain({ count: null }) as never)
    expect(await hasConsultaRealizada('lead-1')).toBe(false)
  })
})

describe('REQUIRES_CONSULTA_REALIZADA', () => {
  it('contains all post-consultation statuses', () => {
    expect(REQUIRES_CONSULTA_REALIZADA.has('consulta_realizada')).toBe(true)
    expect(REQUIRES_CONSULTA_REALIZADA.has('paciente_recorrente')).toBe(true)
    expect(REQUIRES_CONSULTA_REALIZADA.has('retornar_3_meses')).toBe(true)
    expect(REQUIRES_CONSULTA_REALIZADA.has('retornar_6_meses')).toBe(true)
    expect(REQUIRES_CONSULTA_REALIZADA.has('retornar_1_ano')).toBe(true)
  })

  it('does not contain pre-consultation statuses', () => {
    expect(REQUIRES_CONSULTA_REALIZADA.has('iniciou_conversa')).toBe(false)
    expect(REQUIRES_CONSULTA_REALIZADA.has('consulta_agendada')).toBe(false)
  })
})

describe('BLOQUEIO_SEM_CONSULTA_MSG', () => {
  it('is a non-empty explanatory message', () => {
    expect(BLOQUEIO_SEM_CONSULTA_MSG.length).toBeGreaterThan(10)
  })
})

describe('horasParado', () => {
  const agora = new Date('2026-10-23T12:00:00-03:00').getTime()
  const paradoHa = (status: string, horas: number) => ({
    status,
    status_atualizado_em: new Date(agora - horas * 3_600_000).toISOString(),
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(agora)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('conta as horas desde a mudança de etapa', () => {
    expect(horasParado(paradoHa('conversando', 72))).toBe(72)
  })

  it('não alerta antes do limite', () => {
    expect(horasParado(paradoHa('conversando', LIMITE_PARADO_HORAS - 1))).toBeNull()
    expect(horasParado(paradoHa('conversando', LIMITE_PARADO_HORAS))).toBe(LIMITE_PARADO_HORAS)
  })

  it('não alerta etapas que esperam por uma data', () => {
    expect(horasParado(paradoHa('consulta_agendada', 200))).toBeNull()
    expect(horasParado(paradoHa('consulta_confirmada', 200))).toBeNull()
    expect(horasParado(paradoHa('retornar_3_meses', 200))).toBeNull()
  })

  it('não alerta sem carimbo de etapa', () => {
    expect(horasParado({ status: 'conversando', status_atualizado_em: null })).toBeNull()
  })
})
