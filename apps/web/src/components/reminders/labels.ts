import type { Reminder } from './ReminderFormModal'

/** Etiquetas y estilos compartidos por el formulario, el detalle y el panel de recordatorios. */

export const ALERT_LABEL: Record<Reminder['alertLevel'], string> = {
  normal: 'Normal', urgent: 'Urgente', critical: 'Crítico',
}

/** Estilos de color por nivel (el nivel es SOLO visual — HU-156/157). */
export const ALERT_STYLE: Record<Reminder['alertLevel'], { dot: string; badge: string; border: string }> = {
  critical: { dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',       border: 'border-l-red-400 dark:border-l-red-500' },
  urgent:   { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300', border: 'border-l-amber-400 dark:border-l-amber-500' },
  normal:   { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',   border: 'border-l-slate-300 dark:border-l-slate-600' },
}

export const RECUR_LABEL: Record<Reminder['recurrence'], string> = {
  none: 'Una vez', hourly: 'Cada hora', daily: 'Cada día', weekly: 'Cada semana', monthly: 'Cada mes',
}

export const RELATED_LABEL: Record<NonNullable<Reminder['relatedType']>, string> = {
  appointment: 'Cita', client: 'Cliente', deal: 'Venta / negocio', purchase_order: 'Compra',
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
