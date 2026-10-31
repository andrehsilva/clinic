import { describe, expect, it } from 'vitest'
import { consultasVencidas } from './consultasVencidas'

describe('consultasVencidas', () => {
  const agora = Date.parse('2026-11-12T18:00:00-03:00')

  it('includes an appointment at or before now, but not a future appointment', () => {
    const consultas = [
      { id: 'past', status: 'agendada', data_consulta: new Date(agora - 1).toISOString() },
      { id: 'now', status: 'agendada', data_consulta: new Date(agora).toISOString() },
      { id: 'future', status: 'agendada', data_consulta: new Date(agora + 1).toISOString() },
    ]
    expect(consultasVencidas(consultas, agora).map(c => c.id)).toEqual(['past', 'now'])
  })

  it('does not treat classified consultations or invalid dates as overdue', () => {
    const consultas = [
      { id: 'done', status: 'realizada', data_consulta: new Date(agora - 1000).toISOString() },
      { id: 'cancelled', status: 'cancelada', data_consulta: new Date(agora - 1000).toISOString() },
      { id: 'no-show', status: 'faltou', data_consulta: new Date(agora - 1000).toISOString() },
      { id: 'invalid', status: 'agendada', data_consulta: 'bad-date' },
    ]
    expect(consultasVencidas(consultas, agora)).toEqual([])
  })
})
