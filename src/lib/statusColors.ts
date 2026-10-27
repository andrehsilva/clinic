export interface StatusColor {
  /** solid bg-* class — small indicator dots, kanban column accents */
  dot: string
  /** bg-* class for the light badge background */
  badgeBg: string
  /** text-* class for the badge label (and dot-adjacent text) */
  badgeText: string
  pulse?: boolean
}

export const STATUS_COLORS: Record<string, StatusColor> = {
  iniciou_conversa:    { dot: 'bg-accent',         badgeBg: 'bg-accent-light',         badgeText: 'text-accent',         pulse: true },
  conversando:         { dot: 'bg-status-info',    badgeBg: 'bg-status-info-light',    badgeText: 'text-status-info' },
  consulta_agendada:   { dot: 'bg-success',        badgeBg: 'bg-success-light',        badgeText: 'text-success' },
  consulta_cancelada:  { dot: 'bg-status-danger',  badgeBg: 'bg-status-danger-light',  badgeText: 'text-status-danger' },
  follow_up_1_feito:   { dot: 'bg-status-warning', badgeBg: 'bg-status-warning-light', badgeText: 'text-status-warning' },
  follow_up_2_feito:   { dot: 'bg-status-warning', badgeBg: 'bg-status-warning-light', badgeText: 'text-status-warning' },
  follow_up_3_feito:   { dot: 'bg-status-warning', badgeBg: 'bg-status-warning-light', badgeText: 'text-status-warning' },
  consulta_confirmada: { dot: 'bg-success',        badgeBg: 'bg-success-light',        badgeText: 'text-success' },
  consulta_realizada:  { dot: 'bg-success',        badgeBg: 'bg-success',              badgeText: 'text-white' },
  orcamento_pendente:  { dot: 'bg-status-warning', badgeBg: 'bg-status-warning-light', badgeText: 'text-status-warning' },
  paciente_recorrente: { dot: 'bg-status-purple',  badgeBg: 'bg-status-purple-light',  badgeText: 'text-status-purple' },
  retornar_3_meses:    { dot: 'bg-status-teal',    badgeBg: 'bg-status-teal-light',    badgeText: 'text-status-teal' },
  retornar_6_meses:    { dot: 'bg-status-teal',    badgeBg: 'bg-status-teal-light',    badgeText: 'text-status-teal' },
  retornar_1_ano:      { dot: 'bg-status-teal',    badgeBg: 'bg-status-teal-light',    badgeText: 'text-status-teal' },
}

export const DEFAULT_STATUS_COLOR: StatusColor = {
  dot: 'bg-text-secondary',
  badgeBg: 'bg-border-subtle',
  badgeText: 'text-text-secondary',
}

/** Consulta (appointment) status — separate domain from the lead funnel status above. */
export const CONSULTA_STATUS_COLORS: Record<string, StatusColor> = {
  agendada:  { dot: 'bg-success',       badgeBg: 'bg-success-light',       badgeText: 'text-success' },
  realizada: { dot: 'bg-success',       badgeBg: 'bg-success',             badgeText: 'text-white' },
  cancelada: { dot: 'bg-status-danger', badgeBg: 'bg-status-danger-light', badgeText: 'text-status-danger' },
  faltou:    { dot: 'bg-status-warning', badgeBg: 'bg-status-warning-light', badgeText: 'text-status-warning' },
}
