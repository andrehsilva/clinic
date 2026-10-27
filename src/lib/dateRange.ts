export type Period = 'today' | 'yesterday' | '7d' | '14d' | 'month' | 'last_month' | 'year' | 'last_year' | 'custom'

export interface DateRange { from: string; to: string }

export function toSP(d: Date) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}

export function nowSP() { return toSP(new Date()) }

export function fmt(d: Date) { return d.toISOString().split('T')[0] }

export function getRange(period: Period, custom: { from: string; to: string }): DateRange {
  const now = nowSP()
  const y = now.getFullYear(), m = now.getMonth(), day = now.getDate()
  switch (period) {
    case 'today':      return { from: fmt(now), to: fmt(now) }
    case 'yesterday': { const y2 = new Date(y, m, day - 1); return { from: fmt(y2), to: fmt(y2) } }
    case '7d':         return { from: fmt(new Date(y, m, day - 6)), to: fmt(now) }
    case '14d':        return { from: fmt(new Date(y, m, day - 13)), to: fmt(now) }
    case 'month':      return { from: fmt(new Date(y, m, 1)), to: fmt(now) }
    case 'last_month': return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'year':       return { from: `${y}-01-01`, to: fmt(now) }
    case 'last_year':  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'custom':     return custom
  }
}

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',      label: 'Hoje' },
  { key: 'yesterday',  label: 'Ontem' },
  { key: '7d',         label: '7 dias' },
  { key: '14d',        label: '14 dias' },
  { key: 'month',      label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'year',       label: 'Este ano' },
  { key: 'last_year',  label: 'Ano passado' },
  { key: 'custom',     label: 'Personalizado' },
]
